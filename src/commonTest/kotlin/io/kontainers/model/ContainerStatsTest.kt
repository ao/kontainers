package io.kontainers.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class ContainerStatsTest {
    
    @Test
    fun testContainerStatsSerialization() {
        val stats = ContainerStats(
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
        
        val json = Json.encodeToString(stats)
        val decoded = Json.decodeFromString<ContainerStats>(json)
        
        assertEquals(stats.containerId, decoded.containerId)
        assertEquals(stats.timestamp, decoded.timestamp)
        assertEquals(stats.cpuUsage, decoded.cpuUsage)
        assertEquals(stats.memoryUsage, decoded.memoryUsage)
        assertEquals(stats.memoryLimit, decoded.memoryLimit)
        assertEquals(stats.networkRx, decoded.networkRx)
        assertEquals(stats.networkTx, decoded.networkTx)
        assertEquals(stats.blockRead, decoded.blockRead)
        assertEquals(stats.blockWrite, decoded.blockWrite)
    }
    
    @Test
    fun testMemoryUsagePercentage() {
        val stats = ContainerStats(
            containerId = "123abc",
            timestamp = 1623456789,
            cpuUsage = 0.5,
            memoryUsage = 1024 * 1024 * 500, // 500 MB
            memoryLimit = 1024 * 1024 * 1024, // 1 GB
            networkRx = 1024 * 500,
            networkTx = 1024 * 200,
            blockRead = 1024 * 1024 * 10,
            blockWrite = 1024 * 1024 * 5
        )
        
        assertEquals(0.48828125, stats.memoryUsagePercentage, 0.001)
    }
    
    @Test
    fun testMemoryUsagePercentageWithZeroLimit() {
        val stats = ContainerStats(
            containerId = "123abc",
            timestamp = 1623456789,
            cpuUsage = 0.5,
            memoryUsage = 1024 * 1024 * 500, // 500 MB
            memoryLimit = 0, // No limit
            networkRx = 1024 * 500,
            networkTx = 1024 * 200,
            blockRead = 1024 * 1024 * 10,
            blockWrite = 1024 * 1024 * 5
        )
        
        assertEquals(0.0, stats.memoryUsagePercentage)
    }
}