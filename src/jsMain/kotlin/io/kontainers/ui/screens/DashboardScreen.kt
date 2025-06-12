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
import io.kontainers.model.PortMapping
import io.kontainers.model.VolumeMount
import io.kontainers.state.AppStateManager
import io.kontainers.state.Screen
import io.kontainers.ui.components.*
import io.kontainers.ui.components.LoadingIndicator
import io.kontainers.ui.util.*
import io.kontainers.ui.util.ErrorMessage
import io.kontainers.ui.util.InfoMessage
import kotlinx.browser.localStorage
import kotlinx.coroutines.launch
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*
import org.w3c.dom.get
import org.w3c.dom.set

/**
 * Dashboard screen component.
 */
/**
 * Create mock containers for development/demo purposes
 */
fun createMockContainers(): List<Container> {
    return listOf(
        Container(
            id = "mock-container-1",
            name = "nginx-web",
            image = "nginx:latest",
            created = System.currentTimeMillis() - 86400000, // 1 day ago
            state = ContainerState.RUNNING,
            status = "Up 24 hours",
            ports = listOf(PortMapping(80, 80), PortMapping(443, 443)),
            networks = listOf("bridge"),
            volumes = emptyList(),
            labels = emptyMap(),
            env = emptyList()
        ),
        Container(
            id = "mock-container-2",
            name = "postgres-db",
            image = "postgres:13",
            created = System.currentTimeMillis() - 172800000, // 2 days ago
            state = ContainerState.RUNNING,
            status = "Up 48 hours",
            ports = listOf(PortMapping(5432, 5432)),
            networks = listOf("bridge"),
            volumes = listOf(VolumeMount("postgres-data", "/var/lib/postgresql/data")),
            labels = emptyMap(),
            env = emptyList()
        ),
        Container(
            id = "mock-container-3",
            name = "redis-cache",
            image = "redis:alpine",
            created = System.currentTimeMillis() - 43200000, // 12 hours ago
            state = ContainerState.RUNNING,
            status = "Up 12 hours",
            ports = listOf(PortMapping(6379, 6379)),
            networks = listOf("bridge"),
            volumes = emptyList(),
            labels = emptyMap(),
            env = emptyList()
        ),
        Container(
            id = "mock-container-4",
            name = "stopped-service",
            image = "alpine:latest",
            created = System.currentTimeMillis() - 259200000, // 3 days ago
            state = ContainerState.STOPPED,
            status = "Exited (0) 1 day ago",
            ports = emptyList(),
            networks = emptyList(),
            volumes = emptyList(),
            labels = emptyMap(),
            env = emptyList()
        )
    )
}

@Composable
fun DashboardScreen() {
    val apiClient = remember { KontainersApiClient() }
    val appStateFlow = AppStateManager.state
    val appState = remember { appStateFlow.value }
    
    val themeStateFlow = ThemeManager.themeState
    val themeState = remember { themeStateFlow.value }
    
    var isLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var widgets by remember { mutableStateOf<List<WidgetConfig>>(emptyList()) }
    var isEditMode by remember { mutableStateOf(false) }
    var showAddWidgetDialog by remember { mutableStateOf(false) }
    var editingWidget by remember { mutableStateOf<WidgetConfig?>(null) }
    
    // Load widgets from localStorage or use defaults
    LaunchedEffect(Unit) {
        val savedWidgets = localStorage["dashboard_widgets"]
        widgets = if (savedWidgets != null) {
            try {
                Json.decodeFromString(savedWidgets)
            } catch (e: Exception) {
                getDefaultWidgets()
            }
        } else {
            getDefaultWidgets()
        }
    }
    
    // Load containers on initial render and periodically refresh
    LaunchedEffect(Unit) {
        try {
            isLoading = true
            error = null
            
            val containers = apiClient.getContainers(true)
            AppStateManager.updateContainers(containers)
            
            // If no containers were found but no error occurred, add mock data for development
            if (containers.isEmpty()) {
                val mockContainers = createMockContainers()
                AppStateManager.updateContainers(mockContainers)
            }
            
            isLoading = false
        } catch (e: Exception) {
            // Check if the error is related to the backend server not being available
            if (e.message?.contains("404") == true || e.message?.contains("Failed to fetch") == true) {
                error = "Backend server not available. This is expected when running only the frontend in development mode."
                // Add mock data for development
                val mockContainers = createMockContainers()
                AppStateManager.updateContainers(mockContainers)
            } else {
                error = "Failed to load containers: ${e.message}"
            }
            isLoading = false
        }
    }
    
    // Save widgets when they change
    LaunchedEffect(widgets) {
        localStorage["dashboard_widgets"] = Json.encodeToString(widgets)
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
        
        // Dashboard header with edit mode toggle
        Div({
            style {
                display(DisplayStyle.Flex)
                justifyContent(JustifyContent.SpaceBetween)
                alignItems(AlignItems.Center)
                marginBottom(16.px)
            }
        }) {
            Div {
                H1 { Text("Dashboard") }
                P { Text("Overview of your container environment") }
            }
            
            Div({
                style {
                    display(DisplayStyle.Flex)
                    gap(16.px)
                }
            }) {
                // Edit mode toggle button
                Button({
                    style {
                        padding(8.px, 16.px)
                        backgroundColor(if (isEditMode) Color("#f44336") else Color("#1976d2"))
                        color(Color.white)
                        border("0", "none", "transparent")
                        borderRadius(4.px)
                        cursor("pointer")
                    }
                    onClick { isEditMode = !isEditMode }
                }) {
                    Text(if (isEditMode) "Exit Edit Mode" else "Customize Dashboard")
                }
            }
        }
        
        if (isLoading) {
            LoadingIndicator()
        } else {
            // Dashboard content
            Div({
                style {
                    display(DisplayStyle.Flex)
                    flexDirection(FlexDirection.Row)
                    flexWrap(FlexWrap.Wrap)
                    gap(24.px)
                    marginTop(24.px)
                }
                attr("class", "dashboard-grid")
            }) {
                // Render widgets
                widgets.forEach { widgetConfig ->
                    when (widgetConfig.type) {
                        WidgetType.CONTAINER_STATUS -> {
                            DashboardWidget(
                                config = widgetConfig,
                                onRemove = { id -> 
                                    if (isEditMode) {
                                        widgets = widgets.filter { it.id != id }
                                    }
                                },
                                onEdit = { config ->
                                    if (isEditMode) {
                                        editingWidget = config
                                    }
                                }
                            ) {
                                appState?.let { ContainerStatusWidget(it) } ?: Text("Loading...")
                            }
                        }
                        WidgetType.RECENT_CONTAINERS -> {
                            DashboardWidget(
                                config = widgetConfig,
                                onRemove = { id -> 
                                    if (isEditMode) {
                                        widgets = widgets.filter { it.id != id }
                                    }
                                },
                                onEdit = { config ->
                                    if (isEditMode) {
                                        editingWidget = config
                                    }
                                }
                            ) {
                                appState?.let { RecentContainersWidget(it) } ?: Text("Loading...")
                            }
                        }
                        WidgetType.SYSTEM_INFO -> {
                            DashboardWidget(
                                config = widgetConfig,
                                onRemove = { id -> 
                                    if (isEditMode) {
                                        widgets = widgets.filter { it.id != id }
                                    }
                                },
                                onEdit = { config ->
                                    if (isEditMode) {
                                        editingWidget = config
                                    }
                                }
                            ) {
                                appState?.let { SystemInfoWidget(it) } ?: Text("Loading...")
                            }
                        }
                        WidgetType.QUICK_ACTIONS -> {
                            DashboardWidget(
                                config = widgetConfig,
                                onRemove = { id -> 
                                    if (isEditMode) {
                                        widgets = widgets.filter { it.id != id }
                                    }
                                },
                                onEdit = { config ->
                                    if (isEditMode) {
                                        editingWidget = config
                                    }
                                }
                            ) {
                                QuickActionsWidget()
                            }
                        }
                        WidgetType.PROXY_STATUS -> {
                            DashboardWidget(
                                config = widgetConfig,
                                onRemove = { id -> 
                                    if (isEditMode) {
                                        widgets = widgets.filter { it.id != id }
                                    }
                                },
                                onEdit = { config ->
                                    if (isEditMode) {
                                        editingWidget = config
                                    }
                                }
                            ) {
                                appState?.let { ProxyStatusWidget(it) } ?: Text("Loading...")
                            }
                        }
                        WidgetType.SYSTEM_METRICS -> {
                            DashboardWidget(
                                config = widgetConfig,
                                onRemove = { id -> 
                                    if (isEditMode) {
                                        widgets = widgets.filter { it.id != id }
                                    }
                                },
                                onEdit = { config ->
                                    if (isEditMode) {
                                        editingWidget = config
                                    }
                                }
                            ) {
                                appState?.let { SystemMetricsWidget(it) } ?: Text("Loading...")
                            }
                        }
                        WidgetType.ERROR_RATE -> {
                            DashboardWidget(
                                config = widgetConfig,
                                onRemove = { id -> 
                                    if (isEditMode) {
                                        widgets = widgets.filter { it.id != id }
                                    }
                                },
                                onEdit = { config ->
                                    if (isEditMode) {
                                        editingWidget = config
                                    }
                                }
                            ) {
                                appState?.let { ErrorRateWidget(it) } ?: Text("Loading...")
                            }
                        }
                        WidgetType.CUSTOM -> {
                            DashboardWidget(
                                config = widgetConfig,
                                onRemove = { id -> 
                                    if (isEditMode) {
                                        widgets = widgets.filter { it.id != id }
                                    }
                                },
                                onEdit = { config ->
                                    if (isEditMode) {
                                        editingWidget = config
                                    }
                                }
                            ) {
                                CustomWidget(widgetConfig.customData)
                            }
                        }
                    }
                }
                
                // Add widget button (only visible in edit mode)
                if (isEditMode) {
                    Div({
                        style {
                            gridColumn("span 1")
                            gridRow("span 1")
                        }
                    }) {
                        AddWidgetButton {
                            showAddWidgetDialog = true
                        }
                    }
                }
            }
        }
        
        // Add widget dialog
        if (showAddWidgetDialog) {
            AddWidgetDialog(
                onAdd = { config ->
                    widgets = widgets + config
                    showAddWidgetDialog = false
                },
                onCancel = {
                    showAddWidgetDialog = false
                }
            )
        }
        
        // Edit widget dialog
        if (editingWidget != null) {
            WidgetEditorDialog(
                widget = editingWidget,
                onSave = { updatedConfig ->
                    widgets = widgets.map { if (it.id == updatedConfig.id) updatedConfig else it }
                    editingWidget = null
                },
                onCancel = {
                    editingWidget = null
                }
            )
        }
    }
}

/**
 * Container status widget content.
 */
@Composable
fun ContainerStatusWidget(appState: io.kontainers.state.AppState) {
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

/**
 * Recent containers widget content.
 */
@Composable
fun RecentContainersWidget(appState: io.kontainers.state.AppState) {
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

/**
 * System info widget content.
 */
@Composable
fun SystemInfoWidget(appState: io.kontainers.state.AppState) {
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

/**
 * Quick actions widget content.
 */
@Composable
fun QuickActionsWidget() {
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

/**
 * Proxy status widget content.
 */
@Composable
fun ProxyStatusWidget(appState: io.kontainers.state.AppState) {
    val activeRules = appState.proxyRules.count { it.enabled }
    val inactiveRules = appState.proxyRules.size - activeRules
    
    Div({
        style {
            display(DisplayStyle.Flex)
            flexDirection(FlexDirection.Column)
            gap(16.px)
        }
    }) {
        StatusItem("Active Rules", activeRules, "#4caf50")
        StatusItem("Inactive Rules", inactiveRules, "#f44336")
        
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
            onClick { AppStateManager.navigateTo(Screen.PROXY) }
        }) {
            Text("Manage Proxy Rules")
        }
    }
}

/**
 * System metrics widget content.
 */
@Composable
fun SystemMetricsWidget(appState: io.kontainers.state.AppState) {
    // Simplified metrics display
    Div({
        style {
            display(DisplayStyle.Flex)
            flexDirection(FlexDirection.Column)
            gap(16.px)
        }
    }) {
        InfoRow("CPU Usage", "32%")
        InfoRow("Memory Usage", "2.4 GB")
        InfoRow("Disk Usage", "45%")
        InfoRow("Network I/O", "1.2 MB/s")
        
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
            onClick { AppStateManager.navigateTo(Screen.METRICS) }
        }) {
            Text("View Detailed Metrics")
        }
    }
}

/**
 * Error rate widget content.
 */
@Composable
fun ErrorRateWidget(appState: io.kontainers.state.AppState) {
    // Simplified error rate display
    Div({
        style {
            display(DisplayStyle.Flex)
            flexDirection(FlexDirection.Column)
            gap(16.px)
        }
    }) {
        InfoRow("Error Rate (24h)", "0.5%")
        InfoRow("Total Errors", appState.proxyErrors.values.sumOf { it.size }.toString())
        InfoRow("Active Alerts", appState.activeAlerts.size.toString())
        
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
            onClick { AppStateManager.navigateTo(Screen.PROXY_ANALYTICS) }
        }) {
            Text("View Error Details")
        }
    }
}

/**
 * Custom widget content.
 */
@Composable
fun CustomWidget(customData: Map<String, String>) {
    Div({
        style {
            display(DisplayStyle.Flex)
            flexDirection(FlexDirection.Column)
            gap(16.px)
        }
    }) {
        if (customData.isEmpty()) {
            Div({
                style {
                    padding(16.px)
                    color(Color("#757575"))
                    textAlign("center")
                }
            }) {
                Text("Custom widget - configure in edit mode")
            }
        } else {
            customData.forEach { (key, value) ->
                InfoRow(key, value)
            }
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

// LoadingIndicator moved to io.kontainers.ui.components.LoadingIndicator

/**
 * Get default widgets for the dashboard.
 */
private fun getDefaultWidgets(): List<WidgetConfig> {
    return listOf(
        WidgetConfig(
            id = "widget-container-status",
            type = WidgetType.CONTAINER_STATUS,
            title = "Container Status",
            width = 1,
            height = 1,
            position = 0
        ),
        WidgetConfig(
            id = "widget-recent-containers",
            type = WidgetType.RECENT_CONTAINERS,
            title = "Recent Containers",
            width = 1,
            height = 1,
            position = 1
        ),
        WidgetConfig(
            id = "widget-system-info",
            type = WidgetType.SYSTEM_INFO,
            title = "System Info",
            width = 1,
            height = 1,
            position = 2
        ),
        WidgetConfig(
            id = "widget-quick-actions",
            type = WidgetType.QUICK_ACTIONS,
            title = "Quick Actions",
            width = 1,
            height = 1,
            position = 3
        )
    )
}