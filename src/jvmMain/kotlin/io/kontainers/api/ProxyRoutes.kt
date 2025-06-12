package io.kontainers.api

import io.kontainers.model.*
import io.kontainers.proxy.ProxyService
import io.ktor.http.*
import io.ktor.http.content.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.websocket.*
import io.ktor.websocket.*
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.onEach
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.nio.file.Files
import java.nio.file.Paths

/**
 * Data class for SSL certificate upload request.
 */
@Serializable
data class CertificateUploadRequest(
    val name: String,
    val certContent: String,
    val keyContent: String? = null
)

/**
 * Data class for template save request.
 */
@Serializable
data class TemplateSaveRequest(
    val name: String,
    val content: String
)

/**
 * Data class for proxy rule import request.
 */
@Serializable
data class ProxyRuleImportRequest(
    val format: String,
    val overwriteExisting: Boolean = false
)

/**
 * Data class for proxy rule export request.
 */
@Serializable
data class ProxyRuleExportRequest(
    val format: String,
    val ruleIds: List<String>? = null
)

/**
 * Configures the proxy API routes.
 */
fun Route.proxyRoutes(proxyService: ProxyService) {
    route("/api/proxy/rules") {
        // Get all proxy rules with pagination
        get {
            val page = call.request.queryParameters["page"]?.toIntOrNull() ?: 1
            val pageSize = call.request.queryParameters["pageSize"]?.toIntOrNull() ?: 20
            
            val allRules = proxyService.getAllRules()
            val totalRules = allRules.size
            val totalPages = (totalRules + pageSize - 1) / pageSize
            
            val paginatedRules = allRules
                .sortedByDescending { it.created }
                .drop((page - 1) * pageSize)
                .take(pageSize)
            
            call.respond(
                mapOf(
                    "rules" to paginatedRules,
                    "pagination" to mapOf(
                        "page" to page,
                        "pageSize" to pageSize,
                        "totalItems" to totalRules,
                        "totalPages" to totalPages
                    )
                )
            )
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
        
        // Validate proxy rule
        post("/validate") {
            val rule = call.receive<ProxyRule>()
            val validationResult = proxyService.validateRule(rule)
            call.respond(validationResult)
        }
        
        // Import proxy rules
        post("/import") {
            val multipart = call.receiveMultipart()
            var format = "json"
            var overwriteExisting = false
            var fileBytes: ByteArray? = null
            
            multipart.forEachPart { part ->
                when (part) {
                    is PartData.FormItem -> {
                        when (part.name) {
                            "format" -> format = part.value
                            "overwriteExisting" -> overwriteExisting = part.value.toBoolean()
                        }
                    }
                    is PartData.FileItem -> {
                        if (part.name == "file") {
                            fileBytes = part.streamProvider().readBytes()
                        }
                    }
                    else -> {}
                }
                part.dispose()
            }
            
            if (fileBytes == null) {
                call.respond(HttpStatusCode.BadRequest, "Import file is required")
                return@post
            }
            
            // Create temporary file
            val tempFile = Files.createTempFile("proxy_rules_import", ".${format}").toFile()
            try {
                tempFile.writeBytes(fileBytes!!)
                
                val importCount = proxyService.importRules(tempFile.absolutePath, format, overwriteExisting)
                if (importCount > 0) {
                    call.respond(mapOf(
                        "success" to true,
                        "message" to "Successfully imported $importCount proxy rules"
                    ))
                } else {
                    call.respond(HttpStatusCode.BadRequest, mapOf(
                        "success" to false,
                        "message" to "No proxy rules were imported"
                    ))
                }
            } finally {
                tempFile.delete()
            }
        }
        
        // Export proxy rules
        post("/export") {
            val request = call.receive<ProxyRuleExportRequest>()
            
            // Create temporary file
            val tempFile = Files.createTempFile("proxy_rules_export", ".${request.format}").toFile()
            try {
                val success = proxyService.exportRules(tempFile.absolutePath, request.format, request.ruleIds)
                
                if (success) {
                    call.response.header(
                        HttpHeaders.ContentDisposition,
                        ContentDisposition.Attachment.withParameter(
                            ContentDisposition.Parameters.FileName,
                            "proxy_rules.${request.format}"
                        ).toString()
                    )
                    call.respondFile(tempFile)
                } else {
                    call.respond(HttpStatusCode.InternalServerError, mapOf(
                        "success" to false,
                        "message" to "Failed to export proxy rules"
                    ))
                }
            } catch (e: Exception) {
                call.respond(HttpStatusCode.InternalServerError, mapOf(
                    "success" to false,
                    "message" to "Failed to export proxy rules: ${e.message}"
                ))
            } finally {
                tempFile.delete()
            }
        }
    }
    
    // SSL Certificate management
    route("/api/proxy/certificates") {
        // Get all certificates
        get {
            val certificates = proxyService.listCertificates()
            call.respond(certificates)
        }
        
        // Upload certificate
        post {
            val multipart = call.receiveMultipart()
            var name = ""
            var certContent: ByteArray? = null
            var keyContent: ByteArray? = null
            
            multipart.forEachPart { part ->
                when (part) {
                    is PartData.FormItem -> {
                        if (part.name == "name") {
                            name = part.value
                        }
                    }
                    is PartData.FileItem -> {
                        when (part.name) {
                            "cert" -> certContent = part.streamProvider().readBytes()
                            "key" -> keyContent = part.streamProvider().readBytes()
                        }
                    }
                    else -> {}
                }
                part.dispose()
            }
            
            if (name.isBlank() || certContent == null) {
                call.respond(HttpStatusCode.BadRequest, "Certificate name and content are required")
                return@post
            }
            
            val success = proxyService.uploadCertificate(name, certContent!!, keyContent)
            if (success) {
                call.respond(mapOf("success" to true, "message" to "Certificate uploaded successfully"))
            } else {
                call.respond(HttpStatusCode.InternalServerError, mapOf("success" to false, "message" to "Failed to upload certificate"))
            }
        }
        
        // Delete certificate
        delete("/{name}") {
            val name = call.parameters["name"] ?: return@delete call.respond(HttpStatusCode.BadRequest, "Missing certificate name")
            
            val deleted = proxyService.deleteCertificate(name)
            if (deleted) {
                call.respond(mapOf("success" to true, "message" to "Certificate deleted successfully"))
            } else {
                call.respond(HttpStatusCode.NotFound, mapOf("success" to false, "message" to "Certificate not found"))
            }
        }
    }
    
    // Nginx template management
    route("/api/proxy/templates") {
        // Get all templates
        get {
            val templates = proxyService.getTemplates()
            call.respond(templates)
        }
        
        // Get template by name
        get("/{name}") {
            val name = call.parameters["name"] ?: return@get call.respond(HttpStatusCode.BadRequest, "Missing template name")
            
            val template = proxyService.getTemplate(name)
            if (template != null) {
                call.respond(mapOf("name" to name, "content" to template))
            } else {
                call.respond(HttpStatusCode.NotFound, "Template not found")
            }
        }
        
        // Save template
        post {
            val request = call.receive<TemplateSaveRequest>()
            
            if (request.name.isBlank() || request.content.isBlank()) {
                call.respond(HttpStatusCode.BadRequest, "Template name and content are required")
                return@post
            }
            
            val success = proxyService.saveTemplate(request.name, request.content)
            if (success) {
                call.respond(mapOf("success" to true, "message" to "Template saved successfully"))
            } else {
                call.respond(HttpStatusCode.InternalServerError, mapOf("success" to false, "message" to "Failed to save template"))
            }
        }
        
        // Delete template
        delete("/{name}") {
            val name = call.parameters["name"] ?: return@delete call.respond(HttpStatusCode.BadRequest, "Missing template name")
            
            val deleted = proxyService.deleteTemplate(name)
            if (deleted) {
                call.respond(mapOf("success" to true, "message" to "Template deleted successfully"))
            } else {
                call.respond(HttpStatusCode.NotFound, mapOf("success" to false, "message" to "Template not found"))
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
    
    // Monitoring and Analytics Routes
    
    // Traffic data
    route("/api/proxy/analytics/traffic") {
        // Get traffic data for all rules
        get {
            val limit = call.request.queryParameters["limit"]?.toIntOrNull() ?: 100
            val trafficData = proxyService.getAllTrafficData(limit)
            call.respond(trafficData)
        }
        
        // Get traffic data for a specific rule
        get("/{ruleId}") {
            val ruleId = call.parameters["ruleId"] ?: return@get call.respond(HttpStatusCode.BadRequest, "Missing rule ID")
            val limit = call.request.queryParameters["limit"]?.toIntOrNull() ?: 100
            
            val trafficData = proxyService.getTrafficData(ruleId, limit)
            call.respond(trafficData)
        }
        
        // Get traffic summary for a specific rule
        get("/{ruleId}/summary") {
            val ruleId = call.parameters["ruleId"] ?: return@get call.respond(HttpStatusCode.BadRequest, "Missing rule ID")
            val period = call.request.queryParameters["period"] ?: "last_hour"
            
            val summary = proxyService.getTrafficSummary(ruleId, period)
            call.respond(summary)
        }
        
        // Stream real-time traffic updates
        webSocket("/stream") {
            proxyService.trafficUpdates.onEach { data ->
                val json = Json.encodeToString(data)
                outgoing.send(Frame.Text(json))
            }.collect()
        }
    }
    
    // Error data
    route("/api/proxy/analytics/errors") {
        // Get errors for all rules
        get {
            val limit = call.request.queryParameters["limit"]?.toIntOrNull() ?: 100
            val errors = proxyService.getAllErrors(limit)
            call.respond(errors)
        }
        
        // Get errors for a specific rule
        get("/{ruleId}") {
            val ruleId = call.parameters["ruleId"] ?: return@get call.respond(HttpStatusCode.BadRequest, "Missing rule ID")
            val limit = call.request.queryParameters["limit"]?.toIntOrNull() ?: 100
            
            val errors = proxyService.getErrors(ruleId, limit)
            call.respond(errors)
        }
        
        // Get error summary for a specific rule
        get("/{ruleId}/summary") {
            val ruleId = call.parameters["ruleId"] ?: return@get call.respond(HttpStatusCode.BadRequest, "Missing rule ID")
            val period = call.request.queryParameters["period"] ?: "last_hour"
            
            val summary = proxyService.getErrorSummary(ruleId, period)
            call.respond(summary)
        }
        
        // Stream real-time error updates
        webSocket("/stream") {
            proxyService.errorUpdates.onEach { error ->
                val json = Json.encodeToString(error)
                outgoing.send(Frame.Text(json))
            }.collect()
        }
    }
    
    // Request/response logs
    route("/api/proxy/analytics/logs") {
        // Get logs for a specific rule
        get("/{ruleId}") {
            val ruleId = call.parameters["ruleId"] ?: return@get call.respond(HttpStatusCode.BadRequest, "Missing rule ID")
            val limit = call.request.queryParameters["limit"]?.toIntOrNull() ?: 100
            
            val logs = proxyService.getRequestLogs(ruleId, limit)
            call.respond(logs)
        }
        
        // Search logs for a specific rule
        get("/{ruleId}/search") {
            val ruleId = call.parameters["ruleId"] ?: return@get call.respond(HttpStatusCode.BadRequest, "Missing rule ID")
            val params = call.request.queryParameters
            
            val clientIp = params["clientIp"]
            val method = params["method"]
            val path = params["path"]
            val statusCode = params["statusCode"]?.toIntOrNull()
            val minResponseTime = params["minResponseTime"]?.toDoubleOrNull()
            val maxResponseTime = params["maxResponseTime"]?.toDoubleOrNull()
            val startTime = params["startTime"]?.toLongOrNull()
            val endTime = params["endTime"]?.toLongOrNull()
            val limit = params["limit"]?.toIntOrNull() ?: 100
            
            val logs = proxyService.searchRequestLogs(
                ruleId, clientIp, method, path, statusCode,
                minResponseTime, maxResponseTime, startTime, endTime, limit
            )
            
            call.respond(logs)
        }
        
        // Stream real-time log updates
        webSocket("/stream") {
            proxyService.logUpdates.onEach { log ->
                val json = Json.encodeToString(log)
                outgoing.send(Frame.Text(json))
            }.collect()
        }
    }
    
    // Alert management
    route("/api/proxy/analytics/alerts") {
        // Get all alert configurations
        get("/configs") {
            val configs = proxyService.getAlertConfigs()
            call.respond(configs)
        }
        
        // Get a specific alert configuration
        get("/configs/{id}") {
            val id = call.parameters["id"] ?: return@get call.respond(HttpStatusCode.BadRequest, "Missing config ID")
            
            val config = proxyService.getAlertConfig(id)
            if (config != null) {
                call.respond(config)
            } else {
                call.respond(HttpStatusCode.NotFound, "Alert configuration not found")
            }
        }
        
        // Create a new alert configuration
        post("/configs") {
            val config = call.receive<ErrorAlertConfig>()
            val createdConfig = proxyService.createAlertConfig(config)
            call.respond(HttpStatusCode.Created, createdConfig)
        }
        
        // Update an alert configuration
        put("/configs/{id}") {
            val id = call.parameters["id"] ?: return@put call.respond(HttpStatusCode.BadRequest, "Missing config ID")
            val config = call.receive<ErrorAlertConfig>()
            
            val updatedConfig = proxyService.updateAlertConfig(id, config)
            if (updatedConfig != null) {
                call.respond(updatedConfig)
            } else {
                call.respond(HttpStatusCode.NotFound, "Alert configuration not found")
            }
        }
        
        // Delete an alert configuration
        delete("/configs/{id}") {
            val id = call.parameters["id"] ?: return@delete call.respond(HttpStatusCode.BadRequest, "Missing config ID")
            
            val deleted = proxyService.deleteAlertConfig(id)
            if (deleted) {
                call.respond(HttpStatusCode.NoContent)
            } else {
                call.respond(HttpStatusCode.NotFound, "Alert configuration not found")
            }
        }
        
        // Get all active alerts
        get {
            val alerts = proxyService.getActiveAlerts()
            call.respond(alerts)
        }
        
        // Acknowledge an alert
        post("/{id}/acknowledge") {
            val id = call.parameters["id"] ?: return@post call.respond(HttpStatusCode.BadRequest, "Missing alert ID")
            val acknowledgedBy = call.request.queryParameters["by"] ?: "system"
            
            val alert = proxyService.acknowledgeAlert(id, acknowledgedBy)
            if (alert != null) {
                call.respond(alert)
            } else {
                call.respond(HttpStatusCode.NotFound, "Alert not found")
            }
        }
        
        // Resolve an alert
        post("/{id}/resolve") {
            val id = call.parameters["id"] ?: return@post call.respond(HttpStatusCode.BadRequest, "Missing alert ID")
            
            val alert = proxyService.resolveAlert(id)
            if (alert != null) {
                call.respond(alert)
            } else {
                call.respond(HttpStatusCode.NotFound, "Alert not found")
            }
        }
        
        // Stream real-time alert updates
        webSocket("/stream") {
            proxyService.alertUpdates.onEach { alert ->
                val json = Json.encodeToString(alert)
                outgoing.send(Frame.Text(json))
            }.collect()
        }
    }
}