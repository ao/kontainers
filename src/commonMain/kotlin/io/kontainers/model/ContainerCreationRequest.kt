package io.kontainers.model

import kotlinx.serialization.Serializable

/**
 * Represents a request to create a new Docker container.
 */
@Serializable
data class ContainerCreationRequest(
    val name: String,
    val image: String,
    val ports: List<PortMapping> = emptyList(),
    val volumes: List<VolumeMount> = emptyList(),
    val env: List<String> = emptyList(),
    val networks: List<String> = emptyList(),
    val labels: Map<String, String> = emptyMap()
)

/**
 * Represents the result of a container creation operation.
 */
@Serializable
data class ContainerCreationResult(
    val success: Boolean,
    val containerId: String? = null,
    val message: String? = null
)