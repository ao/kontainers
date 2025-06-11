package io.kontainers.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class ProxyRuleTest {
    
    @Test
    fun testProxyRuleSerialization() {
        val healthCheck = HealthCheck(
            path = "/health",
            interval = 30,
            timeout = 5,
            retries = 3
        )
        
        val proxyRule = ProxyRule(
            id = "rule1",
            name = "Test Rule",
            sourceHost = "example.com",
            sourcePath = "/api",
            targetContainer = "api-container",
            targetPort = 8080,
            protocol = ProxyProtocol.HTTP,
            sslEnabled = true,
            sslCertPath = "/path/to/cert.crt",
            headers = mapOf("X-Forwarded-Proto" to "https"),
            healthCheck = healthCheck,
            created = 1623456789,
            enabled = true
        )
        
        val json = Json.encodeToString(proxyRule)
        val decoded = Json.decodeFromString<ProxyRule>(json)
        
        assertEquals(proxyRule.id, decoded.id)
        assertEquals(proxyRule.name, decoded.name)
        assertEquals(proxyRule.sourceHost, decoded.sourceHost)
        assertEquals(proxyRule.sourcePath, decoded.sourcePath)
        assertEquals(proxyRule.targetContainer, decoded.targetContainer)
        assertEquals(proxyRule.targetPort, decoded.targetPort)
        assertEquals(proxyRule.protocol, decoded.protocol)
        assertEquals(proxyRule.sslEnabled, decoded.sslEnabled)
        assertEquals(proxyRule.sslCertPath, decoded.sslCertPath)
        assertEquals(proxyRule.headers.size, decoded.headers.size)
        assertEquals(proxyRule.headers["X-Forwarded-Proto"], decoded.headers["X-Forwarded-Proto"])
        assertEquals(proxyRule.healthCheck?.path, decoded.healthCheck?.path)
        assertEquals(proxyRule.healthCheck?.interval, decoded.healthCheck?.interval)
        assertEquals(proxyRule.healthCheck?.timeout, decoded.healthCheck?.timeout)
        assertEquals(proxyRule.healthCheck?.retries, decoded.healthCheck?.retries)
        assertEquals(proxyRule.created, decoded.created)
        assertEquals(proxyRule.enabled, decoded.enabled)
    }
    
    @Test
    fun testProxyProtocolValues() {
        val protocols = ProxyProtocol.values()
        assertEquals(4, protocols.size)
        assertNotNull(ProxyProtocol.HTTP)
        assertNotNull(ProxyProtocol.HTTPS)
        assertNotNull(ProxyProtocol.TCP)
        assertNotNull(ProxyProtocol.UDP)
    }
    
    @Test
    fun testHealthCheck() {
        val healthCheck = HealthCheck(
            path = "/health",
            interval = 30,
            timeout = 5,
            retries = 3
        )
        
        val json = Json.encodeToString(healthCheck)
        val decoded = Json.decodeFromString<HealthCheck>(json)
        
        assertEquals(healthCheck.path, decoded.path)
        assertEquals(healthCheck.interval, decoded.interval)
        assertEquals(healthCheck.timeout, decoded.timeout)
        assertEquals(healthCheck.retries, decoded.retries)
    }
    
    @Test
    fun testProxyRuleWithDefaultValues() {
        val proxyRule = ProxyRule(
            id = "rule1",
            name = "Test Rule",
            sourceHost = "example.com",
            targetContainer = "api-container",
            targetPort = 8080,
            created = 1623456789
        )
        
        val json = Json.encodeToString(proxyRule)
        val decoded = Json.decodeFromString<ProxyRule>(json)
        
        assertEquals("/", decoded.sourcePath)
        assertEquals(ProxyProtocol.HTTP, decoded.protocol)
        assertEquals(false, decoded.sslEnabled)
        assertEquals(null, decoded.sslCertPath)
        assertEquals(0, decoded.headers.size)
        assertEquals(null, decoded.healthCheck)
        assertEquals(true, decoded.enabled)
    }
}