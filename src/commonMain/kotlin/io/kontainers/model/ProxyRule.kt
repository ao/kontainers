package io.kontainers.model

import kotlinx.serialization.Serializable

/**
 * Represents a proxy rule for routing traffic to a container.
 */
@Serializable
data class ProxyRule(
    val id: String,
    val name: String,
    val sourceHost: String,
    val sourcePath: String = "/",
    val targetContainer: String,
    val targetPort: Int,
    val protocol: ProxyProtocol = ProxyProtocol.HTTP,
    val sslEnabled: Boolean = false,
    val sslCertPath: String? = null,
    val headers: Map<String, String> = emptyMap(),
    val healthCheck: HealthCheck? = null,
    val created: Long,
    val enabled: Boolean = true
)

/**
 * Represents the protocol for a proxy rule.
 */
@Serializable
enum class ProxyProtocol {
    HTTP, HTTPS, TCP, UDP
}

/**
 * Represents a health check configuration for a proxy rule.
 */
@Serializable
data class HealthCheck(
    val path: String = "/health",
    val interval: Int = 30,
    val timeout: Int = 5,
    val retries: Int = 3
)