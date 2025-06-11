package io.kontainers.api

import io.kontainers.model.Container
import io.kontainers.model.ProxyRule
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

// External declaration for JavaScript console
external val console: dynamic

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
        return try {
            client.get("$baseUrl/containers") {
                parameter("all", all)
            }.body()
        } catch (e: Exception) {
            console.warn("Failed to fetch containers from API: ${e.message}. Using mock data.")
            // Return empty list when API is not available
            emptyList()
        }
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
    
    /**
     * Gets all proxy rules.
     *
     * @return List of proxy rules
     */
    suspend fun getProxyRules(): List<ProxyRule> {
        return try {
            client.get("$baseUrl/proxy/rules").body()
        } catch (e: Exception) {
            console.warn("Failed to fetch proxy rules from API: ${e.message}. Using mock data.")
            // Return empty list when API is not available
            emptyList()
        }
    }
    
    /**
     * Gets a proxy rule by ID.
     *
     * @param id Proxy rule ID
     * @return Proxy rule details
     */
    suspend fun getProxyRule(id: String): ProxyRule {
        return client.get("$baseUrl/proxy/rules/$id").body()
    }
    
    /**
     * Creates a new proxy rule.
     *
     * @param rule Proxy rule to create
     * @return Created proxy rule
     */
    suspend fun createProxyRule(rule: ProxyRule): ProxyRule {
        return client.post("$baseUrl/proxy/rules") {
            contentType(ContentType.Application.Json)
            setBody(rule)
        }.body()
    }
    
    /**
     * Updates a proxy rule.
     *
     * @param id Proxy rule ID
     * @param rule Updated proxy rule
     * @return Updated proxy rule
     */
    suspend fun updateProxyRule(id: String, rule: ProxyRule): ProxyRule {
        return client.put("$baseUrl/proxy/rules/$id") {
            contentType(ContentType.Application.Json)
            setBody(rule)
        }.body()
    }
    
    /**
     * Deletes a proxy rule.
     *
     * @param id Proxy rule ID
     * @return true if successful
     */
    suspend fun deleteProxyRule(id: String): Boolean {
        val response = client.delete("$baseUrl/proxy/rules/$id")
        return response.status.isSuccess()
    }
    
    /**
     * Enables or disables a proxy rule.
     *
     * @param id Proxy rule ID
     * @param enabled Whether the rule should be enabled
     * @return Updated proxy rule
     */
    suspend fun toggleProxyRule(id: String, enabled: Boolean): ProxyRule {
        return client.post("$baseUrl/proxy/rules/$id/toggle") {
            parameter("enabled", enabled)
        }.body()
    }
    
    /**
     * Tests a proxy rule.
     *
     * @param rule Proxy rule to test
     * @return true if successful
     */
    suspend fun testProxyRule(rule: ProxyRule): Boolean {
        val response: Map<String, Any> = client.post("$baseUrl/proxy/rules/test") {
            contentType(ContentType.Application.Json)
            setBody(rule)
        }.body()
        return response["success"] as Boolean
    }
}