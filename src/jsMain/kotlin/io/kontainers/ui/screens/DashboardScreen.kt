package io.kontainers.ui.screens

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import io.kontainers.api.KontainersApiClient
import io.kontainers.model.ContainerState
import io.kontainers.state.AppStateManager
import io.kontainers.state.Screen
import io.kontainers.ui.util.*
import io.kontainers.ui.util.ErrorMessage
import io.kontainers.ui.util.InfoMessage
import kotlinx.coroutines.launch
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*

/**
 * Dashboard screen component.
 */
@Composable
fun DashboardScreen() {
    val apiClient = remember { KontainersApiClient() }
    val appState by AppStateManager.state.collectAsState()
    
    var isLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    
    // Load containers on initial render
    LaunchedEffect(Unit) {
        try {
            isLoading = true
            error = null
            
            val containers = apiClient.getContainers(true)
            AppStateManager.updateContainers(containers)
            
            isLoading = false
        } catch (e: Exception) {
            // Check if the error is related to the backend server not being available
            if (e.message?.contains("404") == true || e.message?.contains("Failed to fetch") == true) {
                error = "Backend server not available. This is expected when running only the frontend in development mode."
            } else {
                error = "Failed to load containers: ${e.message}"
            }
            isLoading = false
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
                    // Retry loading
                    kotlinx.coroutines.MainScope().launch {
                        try {
                            isLoading = true
                            val containers = apiClient.getContainers(true)
                            AppStateManager.updateContainers(containers)
                            isLoading = false
                        } catch (e: Exception) {
                            if (e.message?.contains("404") == true || e.message?.contains("Failed to fetch") == true) {
                                error = "Backend server not available. This is expected when running only the frontend in development mode."
                            } else {
                                error = "Failed to load containers: ${e.message}"
                            }
                            isLoading = false
                        }
                    }
                }
            }
        }
        
        H1 { Text("Dashboard") }
        P { Text("Overview of your container environment") }
        
        if (isLoading) {
            LoadingIndicator()
        } else {
            // Dashboard content
            Div({
                style {
                    display(DisplayStyle.Grid)
                    gridTemplateColumns("repeat(auto-fill, minmax(300px, 1fr))")
                    gap(24.px)
                    marginTop(24.px)
                }
            }) {
                // Container status card
                DashboardCard("Container Status") {
                    val running = appState.containers.count { it.state == ContainerState.RUNNING }
                    val stopped = appState.containers.count { it.state == ContainerState.STOPPED || it.state == ContainerState.CREATED || it.state == ContainerState.DEAD }
                    val other = appState.containers.size - running - stopped
                    
                    Div({
                        style {
                            display(DisplayStyle.Flex)
                            flexDirection(FlexDirection.Column)
                            gap(16.px)
                        }
                    }) {
                        StatusItem("Running", running, "#4caf50")
                        StatusItem("Stopped", stopped, "#f44336")
                        StatusItem("Other", other, "#ff9800")
                        
                        Button({
                            style {
                                marginTop(16.px)
                                padding(8.px, 16.px)
                                backgroundColor(Color("#1976d2"))
                                color(Color.white)
                                border("0", "none", "transparent")
                                borderRadius(4.px)
                                cursor("pointer")
                                alignSelf(AlignSelf.FlexStart)
                            }
                            onClick { AppStateManager.navigateTo(Screen.CONTAINERS) }
                        }) {
                            Text("View All Containers")
                        }
                    }
                }
                
                // Recent containers card
                DashboardCard("Recent Containers") {
                    val recentContainers = appState.containers
                        .sortedByDescending { it.created }
                        .take(5)
                    
                    if (recentContainers.isEmpty()) {
                        Div({
                            style {
                                padding(16.px)
                                color(Color("#757575"))
                                textAlign("center")
                            }
                        }) {
                            Text("No containers found")
                        }
                    } else {
                        Div({
                            style {
                                display(DisplayStyle.Flex)
                                flexDirection(FlexDirection.Column)
                                gap(8.px)
                            }
                        }) {
                            recentContainers.forEach { container ->
                                Div({
                                    style {
                                        display(DisplayStyle.Flex)
                                        justifyContent(JustifyContent.SpaceBetween)
                                        alignItems(AlignItems.Center)
                                        padding(8.px)
                                        borderRadius(4.px)
                                        backgroundColor(Color("#f5f5f5"))
                                        cursor("pointer")
                                        hover {
                                            backgroundColor(Color("#e0e0e0"))
                                        }
                                    }
                                    onClick {
                                        AppStateManager.selectContainer(container.id)
                                        AppStateManager.navigateTo(Screen.CONTAINERS)
                                    }
                                }) {
                                    Div {
                                        Text(container.name)
                                    }
                                    
                                    when (container.state) {
                                        ContainerState.RUNNING -> StatusBadge("Running", "#4caf50")
                                        ContainerState.STOPPED, ContainerState.DEAD -> StatusBadge("Stopped", "#f44336")
                                        else -> StatusBadge(container.state.name, "#ff9800")
                                    }
                                }
                            }
                        }
                    }
                }
                
                // System info card
                DashboardCard("System Info") {
                    Div({
                        style {
                            display(DisplayStyle.Flex)
                            flexDirection(FlexDirection.Column)
                            gap(16.px)
                        }
                    }) {
                        InfoRow("Total Containers", appState.containers.size.toString())
                        InfoRow("Running Containers", appState.containers.count { it.state == ContainerState.RUNNING }.toString())
                        InfoRow("Images", appState.containers.map { it.image }.distinct().size.toString())
                        InfoRow("Networks", appState.containers.flatMap { it.networks }.distinct().size.toString())
                    }
                }
                
                // Quick actions card
                DashboardCard("Quick Actions") {
                    Div({
                        style {
                            display(DisplayStyle.Flex)
                            flexDirection(FlexDirection.Column)
                            gap(8.px)
                        }
                    }) {
                        ActionButton("View Containers", "containers", Screen.CONTAINERS)
                        ActionButton("Manage Proxy Rules", "proxy", Screen.PROXY)
                        ActionButton("Settings", "settings", Screen.SETTINGS)
                    }
                }
            }
        }
    }
}

/**
 * Dashboard card component.
 */
@Composable
fun DashboardCard(title: String, content: @Composable () -> Unit) {
    Div({
        style {
            backgroundColor(Color.white)
            borderRadius(8.px)
            boxShadow("0 2px 4px rgba(0,0,0,0.1)")
            overflow("hidden")
        }
    }) {
        Div({
            style {
                padding(16.px)
                borderBottom("1px", "solid", "#e0e0e0")
                backgroundColor(Color("#f5f5f5"))
            }
        }) {
            H3({
                style {
                    margin(0.px)
                    fontSize(18.px)
                }
            }) {
                Text(title)
            }
        }
        
        Div({
            style {
                padding(16.px)
            }
        }) {
            content()
        }
    }
}

/**
 * Status item component.
 */
@Composable
fun StatusItem(label: String, count: Int, color: String) {
    Div({
        style {
            display(DisplayStyle.Flex)
            justifyContent(JustifyContent.SpaceBetween)
            alignItems(AlignItems.Center)
        }
    }) {
        Div({
            style {
                display(DisplayStyle.Flex)
                alignItems(AlignItems.Center)
                gap(8.px)
            }
        }) {
            Div({
                style {
                    width(12.px)
                    height(12.px)
                    borderRadius(6.px)
                    backgroundColor(Color(color))
                }
            }) {}
            
            Text(label)
        }
        
        Div({
            style {
                fontWeight("bold")
                fontSize(18.px)
            }
        }) {
            Text(count.toString())
        }
    }
}

/**
 * Status badge component.
 */
@Composable
fun StatusBadge(label: String, color: String) {
    Span({
        style {
            backgroundColor(Color(color))
            color(Color.white)
            padding(4.px, 8.px)
            borderRadius(4.px)
            fontSize(12.px)
            fontWeight("500")
        }
    }) {
        Text(label)
    }
}

/**
 * Info row component.
 */
@Composable
fun InfoRow(label: String, value: String) {
    Div({
        style {
            display(DisplayStyle.Flex)
            justifyContent(JustifyContent.SpaceBetween)
            alignItems(AlignItems.Center)
        }
    }) {
        Div({
            style {
                color(Color("#757575"))
            }
        }) {
            Text(label)
        }
        
        Div({
            style {
                fontWeight("500")
            }
        }) {
            Text(value)
        }
    }
}

/**
 * Action button component.
 */
@Composable
fun ActionButton(label: String, icon: String, screen: Screen) {
    Button({
        style {
            width(100.percent)
            padding(12.px)
            backgroundColor(Color("#1976d2"))
            color(Color.white)
            border("0", "none", "transparent")
            borderRadius(4.px)
            cursor("pointer")
            textAlign("center")
            hover {
                backgroundColor(Color("#1565c0"))
            }
        }
        onClick { AppStateManager.navigateTo(screen) }
    }) {
        // We would use an icon here in a real implementation
        Text(label)
    }
}