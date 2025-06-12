package io.kontainers.system

import kotlinx.serialization.Serializable

/**
 * Data class representing a configuration backup.
 */
@Serializable
data class ConfigurationBackup(
    val timestamp: Long,
    val version: String,
    val description: String? = null,
    val createdBy: String? = null,
    
    // Additional fields needed by JS components
    val id: String = timestamp.toString(),
    val name: String = "Backup $timestamp",
    val size: Long = 0,
    val components: List<String> = emptyList()
)