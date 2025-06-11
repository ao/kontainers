package io.kontainers.api

import io.kontainers.docker.ContainerService
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.websocket.*
import io.ktor.websocket.*
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.toList
import kotlinx.serialization.json.Json

/**
 * Configures the container API routes.
 */
fun Route.containerRoutes(containerService: ContainerService) {
    route("/api/containers") {
        // Get all containers
        get {
            val all = call.request.queryParameters["all"]?.toBoolean() ?: true
            val containers = containerService.listContainers(all)
            call.respond(containers)
        }
        
        // Get container by ID
        get("/{id}") {
            val id = call.parameters["id"] ?: return@get call.respond(HttpStatusCode.BadRequest, "Missing container ID")
            val all = true
            val containers = containerService.listContainers(all)
            val container = containers.find { it.id == id || it.name == id }
            
            if (container != null) {
                call.respond(container)
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
    }
}