package io.kontainers.system

import io.kontainers.docker.ContainerService
import io.kontainers.proxy.ProxyService
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.serialization.Serializable
import java.io.File
import java.lang.management.ManagementFactory
import java.lang.management.MemoryUsage
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

// Using common module classes

/**
 * Service for monitoring system health.
 */
class HealthMonitoringService(
    private val containerService: ContainerService,
    private val proxyService: ProxyService,
    private val checkInterval: Long = 60000, // 1 minute
    private val metricsInterval: Long = 10000 // 10 seconds
) {
    private val isRunning = AtomicBoolean(false)
    private val healthCheckJob = SupervisorJob()
    private val healthCheckScope = CoroutineScope(Dispatchers.Default + healthCheckJob)
    
    // Store health check results
    private val healthCheckResults = ConcurrentHashMap<String, HealthCheckResult>()
    
    // Store system resource metrics history
    private val systemResourceMetricsHistory = mutableListOf<SystemResourceMetrics>()
    private val maxMetricsHistorySize = 1000 // Keep last 1000 metrics entries
    
    // Shared flow for real-time health updates
    private val _healthUpdates = MutableSharedFlow<HealthCheckResult>(replay = 0, extraBufferCapacity = 100)
    val healthUpdates: Flow<HealthCheckResult> = _healthUpdates.asSharedFlow()
    
    // Shared flow for real-time metrics updates
    private val _metricsUpdates = MutableSharedFlow<SystemResourceMetrics>(replay = 0, extraBufferCapacity = 100)
    val metricsUpdates: Flow<SystemResourceMetrics> = _metricsUpdates.asSharedFlow()
    
    /**
     * Starts the health monitoring service.
     */
    fun start() {
        if (isRunning.compareAndSet(false, true)) {
            // Start health check job
            healthCheckScope.launch {
                while (isActive) {
                    runHealthChecks()
                    delay(checkInterval)
                }
            }
            
            // Start metrics collection job
            healthCheckScope.launch {
                while (isActive) {
                    collectSystemMetrics()
                    delay(metricsInterval)
                }
            }
        }
    }
    
    /**
     * Stops the health monitoring service.
     */
    fun stop() {
        if (isRunning.compareAndSet(true, false)) {
            healthCheckJob.cancel()
        }
    }
    
    /**
     * Gets all health check results.
     */
    fun getAllHealthChecks(): List<HealthCheckResult> {
        return healthCheckResults.values.toList()
    }
    
    /**
     * Gets a health check result by component ID.
     */
    fun getHealthCheck(componentId: String): HealthCheckResult? {
        return healthCheckResults[componentId]
    }
    
    /**
     * Gets the overall system health status.
     */
    fun getOverallHealth(): HealthStatus {
        if (healthCheckResults.isEmpty()) {
            return HealthStatus.UNKNOWN
        }
        
        val hasUnhealthy = healthCheckResults.values.any { it.status == HealthStatus.UNHEALTHY }
        if (hasUnhealthy) {
            return HealthStatus.UNHEALTHY
        }
        
        val hasDegraded = healthCheckResults.values.any { it.status == HealthStatus.DEGRADED }
        if (hasDegraded) {
            return HealthStatus.DEGRADED
        }
        
        return HealthStatus.HEALTHY
    }
    
    /**
     * Gets the system resource metrics history.
     */
    fun getSystemResourceMetricsHistory(limit: Int = 100): List<SystemResourceMetrics> {
        val actualLimit = limit.coerceAtMost(systemResourceMetricsHistory.size)
        return systemResourceMetricsHistory.takeLast(actualLimit)
    }
    
    /**
     * Gets the latest system resource metrics.
     */
    fun getLatestSystemResourceMetrics(): SystemResourceMetrics? {
        return systemResourceMetricsHistory.lastOrNull()
    }
    
    /**
     * Runs all health checks.
     */
    private suspend fun runHealthChecks() {
        try {
            // Check JVM health
            checkJvmHealth()
            
            // Check disk space
            checkDiskSpace()
            
            // Check Docker service
            checkDockerService()
            
            // Check proxy service
            checkProxyService()
            
            // Check database (if applicable)
            // checkDatabase()
            
            // Check external services (if applicable)
            // checkExternalServices()
        } catch (e: Exception) {
            // Log the error but don't stop the health check process
            println("Error running health checks: ${e.message}")
        }
    }
    
    /**
     * Checks JVM health.
     */
    private suspend fun checkJvmHealth() {
        val runtime = Runtime.getRuntime()
        val memoryUsage = ManagementFactory.getMemoryMXBean().heapMemoryUsage
        
        val freeMemory = runtime.freeMemory()
        val totalMemory = runtime.totalMemory()
        val maxMemory = runtime.maxMemory()
        val usedMemory = totalMemory - freeMemory
        
        val memoryUsagePercent = (usedMemory.toDouble() / maxMemory.toDouble()) * 100
        
        val status = when {
            memoryUsagePercent > 90 -> HealthStatus.UNHEALTHY
            memoryUsagePercent > 75 -> HealthStatus.DEGRADED
            else -> HealthStatus.HEALTHY
        }
        
        val result = HealthCheckResult(
            componentId = "jvm",
            componentName = "JVM",
            status = status,
            message = when (status) {
                HealthStatus.HEALTHY -> "JVM memory usage is normal"
                HealthStatus.DEGRADED -> "JVM memory usage is high"
                HealthStatus.UNHEALTHY -> "JVM memory usage is critical"
                HealthStatus.UNKNOWN -> "JVM memory usage is unknown"
            },
            details = mapOf(
                "usedMemory" to formatBytes(usedMemory),
                "totalMemory" to formatBytes(totalMemory),
                "maxMemory" to formatBytes(maxMemory),
                "freeMemory" to formatBytes(freeMemory),
                "memoryUsagePercent" to String.format("%.2f%%", memoryUsagePercent)
            )
        )
        
        updateHealthCheck(result)
    }
    
    /**
     * Checks disk space.
     */
    private suspend fun checkDiskSpace() {
        val root = File("/")
        val totalSpace = root.totalSpace
        val freeSpace = root.freeSpace
        val usedSpace = totalSpace - freeSpace
        
        val diskUsagePercent = (usedSpace.toDouble() / totalSpace.toDouble()) * 100
        
        val status = when {
            diskUsagePercent > 90 -> HealthStatus.UNHEALTHY
            diskUsagePercent > 80 -> HealthStatus.DEGRADED
            else -> HealthStatus.HEALTHY
        }
        
        val result = HealthCheckResult(
            componentId = "disk",
            componentName = "Disk Space",
            status = status,
            message = when (status) {
                HealthStatus.HEALTHY -> "Disk space usage is normal"
                HealthStatus.DEGRADED -> "Disk space usage is high"
                HealthStatus.UNHEALTHY -> "Disk space usage is critical"
                HealthStatus.UNKNOWN -> "Disk space usage is unknown"
            },
            details = mapOf(
                "usedSpace" to formatBytes(usedSpace),
                "totalSpace" to formatBytes(totalSpace),
                "freeSpace" to formatBytes(freeSpace),
                "diskUsagePercent" to String.format("%.2f%%", diskUsagePercent)
            )
        )
        
        updateHealthCheck(result)
    }
    
    /**
     * Checks Docker service health.
     */
    private suspend fun checkDockerService() {
        try {
            val containers = containerService.getContainers(true)
            
            val result = HealthCheckResult(
                componentId = "docker",
                componentName = "Docker Service",
                status = HealthStatus.HEALTHY,
                message = "Docker service is running",
                details = mapOf(
                    "containerCount" to containers.size.toString()
                )
            )
            
            updateHealthCheck(result)
        } catch (e: Exception) {
            val result = HealthCheckResult(
                componentId = "docker",
                componentName = "Docker Service",
                status = HealthStatus.UNHEALTHY,
                message = "Docker service is not available: ${e.message}",
                details = mapOf(
                    "error" to (e.message ?: "Unknown error")
                )
            )
            
            updateHealthCheck(result)
        }
    }
    
    /**
     * Checks proxy service health.
     */
    private suspend fun checkProxyService() {
        try {
            val rules = proxyService.getAllRules()
            
            val result = HealthCheckResult(
                componentId = "proxy",
                componentName = "Proxy Service",
                status = HealthStatus.HEALTHY,
                message = "Proxy service is running",
                details = mapOf(
                    "ruleCount" to rules.size.toString()
                )
            )
            
            updateHealthCheck(result)
        } catch (e: Exception) {
            val result = HealthCheckResult(
                componentId = "proxy",
                componentName = "Proxy Service",
                status = HealthStatus.UNHEALTHY,
                message = "Proxy service is not available: ${e.message}",
                details = mapOf(
                    "error" to (e.message ?: "Unknown error")
                )
            )
            
            updateHealthCheck(result)
        }
    }
    
    /**
     * Collects system resource metrics.
     */
    private suspend fun collectSystemMetrics() {
        try {
            val osBean = ManagementFactory.getOperatingSystemMXBean()
            val cpuUsage = if (osBean is com.sun.management.OperatingSystemMXBean) {
                osBean.processCpuLoad * 100
            } else {
                -1.0
            }
            
            val runtime = Runtime.getRuntime()
            val memoryUsage = runtime.totalMemory() - runtime.freeMemory()
            val memoryTotal = runtime.maxMemory()
            
            val root = File("/")
            val diskUsage = root.totalSpace - root.freeSpace
            val diskTotal = root.totalSpace
            
            val metrics = SystemResourceMetrics(
                cpuUsage = cpuUsage,
                memoryUsage = memoryUsage,
                memoryTotal = memoryTotal,
                diskUsage = diskUsage,
                diskTotal = diskTotal
            )
            
            // Add to history
            synchronized(systemResourceMetricsHistory) {
                systemResourceMetricsHistory.add(metrics)
                
                // Trim history if needed
                if (systemResourceMetricsHistory.size > maxMetricsHistorySize) {
                    systemResourceMetricsHistory.removeAt(0)
                }
            }
            
            // Emit metrics update
            _metricsUpdates.emit(metrics)
        } catch (e: Exception) {
            // Log the error but don't stop the metrics collection process
            println("Error collecting system metrics: ${e.message}")
        }
    }
    
    /**
     * Updates a health check result and emits an update.
     */
    private suspend fun updateHealthCheck(result: HealthCheckResult) {
        healthCheckResults[result.componentId] = result
        _healthUpdates.emit(result)
    }
    
    /**
     * Formats bytes to a human-readable string.
     */
    private fun formatBytes(bytes: Long): String {
        val units = arrayOf("B", "KB", "MB", "GB", "TB")
        var value = bytes.toDouble()
        var unitIndex = 0
        
        while (value > 1024 && unitIndex < units.size - 1) {
            value /= 1024
            unitIndex++
        }
        
        return String.format("%.2f %s", value, units[unitIndex])
    }
}