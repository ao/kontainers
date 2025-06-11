package io.kontainers.model

import kotlinx.serialization.Serializable

/**
 * Represents a Docker container with its properties.
 */
@Serializable
data class Container(
    val id: String,
    val name: String,
    val image: String,
    val state: ContainerState,
    val status: String,
    val ports: List<PortMapping>,
    val volumes: List<VolumeMount>,
    val networks: List<String>,
    val created: Long,
    val labels: Map<String, String> = emptyMap(),
    val env: List<String> = emptyList()
)

/**
 * Enum representing possible container states.
 */
@Serializable
enum class ContainerState {
    RUNNING, STOPPED, PAUSED, RESTARTING, REMOVING, DEAD, CREATED
}

/**
 * Represents a port mapping between container and host.
 */
@Serializable
data class PortMapping(
    val privatePort: Int,
    val publicPort: Int? = null,
    val type: String = "tcp",
    val ip: String = "0.0.0.0"
)

/**
 * Represents a volume mount between host and container.
 */
@Serializable
data class VolumeMount(
    val source: String,
    val destination: String,
    val mode: String = "rw"
)