package io.kontainers.docker

import kotlin.test.Test
import kotlin.test.assertNotNull
import org.junit.jupiter.api.assertDoesNotThrow

class DockerClientConfigTest {
    
    @Test
    fun testCreateDockerClient() {
        assertDoesNotThrow {
            val client = DockerClientConfig.create()
            assertNotNull(client)
        }
    }
}