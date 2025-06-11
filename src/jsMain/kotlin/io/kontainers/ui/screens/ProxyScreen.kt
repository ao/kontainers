package io.kontainers.ui.screens

import androidx.compose.runtime.*
import io.kontainers.api.KontainersApiClient
import io.kontainers.model.ProxyRule
import io.kontainers.model.ProxyProtocol
import io.kontainers.model.HealthCheck
import io.kontainers.state.AppStateManager
import io.kontainers.ui.components.ProxyRuleForm
import io.kontainers.ui.components.ProxyRuleList
import io.kontainers.ui.util.*
import io.kontainers.ui.util.ErrorMessage
import io.kontainers.ui.util.InfoMessage
import kotlinx.coroutines.launch
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*

/**
 * Proxy screen component for managing proxy rules.
 */
@Composable
fun ProxyScreen() {
    val apiClient = remember { KontainersApiClient() }
    val appState by AppStateManager.state.collectAsState()
    
    var isLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var isCreatingRule by remember { mutableStateOf(false) }
    var editingRule by remember { mutableStateOf<ProxyRule?>(null) }
    
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
        
        H1 { Text("Proxy Rules") }
        P { Text("Manage reverse proxy rules for your containers") }
        
        // Create rule button
        Button({
            style {
                marginTop(16.px)
                marginBottom(24.px)
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