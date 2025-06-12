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
    val sslKeyPath: String? = null,
    val headers: Map<String, String> = emptyMap(),
    val responseHeaders: Map<String, String> = emptyMap(),
    val healthCheck: HealthCheck? = null,
    val loadBalancing: LoadBalancingConfig? = null,
    val advancedConfig: AdvancedProxyConfig? = null,
    val customNginxConfig: String? = null,
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
    val retries: Int = 3,
    val successCodes: String = "200-399"
)

/**
 * Represents load balancing configuration for a proxy rule.
 */
@Serializable
data class LoadBalancingConfig(
    val method: LoadBalancingMethod = LoadBalancingMethod.ROUND_ROBIN,
    val targets: List<LoadBalancingTarget> = emptyList(),
    val sticky: Boolean = false,
    val cookieName: String? = null,
    val cookieExpiry: Int? = null
)

/**
 * Represents a load balancing target.
 */
@Serializable
data class LoadBalancingTarget(
    val container: String,
    val port: Int,
    val weight: Int = 1
)

/**
 * Represents the load balancing method.
 */
@Serializable
enum class LoadBalancingMethod {
    ROUND_ROBIN, LEAST_CONN, IP_HASH, RANDOM
}

/**
 * Represents advanced proxy configuration options.
 */
@Serializable
data class AdvancedProxyConfig(
    val clientMaxBodySize: String? = null,
    val proxyConnectTimeout: Int = 60,
    val proxySendTimeout: Int = 60,
    val proxyReadTimeout: Int = 60,
    val proxyBufferSize: String? = null,
    val proxyBuffers: String? = null,
    val proxyBusyBuffersSize: String? = null,
    val cacheEnabled: Boolean = false,
    val cacheDuration: String? = null,
    val corsEnabled: Boolean = false,
    val corsAllowOrigin: String? = null,
    val corsAllowMethods: String? = null,
    val corsAllowHeaders: String? = null,
    val corsAllowCredentials: Boolean = false,
    val rateLimit: RateLimitConfig? = null,
    val rewriteRules: List<RewriteRule> = emptyList()
)

/**
 * Represents a rate limit configuration.
 */
@Serializable
data class RateLimitConfig(
    val requestsPerSecond: Int,
    val burstSize: Int = 5,
    val nodelay: Boolean = false
)

/**
 * Represents a URL rewrite rule.
 */
@Serializable
data class RewriteRule(
    val pattern: String,
    val replacement: String,
    val flag: String = "last"
)