package io.kontainers.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

/**
 * Represents container resource usage statistics.
 */
@Serializable
data class ContainerStats(
    val containerId: String,
    val timestamp: Long,
    val cpuUsage: Double,
    val memoryUsage: Long,
    val memoryLimit: Long,
    val networkRx: Long,
    val networkTx: Long,
    val blockRead: Long,
    val blockWrite: Long
) {
    /**
     * Calculates memory usage as a percentage of the limit.
     * Returns 0.0 if there is no memory limit.
     */
    @Transient
    val memoryUsagePercentage: Double
        get() = if (memoryLimit > 0) memoryUsage.toDouble() / memoryLimit.toDouble() else 0.0
}