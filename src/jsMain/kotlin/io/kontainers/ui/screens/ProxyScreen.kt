package io.kontainers.ui.screens

import androidx.compose.runtime.*
import org.w3c.dom.HTMLSelectElement
import io.kontainers.api.KontainersApiClient
import io.kontainers.model.ProxyRule
import io.kontainers.model.ProxyProtocol
import io.kontainers.model.HealthCheck
import io.kontainers.state.AppStateManager
import io.kontainers.ui.components.ProxyRuleForm
import io.kontainers.ui.components.ProxyRuleList
import io.kontainers.ui.components.LoadingIndicator
import io.kontainers.ui.util.*
import io.kontainers.ui.util.ErrorMessage
import io.kontainers.ui.util.InfoMessage
import kotlinx.browser.document
import kotlinx.coroutines.launch
import org.jetbrains.compose.web.attributes.InputType
import org.jetbrains.compose.web.attributes.accept
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*
import org.w3c.dom.HTMLInputElement
import org.w3c.files.get

/**
 * Proxy screen component for managing proxy rules.
 */
@Composable
fun ProxyScreen() {
    val apiClient = remember { KontainersApiClient() }
    val appState by AppStateManager.state.collectAsState()
    
    var isLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var success by remember { mutableStateOf<String?>(null) }
    var isCreatingRule by remember { mutableStateOf(false) }
    var editingRule by remember { mutableStateOf<ProxyRule?>(null) }
    var showImportDialog by remember { mutableStateOf(false) }
    var showExportDialog by remember { mutableStateOf(false) }
    
    // Load proxy rules on initial render
    LaunchedEffect(Unit) {
        loadProxyRules(apiClient)
    }
    
    Div({
        style {
            padding(16.px)
        }
    }) {
        if (error != null) {
            // Special handling for backend not available error
            if (error!!.contains("Backend server not available")) {
                InfoMessage(error!!, "This is normal in development mode") {
                    error = null
                }
            } else {
                ErrorMessage(error!!) {
                    error = null
                    kotlinx.coroutines.MainScope().launch {
                        loadProxyRules(apiClient)
                    }
                }
            }
        }
        
        if (success != null) {
            SuccessMessage(success!!) {
                success = null
            }
        }
        
        H1 { Text("Proxy Rules") }
        P { Text("Manage reverse proxy rules for your containers") }
        
        // Action buttons
        Div({
            style {
                display(DisplayStyle.Flex)
                gap(16.px)
                marginTop(16.px)
                marginBottom(24.px)
            }
        }) {
            // Create rule button
            Button({
                style {
                    padding(8.px, 16.px)
                    backgroundColor(Color("#1976d2"))
                    color(Color.white)
                    border(0.px, LineStyle.None, Color.transparent)
                    borderRadius(4.px)
                    cursor("pointer")
                    fontSize(14.px)
                }
                onClick {
                    isCreatingRule = true
                    editingRule = null
                }
            }) {
                Text("+ Create New Rule")
            }
            
            // Import button
            Button({
                style {
                    padding(8.px, 16.px)
                    backgroundColor(Color("#4caf50"))
                    color(Color.white)
                    border(0.px, LineStyle.None, Color.transparent)
                    borderRadius(4.px)
                    cursor("pointer")
                    fontSize(14.px)
                }
                onClick { showImportDialog = true }
            }) {
                Text("Import Rules")
            }
            
            // Export button
            Button({
                style {
                    padding(8.px, 16.px)
                    backgroundColor(Color("#ff9800"))
                    color(Color.white)
                    border(0.px, LineStyle.None, Color.transparent)
                    borderRadius(4.px)
                    cursor("pointer")
                    fontSize(14.px)
                }
                onClick { showExportDialog = true }
            }) {
                Text("Export Rules")
            }
        }
        
        if (isLoading) {
            LoadingIndicator()
        } else if (isCreatingRule || editingRule != null) {
            // Rule form for creating or editing
            ProxyRuleForm(
                rule = editingRule,
                containers = appState.containers,
                onSave = { rule ->
                    saveProxyRule(apiClient, rule, editingRule != null)
                    isCreatingRule = false
                    editingRule = null
                },
                onCancel = {
                    isCreatingRule = false
                    editingRule = null
                }
            )
        } else {
            // List of proxy rules
            ProxyRuleList(
                rules = appState.proxyRules,
                onEditClick = { rule ->
                    editingRule = rule
                },
                onDeleteClick = { rule ->
                    deleteProxyRule(apiClient, rule.id)
                },
                onToggleClick = { rule, enabled ->
                    toggleProxyRule(apiClient, rule.id, enabled)
                }
            )
        }
    }
    
    // Import dialog
    if (showImportDialog) {
        var format by remember { mutableStateOf("json") }
        var overwriteExisting by remember { mutableStateOf(false) }
        var isImporting by remember { mutableStateOf(false) }
        
        // Hidden file input for import
        val importInputId = "proxy-rules-import-input"
        Input(InputType.File) {
            id(importInputId)
            style {
                display(DisplayStyle.None)
            }
            accept(".json,.yaml,.yml")
            onChange {
                val input = document.getElementById(importInputId) as HTMLInputElement
                val files = input.files
                if (files != null && files.length > 0) {
                    val file = files[0]!!
                    isImporting = true
                    
                    // Determine format from file extension
                    val fileName = file.name.lowercase()
                    val fileFormat = when {
                        fileName.endsWith(".json") -> "json"
                        fileName.endsWith(".yaml") || fileName.endsWith(".yml") -> "yaml"
                        else -> format
                    }
                    
                    kotlinx.coroutines.MainScope().launch {
                        try {
                            val result = apiClient.importProxyRules(file, fileFormat, overwriteExisting)
                            val importSuccess = result["success"] as Boolean
                            val message = result["message"] as String
                            
                            if (importSuccess) {
                                success = message
                                loadProxyRules(apiClient)
                            } else {
                                error = message
                            }
                        } catch (e: Exception) {
                            error = "Failed to import proxy rules: ${e.message}"
                        } finally {
                            isImporting = false
                            showImportDialog = false
                        }
                    }
                }
            }
        }
        
        Dialog(
            onDismissRequest = { showImportDialog = false },
            onClose = { showImportDialog = false },
            title = "Import Proxy Rules"
        ) {
            Div({
                style {
                    display(DisplayStyle.Flex)
                    flexDirection(FlexDirection.Column)
                    gap(16.px)
                }
            }) {
                P {
                    Text("Import proxy rules from a JSON or YAML file. The file should contain an array of proxy rule objects.")
                }
                
                // Format selection
                Div({
                    style {
                        display(DisplayStyle.Flex)
                        flexDirection(FlexDirection.Column)
                        gap(4.px)
                    }
                }) {
                    Label(forId = "import-format") { Text("Format") }
                    Select({
                        id("import-format")
                        style {
                            padding(8.px)
                            width(100.percent)
                            borderRadius(4.px)
                            border(1.px, LineStyle.Solid, Color("#ddd"))
                        }
                        value(format ?: "json")
                        onChange { event -> format = (event.target as HTMLSelectElement).value }
                    }) {
                        Option("json", attrs = {
                            attr("value", "json")
                        }) { Text("JSON") }
                        Option("yaml", attrs = {
                            attr("value", "yaml")
                        }) { Text("YAML") }
                    }
                }
                
                // Overwrite existing checkbox
                Div({
                    style {
                        display(DisplayStyle.Flex)
                        alignItems(AlignItems.Center)
                        gap(8.px)
                        marginTop(8.px)
                    }
                }) {
                    Input(InputType.Checkbox) {
                        id("overwrite-existing")
                        checked(overwriteExisting)
                        onChange { overwriteExisting = it.value }
                    }
                    Label(forId = "overwrite-existing") { Text("Overwrite existing rules") }
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
                            border(1.px, LineStyle.Solid, Color("#ddd"))
                            borderRadius(4.px)
                            cursor("pointer")
                            fontSize(14.px)
                        }
                        onClick { showImportDialog = false }
                    }) {
                        Text("Cancel")
                    }
                    
                    Button({
                        style {
                            padding(8.px, 16.px)
                            backgroundColor(Color("#4caf50"))
                            color(Color.white)
                            border(0.px, LineStyle.None, Color.transparent)
                            borderRadius(4.px)
                            cursor("pointer")
                            fontSize(14.px)
                        }
                        onClick {
                            val input = document.getElementById(importInputId) as HTMLInputElement
                            input.click()
                        }
                    }) {
                        if (isImporting) {
                            Text("Importing...")
                        } else {
                            Text("Select File")
                        }
                    }
                }
            }
        }
    }
    
    // Export dialog
    if (showExportDialog) {
        var format by remember { mutableStateOf("json") }
        var exportAll by remember { mutableStateOf(true) }
        var selectedRuleIds by remember { mutableStateOf<List<String>>(emptyList()) }
        
        Dialog(
            onDismissRequest = { showExportDialog = false },
            onClose = { showExportDialog = false },
            title = "Export Proxy Rules"
        ) {
            Div({
                style {
                    display(DisplayStyle.Flex)
                    flexDirection(FlexDirection.Column)
                    gap(16.px)
                }
            }) {
                P {
                    Text("Export proxy rules to a JSON or YAML file.")
                }
                
                // Format selection
                Div({
                    style {
                        display(DisplayStyle.Flex)
                        flexDirection(FlexDirection.Column)
                        gap(4.px)
                    }
                }) {
                    Label(forId = "export-format") { Text("Format") }
                    Select({
                        id("export-format")
                        style {
                            padding(8.px)
                            width(100.percent)
                            borderRadius(4.px)
                            border(1.px, LineStyle.Solid, Color("#ddd"))
                        }
                        value(format ?: "json")
                        onChange { event -> format = (event.target as HTMLSelectElement).value }
                    }) {
                        Option("json", attrs = {
                            attr("value", "json")
                        }) { Text("JSON") }
                        Option("yaml", attrs = {
                            attr("value", "yaml")
                        }) { Text("YAML") }
                    }
                }
                
                // Export all checkbox
                Div({
                    style {
                        display(DisplayStyle.Flex)
                        alignItems(AlignItems.Center)
                        gap(8.px)
                        marginTop(8.px)
                    }
                }) {
                    Input(InputType.Checkbox) {
                        id("export-all")
                        checked(exportAll)
                        onChange { exportAll = it.value }
                    }
                    Label(forId = "export-all") { Text("Export all rules") }
                }
                
                // Rule selection (if not exporting all)
                if (!exportAll && appState.proxyRules.isNotEmpty()) {
                    Div({
                        style {
                            display(DisplayStyle.Flex)
                            flexDirection(FlexDirection.Column)
                            gap(4.px)
                            marginTop(8.px)
                        }
                    }) {
                        Label { Text("Select rules to export:") }
                        
                        Div({
                            style {
                                display(DisplayStyle.Flex)
                                flexDirection(FlexDirection.Column)
                                gap(4.px)
                                maxHeight(200.px)
                                overflowY("auto")
                                border(1.px, LineStyle.Solid, Color("#ddd"))
                                borderRadius(4.px)
                                padding(8.px)
                            }
                        }) {
                            appState.proxyRules.forEach { rule ->
                                Div({
                                    style {
                                        display(DisplayStyle.Flex)
                                        alignItems(AlignItems.Center)
                                        gap(8.px)
                                    }
                                }) {
                                    Input(InputType.Checkbox) {
                                        id("rule-${rule.id}")
                                        checked(selectedRuleIds.contains(rule.id))
                                        onChange { event ->
                                            val isChecked = event.target.checked
                                            selectedRuleIds = if (isChecked) {
                                                selectedRuleIds + rule.id
                                            } else {
                                                selectedRuleIds - rule.id
                                            }
                                        }
                                    }
                                    Label(forId = "rule-${rule.id}") { Text("${rule.name} (${rule.sourceHost})") }
                                }
                            }
                        }
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
                            border(1.px, LineStyle.Solid, Color("#ddd"))
                            borderRadius(4.px)
                            cursor("pointer")
                            fontSize(14.px)
                        }
                        onClick { showExportDialog = false }
                    }) {
                        Text("Cancel")
                    }
                    
                    Button({
                        style {
                            padding(8.px, 16.px)
                            backgroundColor(Color("#ff9800"))
                            color(Color.white)
                            border(0.px, LineStyle.None, Color.transparent)
                            borderRadius(4.px)
                            cursor("pointer")
                            fontSize(14.px)
                        }
                        onClick {
                            val ruleIds = if (exportAll) null else selectedRuleIds
                            val exportUrl = apiClient.getProxyRulesExportUrl(format, ruleIds)
                            
                            // Create a form to submit the export request
                            val form = document.createElement("form") as org.w3c.dom.HTMLFormElement
                            form.method = "POST"
                            form.action = exportUrl
                            form.target = "_blank"
                            
                            // Add format parameter
                            val formatInput = document.createElement("input") as org.w3c.dom.HTMLInputElement
                            formatInput.type = "hidden"
                            formatInput.name = "format"
                            formatInput.value = format
                            form.appendChild(formatInput)
                            
                            // Add ruleIds parameter if not exporting all
                            if (!exportAll && selectedRuleIds.isNotEmpty()) {
                                val ruleIdsInput = document.createElement("input") as org.w3c.dom.HTMLInputElement
                                ruleIdsInput.type = "hidden"
                                ruleIdsInput.name = "ruleIds"
                                ruleIdsInput.value = selectedRuleIds.joinToString(",")
                                form.appendChild(ruleIdsInput)
                            }
                            
                            // Submit the form
                            document.body?.appendChild(form)
                            form.submit()
                            document.body?.removeChild(form)
                            
                            showExportDialog = false
                        }
                    }) {
                        Text("Export")
                    }
                }
            }
        }
    }
}

/**
 * Load proxy rules from the API.
 */
private suspend fun loadProxyRules(apiClient: KontainersApiClient) {
    try {
        AppStateManager.setLoading(true)
        AppStateManager.setError(null)
        
        val rules = apiClient.getProxyRules()
        AppStateManager.updateProxyRules(rules)
        
        AppStateManager.setLoading(false)
    } catch (e: Exception) {
        // Check if the error is related to the backend server not being available
        if (e.message?.contains("404") == true || e.message?.contains("Failed to fetch") == true) {
            AppStateManager.setError("Backend server not available. This is expected when running only the frontend in development mode.")
        } else {
            AppStateManager.setError("Failed to load proxy rules: ${e.message}")
        }
        AppStateManager.setLoading(false)
    }
}

/**
 * Save a proxy rule (create or update).
 */
private fun saveProxyRule(apiClient: KontainersApiClient, rule: ProxyRule, isUpdate: Boolean) {
    AppStateManager.setLoading(true)
    
    kotlinx.coroutines.MainScope().launch {
        try {
            if (isUpdate) {
                apiClient.updateProxyRule(rule.id, rule)
            } else {
                val newRule = rule.copy(
                    id = kotlin.random.Random.nextInt(10000, 99999).toString(),
                    created = js("Date.now()").toLong()
                )
                apiClient.createProxyRule(newRule)
            }
            
            loadProxyRules(apiClient)
        } catch (e: Exception) {
            AppStateManager.setError("Failed to save proxy rule: ${e.message}")
            AppStateManager.setLoading(false)
        }
    }
}

/**
 * Delete a proxy rule.
 */
private fun deleteProxyRule(apiClient: KontainersApiClient, id: String) {
    AppStateManager.setLoading(true)
    
    kotlinx.coroutines.MainScope().launch {
        try {
            val success = apiClient.deleteProxyRule(id)
            if (success) {
                loadProxyRules(apiClient)
            } else {
                AppStateManager.setError("Failed to delete proxy rule")
                AppStateManager.setLoading(false)
            }
        } catch (e: Exception) {
            AppStateManager.setError("Failed to delete proxy rule: ${e.message}")
            AppStateManager.setLoading(false)
        }
    }
}

/**
 * Toggle a proxy rule's enabled state.
 */
private fun toggleProxyRule(apiClient: KontainersApiClient, id: String, enabled: Boolean) {
    AppStateManager.setLoading(true)
    
    kotlinx.coroutines.MainScope().launch {
        try {
            apiClient.toggleProxyRule(id, enabled)
            loadProxyRules(apiClient)
        } catch (e: Exception) {
            AppStateManager.setError("Failed to toggle proxy rule: ${e.message}")
            AppStateManager.setLoading(false)
        }
    }
}