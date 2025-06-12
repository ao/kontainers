package io.kontainers

import io.kontainers.api.configurationRoutes
import io.kontainers.api.containerRoutes
import io.kontainers.api.healthRoutes
import io.kontainers.api.proxyRoutes
import io.kontainers.docker.ContainerService
import io.kontainers.docker.DockerClientConfig
import io.kontainers.proxy.ProxyService
import io.kontainers.system.ConfigurationService
import io.kontainers.system.HealthMonitoringService
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.netty.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.plugins.cors.routing.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.http.content.*
import io.ktor.server.websocket.*
import kotlinx.serialization.json.Json
import java.time.Duration

/**
 * Main application entry point.
 */
fun main() {
    // Get port from environment variable or use default (9090)
    val port = System.getenv("PORT")?.toIntOrNull() ?: 9090
    
    // Set development mode
    System.setProperty("dev.mode", "true")
    
    println("Starting Kontainers server on port $port")
    embeddedServer(Netty, port = port, host = "0.0.0.0") {
        module()
    }.start(wait = true)
}

/**
 * Application module configuration.
 */
fun Application.module() {
    // Create Docker client and services
    val dockerClient = DockerClientConfig.create()
    val containerService = ContainerService(dockerClient)
    val proxyService = ProxyService() // Use default paths that now respect dev.mode
    val configurationService = ConfigurationService(proxyService, containerService)
    val healthMonitoringService = HealthMonitoringService(containerService, proxyService)
    
    // Start health monitoring service
    healthMonitoringService.start()
    
    // Install plugins
    install(ContentNegotiation) {
        json(Json {
            prettyPrint = true
            isLenient = true
        })
    }
    
    install(CORS) {
        allowMethod(HttpMethod.Options)
        allowMethod(HttpMethod.Put)
        allowMethod(HttpMethod.Delete)
        allowMethod(HttpMethod.Patch)
        allowHeader(HttpHeaders.Authorization)
        allowHeader(HttpHeaders.ContentType)
        anyHost()
    }
    
    install(WebSockets) {
        pingPeriod = Duration.ofSeconds(15)
        timeout = Duration.ofSeconds(15)
        maxFrameSize = Long.MAX_VALUE
        masking = false
    }
    
    // Configure routing
    configureRouting(containerService, proxyService, configurationService, healthMonitoringService)
}

/**
 * Configure application routing.
 */
fun Application.configureRouting(
    containerService: ContainerService,
    proxyService: ProxyService,
    configurationService: ConfigurationService,
    healthMonitoringService: HealthMonitoringService
) {
    routing {
        containerRoutes(containerService)
        proxyRoutes(proxyService)
        configurationRoutes(configurationService)
        healthRoutes(healthMonitoringService)
        
        // Serve files from the root resources directory (for kontainers.js)
        staticResources("/", "")
        // Serve files from the static subdirectory
        staticResources("/", "static")
        // Set default resource
        get("/") {
            call.respondRedirect("/index.html")
        }
        
        // Health check endpoint
        get("/health") {
            call.respond(mapOf("status" to "UP"))
        }
    }
}