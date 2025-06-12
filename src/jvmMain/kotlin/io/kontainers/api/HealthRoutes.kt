package io.kontainers.api

import io.kontainers.system.HealthMonitoringService
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.websocket.*
import io.ktor.websocket.*
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.onEach
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Configures the health monitoring API routes.
 */
fun Route.healthRoutes(healthMonitoringService: HealthMonitoringService) {
    route("/api/health") {
        // Get overall system health
        get {
            val overallHealth = healthMonitoringService.getOverallHealth()
            call.respond(mapOf(
                "status" to overallHealth.toString(),
                "timestamp" to System.currentTimeMillis()
            ))
        }
        
        // Get all health check results
        get("/checks") {
            val healthChecks = healthMonitoringService.getAllHealthChecks()
            call.respond(healthChecks)
        }
        
        // Get health check result by component ID
        get("/checks/{componentId}") {
            val componentId = call.parameters["componentId"] ?: return@get call.respond(HttpStatusCode.BadRequest, "Missing component ID")
            
            val healthCheck = healthMonitoringService.getHealthCheck(componentId)
            if (healthCheck != null) {
                call.respond(healthCheck)
            } else {
                call.respond(HttpStatusCode.NotFound, "Health check not found for component: $componentId")
            }
        }
        
        // Get system resource metrics
        get("/metrics") {
            val limit = call.request.queryParameters["limit"]?.toIntOrNull() ?: 100
            val metrics = healthMonitoringService.getSystemResourceMetricsHistory(limit)
            call.respond(metrics)
        }
        
        // Get latest system resource metrics
        get("/metrics/latest") {
            val metrics = healthMonitoringService.getLatestSystemResourceMetrics()
            if (metrics != null) {
                call.respond(metrics)
            } else {
                call.respond(HttpStatusCode.NotFound, "No metrics available")
            }
        }
        
        // Stream health check updates
        webSocket("/stream/checks") {
            healthMonitoringService.healthUpdates.onEach { healthCheck ->
                val json = Json.encodeToString(healthCheck)
                outgoing.send(Frame.Text(json))
            }.collect()
        }
        
        // Stream system resource metrics updates
        webSocket("/stream/metrics") {
            healthMonitoringService.metricsUpdates.onEach { metrics ->
                val json = Json.encodeToString(metrics)
                outgoing.send(Frame.Text(json))
            }.collect()
        }
    }
}