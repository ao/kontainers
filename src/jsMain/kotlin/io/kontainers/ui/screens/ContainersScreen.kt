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
import io.kontainers.model.ContainerState
import io.kontainers.state.AppStateManager
import io.kontainers.ui.components.ContainerCreationWizard
import io.kontainers.ui.components.ContainerDetail
import io.kontainers.ui.components.ContainerList
import io.kontainers.ui.components.LoadingIndicator
import io.kontainers.ui.util.*
import io.kontainers.ui.util.ErrorMessage
import io.kontainers.ui.util.InfoMessage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*

/**
 * Containers screen component.
 */
@Composable
fun ContainersScreen() {
    val apiClient = remember { KontainersApiClient() }
    val appState by AppStateManager.state.collectAsState()
    val selectedContainer = appState.selectedContainerId?.let { id ->
        appState.containers.find { it.id == id }
    }
    
    var isLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var containerLogs = remember { MutableStateFlow<List<String>>(emptyList()) }
    val logs by containerLogs.collectAsState()
    
    // Wizard state
    var showWizard by remember { mutableStateOf(false) }
    
    // Load containers on initial render
    LaunchedEffect(Unit) {
        loadContainers(apiClient)
    }
    
    // Load logs when a container is selected
    LaunchedEffect(selectedContainer) {
        if (selectedContainer != null) {
            try {
                isLoading = true
                val fetchedLogs = apiClient.getContainerLogs(selectedContainer.id)
                containerLogs.value = fetchedLogs
                isLoading = false
            } catch (e: Exception) {
                error = "Failed to load logs: ${e.message}"
                isLoading = false
            }
        } else {
            containerLogs.value = emptyList()
        }
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
                        loadContainers(apiClient)
                    }
                }
            }
        }
        
        if (isLoading) {
            LoadingIndicator()
        } else if (selectedContainer != null) {
            ContainerDetail(
                container = selectedContainer,
                logs = logs,
                onBackClick = { AppStateManager.selectContainer(null) },
                onStartClick = {
                    startContainer(apiClient, selectedContainer)
                },
                onStopClick = {
                    stopContainer(apiClient, selectedContainer)
                },
                onRestartClick = {
                    restartContainer(apiClient, selectedContainer)
                }
            )
        } else {
            // Show wizard if enabled
            if (showWizard) {
                ContainerCreationWizard(onClose = { showWizard = false })
            }
            
            // Header with create button
            Div({
                style {
                    display(DisplayStyle.Flex)
                    justifyContent(JustifyContent.SpaceBetween)
                    alignItems(AlignItems.Center)
                    marginBottom(16.px)
                }
            }) {
                Div {
                    H1({ style { margin(0.px) } }) { Text("Containers") }
                    P({ style { margin(0.px) } }) { Text("Manage your Docker containers") }
                }
                
                Button({
                    style {
                        padding(8.px, 16.px)
                        backgroundColor(Color("#2196f3"))
                        color(Color.white)
                        border("0", "none", "transparent")
                        borderRadius(4.px)
                        cursor("pointer")
                    }
                    onClick { showWizard = true }
                }) {
                    Text("Create Container")
                }
            }
            
            ContainerList(
                containers = appState.containers,
                onContainerClick = { container ->
                    AppStateManager.selectContainer(container.id)
                },
                onStartClick = { container ->
                    startContainer(apiClient, container)
                },
                onStopClick = { container ->
                    stopContainer(apiClient, container)
                },
                onRestartClick = { container ->
                    restartContainer(apiClient, container)
                }
            )
        }
    }
}

/**
 * Load containers from the API.
 */
private suspend fun loadContainers(apiClient: KontainersApiClient) {
    try {
        AppStateManager.setLoading(true)
        AppStateManager.setError(null)
        
        val containers = apiClient.getContainers(true)
        AppStateManager.updateContainers(containers)
        
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

/**
 * Start a container.
 */
private fun startContainer(apiClient: KontainersApiClient, container: Container) {
    AppStateManager.setLoading(true)
    
    kotlinx.coroutines.MainScope().launch {
        try {
            val success = apiClient.startContainer(container.id)
            if (success) {
                loadContainers(apiClient)
            } else {
                AppStateManager.setError("Failed to start container")
                AppStateManager.setLoading(false)
            }
        } catch (e: Exception) {
            AppStateManager.setError("Failed to start container: ${e.message}")
            AppStateManager.setLoading(false)
        }
    }
}

/**
 * Stop a container.
 */
private fun stopContainer(apiClient: KontainersApiClient, container: Container) {
    AppStateManager.setLoading(true)
    
    kotlinx.coroutines.MainScope().launch {
        try {
            val success = apiClient.stopContainer(container.id)
            if (success) {
                loadContainers(apiClient)
            } else {
                AppStateManager.setError("Failed to stop container")
                AppStateManager.setLoading(false)
            }
        } catch (e: Exception) {
            AppStateManager.setError("Failed to stop container: ${e.message}")
            AppStateManager.setLoading(false)
        }
    }
}

/**
 * Restart a container.
 */
private fun restartContainer(apiClient: KontainersApiClient, container: Container) {
    AppStateManager.setLoading(true)
    
    kotlinx.coroutines.MainScope().launch {
        try {
            val success = apiClient.restartContainer(container.id)
            if (success) {
                loadContainers(apiClient)
            } else {
                AppStateManager.setError("Failed to restart container")
                AppStateManager.setLoading(false)
            }
        } catch (e: Exception) {
            AppStateManager.setError("Failed to restart container: ${e.message}")
            AppStateManager.setLoading(false)
        }
    }
}

// LoadingIndicator moved to io.kontainers.ui.components.LoadingIndicator

/**
 * Error message component.
 */
// ErrorMessage component moved to UIComponents.kt