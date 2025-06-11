package io.kontainers.api

import io.kontainers.model.ProxyRule
import io.kontainers.proxy.ProxyService
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

/**
 * Configures the proxy API routes.
 */
fun Route.proxyRoutes(proxyService: ProxyService) {
    route("/api/proxy/rules") {
        // Get all proxy rules
        get {
            val rules = proxyService.getAllRules()
            call.respond(rules)
        }
        
        // Get proxy rule by ID
        get("/{id}") {
            val id = call.parameters["id"] ?: return@get call.respond(HttpStatusCode.BadRequest, "Missing rule ID")
            val rule = proxyService.getRule(id)
            
            if (rule != null) {
                call.respond(rule)
            } else {
                call.respond(HttpStatusCode.NotFound, "Proxy rule not found")
            }
        }
        
        // Create new proxy rule
        post {
            val rule = call.receive<ProxyRule>()
            val createdRule = proxyService.createRule(rule)
            call.respond(HttpStatusCode.Created, createdRule)
        }
        
        // Update proxy rule
        put("/{id}") {
            val id = call.parameters["id"] ?: return@put call.respond(HttpStatusCode.BadRequest, "Missing rule ID")
            val rule = call.receive<ProxyRule>()
            
            val updatedRule = proxyService.updateRule(id, rule)
            if (updatedRule != null) {
                call.respond(updatedRule)
            } else {
                call.respond(HttpStatusCode.NotFound, "Proxy rule not found")
            }
        }
        
        // Delete proxy rule
        delete("/{id}") {
            val id = call.parameters["id"] ?: return@delete call.respond(HttpStatusCode.BadRequest, "Missing rule ID")
            
            val deleted = proxyService.deleteRule(id)
            if (deleted) {
                call.respond(HttpStatusCode.NoContent)
            } else {
                call.respond(HttpStatusCode.NotFound, "Proxy rule not found")
            }
        }
        
        // Enable/disable proxy rule
        post("/{id}/toggle") {
            val id = call.parameters["id"] ?: return@post call.respond(HttpStatusCode.BadRequest, "Missing rule ID")
            val enabled = call.request.queryParameters["enabled"]?.toBoolean() ?: true
            
            val updatedRule = proxyService.setRuleEnabled(id, enabled)
            if (updatedRule != null) {
                call.respond(updatedRule)
            } else {
                call.respond(HttpStatusCode.NotFound, "Proxy rule not found")
            }
        }
        
        // Test proxy rule
        post("/test") {
            val rule = call.receive<ProxyRule>()
            val success = proxyService.testRule(rule)
            
            if (success) {
                call.respond(mapOf("success" to true, "message" to "Proxy rule test successful"))
            } else {
                call.respond(HttpStatusCode.BadRequest, mapOf("success" to false, "message" to "Proxy rule test failed"))
            }
        }
    }
    
    // Get current proxy configuration
    get("/api/proxy/config") {
        // In a real implementation, this would return the current Nginx configuration
        call.respond(mapOf("status" to "OK", "message" to "Proxy configuration retrieved"))
    }
    
    // Reload proxy configuration
    post("/api/proxy/reload") {
        // In a real implementation, this would reload the Nginx configuration
        call.respond(mapOf("status" to "OK", "message" to "Proxy configuration reloaded"))
    }
}