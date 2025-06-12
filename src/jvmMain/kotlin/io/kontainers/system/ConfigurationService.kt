package io.kontainers.system

import io.kontainers.docker.ContainerService
import io.kontainers.proxy.ProxyService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.nio.file.Files
import java.nio.file.Paths
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

// Using common module class

/**
 * Service for managing application configuration backup and restore operations.
 */
class ConfigurationService(
    private val proxyService: ProxyService,
    private val containerService: ContainerService,
    private val backupDir: String = "backups",
    private val configDir: String = "config"
) {
    private val json = Json { 
        prettyPrint = true 
        encodeDefaults = true
    }
    
    init {
        // Ensure backup and config directories exist
        File(backupDir).mkdirs()
        File(configDir).mkdirs()
    }
    
    /**
     * Creates a backup of the current application configuration.
     * 
     * @param description Optional description of the backup
     * @param createdBy Optional user who created the backup
     * @return The path to the created backup file
     */
    suspend fun createBackup(description: String? = null, createdBy: String? = null): String = withContext(Dispatchers.IO) {
        val timestamp = System.currentTimeMillis()
        val dateFormat = DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss")
        val dateStr = LocalDateTime.now().format(dateFormat)
        val backupFileName = "kontainers_backup_$dateStr.zip"
        val backupPath = "$backupDir/$backupFileName"
        
        // Create backup metadata
        val backupMetadata = ConfigurationBackup(
            timestamp = timestamp,
            version = "1.0", // Application version
            description = description,
            createdBy = createdBy
        )
        
        // Create temporary directory for backup files
        val tempDir = Files.createTempDirectory("kontainers_backup").toFile()
        try {
            // Save proxy rules
            val proxyRules = proxyService.getAllRules()
            File(tempDir, "proxy_rules.json").writeText(json.encodeToString(proxyRules))
            
            // Save SSL certificates
            val certsDir = File(tempDir, "certificates")
            certsDir.mkdirs()
            val certificates = proxyService.listCertificates()
            // In a real implementation, we would copy the certificate files
            
            // Save Nginx templates
            val templatesDir = File(tempDir, "templates")
            templatesDir.mkdirs()
            val templates = proxyService.getTemplates()
            templates.forEach { templateName ->
                val content = proxyService.getTemplate(templateName)
                if (content != null) {
                    File(templatesDir, templateName).writeText(content)
                }
            }
            
            // Save container configurations
            // In a real implementation, we would save container configurations
            
            // Save backup metadata
            File(tempDir, "metadata.json").writeText(json.encodeToString(backupMetadata))
            
            // Create zip file
            ZipOutputStream(Files.newOutputStream(Paths.get(backupPath))).use { zipOut ->
                zipDirectory(tempDir, tempDir.name, zipOut)
            }
            
            backupPath
        } finally {
            // Clean up temporary directory
            tempDir.deleteRecursively()
        }
    }
    
    /**
     * Restores application configuration from a backup file.
     * 
     * @param backupPath Path to the backup file
     * @param restoreProxyRules Whether to restore proxy rules
     * @param restoreCertificates Whether to restore SSL certificates
     * @param restoreTemplates Whether to restore Nginx templates
     * @return true if the restore was successful
     */
    suspend fun restoreBackup(
        backupPath: String,
        restoreProxyRules: Boolean = true,
        restoreCertificates: Boolean = true,
        restoreTemplates: Boolean = true
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            // Create temporary directory for extracted files
            val tempDir = Files.createTempDirectory("kontainers_restore").toFile()
            
            try {
                // Extract zip file
                ZipInputStream(Files.newInputStream(Paths.get(backupPath))).use { zipIn ->
                    var entry: ZipEntry? = zipIn.nextEntry
                    while (entry != null) {
                        val filePath = Paths.get(tempDir.path, entry.name)
                        if (entry.isDirectory) {
                            Files.createDirectories(filePath)
                        } else {
                            Files.createDirectories(filePath.parent)
                            Files.copy(zipIn, filePath)
                        }
                        zipIn.closeEntry()
                        entry = zipIn.nextEntry
                    }
                }
                
                // Verify backup metadata
                val metadataFile = File(tempDir, "metadata.json")
                if (!metadataFile.exists()) {
                    return@withContext false
                }
                
                val metadata = json.decodeFromString<ConfigurationBackup>(metadataFile.readText())
                
                // Restore proxy rules
                if (restoreProxyRules) {
                    val proxyRulesFile = File(tempDir, "proxy_rules.json")
                    if (proxyRulesFile.exists()) {
                        val proxyRules = json.decodeFromString<List<io.kontainers.model.ProxyRule>>(proxyRulesFile.readText())
                        
                        // Delete existing rules
                        val existingRules = proxyService.getAllRules()
                        existingRules.forEach { rule ->
                            proxyService.deleteRule(rule.id)
                        }
                        
                        // Create restored rules
                        proxyRules.forEach { rule ->
                            proxyService.createRule(rule)
                        }
                    }
                }
                
                // Restore SSL certificates
                if (restoreCertificates) {
                    val certsDir = File(tempDir, "certificates")
                    if (certsDir.exists() && certsDir.isDirectory) {
                        // In a real implementation, we would restore certificate files
                    }
                }
                
                // Restore Nginx templates
                if (restoreTemplates) {
                    val templatesDir = File(tempDir, "templates")
                    if (templatesDir.exists() && templatesDir.isDirectory) {
                        templatesDir.listFiles()?.forEach { file ->
                            val templateName = file.name
                            val content = file.readText()
                            proxyService.saveTemplate(templateName, content)
                        }
                    }
                }
                
                true
            } finally {
                // Clean up temporary directory
                tempDir.deleteRecursively()
            }
        } catch (e: Exception) {
            false
        }
    }
    
    /**
     * Lists all available backups.
     * 
     * @return List of backup metadata
     */
    suspend fun listBackups(): List<ConfigurationBackup> = withContext(Dispatchers.IO) {
        val backupFiles = File(backupDir).listFiles { file -> file.name.endsWith(".zip") } ?: return@withContext emptyList()
        
        val backups = mutableListOf<ConfigurationBackup>()
        
        for (backupFile in backupFiles) {
            try {
                // Extract metadata from backup file
                ZipInputStream(Files.newInputStream(backupFile.toPath())).use { zipIn ->
                    var entry: ZipEntry? = zipIn.nextEntry
                    while (entry != null) {
                        if (entry.name.endsWith("metadata.json")) {
                            val metadata = json.decodeFromString<ConfigurationBackup>(zipIn.readBytes().decodeToString())
                            backups.add(metadata)
                            break
                        }
                        zipIn.closeEntry()
                        entry = zipIn.nextEntry
                    }
                }
            } catch (e: Exception) {
                // Skip invalid backup files
            }
        }
        
        backups.sortedByDescending { it.timestamp }
    }
    
    /**
     * Deletes a backup file.
     * 
     * @param backupPath Path to the backup file
     * @return true if the deletion was successful
     */
    suspend fun deleteBackup(backupPath: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val file = File(backupPath)
            if (file.exists() && file.isFile) {
                file.delete()
            } else {
                false
            }
        } catch (e: Exception) {
            false
        }
    }
    
    /**
     * Helper function to recursively add a directory to a zip file.
     */
    private fun zipDirectory(directory: File, baseName: String, zipOut: ZipOutputStream) {
        val files = directory.listFiles() ?: return
        
        for (file in files) {
            val relativePath = if (baseName.isEmpty()) file.name else "$baseName/${file.name}"
            
            if (file.isDirectory) {
                zipDirectory(file, relativePath, zipOut)
            } else {
                val entry = ZipEntry(relativePath)
                zipOut.putNextEntry(entry)
                Files.copy(file.toPath(), zipOut)
                zipOut.closeEntry()
            }
        }
    }
}