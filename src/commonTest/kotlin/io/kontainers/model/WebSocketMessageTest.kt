package io.kontainers.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.modules.SerializersModule

class WebSocketMessageTest {
    
    private val format = Json {
        classDiscriminator = "type"
        ignoreUnknownKeys = true
        isLenient = true
    }
    
    @Test
    fun testContainerEventSerialization() {
        val container = Container(
            id = "123abc",
            name = "test-container",
            image = "nginx:latest",
            state = ContainerState.RUNNING,
            status = "Up 2 hours",
            ports = listOf(
                PortMapping(
                    privatePort = 80,
                    publicPort = 8080
                )
            ),
            volumes = emptyList(),
            networks = listOf("bridge"),
            created = 1623456789
        )
        
        val event = WebSocketMessage.ContainerEvent(
            type = EventType.STARTED,
            container = container
        )
        
        val json = format.encodeToString(event)
        val decoded = format.decodeFromString<WebSocketMessage.ContainerEvent>(json)
        
        assertTrue(decoded is WebSocketMessage.ContainerEvent)
        val decodedEvent = decoded as WebSocketMessage.ContainerEvent
        assertEquals(EventType.STARTED, decodedEvent.type)
        assertEquals(container.id, decodedEvent.container.id)
        assertEquals(container.name, decodedEvent.container.name)
        assertEquals(container.state, decodedEvent.container.state)
    }
    
    @Test
    fun testProxyEventSerialization() {
        val proxyRule = ProxyRule(
            id = "rule1",
            name = "Test Rule",
            sourceHost = "example.com",
            targetContainer = "api-container",
            targetPort = 8080,
            created = 1623456789
        )
        
        val event = WebSocketMessage.ProxyEvent(
            type = EventType.CREATED,
            rule = proxyRule
        )
        
        val json = format.encodeToString(event)
        val decoded = format.decodeFromString<WebSocketMessage.ProxyEvent>(json)
        
        assertTrue(decoded is WebSocketMessage.ProxyEvent)
        val decodedEvent = decoded as WebSocketMessage.ProxyEvent
        assertEquals(EventType.CREATED, decodedEvent.type)
        assertEquals(proxyRule.id, decodedEvent.rule.id)
        assertEquals(proxyRule.name, decodedEvent.rule.name)
        assertEquals(proxyRule.sourceHost, decodedEvent.rule.sourceHost)
    }
    
    @Test
    fun testStatsUpdateSerialization() {
        val stats = ContainerStats(
            containerId = "123abc",
            timestamp = 1623456789,
            cpuUsage = 0.5,
            memoryUsage = 1024 * 1024 * 100,
            memoryLimit = 1024 * 1024 * 1024,
            networkRx = 1024 * 500,
            networkTx = 1024 * 200,
            blockRead = 1024 * 1024 * 10,
            blockWrite = 1024 * 1024 * 5
        )
        
        val event = WebSocketMessage.StatsUpdate(
            stats = listOf(stats)
        )
        
        val json = format.encodeToString(event)
        val decoded = format.decodeFromString<WebSocketMessage.StatsUpdate>(json)
        
        assertTrue(decoded is WebSocketMessage.StatsUpdate)
        val decodedEvent = decoded as WebSocketMessage.StatsUpdate
        assertEquals(1, decodedEvent.stats.size)
        assertEquals(stats.containerId, decodedEvent.stats[0].containerId)
        assertEquals(stats.cpuUsage, decodedEvent.stats[0].cpuUsage)
    }
    
    @Test
    fun testLogEntrySerialization() {
        val logEntry = WebSocketMessage.LogEntry(
            containerId = "123abc",
            timestamp = 1623456789,
            message = "Container started",
            level = LogLevel.INFO
        )
        
        val json = format.encodeToString(logEntry)
        val decoded = format.decodeFromString<WebSocketMessage.LogEntry>(json)
        
        assertTrue(decoded is WebSocketMessage.LogEntry)
        val decodedEntry = decoded as WebSocketMessage.LogEntry
        assertEquals(logEntry.containerId, decodedEntry.containerId)
        assertEquals(logEntry.timestamp, decodedEntry.timestamp)
        assertEquals(logEntry.message, decodedEntry.message)
        assertEquals(logEntry.level, decodedEntry.level)
    }
    
    @Test
    fun testEventTypeValues() {
        val types = EventType.values()
        assertEquals(5, types.size)
        assertEquals(EventType.CREATED, types[0])
        assertEquals(EventType.STARTED, types[1])
        assertEquals(EventType.STOPPED, types[2])
        assertEquals(EventType.REMOVED, types[3])
        assertEquals(EventType.UPDATED, types[4])
    }
    
    @Test
    fun testLogLevelValues() {
        val levels = LogLevel.values()
        assertEquals(4, levels.size)
        assertEquals(LogLevel.DEBUG, levels[0])
        assertEquals(LogLevel.INFO, levels[1])
        assertEquals(LogLevel.WARN, levels[2])
        assertEquals(LogLevel.ERROR, levels[3])
    }
}