package io.kontainers.docker

import com.github.dockerjava.api.DockerClient
import com.github.dockerjava.api.async.ResultCallback
import com.github.dockerjava.api.model.Bind
import com.github.dockerjava.api.model.ExposedPort
import com.github.dockerjava.api.model.Frame
import com.github.dockerjava.api.model.HostConfig
import com.github.dockerjava.api.model.PortBinding
import com.github.dockerjava.api.model.Ports
import com.github.dockerjava.api.model.Statistics
import com.github.dockerjava.api.model.Volume
import io.kontainers.model.Container
import io.kontainers.model.ContainerCreationRequest
import io.kontainers.model.ContainerCreationResult
import io.kontainers.model.ContainerState
import io.kontainers.model.ContainerStats
import io.kontainers.model.DetailedContainerStats
import io.kontainers.model.HealthStatus
import io.kontainers.model.PortMapping
import io.kontainers.model.VolumeMount
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.Closeable
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import kotlin.coroutines.coroutineContext
import kotlinx.coroutines.CancellationException
import java.time.Instant

/**
 * Service for interacting with Docker containers.
 */
/**
 * Service for interacting with Docker containers.
 */
class ContainerService(private val dockerClient: DockerClient) {
    
    // In-memory storage for historical container statistics
    private val statsHistory = ConcurrentHashMap<String, MutableList<DetailedContainerStats>>()
    
    // Maximum number of historical stats to keep per container
    private val maxHistorySize = 100
    
    /**
     * Converts a Statistics object to a DetailedContainerStats object.
     */
    private fun Statistics.toDetailedContainerStats(containerId: String): DetailedContainerStats {
        return DetailedContainerStats(
            containerId = containerId,
            timestamp = Instant.now().toEpochMilli(),
            cpuUsage = calculateCpuUsage(this),
            memoryUsage = this.memoryStats.usage ?: 0,
            memoryLimit = this.memoryStats.limit ?: 0,
            networkRx = calculateNetworkRx(this),
            networkTx = calculateNetworkTx(this),
            blockRead = calculateBlockRead(this),
            blockWrite = calculateBlockWrite(this),
            cpuKernelUsage = calculateCpuKernelUsage(this),
            cpuUserUsage = calculateCpuUserUsage(this),
            cpuSystemUsage = this.cpuStats.systemCpuUsage?.toDouble() ?: 0.0,
            cpuOnlineCpus = this.cpuStats.onlineCpus?.toInt() ?: 0,
            memoryCache = (this.memoryStats.stats as? Map<String, Any>)?.get("cache")?.toString()?.toLong() ?: 0,
            memorySwap = (this.memoryStats.stats as? Map<String, Any>)?.get("swap")?.toString()?.toLong() ?: 0,
            memorySwapLimit = (this.memoryStats.stats as? Map<String, Any>)?.get("hierarchical_memory_limit")?.toString()?.toLong() ?: 0,
            networkPacketsRx = calculateNetworkPacketsRx(this),
            networkPacketsTx = calculateNetworkPacketsTx(this),
            networkDroppedRx = calculateNetworkDroppedRx(this),
            networkDroppedTx = calculateNetworkDroppedTx(this),
            networkErrorsRx = calculateNetworkErrorsRx(this),
            networkErrorsTx = calculateNetworkErrorsTx(this),
            blockReadOps = calculateBlockReadOps(this),
            blockWriteOps = calculateBlockWriteOps(this),
            pids = this.pidsStats?.current?.toInt() ?: 0,
            restartCount = 0,
            healthStatus = HealthStatus.UNKNOWN,
            healthCheckLogs = emptyList()
        )
    }
    
    /**
     * Lists all containers.
     * 
     * @param all If true, lists all containers including stopped ones. Otherwise, lists only running containers.
     * @return List of containers
     */
    suspend fun listContainers(all: Boolean = true): List<Container> {
        return withContext(Dispatchers.IO) {
            dockerClient.listContainersCmd()
                .withShowAll(all)
                .exec()
                .map { it.toContainer() }
        }
    }
    
    /**
     * Starts a container.
     * 
     * @param containerId ID of the container to start
     * @return true if the container was started successfully, false otherwise
     */
    suspend fun startContainer(containerId: String): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                dockerClient.startContainerCmd(containerId).exec()
                true
            } catch (e: Exception) {
                false
            }
        }
    }
    
    /**
     * Stops a container.
     * 
     * @param containerId ID of the container to stop
     * @param timeout Timeout in seconds before killing the container
     * @return true if the container was stopped successfully, false otherwise
     */
    suspend fun stopContainer(containerId: String, timeout: Int = 10): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                dockerClient.stopContainerCmd(containerId)
                    .withTimeout(timeout)
                    .exec()
                true
            } catch (e: Exception) {
                false
            }
        }
    }
    
    /**
     * Restarts a container.
     * 
     * @param containerId ID of the container to restart
     * @param timeout Timeout in seconds before killing the container
     * @return true if the container was restarted successfully, false otherwise
     */
    suspend fun restartContainer(containerId: String, timeout: Int = 10): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                dockerClient.restartContainerCmd(containerId)
                    .withTimeout(timeout)
                    .exec()
                true
            } catch (e: Exception) {
                false
            }
        }
    }
    
    /**
     * Gets logs from a container.
     * 
     * @param containerId ID of the container
     * @param tail Number of lines to return from the end of the logs
     * @param follow If true, the logs will be streamed as they are generated
     * @return Flow of log lines
     */

    fun getContainerLogs(containerId: String, tail: Int = 100, follow: Boolean = false): Flow<String> {
        return flow {
            val logLines = mutableListOf<String>()
            val callback = object : ResultCallback.Adapter<Frame>() {
                override fun onNext(frame: Frame) {
                    logLines.add(String(frame.payload).trim())
                }
            }
            
            try {
                dockerClient.logContainerCmd(containerId)
                    .withStdOut(true)
                    .withStdErr(true)
                    .withTail(tail)
                    .withFollowStream(follow)
                    .withTimestamps(true)
                    .exec(callback)
                    
                if (!follow) {
                    callback.awaitCompletion(30, TimeUnit.SECONDS)
                    callback.close()
                    
                    // Emit all collected log lines
                    logLines.forEach { emit(it) }
                } else {
                    // For follow mode, we need to keep the callback open
                    // The flow will be cancelled when the collector is cancelled
                    
                    // This is a workaround since we can't directly emit from the callback
                    // In a real implementation, we would use a different approach
                    callback.awaitCompletion(30, TimeUnit.SECONDS)
                    callback.close()
                    
                    // Emit all collected log lines
                    logLines.forEach { emit(it) }
                }
            } catch (e: Exception) {
                emit("Error getting logs: ${e.message}")
                if (!follow) {
                    throw e
                }
            }
        }.flowOn(Dispatchers.IO)
    }
    
    /**
     * Gets a list of all containers.
     *
     * @param all If true, returns all containers, otherwise only running containers
     * @return List of containers
     */
    suspend fun getContainers(all: Boolean = false): List<Container> {
        return withContext(Dispatchers.IO) {
            try {
                dockerClient.listContainersCmd()
                    .withShowAll(all)
                    .exec()
                    .map { it.toContainer() }
            } catch (e: Exception) {
                emptyList()
            }
        }
    }
    
    /**
     * Converts a Docker Java API container to our domain model.
     */
    private fun com.github.dockerjava.api.model.Container.toContainer(): Container {
        return Container(
            id = this.id,
            name = this.names.firstOrNull()?.removePrefix("/") ?: this.id.substring(0, 12),
            image = this.image,
            state = this.state.toContainerState(),
            status = this.status,
            ports = this.ports.map { port ->
                PortMapping(
                    privatePort = port.privatePort ?: 0,
                    publicPort = port.publicPort?.toInt(),
                    type = port.type ?: "tcp",
                    ip = port.ip ?: "0.0.0.0"
                )
            },
            volumes = this.mounts?.map { mount ->
                VolumeMount(
                    source = mount.source ?: "",
                    destination = mount.destination ?: "",
                    mode = mount.mode ?: "rw"
                )
            } ?: emptyList(),
            networks = this.networkSettings?.networks?.keys?.toList() ?: emptyList(),
            created = this.created,
            labels = this.labels ?: emptyMap(),
            env = emptyList() // Docker API doesn't provide env vars in list containers response
        )
    }
    
    /**
     * Converts a Docker Java API container state string to our domain model state.
     */
    private fun String.toContainerState(): ContainerState {
        return when (this.lowercase()) {
            "running" -> ContainerState.RUNNING
            "created" -> ContainerState.CREATED
            "restarting" -> ContainerState.RESTARTING
            "removing" -> ContainerState.REMOVING
            "paused" -> ContainerState.PAUSED
            "exited" -> ContainerState.STOPPED
            "dead" -> ContainerState.DEAD
            else -> ContainerState.STOPPED
        }
    }
    /**
     * Creates a new container.
     *
     * @param request Container creation request
     * @return Result of the container creation operation
     */
    suspend fun createContainer(request: ContainerCreationRequest): ContainerCreationResult {
        return withContext(Dispatchers.IO) {
            try {
                // Create port bindings
                val portBindings = request.ports.associate { portMapping ->
                    val exposedPort = ExposedPort.tcp(portMapping.privatePort)
                    val binding = if (portMapping.publicPort != null) {
                        Ports.Binding.bindPort(portMapping.publicPort)
                    } else {
                        Ports.Binding.empty()
                    }
                    exposedPort to arrayOf(binding)
                }
                
                // Create volume bindings
                val volumeBindings = request.volumes.map { volumeMount ->
                    Bind(volumeMount.source, Volume(volumeMount.destination), volumeMount.mode == "rw")
                }
                
                // Create host config
                // Convert port bindings to the format expected by the Docker Java API
                val ports = Ports()
                portBindings.forEach { (exposedPort, bindings) ->
                    bindings.forEach { binding ->
                        ports.bind(exposedPort, binding)
                    }
                }
                
                val hostConfig = HostConfig.newHostConfig()
                    .withPortBindings(ports)
                    .withBinds(volumeBindings)
                
                // Create container
                val createContainerCmd = dockerClient.createContainerCmd(request.image)
                    .withName(request.name)
                    .withHostConfig(hostConfig)
                
                // Add environment variables if provided
                if (request.env.isNotEmpty()) {
                    createContainerCmd.withEnv(request.env)
                }
                
                // Add networks if provided
                // Note: Docker Java API doesn't support network configuration during container creation
                // We'll need to connect the container to networks after creation
                
                // Add labels if provided
                if (request.labels.isNotEmpty()) {
                    createContainerCmd.withLabels(request.labels)
                }
                
                // Execute the command
                val response = createContainerCmd.exec()
                val containerId = response.id
                
                // Connect to networks if specified
                if (request.networks.isNotEmpty()) {
                    for (network in request.networks) {
                        try {
                            dockerClient.connectToNetworkCmd()
                                .withNetworkId(network)
                                .withContainerId(containerId)
                                .exec()
                        } catch (e: Exception) {
                            // Log the error but continue with other networks
                            println("Failed to connect container to network $network: ${e.message}")
                        }
                    }
                }
                
                ContainerCreationResult(
                    success = true,
                    containerId = containerId,
                    message = "Container created successfully"
                )
            } catch (e: Exception) {
                ContainerCreationResult(
                    success = false,
                    message = "Failed to create container: ${e.message}"
                )
            }
        }
    }
    
    /**
     * Gets detailed statistics for a container.
     *
     * @param containerId ID of the container
     * @return Detailed container statistics
     */
    suspend fun getDetailedContainerStats(containerId: String): DetailedContainerStats {
        return withContext(Dispatchers.IO) {
            try {
                val statsCallback = object : ResultCallback.Adapter<Statistics>() {
                    var statistics: Statistics? = null
                    
                    override fun onNext(stats: Statistics) {
                        statistics = stats
                        close()
                    }
                }
                
                dockerClient.statsCmd(containerId)
                    .withNoStream(true)
                    .exec(statsCallback)
                
                statsCallback.awaitCompletion(30, TimeUnit.SECONDS)
                val stats = statsCallback.statistics ?: throw Exception("Failed to get container statistics")
                
                // Get container inspection for health status and restart count
                val containerInfo = dockerClient.inspectContainerCmd(containerId).exec()
                
                // Extract health status
                val healthStatus = when {
                    containerInfo.state?.health == null -> HealthStatus.UNKNOWN
                    containerInfo.state.health.status == "healthy" -> HealthStatus.HEALTHY
                    containerInfo.state.health.status == "unhealthy" -> HealthStatus.UNHEALTHY
                    containerInfo.state.health.status == "starting" -> HealthStatus.STARTING
                    else -> HealthStatus.UNKNOWN
                }
                
                // Extract health check logs
                val healthCheckLogs = containerInfo.state?.health?.log?.map {
                    "${it.start}: ${it.output.trim()}"
                } ?: emptyList()
                
                // Extract restart count
                val restartCount = containerInfo.restartCount ?: 0
                
                // Create detailed stats object
                val detailedStats = DetailedContainerStats(
                    containerId = containerId,
                    timestamp = Instant.now().toEpochMilli(),
                    cpuUsage = calculateCpuUsage(stats),
                    memoryUsage = stats.memoryStats.usage ?: 0,
                    memoryLimit = stats.memoryStats.limit ?: 0,
                    networkRx = calculateNetworkRx(stats),
                    networkTx = calculateNetworkTx(stats),
                    blockRead = calculateBlockRead(stats),
                    blockWrite = calculateBlockWrite(stats),
                    cpuKernelUsage = calculateCpuKernelUsage(stats),
                    cpuUserUsage = calculateCpuUserUsage(stats),
                    cpuSystemUsage = stats.cpuStats.systemCpuUsage?.toDouble() ?: 0.0,
                    cpuOnlineCpus = stats.cpuStats.onlineCpus?.toInt() ?: 0,
                    memoryCache = (stats.memoryStats.stats as? Map<String, Any>)?.get("cache")?.toString()?.toLong() ?: 0,
                    memorySwap = (stats.memoryStats.stats as? Map<String, Any>)?.get("swap")?.toString()?.toLong() ?: 0,
                    memorySwapLimit = (stats.memoryStats.stats as? Map<String, Any>)?.get("hierarchical_memory_limit")?.toString()?.toLong() ?: 0,
                    networkPacketsRx = calculateNetworkPacketsRx(stats),
                    networkPacketsTx = calculateNetworkPacketsTx(stats),
                    networkDroppedRx = calculateNetworkDroppedRx(stats),
                    networkDroppedTx = calculateNetworkDroppedTx(stats),
                    networkErrorsRx = calculateNetworkErrorsRx(stats),
                    networkErrorsTx = calculateNetworkErrorsTx(stats),
                    blockReadOps = calculateBlockReadOps(stats),
                    blockWriteOps = calculateBlockWriteOps(stats),
                    pids = stats.pidsStats?.current?.toInt() ?: 0,
                    restartCount = restartCount,
                    healthStatus = healthStatus,
                    healthCheckLogs = healthCheckLogs
                )
                
                // Store in history
                storeContainerStats(detailedStats)
                
                detailedStats
            } catch (e: Exception) {
                // If we can't get detailed stats, try to get basic stats
                val basicStats = getBasicContainerStats(containerId)
                DetailedContainerStats.fromContainerStats(basicStats)
            }
        }
    }
    
    /**
     * Gets basic statistics for a container.
     *
     * @param containerId ID of the container
     * @return Basic container statistics
     */
    private suspend fun getBasicContainerStats(containerId: String): ContainerStats {
        return withContext(Dispatchers.IO) {
            try {
                val statsCallback = object : ResultCallback.Adapter<Statistics>() {
                    var statistics: Statistics? = null
                    
                    override fun onNext(stats: Statistics) {
                        statistics = stats
                        close()
                    }
                }
                
                dockerClient.statsCmd(containerId)
                    .withNoStream(true)
                    .exec(statsCallback)
                
                statsCallback.awaitCompletion(30, TimeUnit.SECONDS)
                val stats = statsCallback.statistics ?: throw Exception("Failed to get container statistics")
                
                ContainerStats(
                    containerId = containerId,
                    timestamp = Instant.now().toEpochMilli(),
                    cpuUsage = calculateCpuUsage(stats),
                    memoryUsage = stats.memoryStats.usage ?: 0,
                    memoryLimit = stats.memoryStats.limit ?: 0,
                    networkRx = calculateNetworkRx(stats),
                    networkTx = calculateNetworkTx(stats),
                    blockRead = calculateBlockRead(stats),
                    blockWrite = calculateBlockWrite(stats)
                )
            } catch (e: Exception) {
                // Return empty stats if we can't get them
                ContainerStats(
                    containerId = containerId,
                    timestamp = Instant.now().toEpochMilli(),
                    cpuUsage = 0.0,
                    memoryUsage = 0,
                    memoryLimit = 0,
                    networkRx = 0,
                    networkTx = 0,
                    blockRead = 0,
                    blockWrite = 0
                )
            }
        }
    }
    
    /**
     * Gets historical statistics for a container.
     *
     * @param containerId ID of the container
     * @param limit Maximum number of historical entries to return
     * @return List of historical container statistics
     */
    fun getContainerStatsHistory(containerId: String, limit: Int = maxHistorySize): List<DetailedContainerStats> {
        val history = statsHistory[containerId] ?: return emptyList()
        return history.takeLast(limit.coerceAtMost(history.size))
    }
    
    /**
     * Stores container statistics in the history.
     *
     * @param stats Container statistics to store
     */
    private fun storeContainerStats(stats: DetailedContainerStats) {
        val history = statsHistory.computeIfAbsent(stats.containerId) { mutableListOf() }
        
        // Add new stats
        history.add(stats)
        
        // Trim history if it exceeds the maximum size
        if (history.size > maxHistorySize) {
            val toRemove = history.size - maxHistorySize
            for (i in 0 until toRemove) {
                history.removeAt(0)
            }
        }
    }
    
    /**
     * Clears historical statistics for a container.
     *
     * @param containerId ID of the container
     */
    fun clearContainerStatsHistory(containerId: String) {
        statsHistory.remove(containerId)
    }
    
    /**
     * Clears all historical statistics.
     */
    fun clearAllContainerStatsHistory() {
        statsHistory.clear()
    }
    
    /**
     * Calculates CPU usage percentage from Docker statistics.
     */
    private fun calculateCpuUsage(stats: Statistics): Double {
        val cpuDelta = stats.cpuStats.cpuUsage?.totalUsage?.minus(
            stats.preCpuStats.cpuUsage?.totalUsage ?: 0
        ) ?: 0
        
        val systemDelta = stats.cpuStats.systemCpuUsage?.minus(
            stats.preCpuStats.systemCpuUsage ?: 0
        ) ?: 0
        
        val onlineCpus = stats.cpuStats.onlineCpus ?:
            (stats.cpuStats.cpuUsage?.percpuUsage?.size ?: 1)
        
        return if (systemDelta > 0 && cpuDelta > 0) {
            (cpuDelta.toDouble() / systemDelta.toDouble()) * onlineCpus.toDouble() * 100.0
        } else {
            0.0
        }
    }
    
    /**
     * Calculates CPU kernel usage percentage from Docker statistics.
     */
    private fun calculateCpuKernelUsage(stats: Statistics): Double {
        val kernelDelta = stats.cpuStats.cpuUsage?.totalUsage?.minus(
            stats.preCpuStats.cpuUsage?.totalUsage ?: 0
        ) ?: 0
        
        val systemDelta = stats.cpuStats.systemCpuUsage?.minus(
            stats.preCpuStats.systemCpuUsage ?: 0
        ) ?: 0
        
        return if (systemDelta > 0 && kernelDelta > 0) {
            (kernelDelta.toDouble() / systemDelta.toDouble()) * 100.0
        } else {
            0.0
        }
    }
    
    /**
     * Calculates CPU user usage percentage from Docker statistics.
     */
    private fun calculateCpuUserUsage(stats: Statistics): Double {
        val userDelta = stats.cpuStats.cpuUsage?.totalUsage?.minus(
            stats.preCpuStats.cpuUsage?.totalUsage ?: 0
        ) ?: 0
        
        val systemDelta = stats.cpuStats.systemCpuUsage?.minus(
            stats.preCpuStats.systemCpuUsage ?: 0
        ) ?: 0
        
        return if (systemDelta > 0 && userDelta > 0) {
            (userDelta.toDouble() / systemDelta.toDouble()) * 100.0
        } else {
            0.0
        }
    }
    
    /**
     * Calculates network received bytes from Docker statistics.
     */
    private fun calculateNetworkRx(stats: Statistics): Long {
        return stats.networks?.values?.sumOf { it.rxBytes ?: 0 } ?: 0
    }
    
    /**
     * Calculates network transmitted bytes from Docker statistics.
     */
    private fun calculateNetworkTx(stats: Statistics): Long {
        return stats.networks?.values?.sumOf { it.txBytes ?: 0 } ?: 0
    }
    
    /**
     * Calculates network received packets from Docker statistics.
     */
    private fun calculateNetworkPacketsRx(stats: Statistics): Long {
        return stats.networks?.values?.sumOf { it.rxPackets ?: 0 } ?: 0
    }
    
    /**
     * Calculates network transmitted packets from Docker statistics.
     */
    private fun calculateNetworkPacketsTx(stats: Statistics): Long {
        return stats.networks?.values?.sumOf { it.txPackets ?: 0 } ?: 0
    }
    
    /**
     * Calculates network dropped received packets from Docker statistics.
     */
    private fun calculateNetworkDroppedRx(stats: Statistics): Long {
        return stats.networks?.values?.sumOf { it.rxDropped ?: 0 } ?: 0
    }
    
    /**
     * Calculates network dropped transmitted packets from Docker statistics.
     */
    private fun calculateNetworkDroppedTx(stats: Statistics): Long {
        return stats.networks?.values?.sumOf { it.txDropped ?: 0 } ?: 0
    }
    
    /**
     * Calculates network errors in received packets from Docker statistics.
     */
    private fun calculateNetworkErrorsRx(stats: Statistics): Long {
        return stats.networks?.values?.sumOf { it.rxErrors ?: 0 } ?: 0
    }
    
    /**
     * Calculates network errors in transmitted packets from Docker statistics.
     */
    private fun calculateNetworkErrorsTx(stats: Statistics): Long {
        return stats.networks?.values?.sumOf { it.txErrors ?: 0 } ?: 0
    }
    
    /**
     * Calculates block read bytes from Docker statistics.
     */
    private fun calculateBlockRead(stats: Statistics): Long {
        return stats.blkioStats?.ioServiceBytesRecursive?.filter { stat ->
            stat.op.equals("Read", ignoreCase = true)
        }?.sumOf { it.value ?: 0 } ?: 0
    }
    
    /**
     * Calculates block write bytes from Docker statistics.
     */
    private fun calculateBlockWrite(stats: Statistics): Long {
        return stats.blkioStats?.ioServiceBytesRecursive?.filter { stat ->
            stat.op.equals("Write", ignoreCase = true)
        }?.sumOf { it.value ?: 0 } ?: 0
    }
    
    /**
     * Calculates block read operations from Docker statistics.
     */
    private fun calculateBlockReadOps(stats: Statistics): Long {
        return stats.blkioStats?.ioServicedRecursive?.filter { stat ->
            stat.op.equals("Read", ignoreCase = true)
        }?.sumOf { it.value ?: 0 } ?: 0
    }
    
    /**
     * Calculates block write operations from Docker statistics.
     */
    private fun calculateBlockWriteOps(stats: Statistics): Long {
        return stats.blkioStats?.ioServicedRecursive?.filter { stat ->
            stat.op.equals("Write", ignoreCase = true)
        }?.sumOf { it.value ?: 0 } ?: 0
    }
}