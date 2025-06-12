package io.kontainers.system

import kotlinx.serialization.Serializable

/**
 * Data class representing a health check result.
 */
@Serializable
data class HealthCheckResult(
    val componentId: String,
    val componentName: String,
    val status: HealthStatus,
    val message: String? = null,
    val details: Map<String, String> = emptyMap(),
    val timestamp: Long = 0 // Default to 0 for common module, JVM can override with System.currentTimeMillis()
)