package io.kontainers.model

import kotlinx.serialization.Serializable

/**
 * Sealed class representing different types of WebSocket messages.
 */
@Serializable
@kotlinx.serialization.SerialName("WebSocketMessage")
sealed class WebSocketMessage {
    /**
     * Represents a container event (created, started, stopped, etc.).
     */
    @Serializable
    @kotlinx.serialization.SerialName("ContainerEvent")
    data class ContainerEvent(
        val type: EventType,
        val container: Container
    ) : WebSocketMessage()
    
    /**
     * Represents a proxy rule event (created, updated, etc.).
     */
    @Serializable
    @kotlinx.serialization.SerialName("ProxyEvent")
    data class ProxyEvent(
        val type: EventType,
        val rule: ProxyRule
    ) : WebSocketMessage()
    
    /**
     * Represents a container statistics update.
     */
    @Serializable
    @kotlinx.serialization.SerialName("StatsUpdate")
    data class StatsUpdate(
        val stats: List<ContainerStats>
    ) : WebSocketMessage()
    
    /**
     * Represents a container log entry.
     */
    @Serializable
    @kotlinx.serialization.SerialName("LogEntry")
    data class LogEntry(
        val containerId: String,
        val timestamp: Long,
        val message: String,
        val level: LogLevel = LogLevel.INFO
    ) : WebSocketMessage()
}

/**
 * Enum representing event types for container and proxy events.
 */
@Serializable
enum class EventType {
    CREATED, STARTED, STOPPED, REMOVED, UPDATED
}

/**
 * Enum representing log levels for container logs.
 */
@Serializable
enum class LogLevel {
    DEBUG, INFO, WARN, ERROR
}