package io.kontainers.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import io.kontainers.model.Container
import io.kontainers.ui.util.*
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*

/**
 * Container detail component.
 */
@Composable
fun ContainerDetail(
    container: Container,
    logs: List<String>,
    onBackClick: () -> Unit,
    onStartClick: () -> Unit,
    onStopClick: () -> Unit,
    onRestartClick: () -> Unit
) {
    var activeTab by remember { mutableStateOf("info") }
    
    Div({
        style {
            display(DisplayStyle.Flex)
            flexDirection(FlexDirection.Column)
            gap(24.px)
        }
    }) {
        // Header with back button
        Div({
            style {
                display(DisplayStyle.Flex)
                alignItems(AlignItems.Center)
                gap(16.px)
            }
        }) {
            Button({
                style {
                    padding(8.px, 16.px)
                    borderRadius(4.px)
                    border("0", "none", "transparent")
                    backgroundColor(Color("#f5f5f5"))
                    color(Color("#424242"))
                    cursor("pointer")
                    fontSize(14.px)
                    hover {
                        backgroundColor(Color("#e0e0e0"))
                    }
                }
                onClick { onBackClick() }
            }) {
                Text("← Back")
            }
            
            H2({
                style {
                    margin(0.px)
                }
            }) {
                Text(container.name)
            }
            
            ContainerDetailStatusBadge(container.state)
        }
        
        // Action buttons
        Div({
            style {
                display(DisplayStyle.Flex)
                gap(8.px)
            }
        }) {
            ContainerDetailActionButton("Start", "play", onStartClick, disabled = container.state == io.kontainers.model.ContainerState.RUNNING)
            ContainerDetailActionButton("Stop", "stop", onStopClick, disabled = container.state != io.kontainers.model.ContainerState.RUNNING)
            ContainerDetailActionButton("Restart", "restart", onRestartClick, disabled = container.state != io.kontainers.model.ContainerState.RUNNING)
        }
        
        // Tabs
        Div({
            style {
                borderBottom("1px", "solid", "#e0e0e0")
                display(DisplayStyle.Flex)
                gap(16.px)
            }
        }) {
            TabButton("Info", "info", activeTab == "info") { activeTab = "info" }
            TabButton("Logs", "logs", activeTab == "logs") { activeTab = "logs" }
            TabButton("Environment", "env", activeTab == "env") { activeTab = "env" }
            TabButton("Networks", "networks", activeTab == "networks") { activeTab = "networks" }
            TabButton("Volumes", "volumes", activeTab == "volumes") { activeTab = "volumes" }
        }
        
        // Tab content
        when (activeTab) {
            "info" -> ContainerInfo(container)
            "logs" -> ContainerLogs(logs)
            "env" -> ContainerEnvironment(container.env)
            "networks" -> ContainerNetworks(container.networks)
            "volumes" -> ContainerVolumes(container.volumes)
        }
    }
}

/**
 * Tab button component.
 */
@Composable
fun TabButton(label: String, id: String, active: Boolean, onClick: () -> Unit) {
    Button({
        style {
            padding(12.px, 16.px)
            backgroundColor(Color.transparent)
            border("0", "none", "transparent")
            borderBottom("2px", "solid", if (active) "#1976d2" else "transparent")
            color(if (active) Color("#1976d2") else Color("#757575"))
            fontWeight(if (active) "500" else "normal")
            cursor("pointer")
            hover {
                color(Color("#1976d2"))
            }
        }
        onClick { onClick() }
    }) {
        Text(label)
    }
}

/**
 * Container info tab content.
 */
@Composable
fun ContainerInfo(container: Container) {
    Div({
        style {
            display(DisplayStyle.Grid)
            gridTemplateColumns("1fr 1fr")
            gap(24.px)
            padding(16.px, 0.px)
        }
    }) {
        InfoItem("ID", container.id)
        InfoItem("Name", container.name)
        InfoItem("Image", container.image)
        InfoItem("Status", container.status)
        InfoItem("Created", formatDetailTimestamp(container.created))
        InfoItem("State", container.state.name)
    }
}

/**
 * Info item component.
 */
@Composable
fun InfoItem(label: String, value: String) {
    Div({
        style {
            display(DisplayStyle.Flex)
            flexDirection(FlexDirection.Column)
            gap(4.px)
            padding(12.px)
            backgroundColor(Color("#f5f5f5"))
            borderRadius(4.px)
        }
    }) {
        Div({
            style {
                fontSize(14.px)
                color(Color("#757575"))
            }
        }) {
            Text(label)
        }
        Div({
            style {
                fontSize(16.px)
                wordBreak("break-all")
            }
        }) {
            Text(value)
        }
    }
}

/**
 * Container logs tab content.
 */
@Composable
fun ContainerLogs(logs: List<String>) {
    if (logs.isEmpty()) {
        ContainerDetailEmptyState("No logs available", "This container has no logs or is not running")
    } else {
        Pre({
            style {
                backgroundColor(Color("#f5f5f5"))
                padding(16.px)
                borderRadius(4.px)
                overflowX("auto")
                maxHeight(500.px)
                margin(0.px)
                fontSize(14.px)
                fontFamily("monospace")
            }
        }) {
            logs.forEach { line ->
                Div {
                    Text(line)
                }
            }
        }
    }
}

/**
 * Container environment tab content.
 */
@Composable
fun ContainerEnvironment(env: List<String>) {
    if (env.isEmpty()) {
        ContainerDetailEmptyState("No environment variables", "This container has no environment variables defined")
    } else {
        Table({
            style {
                width(100.percent)
                borderCollapse("collapse")
            }
        }) {
            Thead {
                Tr {
                    Th({
                        style {
                            textAlign("left")
                            padding(12.px)
                            backgroundColor(Color("#f5f5f5"))
                            borderBottom("1px", "solid", "#e0e0e0")
                        }
                    }) {
                        Text("Key")
                    }
                    Th({
                        style {
                            textAlign("left")
                            padding(12.px)
                            backgroundColor(Color("#f5f5f5"))
                            borderBottom("1px", "solid", "#e0e0e0")
                        }
                    }) {
                        Text("Value")
                    }
                }
            }
            Tbody {
                env.forEach { envVar ->
                    val parts = envVar.split("=", limit = 2)
                    val key = parts.getOrNull(0) ?: ""
                    val value = parts.getOrNull(1) ?: ""
                    
                    Tr({
                        style {
                            borderBottom("1px", "solid", "#e0e0e0")
                        }
                    }) {
                        Td({
                            style {
                                padding(12.px)
                                fontFamily("monospace")
                            }
                        }) {
                            Text(key)
                        }
                        Td({
                            style {
                                padding(12.px)
                                fontFamily("monospace")
                                wordBreak("break-all")
                            }
                        }) {
                            Text(value)
                        }
                    }
                }
            }
        }
    }
}

/**
 * Container networks tab content.
 */
@Composable
fun ContainerNetworks(networks: List<String>) {
    if (networks.isEmpty()) {
        ContainerDetailEmptyState("No networks", "This container is not connected to any networks")
    } else {
        Ul({
            style {
                listStyleType("none")
                padding(0.px)
                margin(0.px)
                display(DisplayStyle.Flex)
                flexDirection(FlexDirection.Column)
                gap(8.px)
            }
        }) {
            networks.forEach { network ->
                Li({
                    style {
                        padding(12.px)
                        backgroundColor(Color("#f5f5f5"))
                        borderRadius(4.px)
                        display(DisplayStyle.Flex)
                        alignItems(AlignItems.Center)
                        gap(8.px)
                    }
                }) {
                    // Network icon would go here in a real implementation
                    Text(network)
                }
            }
        }
    }
}

/**
 * Container volumes tab content.
 */
@Composable
fun ContainerVolumes(volumes: List<io.kontainers.model.VolumeMount>) {
    if (volumes.isEmpty()) {
        ContainerDetailEmptyState("No volumes", "This container has no volume mounts")
    } else {
        Table({
            style {
                width(100.percent)
                borderCollapse("collapse")
            }
        }) {
            Thead {
                Tr {
                    Th({
                        style {
                            textAlign("left")
                            padding(12.px)
                            backgroundColor(Color("#f5f5f5"))
                            borderBottom("1px", "solid", "#e0e0e0")
                        }
                    }) {
                        Text("Source")
                    }
                    Th({
                        style {
                            textAlign("left")
                            padding(12.px)
                            backgroundColor(Color("#f5f5f5"))
                            borderBottom("1px", "solid", "#e0e0e0")
                        }
                    }) {
                        Text("Destination")
                    }
                    Th({
                        style {
                            textAlign("left")
                            padding(12.px)
                            backgroundColor(Color("#f5f5f5"))
                            borderBottom("1px", "solid", "#e0e0e0")
                        }
                    }) {
                        Text("Mode")
                    }
                }
            }
            Tbody {
                volumes.forEach { volume ->
                    Tr({
                        style {
                            borderBottom("1px", "solid", "#e0e0e0")
                        }
                    }) {
                        Td({
                            style {
                                padding(12.px)
                                fontFamily("monospace")
                                wordBreak("break-all")
                            }
                        }) {
                            Text(volume.source)
                        }
                        Td({
                            style {
                                padding(12.px)
                                fontFamily("monospace")
                                wordBreak("break-all")
                            }
                        }) {
                            Text(volume.destination)
                        }
                        Td({
                            style {
                                padding(12.px)
                            }
                        }) {
                            Text(volume.mode)
                        }
                    }
                }
            }
        }
    }
}

/**
 * Empty state component for container detail.
 */
@Composable
fun ContainerDetailEmptyState(title: String, message: String) {
    Div({
        style {
            display(DisplayStyle.Flex)
            flexDirection(FlexDirection.Column)
            alignItems(AlignItems.Center)
            justifyContent(JustifyContent.Center)
            padding(48.px)
            textAlign("center")
            color(Color("#757575"))
        }
    }) {
        H3 {
            Text(title)
        }
        P {
            Text(message)
        }
    }
}

/**
 * Action button component for container detail.
 */
@Composable
fun ContainerDetailActionButton(label: String, icon: String, onClick: () -> Unit, disabled: Boolean = false) {
    Button({
        style {
            padding(8.px, 16.px)
            borderRadius(4.px)
            border("0", "none", "transparent")
            backgroundColor(if (disabled) Color("#e0e0e0") else Color("#1976d2"))
            color(if (disabled) Color("#9e9e9e") else Color.white)
            cursor(if (disabled) "not-allowed" else "pointer")
            fontSize(14.px)
            if (!disabled) {
                hover {
                    backgroundColor(Color("#1565c0"))
                }
            }
        }
        if (!disabled) {
            onClick { onClick() }
        }
        attr("disabled", disabled.toString())
    }) {
        // Icon would go here in a real implementation
        Text(label)
    }
}

/**
 * Container status badge component for container detail.
 */
@Composable
fun ContainerDetailStatusBadge(state: io.kontainers.model.ContainerState) {
    val (color, backgroundColor) = when (state) {
        io.kontainers.model.ContainerState.RUNNING -> Pair("#388e3c", "#e8f5e9")
        io.kontainers.model.ContainerState.STOPPED -> Pair("#d32f2f", "#ffebee")
        io.kontainers.model.ContainerState.PAUSED -> Pair("#f57c00", "#fff3e0")
        io.kontainers.model.ContainerState.RESTARTING -> Pair("#0288d1", "#e1f5fe")
        else -> Pair("#757575", "#f5f5f5")
    }
    
    Span({
        style {
            padding(4.px, 8.px)
            borderRadius(4.px)
            backgroundColor(Color(backgroundColor))
            color(Color(color))
            fontSize(12.px)
            fontWeight("500")
            textTransform("uppercase")
        }
    }) {
        Text(state.name)
    }
}

/**
 * Format timestamp to human-readable date for container detail.
 */
fun formatDetailTimestamp(timestamp: Long): String {
    // In a real implementation, this would use proper date formatting
    // For now, just return the timestamp as a string
    return "Timestamp: $timestamp"
}