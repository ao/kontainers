package io.kontainers.api

import io.kontainers.model.Container
import kotlinx.browser.window
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.plugins.websocket.*
import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.websocket.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.serialization.json.Json

/**
 * API client for communicating with the Kontainers backend.
 */
class KontainersApiClient {
    private val client = HttpClient {
        install(ContentNegotiation) {
            json(Json {
                prettyPrint = true
                isLenient = true
                ignoreUnknownKeys = true
            })
        }
        install(WebSockets)
    }
    
    /**
     * Base URL for API requests.
     */
    private val baseUrl = "/api"
    
    /**
     * Gets all containers.
     * 
     * @param all If true, includes stopped containers
     * @return List of containers
     */
    suspend fun getContainers(all: Boolean = true): List<Container> {
        return client.get("$baseUrl/containers") {
            parameter("all", all)
        }.body()
    }
    
    /**
     * Gets a container by ID.
     * 
     * @param id Container ID
     * @return Container details
     */
    suspend fun getContainer(id: String): Container {
        return client.get("$baseUrl/containers/$id").body()
    }
    
    /**
     * Starts a container.
     * 
     * @param id Container ID
     * @return true if successful
     */
    suspend fun startContainer(id: String): Boolean {
        val response: Map<String, Any> = client.post("$baseUrl/containers/$id/start").body()
        return response["success"] as Boolean
    }
    
    /**
     * Stops a container.
     * 
     * @param id Container ID
     * @param timeout Timeout in seconds before killing the container
     * @return true if successful
     */
    suspend fun stopContainer(id: String, timeout: Int = 10): Boolean {
        val response: Map<String, Any> = client.post("$baseUrl/containers/$id/stop") {
            parameter("timeout", timeout)
        }.body()
        return response["success"] as Boolean
    }
    
    /**
     * Restarts a container.
     * 
     * @param id Container ID
     * @param timeout Timeout in seconds before killing the container
     * @return true if successful
     */
    suspend fun restartContainer(id: String, timeout: Int = 10): Boolean {
        val response: Map<String, Any> = client.post("$baseUrl/containers/$id/restart") {
            parameter("timeout", timeout)
        }.body()
        return response["success"] as Boolean
    }
    
    /**
     * Gets container logs.
     * 
     * @param id Container ID
     * @param tail Number of lines to return from the end of the logs
     * @return List of log lines
     */
    suspend fun getContainerLogs(id: String, tail: Int = 100): List<String> {
        return client.get("$baseUrl/containers/$id/logs") {
            parameter("tail", tail)
        }.body()
    }
    
    /**
     * Streams container logs via WebSocket.
     * 
     * @param id Container ID
     * @param tail Number of lines to return from the end of the logs
     * @return Flow of log lines
     */
    fun streamContainerLogs(id: String, tail: Int = 100): Flow<String> = flow {
        val protocol = if (window.location.protocol == "https:") "wss" else "ws"
        val host = window.location.hostname
        val port = window.location.port.toIntOrNull() ?: if (protocol == "wss") 443 else 80
        
        client.webSocket(
            method = HttpMethod.Get,
            host = host,
            port = port,
            path = "$baseUrl/containers/$id/logs/stream?tail=$tail"
        ) {
            for (frame in incoming) {
                if (frame is Frame.Text) {
                    emit(frame.readText())
                }
            }
        }
    }
}