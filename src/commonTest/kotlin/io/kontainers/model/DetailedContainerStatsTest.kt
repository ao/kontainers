package io.kontainers.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class DetailedContainerStatsTest {
    
    @Test
    fun testDetailedContainerStatsSerialization() {
        val stats = DetailedContainerStats(
            containerId = "123abc",
            timestamp = 1623456789,
            cpuUsage = 0.5,
            memoryUsage = 1024 * 1024 * 100, // 100 MB
            memoryLimit = 1024 * 1024 * 1024, // 1 GB
            networkRx = 1024 * 500, // 500 KB
            networkTx = 1024 * 200, // 200 KB
            blockRead = 1024 * 1024 * 10, // 10 MB
            blockWrite = 1024 * 1024 * 5, // 5 MB
            cpuKernelUsage = 0.2,
            cpuUserUsage = 0.3,
            cpuSystemUsage = 0.5,
            cpuOnlineCpus = 4,
            memoryCache = 1024 * 1024 * 50, // 50 MB
            memorySwap = 1024 * 1024 * 20, // 20 MB
            memorySwapLimit = 1024 * 1024 * 512, // 512 MB
            networkPacketsRx = 1000,
            networkPacketsTx = 500,
            networkDroppedRx = 10,
            networkDroppedTx = 5,
            networkErrorsRx = 2,
            networkErrorsTx = 1,
            blockReadOps = 500,
            blockWriteOps = 300,
            pids = 15,
            restartCount = 2,
            healthStatus = HealthStatus.HEALTHY,
            healthCheckLogs = listOf("Health check passed", "All systems operational")
        )
        
        val json = Json.encodeToString(stats)
        val decoded = Json.decodeFromString<DetailedContainerStats>(json)
        
        assertEquals(stats.containerId, decoded.containerId)
        assertEquals(stats.timestamp, decoded.timestamp)
        assertEquals(stats.cpuUsage, decoded.cpuUsage)
        assertEquals(stats.memoryUsage, decoded.memoryUsage)
        assertEquals(stats.memoryLimit, decoded.memoryLimit)
        assertEquals(stats.networkRx, decoded.networkRx)
        assertEquals(stats.networkTx, decoded.networkTx)
        assertEquals(stats.blockRead, decoded.blockRead)
        assertEquals(stats.blockWrite, decoded.blockWrite)
        assertEquals(stats.cpuKernelUsage, decoded.cpuKernelUsage)
        assertEquals(stats.cpuUserUsage, decoded.cpuUserUsage)
        assertEquals(stats.cpuSystemUsage, decoded.cpuSystemUsage)
        assertEquals(stats.cpuOnlineCpus, decoded.cpuOnlineCpus)
        assertEquals(stats.memoryCache, decoded.memoryCache)
        assertEquals(stats.memorySwap, decoded.memorySwap)
        assertEquals(stats.memorySwapLimit, decoded.memorySwapLimit)
        assertEquals(stats.networkPacketsRx, decoded.networkPacketsRx)
        assertEquals(stats.networkPacketsTx, decoded.networkPacketsTx)
        assertEquals(stats.networkDroppedRx, decoded.networkDroppedRx)
        assertEquals(stats.networkDroppedTx, decoded.networkDroppedTx)
        assertEquals(stats.networkErrorsRx, decoded.networkErrorsRx)
        assertEquals(stats.networkErrorsTx, decoded.networkErrorsTx)
        assertEquals(stats.blockReadOps, decoded.blockReadOps)
        assertEquals(stats.blockWriteOps, decoded.blockWriteOps)
        assertEquals(stats.pids, decoded.pids)
        assertEquals(stats.restartCount, decoded.restartCount)
        assertEquals(stats.healthStatus, decoded.healthStatus)
        assertEquals(stats.healthCheckLogs, decoded.healthCheckLogs)
    }
    
    @Test
    fun testCalculatedProperties() {
        val stats = DetailedContainerStats(
            containerId = "123abc",
            timestamp = 1623456789,
            cpuUsage = 0.5,
            memoryUsage = 1024 * 1024 * 500, // 500 MB
            memoryLimit = 1024 * 1024 * 1024, // 1 GB
            networkRx = 1024 * 500, // 500 KB
            networkTx = 1024 * 200, // 200 KB
            blockRead = 1024 * 1024 * 10, // 10 MB
            blockWrite = 1024 * 1024 * 5, // 5 MB
            cpuKernelUsage = 0.2,
            cpuUserUsage = 0.3,
            cpuSystemUsage = 0.5,
            cpuOnlineCpus = 4,
            memoryCache = 1024 * 1024 * 50, // 50 MB
            memorySwap = 1024 * 1024 * 100, // 100 MB
            memorySwapLimit = 1024 * 1024 * 512, // 512 MB
            networkPacketsRx = 1000,
            networkPacketsTx = 500,
            networkDroppedRx = 10,
            networkDroppedTx = 5,
            networkErrorsRx = 2,
            networkErrorsTx = 1,
            blockReadOps = 500,
            blockWriteOps = 300,
            pids = 15,
            restartCount = 2,
            healthStatus = HealthStatus.HEALTHY,
            healthCheckLogs = listOf("Health check passed")
        )
        
        // Test memory usage percentage
        assertEquals(0.48828125, stats.memoryUsagePercentage, 0.001)
        
        // Test swap usage percentage
        assertEquals(0.1953125, stats.swapUsagePercentage, 0.001)
        
        // Test network throughput
        assertEquals(1024 * 700, stats.networkThroughput)
        
        // Test block throughput
        assertEquals(1024 * 1024 * 15, stats.blockThroughput)
    }
    
    @Test
    fun testFromContainerStats() {
        val containerStats = ContainerStats(
            containerId = "123abc",
            timestamp = 1623456789,
            cpuUsage = 0.5,
            memoryUsage = 1024 * 1024 * 100, // 100 MB
            memoryLimit = 1024 * 1024 * 1024, // 1 GB
            networkRx = 1024 * 500, // 500 KB
            networkTx = 1024 * 200, // 200 KB
            blockRead = 1024 * 1024 * 10, // 10 MB
            blockWrite = 1024 * 1024 * 5 // 5 MB
        )
        
        val detailedStats = DetailedContainerStats.fromContainerStats(containerStats)
        
        // Verify base properties are copied correctly
        assertEquals(containerStats.containerId, detailedStats.containerId)
        assertEquals(containerStats.timestamp, detailedStats.timestamp)
        assertEquals(containerStats.cpuUsage, detailedStats.cpuUsage)
        assertEquals(containerStats.memoryUsage, detailedStats.memoryUsage)
        assertEquals(containerStats.memoryLimit, detailedStats.memoryLimit)
        assertEquals(containerStats.networkRx, detailedStats.networkRx)
        assertEquals(containerStats.networkTx, detailedStats.networkTx)
        assertEquals(containerStats.blockRead, detailedStats.blockRead)
        assertEquals(containerStats.blockWrite, detailedStats.blockWrite)
        
        // Verify enhanced properties have default values
        assertEquals(0.0, detailedStats.cpuKernelUsage)
        assertEquals(0.0, detailedStats.cpuUserUsage)
        assertEquals(0.0, detailedStats.cpuSystemUsage)
        assertEquals(0, detailedStats.cpuOnlineCpus)
        assertEquals(0L, detailedStats.memoryCache)
        assertEquals(0L, detailedStats.memorySwap)
        assertEquals(0L, detailedStats.memorySwapLimit)
        assertEquals(0L, detailedStats.networkPacketsRx)
        assertEquals(0L, detailedStats.networkPacketsTx)
        assertEquals(0L, detailedStats.networkDroppedRx)
        assertEquals(0L, detailedStats.networkDroppedTx)
        assertEquals(0L, detailedStats.networkErrorsRx)
        assertEquals(0L, detailedStats.networkErrorsTx)
        assertEquals(0L, detailedStats.blockReadOps)
        assertEquals(0L, detailedStats.blockWriteOps)
        assertEquals(0, detailedStats.pids)
        assertEquals(0, detailedStats.restartCount)
        assertEquals(HealthStatus.UNKNOWN, detailedStats.healthStatus)
        assertEquals(emptyList<String>(), detailedStats.healthCheckLogs)
    }
}