import fs from 'fs/promises';
import readline from 'readline';
import { createReadStream } from 'fs';
import path from 'path';
import { db } from '../db';
import { proxyRules, proxyTraffic, proxyErrors } from '../db/schema';
import { eq, and, gte, lte } from 'drizzle-orm/sqlite-core';
import { 
  ProxyTrafficData, 
  ProxyTrafficTimeSeries, 
  ProxyTrafficSummary,
  RequestResponseLog,
  ProxyError,
  ProxyErrorType,
  ProxyErrorSummary
} from '../../../shared/src/models';
import { proxyService } from './proxy';

/**
 * Service for analyzing proxy traffic and logs
 */
export class ProxyAnalyticsService {
  private logDir: string;
  private analyticsCache: Map<string, {
    trafficSummary: ProxyTrafficSummary;
    errorSummary: ProxyErrorSummary;
    lastUpdated: number;
  }> = new Map();
  private eventHandlers: Map<string, Function[]> = new Map();
  private logParsingInterval: NodeJS.Timeout | null = null;
  private isProcessingLogs = false;

  constructor(options: { logDir?: string } = {}) {
    this.logDir = options.logDir || '/var/log/nginx';
    this.eventHandlers = new Map();
  }

  /**
   * Register event handler
   */
  on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)?.push(handler);
  }

  /**
   * Emit event
   */
  private emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  /**
   * Initialize analytics service
   */
  async initialize(): Promise<void> {
    try {
      console.log(`ProxyAnalyticsService initializing with log directory: ${this.logDir}`);
      
      // Start periodic log parsing
      this.startLogParsing();
      
      this.emit('analytics:initialized', { success: true });
    } catch (error: any) {
      console.error('Error initializing ProxyAnalyticsService:', error);
      this.emit('analytics:initialized', { success: false, error: error.message });
      throw error;
    }
  }

  /**
   * Start periodic log parsing
   */
  private startLogParsing(): void {
    // Parse logs every 5 minutes
    this.logParsingInterval = setInterval(() => {
      this.parseAllLogs().catch(err => {
        console.error('Error parsing logs:', err);
      });
    }, 5 * 60 * 1000);
    
    // Parse logs immediately on startup
    this.parseAllLogs().catch(err => {
      console.error('Error parsing logs on startup:', err);
    });
  }

  /**
   * Stop periodic log parsing
   */
  stopLogParsing(): void {
    if (this.logParsingInterval) {
      clearInterval(this.logParsingInterval);
      this.logParsingInterval = null;
    }
  }

  /**
   * Parse all nginx logs for all proxy rules
   */
  async parseAllLogs(): Promise<void> {
    if (this.isProcessingLogs) {
      console.log('Log processing already in progress, skipping');
      return;
    }

    this.isProcessingLogs = true;
    try {
      const rules = await proxyService.getRules();
      
      for (const rule of rules) {
        await this.parseLogsForRule(rule.id);
      }
      
      console.log('Finished parsing logs for all rules');
    } catch (error) {
      console.error('Error parsing all logs:', error);
    } finally {
      this.isProcessingLogs = false;
    }
  }

  /**
   * Parse nginx logs for a specific proxy rule
   */
  async parseLogsForRule(ruleId: string): Promise<void> {
    try {
      const rule = await proxyService.getRule(ruleId);
      if (!rule) {
        throw new Error(`Rule with ID ${ruleId} not found`);
      }

      const accessLogPath = path.join(this.logDir, `${ruleId}_access.log`);
      const errorLogPath = path.join(this.logDir, `${ruleId}_error.log`);
      
      // Get the timestamp of the last processed log entry
      const lastTrafficEntry = await db.select()
        .from(proxyTraffic)
        .where(eq(proxyTraffic.ruleId, ruleId))
        .orderBy(proxyTraffic.timestamp, 'desc')
        .limit(1)
        .all();
      
      const lastTimestamp = lastTrafficEntry.length > 0 
        ? parseInt(lastTrafficEntry[0].timestamp) 
        : 0;
      
      // Parse access logs
      await this.parseAccessLog(accessLogPath, ruleId, lastTimestamp);
      
      // Parse error logs
      await this.parseErrorLog(errorLogPath, ruleId, lastTimestamp);
      
      // Update analytics cache
      await this.updateAnalyticsCache(ruleId);
      
      console.log(`Finished parsing logs for rule ${ruleId}`);
    } catch (error: any) {
      console.error(`Error parsing logs for rule ${ruleId}:`, error);
      
      // Record error but don't throw to allow processing other rules
      await proxyService.recordError({
        ruleId,
        timestamp: Date.now(),
        errorType: ProxyErrorType.UNKNOWN,
        message: `Error parsing logs: ${error.message}`,
        resolved: false
      });
    }
  }

  /**
   * Parse nginx access log
   */
  private async parseAccessLog(logPath: string, ruleId: string, lastTimestamp: number): Promise<void> {
    try {
      // Check if log file exists
      try {
        await fs.access(logPath);
      } catch (error) {
        console.log(`Access log file ${logPath} does not exist yet`);
        return;
      }
      
      const fileStream = createReadStream(logPath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      
      // Regular expression for parsing the log format
      // Format: $remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent" $request_time $upstream_response_time $pipe $upstream_cache_status $host
      const logRegex = /^(\S+) - (\S+) \[([^\]]+)\] "([^"]*)" (\d+) (\d+) "([^"]*)" "([^"]*)" ([\d\.]+) ([\d\.]+|-) (\.) (\S+) (\S+)$/;
      
      let batchEntries: any[] = [];
      const batchSize = 100;
      
      for await (const line of rl) {
        const match = line.match(logRegex);
        if (!match) continue;
        
        const [
          _, // Full match
          clientIp,
          remoteUser,
          timeLocal,
          request,
          status,
          bodyBytesSent,
          referer,
          userAgent,
          requestTime,
          upstreamResponseTime,
          pipe,
          cacheStatus,
          host
        ] = match;
        
        // Parse time
        const timestamp = this.parseNginxDate(timeLocal);
        
        // Skip entries that have already been processed
        if (timestamp <= lastTimestamp) continue;
        
        // Parse request
        const [method, path] = this.parseRequest(request);
        
        // Create log entry
        const logEntry = {
          id: this.generateUUID(),
          ruleId,
          timestamp: timestamp.toString(),
          method,
          path,
          statusCode: parseInt(status),
          responseTime: Math.round(parseFloat(requestTime) * 1000), // Convert to milliseconds
          bytesSent: parseInt(bodyBytesSent),
          bytesReceived: 0, // Not available in standard log format
          clientIp,
          userAgent: userAgent !== '-' ? userAgent : undefined
        };
        
        batchEntries.push(logEntry);
        
        // Insert in batches
        if (batchEntries.length >= batchSize) {
          await db.insert(proxyTraffic).values(batchEntries);
          batchEntries = [];
        }
      }
      
      // Insert any remaining entries
      if (batchEntries.length > 0) {
        await db.insert(proxyTraffic).values(batchEntries);
      }
      
    } catch (error) {
      console.error(`Error parsing access log ${logPath}:`, error);
      throw error;
    }
  }

  /**
   * Parse nginx error log
   */
  private async parseErrorLog(logPath: string, ruleId: string, lastTimestamp: number): Promise<void> {
    try {
      // Check if log file exists
      try {
        await fs.access(logPath);
      } catch (error) {
        console.log(`Error log file ${logPath} does not exist yet`);
        return;
      }
      
      const fileStream = createReadStream(logPath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });
      
      // Regular expression for parsing nginx error log format
      const logRegex = /^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}) \[(\w+)\] (\d+)#(\d+): (.+)$/;
      
      let batchEntries: any[] = [];
      const batchSize = 100;
      
      for await (const line of rl) {
        const match = line.match(logRegex);
        if (!match) continue;
        
        const [
          _, // Full match
          dateStr,
          errorLevel,
          pid,
          tid,
          errorMessage
        ] = match;
        
        // Parse time
        const timestamp = this.parseNginxErrorDate(dateStr);
        
        // Skip entries that have already been processed
        if (timestamp <= lastTimestamp) continue;
        
        // Determine error type
        const errorType = this.determineErrorType(errorMessage);
        
        // Extract status code if present
        const statusCodeMatch = errorMessage.match(/HTTP (\d+)/);
        const statusCode = statusCodeMatch ? parseInt(statusCodeMatch[1]) : undefined;
        
        // Extract path if present
        const pathMatch = errorMessage.match(/"(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS) ([^"]+)"/);
        const path = pathMatch ? pathMatch[2] : undefined;
        
        // Create error entry
        const errorEntry = {
          id: this.generateUUID(),
          ruleId,
          timestamp: timestamp.toString(),
          type: errorType,
          code: statusCode,
          message: errorMessage,
          path,
          resolved: 0
        };
        
        batchEntries.push(errorEntry);
        
        // Insert in batches
        if (batchEntries.length >= batchSize) {
          await db.insert(proxyErrors).values(batchEntries);
          batchEntries = [];
        }
      }
      
      // Insert any remaining entries
      if (batchEntries.length > 0) {
        await db.insert(proxyErrors).values(batchEntries);
      }
      
    } catch (error) {
      console.error(`Error parsing error log ${logPath}:`, error);
      throw error;
    }
  }

  /**
   * Update analytics cache for a rule
   */
  private async updateAnalyticsCache(ruleId: string): Promise<void> {
    try {
      // Get traffic data for the last 24 hours
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      
      // Get traffic data
      const trafficData = await db.select()
        .from(proxyTraffic)
        .where(
          and(
            eq(proxyTraffic.ruleId, ruleId),
            gte(proxyTraffic.timestamp, oneDayAgo.toString())
          )
        )
        .all();
      
      // Get error data
      const errorData = await db.select()
        .from(proxyErrors)
        .where(
          and(
            eq(proxyErrors.ruleId, ruleId),
            gte(proxyErrors.timestamp, oneDayAgo.toString())
          )
        )
        .all();
      
      // Calculate traffic summary
      const trafficSummary = this.calculateTrafficSummary(ruleId, trafficData);
      
      // Calculate error summary
      const errorSummary = this.calculateErrorSummary(ruleId, errorData, trafficData.length);
      
      // Update cache
      this.analyticsCache.set(ruleId, {
        trafficSummary,
        errorSummary,
        lastUpdated: Date.now()
      });
      
      // Emit event
      this.emit('analytics:updated', { ruleId });
      
    } catch (error) {
      console.error(`Error updating analytics cache for rule ${ruleId}:`, error);
    }
  }

  /**
   * Calculate traffic summary from traffic data
   */
  private calculateTrafficSummary(ruleId: string, trafficData: any[]): ProxyTrafficSummary {
    // Initialize summary
    const summary: ProxyTrafficSummary = {
      ruleId,
      totalRequests: trafficData.length,
      totalResponses: trafficData.length,
      totalBytesReceived: 0,
      totalBytesSent: 0,
      avgResponseTime: 0,
      statusCodeDistribution: {},
      requestMethodDistribution: {},
      topClientIps: [],
      topUserAgents: [],
      topPaths: [],
      period: 'last_day'
    };
    
    // Maps for counting occurrences
    const statusCodes: Record<number, number> = {};
    const methods: Record<string, number> = {};
    const clientIps: Record<string, number> = {};
    const userAgents: Record<string, number> = {};
    const paths: Record<string, number> = {};
    
    let totalResponseTime = 0;
    
    // Process each traffic entry
    for (const entry of trafficData) {
      // Accumulate bytes
      summary.totalBytesReceived += entry.bytesReceived || 0;
      summary.totalBytesSent += entry.bytesSent || 0;
      
      // Accumulate response time
      if (entry.responseTime) {
        totalResponseTime += entry.responseTime;
      }
      
      // Count status codes
      if (entry.statusCode) {
        statusCodes[entry.statusCode] = (statusCodes[entry.statusCode] || 0) + 1;
      }
      
      // Count methods
      if (entry.method) {
        methods[entry.method] = (methods[entry.method] || 0) + 1;
      }
      
      // Count client IPs
      if (entry.clientIp) {
        clientIps[entry.clientIp] = (clientIps[entry.clientIp] || 0) + 1;
      }
      
      // Count user agents
      if (entry.userAgent) {
        userAgents[entry.userAgent] = (userAgents[entry.userAgent] || 0) + 1;
      }
      
      // Count paths
      if (entry.path) {
        paths[entry.path] = (paths[entry.path] || 0) + 1;
      }
    }
    
    // Calculate average response time
    summary.avgResponseTime = trafficData.length > 0 
      ? Math.round(totalResponseTime / trafficData.length) 
      : 0;
    
    // Set distributions
    summary.statusCodeDistribution = statusCodes;
    summary.requestMethodDistribution = methods;
    
    // Set top items
    summary.topClientIps = this.getTopItems(clientIps, 10);
    summary.topUserAgents = this.getTopItems(userAgents, 10);
    summary.topPaths = this.getTopItems(paths, 10);
    
    return summary;
  }

  /**
   * Calculate error summary from error data
   */
  private calculateErrorSummary(ruleId: string, errorData: any[], totalRequests: number): ProxyErrorSummary {
    // Initialize summary
    const summary: ProxyErrorSummary = {
      ruleId,
      totalErrors: errorData.length,
      errorsByType: {} as Record<ProxyErrorType, number>,
      errorsByStatusCode: {},
      errorRate: totalRequests > 0 ? errorData.length / totalRequests : 0,
      period: 'last_day',
      topErrorPaths: [],
      topErrorClients: []
    };
    
    // Maps for counting occurrences
    const errorTypes: Record<string, number> = {};
    const statusCodes: Record<number, number> = {};
    const paths: Record<string, number> = {};
    const clientIps: Record<string, number> = {};
    
    // Process each error entry
    for (const entry of errorData) {
      // Count error types
      if (entry.type) {
        errorTypes[entry.type] = (errorTypes[entry.type] || 0) + 1;
      }
      
      // Count status codes
      if (entry.code) {
        statusCodes[entry.code] = (statusCodes[entry.code] || 0) + 1;
      }
      
      // Count paths
      if (entry.path) {
        paths[entry.path] = (paths[entry.path] || 0) + 1;
      }
      
      // Count client IPs
      if (entry.clientIp) {
        clientIps[entry.clientIp] = (clientIps[entry.clientIp] || 0) + 1;
      }
    }
    
    // Set distributions
    summary.errorsByType = errorTypes as Record<ProxyErrorType, number>;
    summary.errorsByStatusCode = statusCodes;
    
    // Set top items
    summary.topErrorPaths = this.getTopItems(paths, 10);
    summary.topErrorClients = this.getTopItems(clientIps, 10);
    
    return summary;
  }

  /**
   * Get traffic summary for a rule
   */
  async getTrafficSummary(ruleId: string, period: string = 'last_day'): Promise<ProxyTrafficSummary> {
    // Check if we have a cached summary
    const cached = this.analyticsCache.get(ruleId);
    if (cached && Date.now() - cached.lastUpdated < 5 * 60 * 1000) { // 5 minutes cache
      return cached.trafficSummary;
    }
    
    // If not cached or cache expired, update cache
    await this.updateAnalyticsCache(ruleId);
    
    // Return from cache
    const updated = this.analyticsCache.get(ruleId);
    if (!updated) {
      throw new Error(`Failed to get traffic summary for rule ${ruleId}`);
    }
    
    return updated.trafficSummary;
  }

  /**
   * Get error summary for a rule
   */
  async getErrorSummary(ruleId: string, period: string = 'last_day'): Promise<ProxyErrorSummary> {
    // Check if we have a cached summary
    const cached = this.analyticsCache.get(ruleId);
    if (cached && Date.now() - cached.lastUpdated < 5 * 60 * 1000) { // 5 minutes cache
      return cached.errorSummary;
    }
    
    // If not cached or cache expired, update cache
    await this.updateAnalyticsCache(ruleId);
    
    // Return from cache
    const updated = this.analyticsCache.get(ruleId);
    if (!updated) {
      throw new Error(`Failed to get error summary for rule ${ruleId}`);
    }
    
    return updated.errorSummary;
  }

  /**
   * Get traffic time series for a rule
   */
  async getTrafficTimeSeries(
    ruleId: string, 
    startTime: number, 
    endTime: number, 
    interval: number = 3600000 // 1 hour default
  ): Promise<ProxyTrafficTimeSeries> {
    // Get traffic data for the specified time range
    const trafficData = await db.select()
      .from(proxyTraffic)
      .where(
        and(
          eq(proxyTraffic.ruleId, ruleId),
          gte(proxyTraffic.timestamp, startTime.toString()),
          lte(proxyTraffic.timestamp, endTime.toString())
        )
      )
      .all();
    
    // Group data by time intervals
    const intervals: Record<number, any[]> = {};
    
    for (const entry of trafficData) {
      const timestamp = parseInt(entry.timestamp);
      const intervalStart = Math.floor(timestamp / interval) * interval;
      
      if (!intervals[intervalStart]) {
        intervals[intervalStart] = [];
      }
      
      intervals[intervalStart].push(entry);
    }
    
    // Calculate data points
    const dataPoints: ProxyTrafficData[] = [];
    
    for (const [intervalStart, entries] of Object.entries(intervals)) {
      const start = parseInt(intervalStart);
      
      // Calculate summary for this interval
      const summary = this.calculateTrafficSummary(ruleId, entries);
      
      // Create data point
      const dataPoint: ProxyTrafficData = {
        id: this.generateUUID(),
        ruleId,
        timestamp: start,
        requestCount: entries.length,
        responseCount: entries.length,
        bytesReceived: summary.totalBytesReceived,
        bytesSent: summary.totalBytesSent,
        avgResponseTime: summary.avgResponseTime,
        statusCodes: summary.statusCodeDistribution,
        requestMethods: summary.requestMethodDistribution,
        clientIps: this.arrayToRecord(summary.topClientIps),
        userAgents: this.arrayToRecord(summary.topUserAgents),
        pathHits: this.arrayToRecord(summary.topPaths)
      };
      
      dataPoints.push(dataPoint);
    }
    
    // Sort data points by timestamp
    dataPoints.sort((a, b) => a.timestamp - b.timestamp);
    
    return {
      ruleId,
      interval,
      startTime,
      endTime,
      dataPoints
    };
  }

  /**
   * Get detailed request logs for a rule
   */
  async getRequestLogs(
    ruleId: string, 
    options: { 
      limit?: number; 
      offset?: number; 
      startTime?: number; 
      endTime?: number;
      statusCode?: number;
      method?: string;
      path?: string;
    } = {}
  ): Promise<{ logs: RequestResponseLog[]; total: number }> {
    let query = db.select()
      .from(proxyTraffic)
      .where(eq(proxyTraffic.ruleId, ruleId));
    
    // Apply filters
    if (options.startTime !== undefined) {
      query = query.where(gte(proxyTraffic.timestamp, options.startTime.toString()));
    }
    
    if (options.endTime !== undefined) {
      query = query.where(lte(proxyTraffic.timestamp, options.endTime.toString()));
    }
    
    if (options.statusCode !== undefined) {
      query = query.where(eq(proxyTraffic.statusCode, options.statusCode));
    }
    
    if (options.method !== undefined) {
      query = query.where(eq(proxyTraffic.method, options.method));
    }
    
    if (options.path !== undefined) {
      query = query.where(eq(proxyTraffic.path, options.path));
    }
    
    // Count total matching records
    const countQuery = db.select({ count: db.count() })
      .from(proxyTraffic)
      .where(eq(proxyTraffic.ruleId, ruleId));
    
    // Apply same filters to count query
    if (options.startTime !== undefined) {
      countQuery.where(gte(proxyTraffic.timestamp, options.startTime.toString()));
    }
    
    if (options.endTime !== undefined) {
      countQuery.where(lte(proxyTraffic.timestamp, options.endTime.toString()));
    }
    
    if (options.statusCode !== undefined) {
      countQuery.where(eq(proxyTraffic.statusCode, options.statusCode));
    }
    
    if (options.method !== undefined) {
      countQuery.where(eq(proxyTraffic.method, options.method));
    }
    
    if (options.path !== undefined) {
      countQuery.where(eq(proxyTraffic.path, options.path));
    }
    
    const countResult = await countQuery.all();
    const total = countResult.length > 0 ? countResult[0].count : 0;
    
    // Apply pagination
    if (options.limit !== undefined) {
      query = query.limit(options.limit);
    }
    
    if (options.offset !== undefined) {
      query = query.offset(options.offset);
    }
    
    // Order by timestamp (newest first)
    query = query.orderBy(proxyTraffic.timestamp, 'desc');
    
    // Execute query
    const results = await query.all();
    
    // Convert to RequestResponseLog objects
    const logs: RequestResponseLog[] = results.map((result: any) => ({
      id: result.id,
      ruleId: result.ruleId,
      timestamp: parseInt(result.timestamp),
      clientIp: result.clientIp || '',
      method: result.method,
      path: result.path,
      statusCode: result.statusCode || 0,
      responseTime: result.responseTime || 0,
      bytesReceived: result.bytesReceived || 0,
      bytesSent: result.bytesSent || 0,
      userAgent: result.userAgent
    }));
    
    return { logs, total };
  }

  /**
   * Parse nginx date format to timestamp
   */
  private parseNginxDate(dateStr: string): number {
    // Format: 10/Oct/2023:13:55:36 +0200
    const months: Record<string, number> = {
      'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
      'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
    };
    
    const regex = /(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})/;
    const match = dateStr.match(regex);
    
    if (!match) return 0;
    
    const [_, day, month, year, hour, minute, second, timezone] = match;
    
    const date = new Date();
    date.setUTCFullYear(parseInt(year));
    date.setUTCMonth(months[month]);
    date.setUTCDate(parseInt(day));
    date.setUTCHours(parseInt(hour));
    date.setUTCMinutes(parseInt(minute));
    date.setUTCSeconds(parseInt(second));
    
    // Adjust for timezone
    const tzHours = parseInt(timezone.substring(1, 3));
    const tzMinutes = parseInt(timezone.substring(3, 5));
    const tzOffset = (tzHours * 60 + tzMinutes) * 60 * 1000;
    
    if (timezone.startsWith('+')) {
      return date.getTime() - tzOffset;
    } else {
      return date.getTime() + tzOffset;
    }
  }

  /**
   * Parse nginx error log date format to timestamp
   */
  private parseNginxErrorDate(dateStr: string): number {
    // Format: 2023/10/10 13:55:36
    const regex = /(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/;
    const match = dateStr.match(regex);
    
    if (!match) return 0;
    
    const [_, year, month, day, hour, minute, second] = match;
    
    const date = new Date();
    date.setUTCFullYear(parseInt(year));
    date.setUTCMonth(parseInt(month) - 1); // Month is 0-indexed
    date.setUTCDate(parseInt(day));
    date.setUTCHours(parseInt(hour));
    date.setUTCMinutes(parseInt(minute));
    date.setUTCSeconds(parseInt(second));
    
    return date.getTime();
  }

  /**
   * Parse request string to method and path
   */
  private parseRequest(request: string): [string, string] {
    const parts = request.split(' ');
    if (parts.length >= 2) {
      return [parts[0], parts[1]];
    }
    return ['', ''];
  }

  /**
   * Determine error type from error message
   */
  private determineErrorType(message: string): ProxyErrorType {
    if (message.includes('connect() failed') || message.includes('Connection refused')) {
      return ProxyErrorType.CONNECTION_REFUSED;
    } else if (message.includes('upstream timed out') || message.includes('timed out')) {
      return ProxyErrorType.TIMEOUT;
    } else if (message.includes('SSL') || message.includes('certificate')) {
      return ProxyErrorType.SSL_ERROR;
    } else if (message.includes('502') || message.includes('Bad Gateway')) {
      return ProxyErrorType.BAD_GATEWAY;
    } else if (message.includes('504') || message.includes('Gateway Timeout')) {
      return ProxyErrorType.GATEWAY_TIMEOUT;
    } else if (message.includes('rate limit')) {
      return ProxyErrorType.RATE_LIMIT_EXCEEDED;
    } else if (message.includes('configuration')) {
      return ProxyErrorType.CONFIGURATION_ERROR;
    } else if (message.match(/HTTP [45]\d\d/)) {
      const statusCode = parseInt(message.match(/HTTP ([45]\d\d)/)![1]);
      return statusCode >= 500 ? ProxyErrorType.SERVER_ERROR : ProxyErrorType.CLIENT_ERROR;
    }
    
    return ProxyErrorType.UNKNOWN;
  }

  /**
   * Get top N items from a record of counts
   */
  private getTopItems(counts: Record<string, number>, n: number): Array<[string, number]> {
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);
  }
  
  /**
   * Convert array of [key, value] to Record
   */
  private arrayToRecord(arr: Array<[string, number]>): Record<string, number> {
    const record: Record<string, number> = {};
    for (const [key, value] of arr) {
      record[key] = value;
    }
    return record;
  }
  
  /**
   * Generate a UUID v4-like ID
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

// Export a singleton instance
export const proxyAnalyticsService = new ProxyAnalyticsService();