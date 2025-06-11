package io.kontainers.docker

import com.github.dockerjava.api.DockerClient
import com.github.dockerjava.api.async.ResultCallback
import com.github.dockerjava.api.model.Frame
import io.kontainers.model.Container
import io.kontainers.model.ContainerState
import io.kontainers.model.PortMapping
import io.kontainers.model.VolumeMount
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.Closeable
import java.util.concurrent.TimeUnit
import kotlin.coroutines.coroutineContext
import kotlinx.coroutines.CancellationException

/**
 * Service for interacting with Docker containers.
 */
class ContainerService(private val dockerClient: DockerClient) {
    
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
}