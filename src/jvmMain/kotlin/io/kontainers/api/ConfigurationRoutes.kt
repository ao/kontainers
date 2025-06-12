package io.kontainers.api

import io.kontainers.system.ConfigurationService
import io.ktor.http.*
import io.ktor.http.content.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable
import java.io.File
import java.nio.file.Files
import java.nio.file.Paths
import java.nio.file.StandardCopyOption

/**
 * Data class for backup creation request.
 */
@Serializable
data class BackupCreationRequest(
    val description: String? = null,
    val createdBy: String? = null
)

/**
 * Data class for backup restore request.
 */
@Serializable
data class BackupRestoreRequest(
    val backupPath: String,
    val restoreProxyRules: Boolean = true,
    val restoreCertificates: Boolean = true,
    val restoreTemplates: Boolean = true
)

/**
 * Configures the configuration API routes.
 */
fun Route.configurationRoutes(configurationService: ConfigurationService) {
    route("/api/configuration") {
        // Get all backups
        get("/backups") {
            val backups = configurationService.listBackups()
            call.respond(backups)
        }
        
        // Create a new backup
        post("/backups") {
            val request = call.receive<BackupCreationRequest>()
            
            try {
                val backupPath = configurationService.createBackup(
                    description = request.description,
                    createdBy = request.createdBy
                )
                
                call.respond(
                    HttpStatusCode.Created,
                    mapOf(
                        "success" to true,
                        "message" to "Backup created successfully",
                        "backupPath" to backupPath
                    )
                )
            } catch (e: Exception) {
                call.respond(
                    HttpStatusCode.InternalServerError,
                    mapOf(
                        "success" to false,
                        "message" to "Failed to create backup: ${e.message}"
                    )
                )
            }
        }
        
        // Delete a backup
        delete("/backups") {
            val backupPath = call.request.queryParameters["path"]
                ?: return@delete call.respond(HttpStatusCode.BadRequest, "Missing backup path")
            
            val success = configurationService.deleteBackup(backupPath)
            if (success) {
                call.respond(mapOf("success" to true, "message" to "Backup deleted successfully"))
            } else {
                call.respond(
                    HttpStatusCode.NotFound,
                    mapOf("success" to false, "message" to "Backup not found or could not be deleted")
                )
            }
        }
        
        // Restore from a backup
        post("/restore") {
            val request = call.receive<BackupRestoreRequest>()
            
            val success = configurationService.restoreBackup(
                backupPath = request.backupPath,
                restoreProxyRules = request.restoreProxyRules,
                restoreCertificates = request.restoreCertificates,
                restoreTemplates = request.restoreTemplates
            )
            
            if (success) {
                call.respond(mapOf("success" to true, "message" to "Configuration restored successfully"))
            } else {
                call.respond(
                    HttpStatusCode.InternalServerError,
                    mapOf("success" to false, "message" to "Failed to restore configuration")
                )
            }
        }
        
        // Upload a backup file
        post("/backups/upload") {
            val multipart = call.receiveMultipart()
            var fileName = ""
            var fileBytes: ByteArray? = null
            
            multipart.forEachPart { part ->
                when (part) {
                    is PartData.FormItem -> {
                        if (part.name == "fileName") {
                            fileName = part.value
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
            
            if (fileName.isBlank() || fileBytes == null) {
                call.respond(HttpStatusCode.BadRequest, "File name and content are required")
                return@post
            }
            
            try {
                // Ensure backup directory exists
                val backupDir = File("backups")
                backupDir.mkdirs()
                
                // Write the uploaded file
                val filePath = Paths.get("backups", fileName)
                Files.write(filePath, fileBytes!!)
                
                call.respond(
                    mapOf(
                        "success" to true,
                        "message" to "Backup file uploaded successfully",
                        "backupPath" to filePath.toString()
                    )
                )
            } catch (e: Exception) {
                call.respond(
                    HttpStatusCode.InternalServerError,
                    mapOf("success" to false, "message" to "Failed to upload backup file: ${e.message}")
                )
            }
        }
        
        // Download a backup file
        get("/backups/download") {
            val backupPath = call.request.queryParameters["path"]
                ?: return@get call.respond(HttpStatusCode.BadRequest, "Missing backup path")
            
            val file = File(backupPath)
            if (!file.exists() || !file.isFile) {
                call.respond(HttpStatusCode.NotFound, "Backup file not found")
                return@get
            }
            
            call.response.header(
                HttpHeaders.ContentDisposition,
                ContentDisposition.Attachment.withParameter(ContentDisposition.Parameters.FileName, file.name).toString()
            )
            call.respondFile(file)
        }
    }
}