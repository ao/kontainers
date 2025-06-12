package io.kontainers.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

/**
 * Represents detailed container resource usage statistics.
 * Extends the basic ContainerStats with additional metrics for enhanced monitoring.
 */
@Serializable
data class DetailedContainerStats(
    // Base stats from ContainerStats
    val containerId: String,
    val timestamp: Long,
    val cpuUsage: Double,
    val memoryUsage: Long,
    val memoryLimit: Long,
    val networkRx: Long,
    val networkTx: Long,
    val blockRead: Long,
    val blockWrite: Long,
    
    // Enhanced metrics
    val cpuKernelUsage: Double,
    val cpuUserUsage: Double,
    val cpuSystemUsage: Double,
    val cpuOnlineCpus: Int,
    val memoryCache: Long,
    val memorySwap: Long,
    val memorySwapLimit: Long,
    val networkPacketsRx: Long,
    val networkPacketsTx: Long,
    val networkDroppedRx: Long,
    val networkDroppedTx: Long,
    val networkErrorsRx: Long,
    val networkErrorsTx: Long,
    val blockReadOps: Long,
    val blockWriteOps: Long,
    val pids: Int,
    val restartCount: Int,
    val healthStatus: HealthStatus = HealthStatus.UNKNOWN,
    val healthCheckLogs: List<String> = emptyList()
) {
    /**
     * Calculates memory usage as a percentage of the limit.
     * Returns 0.0 if there is no memory limit.
     */
    @Transient
    val memoryUsagePercentage: Double
        get() = if (memoryLimit > 0) memoryUsage.toDouble() / memoryLimit.toDouble() else 0.0
    
    /**
     * Calculates swap usage as a percentage of the limit.
     * Returns 0.0 if there is no swap limit.
     */
    @Transient
    val swapUsagePercentage: Double
        get() = if (memorySwapLimit > 0) memorySwap.toDouble() / memorySwapLimit.toDouble() else 0.0
    
    /**
     * Calculates total network throughput (rx + tx).
     */
    @Transient
    val networkThroughput: Long
        get() = networkRx + networkTx
    
    /**
     * Calculates total disk throughput (read + write).
     */
    @Transient
    val blockThroughput: Long
        get() = blockRead + blockWrite
    
    /**
     * Converts from basic ContainerStats to DetailedContainerStats with default values for enhanced metrics.
     */
    companion object {
        fun fromContainerStats(stats: ContainerStats): DetailedContainerStats {
            return DetailedContainerStats(
                containerId = stats.containerId,
                timestamp = stats.timestamp,
                cpuUsage = stats.cpuUsage,
                memoryUsage = stats.memoryUsage,
                memoryLimit = stats.memoryLimit,
                networkRx = stats.networkRx,
                networkTx = stats.networkTx,
                blockRead = stats.blockRead,
                blockWrite = stats.blockWrite,
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
                restartCount = 0,
                healthStatus = HealthStatus.UNKNOWN,
                healthCheckLogs = emptyList()
            )
        }
    }
}

/**
 * Represents the health status of a container.
 */
@Serializable
enum class HealthStatus {
    HEALTHY,
    UNHEALTHY,
    STARTING,
    UNKNOWN
}