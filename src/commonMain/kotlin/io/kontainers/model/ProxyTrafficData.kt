package io.kontainers.model

import kotlinx.serialization.Serializable

/**
 * Represents traffic data for a proxy rule.
 */
@Serializable
data class ProxyTrafficData(
    val id: String,
    val ruleId: String,
    val timestamp: Long,
    val requestCount: Long,
    val responseCount: Long,
    val bytesReceived: Long,
    val bytesSent: Long,
    val avgResponseTime: Double,
    val statusCodes: Map<Int, Long> = emptyMap(),
    val requestMethods: Map<String, Long> = emptyMap(),
    val clientIps: Map<String, Long> = emptyMap(),
    val userAgents: Map<String, Long> = emptyMap(),
    val pathHits: Map<String, Long> = emptyMap()
)

/**
 * Represents a time-series collection of traffic data.
 */
@Serializable
data class ProxyTrafficTimeSeries(
    val ruleId: String,
    val interval: Long, // interval in milliseconds
    val startTime: Long,
    val endTime: Long,
    val dataPoints: List<ProxyTrafficData>
)

/**
 * Represents a summary of traffic data for a proxy rule.
 */
@Serializable
data class ProxyTrafficSummary(
    val ruleId: String,
    val totalRequests: Long,
    val totalResponses: Long,
    val totalBytesReceived: Long,
    val totalBytesSent: Long,
    val avgResponseTime: Double,
    val statusCodeDistribution: Map<Int, Long>,
    val requestMethodDistribution: Map<String, Long>,
    val topClientIps: List<Pair<String, Long>>,
    val topUserAgents: List<Pair<String, Long>>,
    val topPaths: List<Pair<String, Long>>,
    val period: String // e.g., "last_hour", "last_day", "last_week"
)

/**
 * Represents a single request/response log entry.
 */
@Serializable
data class RequestResponseLog(
    val id: String,
    val ruleId: String,
    val timestamp: Long,
    val clientIp: String,
    val method: String,
    val path: String,
    val queryString: String?,
    val statusCode: Int,
    val responseTime: Double,
    val bytesReceived: Long,
    val bytesSent: Long,
    val userAgent: String?,
    val referer: String?,
    val requestHeaders: Map<String, String>?,
    val responseHeaders: Map<String, String>?,
    val requestBody: String?,
    val responseBody: String?
)