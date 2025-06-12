package io.kontainers.ui.components

import androidx.compose.runtime.*
import io.kontainers.api.KontainersApiClient
import io.kontainers.system.ConfigurationBackup
import io.kontainers.ui.util.ErrorMessage
import io.kontainers.ui.util.SuccessMessage
import io.kontainers.ui.util.hover
import io.kontainers.ui.util.zIndex
import io.kontainers.ui.util.property
import org.jetbrains.compose.web.attributes.AttrsScope
import org.jetbrains.compose.web.dom.*
import org.w3c.dom.HTMLAnchorElement
import io.kontainers.ui.util.UtilLoadingIndicator
import kotlinx.browser.document
import kotlinx.coroutines.launch
import org.jetbrains.compose.web.attributes.InputType
import org.jetbrains.compose.web.attributes.accept
import org.jetbrains.compose.web.attributes.disabled
import org.jetbrains.compose.web.attributes.multiple
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*
import org.w3c.dom.HTMLInputElement
import org.w3c.files.File
import org.w3c.files.get
import kotlin.js.Date

/**
 * Component for managing configuration backups and restores.
 */
@Composable
fun ConfigurationBackupRestore() {
    val apiClient = remember { KontainersApiClient() }
    val coroutineScope = rememberCoroutineScope()
    
    var backups by remember { mutableStateOf<List<ConfigurationBackup>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var success by remember { mutableStateOf<String?>(null) }
    
    var showCreateBackupDialog by remember { mutableStateOf(false) }
    var showRestoreDialog by remember { mutableStateOf(false) }
    var selectedBackupPath by remember { mutableStateOf<String?>(null) }
    
    // Load backups on initial render
    LaunchedEffect(Unit) {
        loadBackups(apiClient) { result ->
            backups = result
        }
    }
    
    Div({
        style {
            padding(16.px)
            maxWidth(800.px)
        }
    }) {
        // Error and success messages
        if (error != null) {
            ErrorMessage(error!!) {
                error = null
            }
        }
        
        if (success != null) {
            SuccessMessage(success!!) {
                success = null
            }
        }
        
        H2 { Text("Configuration Management") }
        P {
            Text("Backup and restore your Kontainers configuration, including proxy rules, SSL certificates, and Nginx templates.")
        }
        
        // Buttons for creating backup and uploading backup
        Div({
            style {
                display(DisplayStyle.Flex)
                gap(16.px)
                marginBottom(24.px)
            }
        }) {
            Button({
                style {
                    padding(8.px, 16.px)
                    backgroundColor(Color("#1976d2"))
                    color(Color.white)
                    property("border", "0px none transparent")
                    borderRadius(4.px)
                    cursor("pointer")
                    fontSize(14.px)
                }
                onClick { showCreateBackupDialog = true }
            }) {
                Text("Create Backup")
            }
            
            // Hidden file input for backup upload
            val uploadInputId = "backup-upload-input"
            Input(InputType.File) {
                id(uploadInputId)
                style {
                    display(DisplayStyle.None)
                }
                accept(".zip")
                onChange {
                    val input = document.getElementById(uploadInputId) as HTMLInputElement
                    val files = input.files
                    if (files != null && files.length > 0) {
                        val file = files[0]!!
                        uploadBackup(apiClient, file.name, file) { isSuccess, message ->
                            if (isSuccess) {
                                success = message
                                coroutineScope.launch {
                                    loadBackups(apiClient) { result ->
                                        backups = result
                                    }
                                }
                            } else {
                                error = message
                            }
                        }
                    }
                }
            }
            
            Button({
                style {
                    padding(8.px, 16.px)
                    backgroundColor(Color("#4caf50"))
                    color(Color.white)
                    property("border", "0px none transparent")
                    borderRadius(4.px)
                    cursor("pointer")
                    fontSize(14.px)
                }
                onClick { 
                    val input = document.getElementById(uploadInputId) as HTMLInputElement
                    input.click()
                }
            }) {
                Text("Upload Backup")
            }
        }
        
        // Backups table
        if (isLoading) {
            UtilLoadingIndicator()
        } else if (backups.isEmpty()) {
            P { Text("No backups available.") }
        } else {
            Table({
                style {
                    width(100.percent)
                    property("border-collapse", "collapse")
                    marginTop(16.px)
                }
            }) {
                Thead {
                    Tr {
                        Th({
                            style {
                                textAlign("left")
                                padding(8.px)
                                property("border-bottom", "1px solid #ddd")
                            }
                        }) { Text("Date") }
                        Th({
                            style {
                                textAlign("left")
                                padding(8.px)
                                property("border-bottom", "1px solid #ddd")
                            }
                        }) { Text("Description") }
                        Th({
                            style {
                                textAlign("left")
                                padding(8.px)
                                property("border-bottom", "1px solid #ddd")
                            }
                        }) { Text("Created By") }
                        Th({
                            style {
                                textAlign("center")
                                padding(8.px)
                                property("border-bottom", "1px solid #ddd")
                            }
                        }) { Text("Actions") }
                    }
                }
                Tbody {
                    backups.forEach { backup ->
                        Tr({
                            style {
                                property("&:hover", "")
                                property("background-color", "#f5f5f5")
                            }
                        }) {
                            Td({
                                style {
                                    padding(8.px)
                                    property("border-bottom", "1px solid #ddd")
                                }
                            }) { 
                                val date = Date(backup.timestamp)
                                Text(date.toLocaleString())
                            }
                            Td({
                                style {
                                    padding(8.px)
                                    property("border-bottom", "1px solid #ddd")
                                }
                            }) { Text(backup.description ?: "No description") }
                            Td({
                                style {
                                    padding(8.px)
                                    property("border-bottom", "1px solid #ddd")
                                }
                            }) { Text(backup.createdBy ?: "System") }
                            Td({
                                style {
                                    padding(8.px)
                                    property("border-bottom", "1px solid #ddd")
                                    display(DisplayStyle.Flex)
                                    justifyContent(JustifyContent.Center)
                                    gap(8.px)
                                }
                            }) {
                                // Restore button
                                Button({
                                    style {
                                        padding(4.px, 8.px)
                                        backgroundColor(Color("#2196f3"))
                                        color(Color.white)
                                        property("border", "0px none transparent")
                                        borderRadius(4.px)
                                        cursor("pointer")
                                        fontSize(12.px)
                                    }
                                    onClick { 
                                        selectedBackupPath = "backups/kontainers_backup_${backup.timestamp}.zip"
                                        showRestoreDialog = true
                                    }
                                }) {
                                    Text("Restore")
                                }
                                
                                // Download button
                                A(
                                    attrs = {
                                        style {
                                            padding(4.px, 8.px)
                                            backgroundColor(Color("#4caf50"))
                                            color(Color.white)
                                            property("border", "0px none transparent")
                                            borderRadius(4.px)
                                            cursor("pointer")
                                            fontSize(12.px)
                                            property("text-decoration", "none")
                                            display(DisplayStyle.InlineBlock)
                                        }
                                        attr("href", apiClient.getConfigurationBackupDownloadUrl("backups/kontainers_backup_${backup.timestamp}.zip"))
                                    }
                                ) {
                                    Text("Download")
                                }
                                
                                // Delete button
                                Button({
                                    style {
                                        padding(4.px, 8.px)
                                        backgroundColor(Color("#f44336"))
                                        color(Color.white)
                                        property("border", "0px none transparent")
                                        borderRadius(4.px)
                                        cursor("pointer")
                                        fontSize(12.px)
                                    }
                                    onClick { 
                                        deleteBackup(apiClient, "backups/kontainers_backup_${backup.timestamp}.zip") { isSuccess, message ->
                                            if (isSuccess) {
                                                success = message
                                                coroutineScope.launch {
                                                    loadBackups(apiClient) { result ->
                                                        backups = result
                                                    }
                                                }
                                            } else {
                                                error = message
                                            }
                                        }
                                    }
                                }) {
                                    Text("Delete")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Create backup dialog
    if (showCreateBackupDialog) {
        var description by remember { mutableStateOf("") }
        var createdBy by remember { mutableStateOf("") }
        var isCreating by remember { mutableStateOf(false) }
        
        Div({
            style {
                position(Position.Fixed)
                top(0.px)
                left(0.px)
                width(100.percent)
                height(100.percent)
                backgroundColor(rgba(0, 0, 0, 0.5))
                display(DisplayStyle.Flex)
                justifyContent(JustifyContent.Center)
                alignItems(AlignItems.Center)
                property("z-index", "1000")
            }
            onClick { showCreateBackupDialog = false }
        }) {
            Div({
                style {
                    backgroundColor(Color.white)
                    padding(24.px)
                    borderRadius(4.px)
                    maxWidth(500.px)
                    width(100.percent)
                    property("box-shadow", "0 4px 8px rgba(0,0,0,0.1)")
                }
                onClick { it.stopPropagation() }
            }) {
                H3 { Text("Create Backup") }
                Div({
                    style {
                        display(DisplayStyle.Flex)
                        flexDirection(FlexDirection.Column)
                        gap(16.px)
                    }
                }) {
                    // Description input
                    Div({
                        style {
                            display(DisplayStyle.Flex)
                            flexDirection(FlexDirection.Column)
                            gap(4.px)
                        }
                    }) {
                        Label(attrs = {
                            attr("for", "backup-description")
                        }) { Text("Description") }
                        Input(InputType.Text) {
                            id("backup-description")
                            style {
                                padding(8.px)
                                property("border", "1px solid #ddd")
                                borderRadius(4.px)
                                width(100.percent)
                            }
                            value(description)
                            onInput { description = it.value }
                        }
                    }
                    
                    // Created by input
                    Div({
                        style {
                            display(DisplayStyle.Flex)
                            flexDirection(FlexDirection.Column)
                            gap(4.px)
                        }
                    }) {
                        Label(attrs = {
                            attr("for", "backup-created-by")
                        }) { Text("Created By") }
                        Input(InputType.Text) {
                            id("backup-created-by")
                            style {
                                padding(8.px)
                                property("border", "1px solid #ddd")
                                borderRadius(4.px)
                                width(100.percent)
                            }
                            value(createdBy)
                            onInput { createdBy = it.value }
                        }
                    }
                    
                    // Buttons
                    Div({
                        style {
                            display(DisplayStyle.Flex)
                            justifyContent(JustifyContent.FlexEnd)
                            gap(8.px)
                            marginTop(16.px)
                        }
                    }) {
                        Button({
                            style {
                                padding(8.px, 16.px)
                                backgroundColor(Color("#f5f5f5"))
                                color(Color("#333"))
                                property("border", "1px solid #ddd")
                                borderRadius(4.px)
                                cursor("pointer")
                                fontSize(14.px)
                            }
                            onClick { showCreateBackupDialog = false }
                        }) {
                            Text("Cancel")
                        }
                        
                        Button({
                            style {
                                padding(8.px, 16.px)
                                backgroundColor(Color("#1976d2"))
                                color(Color.white)
                                property("border", "0px none transparent")
                                borderRadius(4.px)
                                cursor("pointer")
                                fontSize(14.px)
                            }
                            if (isCreating) {
                                disabled()
                            }
                            onClick { 
                                isCreating = true
                                createBackup(apiClient, description, createdBy) { isSuccess, message ->
                                    isCreating = false
                                    showCreateBackupDialog = false
                                    
                                    if (isSuccess) {
                                        success = message
                                        coroutineScope.launch {
                                            loadBackups(apiClient) { result ->
                                                backups = result
                                            }
                                        }
                                    } else {
                                        error = message
                                    }
                                }
                            }
                        }) {
                            if (isCreating) {
                                Text("Creating...")
                            } else {
                                Text("Create")
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Restore dialog
    if (showRestoreDialog && selectedBackupPath != null) {
        var restoreProxyRules by remember { mutableStateOf(true) }
        var restoreCertificates by remember { mutableStateOf(true) }
        var restoreTemplates by remember { mutableStateOf(true) }
        var isRestoring by remember { mutableStateOf(false) }
        
        Div({
            style {
                position(Position.Fixed)
                top(0.px)
                left(0.px)
                width(100.percent)
                height(100.percent)
                backgroundColor(rgba(0, 0, 0, 0.5))
                display(DisplayStyle.Flex)
                justifyContent(JustifyContent.Center)
                alignItems(AlignItems.Center)
                property("z-index", "1000")
            }
            onClick { showRestoreDialog = false }
        }) {
            Div({
                style {
                    backgroundColor(Color.white)
                    padding(24.px)
                    borderRadius(4.px)
                    maxWidth(500.px)
                    width(100.percent)
                    property("box-shadow", "0 4px 8px rgba(0,0,0,0.1)")
                }
                onClick { it.stopPropagation() }
            }) {
                H3 { Text("Restore Configuration") }
                Div({
                    style {
                        display(DisplayStyle.Flex)
                        flexDirection(FlexDirection.Column)
                        gap(16.px)
                    }
                }) {
                    P { 
                        Text("Warning: Restoring configuration will overwrite your current settings. Make sure you have a backup of your current configuration before proceeding.")
                    }
                    
                    // Restore options
                    Div({
                        style {
                            display(DisplayStyle.Flex)
                            flexDirection(FlexDirection.Column)
                            gap(8.px)
                        }
                    }) {
                        Div({
                            style {
                                display(DisplayStyle.Flex)
                                alignItems(AlignItems.Center)
                                gap(8.px)
                            }
                        }) {
                            Input(InputType.Checkbox) {
                                id("restore-proxy-rules")
                                checked(restoreProxyRules)
                                onChange { restoreProxyRules = it.value }
                            }
                            Label(attrs = {
                                attr("for", "restore-proxy-rules")
                            }) { Text("Restore Proxy Rules") }
                        }
                        
                        Div({
                            style {
                                display(DisplayStyle.Flex)
                                alignItems(AlignItems.Center)
                                gap(8.px)
                            }
                        }) {
                            Input(InputType.Checkbox) {
                                id("restore-certificates")
                                checked(restoreCertificates)
                                onChange { restoreCertificates = it.value }
                            }
                            Label(attrs = {
                                attr("for", "restore-certificates")
                            }) { Text("Restore SSL Certificates") }
                        }
                        
                        Div({
                            style {
                                display(DisplayStyle.Flex)
                                alignItems(AlignItems.Center)
                                gap(8.px)
                            }
                        }) {
                            Input(InputType.Checkbox) {
                                id("restore-templates")
                                checked(restoreTemplates)
                                onChange { restoreTemplates = it.value }
                            }
                            Label(attrs = {
                                attr("for", "restore-templates")
                            }) { Text("Restore Nginx Templates") }
                        }
                    }
                    
                    // Buttons
                    Div({
                        style {
                            display(DisplayStyle.Flex)
                            justifyContent(JustifyContent.FlexEnd)
                            gap(8.px)
                            marginTop(16.px)
                        }
                    }) {
                        Button({
                            style {
                                padding(8.px, 16.px)
                                backgroundColor(Color("#f5f5f5"))
                                color(Color("#333"))
                                property("border", "1px solid #ddd")
                                borderRadius(4.px)
                                cursor("pointer")
                                fontSize(14.px)
                            }
                            onClick { showRestoreDialog = false }
                        }) {
                            Text("Cancel")
                        }
                        
                        Button({
                            style {
                                padding(8.px, 16.px)
                                backgroundColor(Color("#f44336"))
                                color(Color.white)
                                property("border", "0px none transparent")
                                borderRadius(4.px)
                                cursor("pointer")
                                fontSize(14.px)
                            }
                            if (isRestoring) {
                                disabled()
                            }
                            onClick { 
                                isRestoring = true
                                restoreBackup(
                                    apiClient, 
                                    selectedBackupPath!!, 
                                    restoreProxyRules, 
                                    restoreCertificates, 
                                    restoreTemplates
                                ) { isSuccess, message ->
                                    isRestoring = false
                                    showRestoreDialog = false
                                    
                                    if (isSuccess) {
                                        success = message
                                    } else {
                                        error = message
                                    }
                                }
                            }
                        }) {
                            if (isRestoring) {
                                Text("Restoring...")
                            } else {
                                Text("Restore")
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * Loads configuration backups.
 */
private suspend fun loadBackups(
    apiClient: KontainersApiClient,
    onComplete: (List<ConfigurationBackup>) -> Unit
) {
    try {
        val backups = apiClient.getConfigurationBackups()
        onComplete(backups)
    } catch (e: Exception) {
        onComplete(emptyList())
    }
}

/**
 * Creates a new configuration backup.
 */
private fun createBackup(
    apiClient: KontainersApiClient,
    description: String,
    createdBy: String,
    onComplete: (Boolean, String) -> Unit
) {
    kotlinx.coroutines.MainScope().launch {
        try {
            val result = apiClient.createConfigurationBackup(description, createdBy)
            val success = result["success"] as Boolean
            val message = result["message"] as String
            
            onComplete(success, message)
        } catch (e: Exception) {
            onComplete(false, "Failed to create backup: ${e.message}")
        }
    }
}

/**
 * Deletes a configuration backup.
 */
private fun deleteBackup(
    apiClient: KontainersApiClient,
    backupPath: String,
    onComplete: (Boolean, String) -> Unit
) {
    kotlinx.coroutines.MainScope().launch {
        try {
            val result = apiClient.deleteConfigurationBackup(backupPath)
            val success = result["success"] as Boolean
            val message = result["message"] as String
            
            onComplete(success, message)
        } catch (e: Exception) {
            onComplete(false, "Failed to delete backup: ${e.message}")
        }
    }
}

/**
 * Restores configuration from a backup.
 */
private fun restoreBackup(
    apiClient: KontainersApiClient,
    backupPath: String,
    restoreProxyRules: Boolean,
    restoreCertificates: Boolean,
    restoreTemplates: Boolean,
    onComplete: (Boolean, String) -> Unit
) {
    kotlinx.coroutines.MainScope().launch {
        try {
            val result = apiClient.restoreConfiguration(
                backupPath,
                restoreProxyRules,
                restoreCertificates,
                restoreTemplates
            )
            val success = result["success"] as Boolean
            val message = result["message"] as String
            
            onComplete(success, message)
        } catch (e: Exception) {
            onComplete(false, "Failed to restore configuration: ${e.message}")
        }
    }
}

/**
 * Uploads a configuration backup file.
 */
private fun uploadBackup(
    apiClient: KontainersApiClient,
    fileName: String,
    file: File,
    onComplete: (Boolean, String) -> Unit
) {
    kotlinx.coroutines.MainScope().launch {
        try {
            val result = apiClient.uploadConfigurationBackup(fileName, file)
            val success = result["success"] as Boolean
            val message = result["message"] as String
            
            onComplete(success, message)
        } catch (e: Exception) {
            onComplete(false, "Failed to upload backup: ${e.message}")
        }
    }
}