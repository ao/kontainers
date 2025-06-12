package io.kontainers.model

import kotlinx.serialization.Serializable

/**
 * Represents an error that occurred in the proxy.
 */
@Serializable
data class ProxyError(
    val id: String,
    val ruleId: String,
    val timestamp: Long,
    val errorType: ProxyErrorType,
    val statusCode: Int?,
    val message: String,
    val clientIp: String?,
    val method: String?,
    val path: String?,
    val requestId: String?,
    val stackTrace: String?,
    val resolved: Boolean = false,
    val resolvedAt: Long? = null,
    val resolution: String? = null
)

/**
 * Represents the type of proxy error.
 */
@Serializable
enum class ProxyErrorType {
    CONNECTION_REFUSED,
    TIMEOUT,
    SSL_ERROR,
    BAD_GATEWAY,
    GATEWAY_TIMEOUT,
    CLIENT_ERROR,
    SERVER_ERROR,
    RATE_LIMIT_EXCEEDED,
    CONFIGURATION_ERROR,
    UNKNOWN
}

/**
 * Represents a summary of errors for a proxy rule.
 */
@Serializable
data class ProxyErrorSummary(
    val ruleId: String,
    val totalErrors: Long,
    val errorsByType: Map<ProxyErrorType, Long>,
    val errorsByStatusCode: Map<Int, Long>,
    val errorRate: Double, // errors / total requests
    val period: String, // e.g., "last_hour", "last_day", "last_week"
    val topErrorPaths: List<Pair<String, Long>>,
    val topErrorClients: List<Pair<String, Long>>
)

/**
 * Represents an alert configuration for proxy errors.
 */
@Serializable
data class ErrorAlertConfig(
    val id: String,
    val ruleId: String?,  // null means all rules
    val name: String,
    val errorType: ProxyErrorType?,  // null means all error types
    val statusCode: Int?,  // null means all status codes
    val threshold: Double,  // error rate threshold to trigger alert
    val timeWindow: Long,  // time window in milliseconds to calculate error rate
    val minRequests: Int,  // minimum number of requests to consider for alerting
    val enabled: Boolean = true,
    val notificationChannels: List<NotificationChannel> = emptyList()
)

/**
 * Represents a notification channel for alerts.
 */
@Serializable
data class NotificationChannel(
    val type: NotificationType,
    val destination: String,  // email address, webhook URL, etc.
    val enabled: Boolean = true
)

/**
 * Represents the type of notification.
 */
@Serializable
enum class NotificationType {
    EMAIL,
    WEBHOOK,
    SLACK,
    TEAMS,
    SMS
}

/**
 * Represents an alert triggered by proxy errors.
 */
@Serializable
data class ErrorAlert(
    val id: String,
    val configId: String,
    val ruleId: String?,
    val timestamp: Long,
    val errorRate: Double,
    val errorCount: Long,
    val requestCount: Long,
    val message: String,
    val status: AlertStatus,
    val acknowledgedAt: Long? = null,
    val acknowledgedBy: String? = null,
    val resolvedAt: Long? = null
)

/**
 * Represents the status of an alert.
 */
@Serializable
enum class AlertStatus {
    ACTIVE,
    ACKNOWLEDGED,
    RESOLVED
}