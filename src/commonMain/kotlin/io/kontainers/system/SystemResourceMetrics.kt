package io.kontainers.system

import kotlinx.serialization.Serializable

/**
 * Data class representing system resource metrics.
 */
@Serializable
data class SystemResourceMetrics(
    val cpuUsage: Double,
    val memoryUsage: Long,
    val memoryTotal: Long,
    val diskUsage: Long,
    val diskTotal: Long,
    val networkRxKBps: Double = 0.0,
    val networkTxKBps: Double = 0.0,
    
    // Additional fields needed by JS components
    val cpuUsagePercent: Double = cpuUsage * 100.0,
    val memoryUsagePercent: Double = if (memoryTotal > 0) (memoryUsage.toDouble() / memoryTotal.toDouble()) * 100.0 else 0.0,
    val memoryUsedMB: Long = memoryUsage / (1024 * 1024),
    val memoryTotalMB: Long = memoryTotal / (1024 * 1024),
    val diskUsagePercent: Double = if (diskTotal > 0) (diskUsage.toDouble() / diskTotal.toDouble()) * 100.0 else 0.0,
    val diskUsedGB: Double = diskUsage.toDouble() / (1024 * 1024 * 1024),
    val diskTotalGB: Double = diskTotal.toDouble() / (1024 * 1024 * 1024),
    val timestamp: Long = 0 // Default to 0 for common module, JVM can override with System.currentTimeMillis()
)