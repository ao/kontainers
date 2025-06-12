package io.kontainers.system

import kotlinx.serialization.Serializable

/**
 * Enum representing the health status of a component.
 */
@Serializable
enum class HealthStatus {
    HEALTHY, DEGRADED, UNHEALTHY, UNKNOWN
}