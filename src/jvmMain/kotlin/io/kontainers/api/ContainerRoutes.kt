package io.kontainers.api

import io.kontainers.docker.ContainerService
import io.kontainers.model.ContainerCreationRequest
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.websocket.*
import io.ktor.websocket.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.isActive
import kotlinx.serialization.json.Json

/**
 * Configures the container API routes.
 */
fun Route.containerRoutes(containerService: ContainerService) {
    route("/api/containers") {
        // Get all containers
        get {
            try {
                val all = call.request.queryParameters["all"]?.toBoolean() ?: true
                val containers = containerService.listContainers(all)
                call.respond(containers)
            } catch (e: Exception) {
                call.respond(HttpStatusCode.InternalServerError, "Failed to get containers: ${e.message}")
            }
        }
        
        // Get container by ID
        get("/{id}") {
            val id = call.parameters["id"] ?: return@get call.respond(HttpStatusCode.BadRequest, "Missing container ID")
            val all = true
            val containers = containerService.listContainers(all)
            val container = containers.find { it.id == id || it.name == id }
            
            if (container != null) {
                try {
                    // Get detailed stats for the container
                    val stats = containerService.getDetailedContainerStats(container.id)
                    call.respond(mapOf("container" to container, "stats" to stats))
                } catch (e: Exception) {
                    call.respond(container)
                }
            } else {
                call.respond(HttpStatusCode.NotFound, "Container not found")
            }
        }
        
        // Start container
        post("/{id}/start") {
            val id = call.parameters["id"] ?: return@post call.respond(HttpStatusCode.BadRequest, "Missing container ID")
            val success = containerService.startContainer(id)
            
            if (success) {
                call.respond(mapOf("success" to true, "message" to "Container started"))
            } else {
                call.respond(HttpStatusCode.InternalServerError, mapOf("success" to false, "message" to "Failed to start container"))
            }
        }
        
        // Stop container
        post("/{id}/stop") {
            val id = call.parameters["id"] ?: return@post call.respond(HttpStatusCode.BadRequest, "Missing container ID")
            val timeout = call.request.queryParameters["timeout"]?.toIntOrNull() ?: 10
            val success = containerService.stopContainer(id, timeout)
            
            if (success) {
                call.respond(mapOf("success" to true, "message" to "Container stopped"))
            } else {
                call.respond(HttpStatusCode.InternalServerError, mapOf("success" to false, "message" to "Failed to stop container"))
            }
        }
        
        // Restart container
        post("/{id}/restart") {
            val id = call.parameters["id"] ?: return@post call.respond(HttpStatusCode.BadRequest, "Missing container ID")
            val timeout = call.request.queryParameters["timeout"]?.toIntOrNull() ?: 10
            val success = containerService.restartContainer(id, timeout)
            
            if (success) {
                call.respond(mapOf("success" to true, "message" to "Container restarted"))
            } else {
                call.respond(HttpStatusCode.InternalServerError, mapOf("success" to false, "message" to "Failed to restart container"))
            }
        }
        
        // Get container logs
        get("/{id}/logs") {
            val id = call.parameters["id"] ?: return@get call.respond(HttpStatusCode.BadRequest, "Missing container ID")
            val tail = call.request.queryParameters["tail"]?.toIntOrNull() ?: 100
            val follow = call.request.queryParameters["follow"]?.toBoolean() ?: false
            
            if (follow) {
                // For follow=true, we'll use WebSockets
                call.respond(HttpStatusCode.BadRequest, "Use WebSocket endpoint for streaming logs")
            } else {
                // For follow=false, we'll collect logs and return them as a list
                val logs = containerService.getContainerLogs(id, tail, false).toList()
                call.respond(logs)
            }
        }
        
        // WebSocket endpoint for streaming logs
        webSocket("/{id}/logs/stream") {
            val id = call.parameters["id"] ?: return@webSocket close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Missing container ID"))
            val tail = call.parameters["tail"]?.toIntOrNull() ?: 100
            
            try {
                containerService.getContainerLogs(id, tail, true).collect { logLine ->
                    try {
                        outgoing.send(Frame.Text(logLine))
                    } catch (e: Exception) {
                        // Connection might have been closed by the client
                        return@collect
                    }
                }
            } catch (e: Exception) {
                try {
                    close(CloseReason(CloseReason.Codes.INTERNAL_ERROR, e.message ?: "Unknown error"))
                } catch (closeEx: Exception) {
                    // Connection might already be closed
                }
            }
        }
        
        // Get container statistics
        get("/{id}/stats") {
            val id = call.parameters["id"] ?: return@get call.respond(HttpStatusCode.BadRequest, "Missing container ID")
            val detailed = call.request.queryParameters["detailed"]?.toBoolean() ?: false
            
            try {
                val stats = if (detailed) {
                    containerService.getDetailedContainerStats(id)
                } else {
                    // For backward compatibility, convert detailed stats to basic stats
                    val detailedStats = containerService.getDetailedContainerStats(id)
                    io.kontainers.model.ContainerStats(
                        containerId = detailedStats.containerId,
                        timestamp = detailedStats.timestamp,
                        cpuUsage = detailedStats.cpuUsage,
                        memoryUsage = detailedStats.memoryUsage,
                        memoryLimit = detailedStats.memoryLimit,
                        networkRx = detailedStats.networkRx,
                        networkTx = detailedStats.networkTx,
                        blockRead = detailedStats.blockRead,
                        blockWrite = detailedStats.blockWrite
                    )
                }
                call.respond(stats)
            } catch (e: Exception) {
                call.respond(HttpStatusCode.InternalServerError, "Failed to get container statistics: ${e.message}")
            }
        }
        
        // Get container statistics history
        get("/{id}/stats/history") {
            val id = call.parameters["id"] ?: return@get call.respond(HttpStatusCode.BadRequest, "Missing container ID")
            val limit = call.request.queryParameters["limit"]?.toIntOrNull() ?: 100
            
            try {
                val history = containerService.getContainerStatsHistory(id, limit)
                call.respond(history)
            } catch (e: Exception) {
                call.respond(HttpStatusCode.InternalServerError, "Failed to get container statistics history: ${e.message}")
            }
        }
        
        // WebSocket endpoint for streaming container statistics
        webSocket("/{id}/stats/stream") {
            val id = call.parameters["id"] ?: return@webSocket close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Missing container ID"))
            val interval = call.parameters["interval"]?.toLongOrNull() ?: 1000L // Default to 1 second
            val detailed = call.parameters["detailed"]?.toBoolean() ?: true
            
            try {
                while (isActive) {
                    try {
                        val stats = containerService.getDetailedContainerStats(id)
                        val jsonString = if (detailed) {
                            Json.encodeToString(
                                io.kontainers.model.DetailedContainerStats.serializer(),
                                stats
                            )
                        } else {
                            Json.encodeToString(
                                io.kontainers.model.ContainerStats.serializer(),
                                io.kontainers.model.ContainerStats(
                                    containerId = stats.containerId,
                                    timestamp = stats.timestamp,
                                    cpuUsage = stats.cpuUsage,
                                    memoryUsage = stats.memoryUsage,
                                    memoryLimit = stats.memoryLimit,
                                    networkRx = stats.networkRx,
                                    networkTx = stats.networkTx,
                                    blockRead = stats.blockRead,
                                    blockWrite = stats.blockWrite
                                )
                            )
                        }
                        outgoing.send(Frame.Text(jsonString))
                        delay(interval)
                    } catch (e: Exception) {
                        // Log the error but continue streaming
                        println("Error streaming container stats: ${e.message}")
                        delay(interval)
                    }
                }
            } catch (e: Exception) {
                try {
                    close(CloseReason(CloseReason.Codes.INTERNAL_ERROR, e.message ?: "Unknown error"))
                } catch (closeEx: Exception) {
                    // Connection might already be closed
                }
            }
        }
    }
    
    // Create container
    post {
        try {
            val request = call.receive<ContainerCreationRequest>()
            val result = containerService.createContainer(request)
            
            if (result.success) {
                call.respond(HttpStatusCode.Created, result)
            } else {
                call.respond(HttpStatusCode.BadRequest, result)
            }
        } catch (e: Exception) {
            call.respond(
                HttpStatusCode.InternalServerError,
                mapOf("success" to false, "message" to "Failed to create container: ${e.message}")
            )
        }
    }
    
    // Get detailed stats for a container
    get("/{id}/detailed-stats") {
        val id = call.parameters["id"] ?: return@get call.respond(HttpStatusCode.BadRequest, "Missing container ID")
        
        try {
            val stats = containerService.getDetailedContainerStats(id)
            call.respond(stats)
        } catch (e: Exception) {
            call.respond(HttpStatusCode.InternalServerError, "Failed to get detailed container statistics: ${e.message}")
        }
    }
}