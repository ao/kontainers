package io.kontainers.ui.screens

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import io.kontainers.api.KontainersApiClient
import io.kontainers.model.Container
import io.kontainers.state.AppStateManager
import io.kontainers.ui.components.MetricsDashboard
import io.kontainers.ui.components.SystemHealthMonitor
import io.kontainers.ui.util.ErrorMessage
import io.kontainers.ui.components.LoadingIndicator
import kotlinx.coroutines.launch
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*

/**
 * Metrics screen component.
 */
@Composable
fun MetricsScreen() {
    val apiClient = remember { KontainersApiClient() }
    val appState by AppStateManager.state.collectAsState()
    
    var isLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var containers by remember { mutableStateOf<List<Container>>(emptyList()) }
    var selectedContainerId by remember { mutableStateOf<String?>(null) }
    var activeTab by remember { mutableStateOf("containers") } // "containers" or "system"
    
    // Load containers on initial render
    LaunchedEffect(Unit) {
        loadContainers(apiClient) { loadedContainers ->
            containers = loadedContainers
            
            // Select the first container by default if none is selected
            if (selectedContainerId == null && loadedContainers.isNotEmpty()) {
                selectedContainerId = loadedContainers.first().id
            }
        }
    }
    
    Div({
        style {
            padding(16.px)
        }
    }) {
        // Header
        Div({
            style {
                display(DisplayStyle.Flex)
                justifyContent(JustifyContent.SpaceBetween)
                alignItems(AlignItems.Center)
                marginBottom(24.px)
            }
        }) {
            Div {
                H1({ style { margin(0.px) } }) { Text("Metrics Dashboard") }
                P({ style { margin(0.px) } }) { Text("Monitor container and system performance") }
            }
            
            // Refresh button
            Button({
                style {
                    padding(8.px, 16.px)
                    backgroundColor(Color("#2196f3"))
                    color(Color.white)
                    border {
                        width = 0.px
                        style = LineStyle.None
                        color = Color.transparent
                    }
                    borderRadius(4.px)
                    cursor("pointer")
                }
                onClick {
                    kotlinx.coroutines.MainScope().launch {
                        loadContainers(apiClient) { loadedContainers ->
                            containers = loadedContainers
                        }
                    }
                }
            }) {
                Text("Refresh Containers")
            }
        }
        
        if (error != null) {
            ErrorMessage(error!!) {
                error = null
                kotlinx.coroutines.MainScope().launch {
                    loadContainers(apiClient) { loadedContainers ->
                        containers = loadedContainers
                    }
                }
            }
        }
        
        // Tab navigation
        Div({
            style {
                display(DisplayStyle.Flex)
                marginBottom(24.px)
                property("border-bottom", "1px solid #e0e0e0")
            }
        }) {
            // Container Metrics tab
            Div({
                style {
                    padding(12.px, 24.px)
                    cursor("pointer")
                    fontWeight(if (activeTab == "containers") "bold" else "normal")
                    property("border-bottom",
                        if (activeTab == "containers")
                            "2px solid #1976d2"
                        else
                            "2px solid transparent"
                    )
                    color(if (activeTab == "containers") Color("#1976d2") else Color("#666"))
                }
                onClick { activeTab = "containers" }
            }) {
                Text("Container Metrics")
            }
            
            // System Health tab
            Div({
                style {
                    padding(12.px, 24.px)
                    cursor("pointer")
                    fontWeight(if (activeTab == "system") "bold" else "normal")
                    property("border-bottom",
                        if (activeTab == "system")
                            "2px solid #1976d2"
                        else
                            "2px solid transparent"
                    )
                    color(if (activeTab == "system") Color("#1976d2") else Color("#666"))
                }
                onClick { activeTab = "system" }
            }) {
                Text("System Health")
            }
        }
        
        // Content based on active tab
        if (activeTab == "containers") {
            if (isLoading && containers.isEmpty()) {
                LoadingIndicator()
            } else {
                // Container selector
                Div({
                    style {
                        marginBottom(24.px)
                    }
                }) {
                    Label(attrs = {
                        style {
                            display(DisplayStyle.Block)
                            marginBottom(8.px)
                            fontWeight("500")
                        }
                        attr("for", "container-selector")
                    }) {
                        Text("Select Container")
                    }
                    
                    Select({
                        id("container-selector")
                        style {
                            padding(8.px)
                            width(100.percent)
                            maxWidth(400.px)
                            borderRadius(4.px)
                            border(1.px, LineStyle.Solid, Color("#ccc"))
                        }
                        onChange { event ->
                            val value = event.target.value
                            selectedContainerId = value
                        }
                    }) {
                        containers.forEach { container ->
                            Option(container.id, attrs = {
                                attr("value", container.id)
                                if (container.id == selectedContainerId) {
                                    attr("selected", "selected")
                                }
                            }) {
                                Text("${container.name} (${container.id.take(12)})")
                            }
                        }
                    }
                }
                
                // Display metrics dashboard for selected container
                selectedContainerId?.let { containerId ->
                    val selectedContainer = containers.find { it.id == containerId }
                    if (selectedContainer != null) {
                        MetricsDashboard(
                            container = selectedContainer,
                            apiClient = apiClient
                        )
                    } else {
                        Div({
                            style {
                                padding(16.px)
                                backgroundColor(Color("#f5f5f5"))
                                borderRadius(4.px)
                                textAlign("center")
                            }
                        }) {
                            Text("Select a container to view metrics")
                        }
                    }
                } ?: run {
                    Div({
                        style {
                            padding(16.px)
                            backgroundColor(Color("#f5f5f5"))
                            borderRadius(4.px)
                            textAlign("center")
                        }
                    }) {
                        if (containers.isEmpty()) {
                            Text("No containers available")
                        } else {
                            Text("Select a container to view metrics")
                        }
                    }
                }
            }
        } else if (activeTab == "system") {
            // System Health Monitor
            SystemHealthMonitor()
        }
    }
}

/**
 * Load containers from the API.
 */
private suspend fun loadContainers(
    apiClient: KontainersApiClient,
    onSuccess: (List<Container>) -> Unit
) {
    try {
        AppStateManager.setLoading(true)
        AppStateManager.setError(null)
        
        val containers = apiClient.getContainers(true)
        onSuccess(containers)
        
        AppStateManager.setLoading(false)
    } catch (e: Exception) {
        // Check if the error is related to the backend server not being available
        if (e.message?.contains("404") == true || e.message?.contains("Failed to fetch") == true) {
            AppStateManager.setError("Backend server not available. This is expected when running only the frontend in development mode.")
        } else {
            AppStateManager.setError("Failed to load containers: ${e.message}")
        }
        AppStateManager.setLoading(false)
    }
}