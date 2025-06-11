package io.kontainers.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class ContainerTest {
    
    @Test
    fun testContainerSerialization() {
        val container = Container(
            id = "123abc",
            name = "test-container",
            image = "nginx:latest",
            state = ContainerState.RUNNING,
            status = "Up 2 hours",
            ports = listOf(
                PortMapping(
                    privatePort = 80,
                    publicPort = 8080,
                    type = "tcp"
                )
            ),
            volumes = listOf(
                VolumeMount(
                    source = "/host/path",
                    destination = "/container/path",
                    mode = "rw"
                )
            ),
            networks = listOf("bridge"),
            created = 1623456789,
            labels = mapOf("com.example.label" to "value"),
            env = listOf("ENV_VAR=value")
        )
        
        val json = Json.encodeToString(container)
        val decoded = Json.decodeFromString<Container>(json)
        
        assertEquals(container.id, decoded.id)
        assertEquals(container.name, decoded.name)
        assertEquals(container.image, decoded.image)
        assertEquals(container.state, decoded.state)
        assertEquals(container.status, decoded.status)
        assertEquals(container.ports.size, decoded.ports.size)
        assertEquals(container.ports[0].privatePort, decoded.ports[0].privatePort)
        assertEquals(container.ports[0].publicPort, decoded.ports[0].publicPort)
        assertEquals(container.volumes.size, decoded.volumes.size)
        assertEquals(container.volumes[0].source, decoded.volumes[0].source)
        assertEquals(container.networks.size, decoded.networks.size)
        assertEquals(container.networks[0], decoded.networks[0])
        assertEquals(container.created, decoded.created)
        assertEquals(container.labels.size, decoded.labels.size)
        assertEquals(container.labels["com.example.label"], decoded.labels["com.example.label"])
        assertEquals(container.env.size, decoded.env.size)
        assertEquals(container.env[0], decoded.env[0])
    }
    
    @Test
    fun testContainerStateValues() {
        val states = ContainerState.values()
        assertEquals(7, states.size)
        assertNotNull(ContainerState.RUNNING)
        assertNotNull(ContainerState.STOPPED)
        assertNotNull(ContainerState.PAUSED)
        assertNotNull(ContainerState.RESTARTING)
        assertNotNull(ContainerState.REMOVING)
        assertNotNull(ContainerState.DEAD)
        assertNotNull(ContainerState.CREATED)
    }
    
    @Test
    fun testPortMapping() {
        val portMapping = PortMapping(
            privatePort = 80,
            publicPort = 8080,
            type = "tcp",
            ip = "0.0.0.0"
        )
        
        val json = Json.encodeToString(portMapping)
        val decoded = Json.decodeFromString<PortMapping>(json)
        
        assertEquals(portMapping.privatePort, decoded.privatePort)
        assertEquals(portMapping.publicPort, decoded.publicPort)
        assertEquals(portMapping.type, decoded.type)
        assertEquals(portMapping.ip, decoded.ip)
    }
    
    @Test
    fun testVolumeMount() {
        val volumeMount = VolumeMount(
            source = "/host/path",
            destination = "/container/path",
            mode = "rw"
        )
        
        val json = Json.encodeToString(volumeMount)
        val decoded = Json.decodeFromString<VolumeMount>(json)
        
        assertEquals(volumeMount.source, decoded.source)
        assertEquals(volumeMount.destination, decoded.destination)
        assertEquals(volumeMount.mode, decoded.mode)
    }
}