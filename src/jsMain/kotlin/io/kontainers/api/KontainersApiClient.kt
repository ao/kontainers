package io.kontainers.api

import io.kontainers.model.*
import io.kontainers.system.ConfigurationBackup
import io.kontainers.system.HealthCheckResult
import io.kontainers.system.HealthStatus
import io.kontainers.system.SystemResourceMetrics
import kotlinx.browser.window
import kotlinx.datetime.*
import org.w3c.files.File
import org.w3c.xhr.FormData
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.plugins.websocket.*
import io.ktor.client.request.*
import io.ktor.client.request.forms.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.websocket.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.serialization.json.Json
import org.w3c.files.File as JsFile

// External declaration for JavaScript console
external val console: dynamic

/**
 * API client for communicating with the Kontainers backend.
 */
class KontainersApiClient {
    private val client = HttpClient {
        install(ContentNegotiation) {
            json(Json {
                prettyPrint = true
                isLenient = true
                ignoreUnknownKeys = true
            })
        }
        install(WebSockets)
    }
    
    /**
     * Base URL for API requests.
     */
    private val baseUrl = "/api"
    
    /**
     * Gets all containers.
     *
     * @param all If true, includes stopped containers
     * @return List of containers
     */
    suspend fun getContainers(all: Boolean = true): List<Container> {
        return try {
            client.get("$baseUrl/containers") {
                parameter("all", all)
            }.body()
        } catch (e: Exception) {
            console.warn("Failed to fetch containers from API: ${e.message}. Using mock data.")
            // Return empty list when API is not available
            emptyList()
        }
    }
    
    /**
     * Gets a container by ID.
     * 
     * @param id Container ID
     * @return Container details
     */
    suspend fun getContainer(id: String): Container {
        return client.get("$baseUrl/containers/$id").body()
    }
    
    /**
     * Starts a container.
     * 
     * @param id Container ID
     * @return true if successful
     */
    suspend fun startContainer(id: String): Boolean {
        val response: Map<String, Any> = client.post("$baseUrl/containers/$id/start").body()
        return response["success"] as Boolean
    }
    
    /**
     * Stops a container.
     * 
     * @param id Container ID
     * @param timeout Timeout in seconds before killing the container
     * @return true if successful
     */
    suspend fun stopContainer(id: String, timeout: Int = 10): Boolean {
        val response: Map<String, Any> = client.post("$baseUrl/containers/$id/stop") {
            parameter("timeout", timeout)
        }.body()
        return response["success"] as Boolean
    }
    
    /**
     * Restarts a container.
     * 
     * @param id Container ID
     * @param timeout Timeout in seconds before killing the container
     * @return true if successful
     */
    suspend fun restartContainer(id: String, timeout: Int = 10): Boolean {
        val response: Map<String, Any> = client.post("$baseUrl/containers/$id/restart") {
            parameter("timeout", timeout)
        }.body()
        return response["success"] as Boolean
    }
    
    /**
     * Gets container logs.
     * 
     * @param id Container ID
     * @param tail Number of lines to return from the end of the logs
     * @return List of log lines
     */
    suspend fun getContainerLogs(id: String, tail: Int = 100): List<String> {
        return client.get("$baseUrl/containers/$id/logs") {
            parameter("tail", tail)
        }.body()
    }
    
    /**
     * Creates a new container.
     *
     * @param request Container creation request
     * @return Result of the container creation operation
     */
    suspend fun createContainer(request: ContainerCreationRequest): ContainerCreationResult {
        return try {
            client.post("$baseUrl/containers") {
                contentType(ContentType.Application.Json)
                setBody(request)
            }.body()
        } catch (e: Exception) {
            console.error("Failed to create container: ${e.message}")
            ContainerCreationResult(
                success = false,
                message = "Failed to create container: ${e.message}"
            )
        }
    }
    
    /**
     * Streams container logs via WebSocket.
     *
     * @param id Container ID
     * @param tail Number of lines to return from the end of the logs
     * @return Flow of log lines
     */
    fun streamContainerLogs(id: String, tail: Int = 100): Flow<String> = flow {
        val protocol = if (window.location.protocol == "https:") "wss" else "ws"
        val host = window.location.hostname
        val port = window.location.port.toIntOrNull() ?: if (protocol == "wss") 443 else 80
        
        client.webSocket(
            method = HttpMethod.Get,
            host = host,
            port = port,
            path = "$baseUrl/containers/$id/logs/stream?tail=$tail"
        ) {
            for (frame in incoming) {
                if (frame is Frame.Text) {
                    emit(frame.readText())
                }
            }
        }
    }
    
    /**
     * Gets container statistics.
     *
     * @param id Container ID
     * @param detailed Whether to get detailed statistics
     * @return Container statistics
     */
    suspend fun getContainerStats(id: String, detailed: Boolean = false): Any {
        return try {
            if (detailed) {
                client.get("$baseUrl/containers/$id/stats") {
                    parameter("detailed", true)
                }.body<DetailedContainerStats>()
            } else {
                client.get("$baseUrl/containers/$id/stats").body<ContainerStats>()
            }
        } catch (e: Exception) {
            console.warn("Failed to fetch container stats from API: ${e.message}")
            if (detailed) {
                DetailedContainerStats(
                    containerId = id,
                    timestamp = Clock.System.now().toEpochMilliseconds(),
                    cpuUsage = 0.0,
                    memoryUsage = 0,
                    memoryLimit = 0,
                    networkRx = 0,
                    networkTx = 0,
                    blockRead = 0,
                    blockWrite = 0,
                    cpuKernelUsage = 0.0,
                    cpuUserUsage = 0.0,
                    cpuSystemUsage = 0.0,
                    cpuOnlineCpus = 0,
                    memoryCache = 0,
                    memorySwap = 0,
                    memorySwapLimit = 0,
                    networkPacketsRx = 0,
                    networkPacketsTx = 0,
                    networkDroppedRx = 0,
                    networkDroppedTx = 0,
                    networkErrorsRx = 0,
                    networkErrorsTx = 0,
                    blockReadOps = 0,
                    blockWriteOps = 0,
                    pids = 0,
                    restartCount = 0
                )
            } else {
                ContainerStats(
                    containerId = id,
                    timestamp = Clock.System.now().toEpochMilliseconds(),
                    cpuUsage = 0.0,
                    memoryUsage = 0,
                    memoryLimit = 0,
                    networkRx = 0,
                    networkTx = 0,
                    blockRead = 0,
                    blockWrite = 0
                )
            }
        }
    }
    
    /**
     * Gets container statistics history.
     *
     * @param id Container ID
     * @param limit Maximum number of historical entries to return
     * @return List of historical container statistics
     */
    suspend fun getContainerStatsHistory(id: String, limit: Int = 100): List<DetailedContainerStats> {
        return try {
            client.get("$baseUrl/containers/$id/stats/history") {
                parameter("limit", limit)
            }.body()
        } catch (e: Exception) {
            console.warn("Failed to fetch container stats history from API: ${e.message}")
            emptyList()
        }
    }
    
    /**
     * Streams container statistics via WebSocket.
     *
     * @param id Container ID
     * @param interval Interval between stats updates in milliseconds
     * @param detailed Whether to get detailed statistics
     * @return Flow of container statistics
     */
    fun streamContainerStats(id: String, interval: Long = 1000, detailed: Boolean = true): Flow<Any> = flow {
        val protocol = if (window.location.protocol == "https:") "wss" else "ws"
        val host = window.location.hostname
        val port = window.location.port.toIntOrNull() ?: if (protocol == "wss") 443 else 80
        
        client.webSocket(
            method = HttpMethod.Get,
            host = host,
            port = port,
            path = "$baseUrl/containers/$id/stats/stream?interval=$interval&detailed=$detailed"
        ) {
            for (frame in incoming) {
                if (frame is Frame.Text) {
                    val text = frame.readText()
                    val stats = if (detailed) {
                        Json.decodeFromString<DetailedContainerStats>(text)
                    } else {
                        Json.decodeFromString<ContainerStats>(text)
                    }
                    emit(stats)
                }
            }
        }
    }
    
    /**
     * Gets all proxy rules.
     *
     * @return List of proxy rules
     */
    suspend fun getProxyRules(): List<ProxyRule> {
        return try {
            client.get("$baseUrl/proxy/rules").body()
        } catch (e: Exception) {
            console.warn("Failed to fetch proxy rules from API: ${e.message}. Using mock data.")
            // Return empty list when API is not available
            emptyList()
        }
    }
    
    /**
     * Gets a proxy rule by ID.
     *
     * @param id Proxy rule ID
     * @return Proxy rule details
     */
    suspend fun getProxyRule(id: String): ProxyRule {
        return client.get("$baseUrl/proxy/rules/$id").body()
    }
    
    /**
     * Creates a new proxy rule.
     *
     * @param rule Proxy rule to create
     * @return Created proxy rule
     */
    suspend fun createProxyRule(rule: ProxyRule): ProxyRule {
        return client.post("$baseUrl/proxy/rules") {
            contentType(ContentType.Application.Json)
            setBody(rule)
        }.body()
    }
    
    /**
     * Updates a proxy rule.
     *
     * @param id Proxy rule ID
     * @param rule Updated proxy rule
     * @return Updated proxy rule
     */
    suspend fun updateProxyRule(id: String, rule: ProxyRule): ProxyRule {
        return client.put("$baseUrl/proxy/rules/$id") {
            contentType(ContentType.Application.Json)
            setBody(rule)
        }.body()
    }
    
    /**
     * Deletes a proxy rule.
     *
     * @param id Proxy rule ID
     * @return true if successful
     */
    suspend fun deleteProxyRule(id: String): Boolean {
        val response = client.delete("$baseUrl/proxy/rules/$id")
        return response.status.isSuccess()
    }
    
    /**
     * Enables or disables a proxy rule.
     *
     * @param id Proxy rule ID
     * @param enabled Whether the rule should be enabled
     * @return Updated proxy rule
     */
    suspend fun toggleProxyRule(id: String, enabled: Boolean): ProxyRule {
        return client.post("$baseUrl/proxy/rules/$id/toggle") {
            parameter("enabled", enabled)
        }.body()
    }
    
    /**
     * Tests a proxy rule.
     *
     * @param rule Proxy rule to test
     * @return true if successful
     */
    suspend fun testProxyRule(rule: ProxyRule): Boolean {
        val response: Map<String, Any> = client.post("$baseUrl/proxy/rules/test") {
            contentType(ContentType.Application.Json)
            setBody(rule)
        }.body()
        return response["success"] as Boolean
    }
    
    /**
     * Exports proxy rules to a file.
     *
     * @param format Export format (json or yaml)
     * @param ruleIds Optional list of rule IDs to export
     * @return URL to download the exported file
     */
    fun getProxyRulesExportUrl(format: String, ruleIds: List<String>? = null): String {
        return "$baseUrl/proxy/rules/export"
    }
    
    /**
     * Exports proxy rules to a file.
     *
     * @param format Export format (json or yaml)
     * @param ruleIds Optional list of rule IDs to export
     */
    suspend fun exportProxyRules(format: String, ruleIds: List<String>? = null): ByteArray {
        return client.post("$baseUrl/proxy/rules/export") {
            contentType(ContentType.Application.Json)
            setBody(mapOf(
                "format" to format,
                "ruleIds" to ruleIds
            ))
        }.body()
    }
    
    /**
     * Imports proxy rules from a file.
     *
     * @param file File containing proxy rules
     * @param format Import format (json or yaml)
     * @param overwriteExisting Whether to overwrite existing rules with the same ID
     * @return Map containing success status and message
     */
    suspend fun importProxyRules(file: JsFile, format: String, overwriteExisting: Boolean = false): Map<String, Any> {
        return client.submitFormWithBinaryData(
            url = "$baseUrl/proxy/rules/import",
            formData = formData {
                append("format", format)
                append("overwriteExisting", overwriteExisting.toString())
                append("file", file.name)
            }
        ).body()
    }
    
    /**
     * Validates a proxy rule.
     *
     * @param rule Proxy rule to validate
     * @return Validation result
     */
    suspend fun validateProxyRule(rule: ProxyRule): Map<String, Any> {
        return client.post("$baseUrl/proxy/rules/validate") {
            contentType(ContentType.Application.Json)
            setBody(rule)
        }.body()
    }
    
    /**
     * Gets all SSL certificates.
     *
     * @return List of certificate names
     */
    suspend fun getCertificates(): List<String> {
        return try {
            client.get("$baseUrl/proxy/certificates").body()
        } catch (e: Exception) {
            console.warn("Failed to fetch certificates from API: ${e.message}")
            emptyList()
        }
    }
    
    /**
     * Uploads an SSL certificate.
     *
     * @param name Certificate name
     * @param certFile Certificate file
     * @param keyFile Key file (optional)
     * @return true if successful
     */
    suspend fun uploadCertificate(name: String, certFile: File, keyFile: File? = null): Boolean {
        val formData = FormData()
        formData.append("name", name)
        formData.append("cert", certFile)
        if (keyFile != null) {
            formData.append("key", keyFile)
        }
        
        val response: Map<String, Any> = client.post("$baseUrl/proxy/certificates") {
            setBody(formData)
        }.body()
        
        return response["success"] as Boolean
    }
    
    /**
     * Deletes an SSL certificate.
     *
     * @param name Certificate name
     * @return true if successful
     */
    suspend fun deleteCertificate(name: String): Boolean {
        val response: Map<String, Any> = client.delete("$baseUrl/proxy/certificates/$name").body()
        return response["success"] as Boolean
    }
    
    /**
     * Gets all Nginx templates.
     *
     * @return List of template names
     */
    suspend fun getNginxTemplates(): List<String> {
        return try {
            client.get("$baseUrl/proxy/templates").body()
        } catch (e: Exception) {
            console.warn("Failed to fetch templates from API: ${e.message}")
            emptyList()
        }
    }
    
    /**
     * Gets an Nginx template by name.
     *
     * @param name Template name
     * @return Template content
     */
    suspend fun getNginxTemplate(name: String): String? {
        return try {
            val response: Map<String, Any> = client.get("$baseUrl/proxy/templates/$name").body()
            response["content"] as String
        } catch (e: Exception) {
            console.warn("Failed to fetch template from API: ${e.message}")
            null
        }
    }
    
    /**
     * Saves an Nginx template.
     *
     * @param name Template name
     * @param content Template content
     * @return true if successful
     */
    suspend fun saveNginxTemplate(name: String, content: String): Boolean {
        val response: Map<String, Any> = client.post("$baseUrl/proxy/templates") {
            contentType(ContentType.Application.Json)
            setBody(mapOf("name" to name, "content" to content))
        }.body()
        
        return response["success"] as Boolean
    }
    
    /**
     * Deletes an Nginx template.
     *
     * @param name Template name
     * @return true if successful
     */
    suspend fun deleteNginxTemplate(name: String): Boolean {
        val response: Map<String, Any> = client.delete("$baseUrl/proxy/templates/$name").body()
        return response["success"] as Boolean
    }
    
    /**
     * Gets traffic data for a proxy rule.
     *
     * @param ruleId Proxy rule ID
     * @param limit Maximum number of data points to return
     * @return List of traffic data points
     */
    suspend fun getProxyTrafficData(ruleId: String, limit: Int = 100): List<ProxyTrafficData> {
        return try {
            client.get("$baseUrl/proxy/analytics/traffic/$ruleId") {
                parameter("limit", limit)
            }.body()
        } catch (e: Exception) {
            console.warn("Failed to fetch traffic data from API: ${e.message}")
            emptyList()
        }
    }
    
    /**
     * Gets traffic summary for a proxy rule.
     *
     * @param ruleId Proxy rule ID
     * @param period Time period for the summary (e.g., "last_hour", "last_day", "last_week")
     * @return Traffic summary
     */
    suspend fun getProxyTrafficSummary(ruleId: String, period: String = "last_hour"): ProxyTrafficSummary {
        return try {
            client.get("$baseUrl/proxy/analytics/traffic/$ruleId/summary") {
                parameter("period", period)
            }.body()
        } catch (e: Exception) {
            console.warn("Failed to fetch traffic summary from API: ${e.message}")
            ProxyTrafficSummary(
                ruleId = ruleId,
                totalRequests = 0,
                totalResponses = 0,
                totalBytesReceived = 0,
                totalBytesSent = 0,
                avgResponseTime = 0.0,
                statusCodeDistribution = emptyMap(),
                requestMethodDistribution = emptyMap(),
                topClientIps = emptyList(),
                topUserAgents = emptyList(),
                topPaths = emptyList(),
                period = period
            )
        }
    }
    
    /**
     * Streams real-time traffic updates for proxy rules.
     *
     * @return Flow of traffic data points
     */
    fun streamProxyTrafficData(): Flow<ProxyTrafficData> = flow {
        val protocol = if (window.location.protocol == "https:") "wss" else "ws"
        val host = window.location.hostname
        val port = window.location.port.toIntOrNull() ?: if (protocol == "wss") 443 else 80
        
        client.webSocket(
            method = HttpMethod.Get,
            host = host,
            port = port,
            path = "$baseUrl/proxy/analytics/traffic/stream"
        ) {
            for (frame in incoming) {
                if (frame is Frame.Text) {
                    val text = frame.readText()
                    val data = Json.decodeFromString<ProxyTrafficData>(text)
                    emit(data)
                }
            }
        }
    }
    
    /**
     * Gets errors for a proxy rule.
     *
     * @param ruleId Proxy rule ID
     * @param limit Maximum number of errors to return
     * @return List of errors
     */
    suspend fun getProxyErrors(ruleId: String, limit: Int = 100): List<ProxyError> {
        return try {
            client.get("$baseUrl/proxy/analytics/errors/$ruleId") {
                parameter("limit", limit)
            }.body()
        } catch (e: Exception) {
            console.warn("Failed to fetch errors from API: ${e.message}")
            emptyList()
        }
    }
    
    /**
     * Gets error summary for a proxy rule.
     *
     * @param ruleId Proxy rule ID
     * @param period Time period for the summary (e.g., "last_hour", "last_day", "last_week")
     * @return Error summary
     */
    suspend fun getProxyErrorSummary(ruleId: String, period: String = "last_hour"): ProxyErrorSummary {
        return try {
            client.get("$baseUrl/proxy/analytics/errors/$ruleId/summary") {
                parameter("period", period)
            }.body()
        } catch (e: Exception) {
            console.warn("Failed to fetch error summary from API: ${e.message}")
            ProxyErrorSummary(
                ruleId = ruleId,
                totalErrors = 0,
                errorsByType = emptyMap(),
                errorsByStatusCode = emptyMap(),
                errorRate = 0.0,
                period = period,
                topErrorPaths = emptyList(),
                topErrorClients = emptyList()
            )
        }
    }
    
    /**
     * Streams real-time error updates for proxy rules.
     *
     * @return Flow of errors
     */
    fun streamProxyErrors(): Flow<ProxyError> = flow {
        val protocol = if (window.location.protocol == "https:") "wss" else "ws"
        val host = window.location.hostname
        val port = window.location.port.toIntOrNull() ?: if (protocol == "wss") 443 else 80
        
        client.webSocket(
            method = HttpMethod.Get,
            host = host,
            port = port,
            path = "$baseUrl/proxy/analytics/errors/stream"
        ) {
            for (frame in incoming) {
                if (frame is Frame.Text) {
                    val text = frame.readText()
                    val error = Json.decodeFromString<ProxyError>(text)
                    emit(error)
                }
            }
        }
    }
    
    /**
     * Gets request logs for a proxy rule.
     *
     * @param ruleId Proxy rule ID
     * @param limit Maximum number of logs to return
     * @return List of request logs
     */
    suspend fun getRequestLogs(ruleId: String, limit: Int = 100): List<RequestResponseLog> {
        return try {
            client.get("$baseUrl/proxy/analytics/logs/$ruleId") {
                parameter("limit", limit)
            }.body()
        } catch (e: Exception) {
            console.warn("Failed to fetch request logs from API: ${e.message}")
            emptyList()
        }
    }
    
    /**
     * Searches request logs for a proxy rule.
     *
     * @param ruleId Proxy rule ID
     * @param clientIp Filter by client IP
     * @param method Filter by HTTP method
     * @param path Filter by path
     * @param statusCode Filter by status code
     * @param minResponseTime Filter by minimum response time
     * @param maxResponseTime Filter by maximum response time
     * @param startTime Filter by start time
     * @param endTime Filter by end time
     * @param limit Maximum number of logs to return
     * @return List of request logs
     */
    suspend fun searchRequestLogs(
        ruleId: String,
        clientIp: String? = null,
        method: String? = null,
        path: String? = null,
        statusCode: Int? = null,
        minResponseTime: Double? = null,
        maxResponseTime: Double? = null,
        startTime: Long? = null,
        endTime: Long? = null,
        limit: Int = 100
    ): List<RequestResponseLog> {
        return try {
            client.get("$baseUrl/proxy/analytics/logs/$ruleId/search") {
                if (clientIp != null) parameter("clientIp", clientIp)
                if (method != null) parameter("method", method)
                if (path != null) parameter("path", path)
                if (statusCode != null) parameter("statusCode", statusCode)
                if (minResponseTime != null) parameter("minResponseTime", minResponseTime)
                if (maxResponseTime != null) parameter("maxResponseTime", maxResponseTime)
                if (startTime != null) parameter("startTime", startTime)
                if (endTime != null) parameter("endTime", endTime)
                parameter("limit", limit)
            }.body()
        } catch (e: Exception) {
            console.warn("Failed to search request logs from API: ${e.message}")
            emptyList()
        }
    }
    
    /**
     * Streams real-time request log updates.
     *
     * @return Flow of request logs
     */
    fun streamRequestLogs(): Flow<RequestResponseLog> = flow {
        val protocol = if (window.location.protocol == "https:") "wss" else "ws"
        val host = window.location.hostname
        val port = window.location.port.toIntOrNull() ?: if (protocol == "wss") 443 else 80
        
        client.webSocket(
            method = HttpMethod.Get,
            host = host,
            port = port,
            path = "$baseUrl/proxy/analytics/logs/stream"
        ) {
            for (frame in incoming) {
                if (frame is Frame.Text) {
                    val text = frame.readText()
                    val log = Json.decodeFromString<RequestResponseLog>(text)
                    emit(log)
                }
            }
        }
    }
    
    /**
     * Gets all alert configurations.
     *
     * @return List of alert configurations
     */
    suspend fun getAlertConfigs(): List<ErrorAlertConfig> {
        return try {
            client.get("$baseUrl/proxy/analytics/alerts/configs").body()
        } catch (e: Exception) {
            console.warn("Failed to fetch alert configs from API: ${e.message}")
            emptyList()
        }
    }
    
    /**
     * Gets an alert configuration by ID.
     *
     * @param id Alert configuration ID
     * @return Alert configuration
     */
    suspend fun getAlertConfig(id: String): ErrorAlertConfig? {
        return try {
            client.get("$baseUrl/proxy/analytics/alerts/configs/$id").body()
        } catch (e: Exception) {
            console.warn("Failed to fetch alert config from API: ${e.message}")
            null
        }
    }
    
    /**
     * Creates an alert configuration.
     *
     * @param config Alert configuration
     * @return Created alert configuration
     */
    suspend fun createAlertConfig(config: ErrorAlertConfig): ErrorAlertConfig {
        return client.post("$baseUrl/proxy/analytics/alerts/configs") {
            contentType(ContentType.Application.Json)
            setBody(config)
        }.body()
    }
    
    /**
     * Updates an alert configuration.
     *
     * @param id Alert configuration ID
     * @param config Updated alert configuration
     * @return Updated alert configuration
     */
    suspend fun updateAlertConfig(id: String, config: ErrorAlertConfig): ErrorAlertConfig {
        return client.put("$baseUrl/proxy/analytics/alerts/configs/$id") {
            contentType(ContentType.Application.Json)
            setBody(config)
        }.body()
    }
    
    /**
     * Deletes an alert configuration.
     *
     * @param id Alert configuration ID
     * @return true if successful
     */
    suspend fun deleteAlertConfig(id: String): Boolean {
        val response = client.delete("$baseUrl/proxy/analytics/alerts/configs/$id")
        return response.status.isSuccess()
    }
    
    /**
     * Gets all active alerts.
     *
     * @return List of active alerts
     */
    suspend fun getActiveAlerts(): List<ErrorAlert> {
        return try {
            client.get("$baseUrl/proxy/analytics/alerts").body()
        } catch (e: Exception) {
            console.warn("Failed to fetch active alerts from API: ${e.message}")
            emptyList()
        }
    }
    
    /**
     * Acknowledges an alert.
     *
     * @param id Alert ID
     * @param acknowledgedBy User who acknowledged the alert
     * @return Updated alert
     */
    suspend fun acknowledgeAlert(id: String, acknowledgedBy: String): ErrorAlert? {
        return try {
            client.post("$baseUrl/proxy/analytics/alerts/$id/acknowledge") {
                parameter("by", acknowledgedBy)
            }.body()
        } catch (e: Exception) {
            console.warn("Failed to acknowledge alert: ${e.message}")
            null
        }
    }
    
    /**
     * Resolves an alert.
     *
     * @param id Alert ID
     * @return Updated alert
     */
    suspend fun resolveAlert(id: String): ErrorAlert? {
        return try {
            client.post("$baseUrl/proxy/analytics/alerts/$id/resolve").body()
        } catch (e: Exception) {
            console.warn("Failed to resolve alert: ${e.message}")
            null
        }
    }
    
    /**
     * Streams real-time alert updates.
     *
     * @return Flow of alerts
     */
    fun streamAlerts(): Flow<ErrorAlert> = flow {
        val protocol = if (window.location.protocol == "https:") "wss" else "ws"
        val host = window.location.hostname
        val port = window.location.port.toIntOrNull() ?: if (protocol == "wss") 443 else 80
        
        client.webSocket(
            method = HttpMethod.Get,
            host = host,
            port = port,
            path = "$baseUrl/proxy/analytics/alerts/stream"
        ) {
            for (frame in incoming) {
                if (frame is Frame.Text) {
                    val text = frame.readText()
                    val alert = Json.decodeFromString<ErrorAlert>(text)
                    emit(alert)
                }
            }
        }
    }
    
    /**
     * Gets all configuration backups.
     *
     * @return List of configuration backups
     */
    suspend fun getConfigurationBackups(): List<ConfigurationBackup> {
        return try {
            client.get("$baseUrl/configuration/backups").body()
        } catch (e: Exception) {
            console.warn("Failed to fetch configuration backups: ${e.message}")
            emptyList()
        }
    }
    
    /**
     * Creates a new configuration backup.
     *
     * @param description Optional description of the backup
     * @param createdBy Optional user who created the backup
     * @return Map containing success status, message, and backup path
     */
    suspend fun createConfigurationBackup(description: String? = null, createdBy: String? = null): Map<String, Any> {
        return try {
            client.post("$baseUrl/configuration/backups") {
                contentType(ContentType.Application.Json)
                setBody(mapOf(
                    "description" to description,
                    "createdBy" to createdBy
                ))
            }.body()
        } catch (e: Exception) {
            console.error("Failed to create configuration backup: ${e.message}")
            mapOf(
                "success" to false,
                "message" to "Failed to create configuration backup: ${e.message}"
            )
        }
    }
    
    /**
     * Deletes a configuration backup.
     *
     * @param backupPath Path to the backup file
     * @return Map containing success status and message
     */
    suspend fun deleteConfigurationBackup(backupPath: String): Map<String, Any> {
        return try {
            client.delete("$baseUrl/configuration/backups") {
                parameter("path", backupPath)
            }.body()
        } catch (e: Exception) {
            console.error("Failed to delete configuration backup: ${e.message}")
            mapOf(
                "success" to false,
                "message" to "Failed to delete configuration backup: ${e.message}"
            )
        }
    }
    
    /**
     * Restores configuration from a backup.
     *
     * @param backupPath Path to the backup file
     * @param restoreProxyRules Whether to restore proxy rules
     * @param restoreCertificates Whether to restore SSL certificates
     * @param restoreTemplates Whether to restore Nginx templates
     * @return Map containing success status and message
     */
    suspend fun restoreConfiguration(
        backupPath: String,
        restoreProxyRules: Boolean = true,
        restoreCertificates: Boolean = true,
        restoreTemplates: Boolean = true
    ): Map<String, Any> {
        return try {
            client.post("$baseUrl/configuration/restore") {
                contentType(ContentType.Application.Json)
                setBody(mapOf(
                    "backupPath" to backupPath,
                    "restoreProxyRules" to restoreProxyRules,
                    "restoreCertificates" to restoreCertificates,
                    "restoreTemplates" to restoreTemplates
                ))
            }.body()
        } catch (e: Exception) {
            console.error("Failed to restore configuration: ${e.message}")
            mapOf(
                "success" to false,
                "message" to "Failed to restore configuration: ${e.message}"
            )
        }
    }
    
    /**
     * Uploads a configuration backup file.
     *
     * @param fileName Name of the backup file
     * @param file Backup file
     * @return Map containing success status, message, and backup path
     */
    suspend fun uploadConfigurationBackup(fileName: String, file: JsFile): Map<String, Any> {
        return try {
            client.submitFormWithBinaryData(
                url = "$baseUrl/configuration/backups/upload",
                formData = formData {
                    append("fileName", fileName)
                    append("file", file.name)
                }
            ).body()
        } catch (e: Exception) {
            console.error("Failed to upload configuration backup: ${e.message}")
            mapOf(
                "success" to false,
                "message" to "Failed to upload configuration backup: ${e.message}"
            )
        }
    }
    
    /**
     * Gets the download URL for a configuration backup file.
     *
     * @param backupPath Path to the backup file
     * @return Download URL
     */
    fun getConfigurationBackupDownloadUrl(backupPath: String): String {
        return "$baseUrl/configuration/backups/download?path=$backupPath"
    }
    
    /**
     * Gets the overall system health status.
     *
     * @return Map containing status and timestamp
     */
    suspend fun getSystemHealth(): Map<String, Any> {
        return try {
            client.get("$baseUrl/health").body()
        } catch (e: Exception) {
            console.warn("Failed to fetch system health: ${e.message}")
            mapOf(
                "status" to "UNKNOWN",
                "timestamp" to kotlinx.datetime.Clock.System.now().toEpochMilliseconds()
            )
        }
    }
    
    /**
     * Gets all health check results.
     *
     * @return List of health check results
     */
    suspend fun getHealthChecks(): List<HealthCheckResult> {
        return try {
            client.get("$baseUrl/health/checks").body()
        } catch (e: Exception) {
            console.warn("Failed to fetch health checks: ${e.message}")
            emptyList()
        }
    }
    
    /**
     * Gets a health check result by component ID.
     *
     * @param componentId Component ID
     * @return Health check result
     */
    suspend fun getHealthCheck(componentId: String): HealthCheckResult? {
        return try {
            client.get("$baseUrl/health/checks/$componentId").body()
        } catch (e: Exception) {
            console.warn("Failed to fetch health check: ${e.message}")
            null
        }
    }
    
    /**
     * Gets system resource metrics.
     *
     * @param limit Maximum number of metrics to return
     * @return List of system resource metrics
     */
    suspend fun getSystemResourceMetrics(limit: Int = 100): List<SystemResourceMetrics> {
        return try {
            client.get("$baseUrl/health/metrics") {
                parameter("limit", limit)
            }.body()
        } catch (e: Exception) {
            console.warn("Failed to fetch system resource metrics: ${e.message}")
            emptyList()
        }
    }
    
    /**
     * Gets the latest system resource metrics.
     *
     * @return Latest system resource metrics
     */
    suspend fun getLatestSystemResourceMetrics(): SystemResourceMetrics? {
        return try {
            client.get("$baseUrl/health/metrics/latest").body()
        } catch (e: Exception) {
            console.warn("Failed to fetch latest system resource metrics: ${e.message}")
            null
        }
    }
    
    /**
     * Streams health check updates.
     *
     * @return Flow of health check results
     */
    fun streamHealthChecks(): Flow<HealthCheckResult> = flow {
        val protocol = if (window.location.protocol == "https:") "wss" else "ws"
        val host = window.location.hostname
        val port = window.location.port.toIntOrNull() ?: if (protocol == "wss") 443 else 80
        
        client.webSocket(
            method = HttpMethod.Get,
            host = host,
            port = port,
            path = "$baseUrl/health/stream/checks"
        ) {
            for (frame in incoming) {
                if (frame is Frame.Text) {
                    val healthCheck = Json.decodeFromString<HealthCheckResult>(frame.readText())
                    emit(healthCheck)
                }
            }
        }
    }
    
    /**
     * Streams system resource metrics updates.
     *
     * @return Flow of system resource metrics
     */
    fun streamSystemResourceMetrics(): Flow<SystemResourceMetrics> = flow {
        val protocol = if (window.location.protocol == "https:") "wss" else "ws"
        val host = window.location.hostname
        val port = window.location.port.toIntOrNull() ?: if (protocol == "wss") 443 else 80
        
        client.webSocket(
            method = HttpMethod.Get,
            host = host,
            port = port,
            path = "$baseUrl/health/stream/metrics"
        ) {
            for (frame in incoming) {
                if (frame is Frame.Text) {
                    val metrics = Json.decodeFromString<SystemResourceMetrics>(frame.readText())
                    emit(metrics)
                }
            }
        }
    }
}