package io.kontainers.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import io.kontainers.model.Container
import io.kontainers.model.ContainerState
import io.kontainers.ui.util.*
import org.jetbrains.compose.web.attributes.InputType
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*

/**
 * Container list component.
 */
@Composable
fun ContainerList(
    containers: List<Container>,
    onContainerClick: (Container) -> Unit,
    onStartClick: (Container) -> Unit,
    onStopClick: (Container) -> Unit,
    onRestartClick: (Container) -> Unit
) {
    var searchQuery by remember { mutableStateOf("") }
    var selectedState by remember { mutableStateOf<ContainerState?>(null) }
    
    // Filter containers based on search query and selected state
    val filteredContainers = containers.filter { container ->
        val matchesSearch = searchQuery.isEmpty() ||
            container.name.contains(searchQuery, ignoreCase = true) ||
            container.image.contains(searchQuery, ignoreCase = true)
        val matchesState = selectedState == null || container.state == selectedState
        matchesSearch && matchesState
    }
    
    if (containers.isEmpty()) {
        EmptyStateContainer("No containers found", "Connect to Docker to see your containers")
    } else {
        // Search and filter controls
        Div({
            style {
                display(DisplayStyle.Flex)
                flexDirection(FlexDirection.Column)
                gap(16.px)
                marginBottom(16.px)
            }
        }) {
            // Search input
            Div({
                style {
                    display(DisplayStyle.Flex)
                    gap(8.px)
                    alignItems(AlignItems.Center)
                }
            }) {
                Input(InputType.Text) {
                    style {
                        padding(8.px, 12.px)
                        borderRadius(4.px)
                        border(1.px, LineStyle.Solid, Color("#e0e0e0"))
                        fontSize(14.px)
                        width(300.px)
                    }
                    attr("placeholder", "Search containers...")
                    value(searchQuery)
                    onInput { event -> searchQuery = event.value }
                }
                
                Button({
                    style {
                        padding(8.px, 16.px)
                        borderRadius(4.px)
                        border("0", "none", "transparent")
                        backgroundColor(Color("#f5f5f5"))
                        color(Color("#424242"))
                        cursor("pointer")
                        fontSize(14.px)
                    }
                    onClick { searchQuery = "" }
                }) {
                    Text("Clear")
                }
            }
            
            // Filter buttons
            Div({
                style {
                    display(DisplayStyle.Flex)
                    gap(8.px)
                    alignItems(AlignItems.Center)
                }
            }) {
                Text("Filter by state: ")
                
                FilterButton("All", null, selectedState == null) {
                    selectedState = null
                }
                FilterButton("Running", ContainerState.RUNNING, selectedState == ContainerState.RUNNING) {
                    selectedState = ContainerState.RUNNING
                }
                FilterButton("Stopped", ContainerState.STOPPED, selectedState == ContainerState.STOPPED) {
                    selectedState = ContainerState.STOPPED
                }
                FilterButton("Other", ContainerState.CREATED, selectedState == ContainerState.CREATED) {
                    selectedState = ContainerState.CREATED
                }
            }
            
            // Results count
            Div({
                style {
                    fontSize(14.px)
                    color(Color("#757575"))
                }
            }) {
                Text("Showing ${filteredContainers.size} of ${containers.size} containers")
            }
        }
        Div({
            style {
                display(DisplayStyle.Flex)
                flexDirection(FlexDirection.Column)
                gap(16.px)
            }
        }) {
            // Table header
            Div({
                style {
                    display(DisplayStyle.Grid)
                    gridTemplateColumns("2fr 1fr 1fr 1fr 1fr 1fr")
                    padding(12.px)
                    backgroundColor(Color("#f5f5f5"))
                    borderRadius(4.px)
                    fontWeight("bold")
                }
            }) {
                Div { Text("Name") }
                Div { Text("Image") }
                Div { Text("Status") }
                Div { Text("Created") }
                Div { Text("Ports") }
                Div { Text("Actions") }
            }
            
            // Container rows
            if (filteredContainers.isEmpty()) {
                Div({
                    style {
                        padding(24.px)
                        textAlign("center")
                        color(Color("#757575"))
                        gridColumn("1 / span 6")
                    }
                }) {
                    Text("No containers match your search criteria")
                }
            } else {
                filteredContainers.forEach { container ->
                ContainerRow(
                    container = container,
                    onClick = { onContainerClick(container) },
                    onStartClick = { onStartClick(container) },
                    onStopClick = { onStopClick(container) },
                    onRestartClick = { onRestartClick(container) }
                )
                }
            }
        }
    }
}

/**
 * Filter button component.
 */
@Composable
fun FilterButton(
    label: String,
    state: ContainerState?,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    Button({
        style {
            padding(6.px, 12.px)
            borderRadius(4.px)
            border("1px", "solid", if (isSelected) "#1976d2" else "#e0e0e0")
            backgroundColor(if (isSelected) Color("#e3f2fd") else Color.white)
            color(if (isSelected) Color("#1976d2") else Color("#424242"))
            cursor("pointer")
            fontSize(14.px)
        }
        onClick { onClick() }
    }) {
        Text(label)
    }
}

/**
 * Container row component.
 */
@Composable
fun ContainerRow(
    container: Container,
    onClick: () -> Unit,
    onStartClick: () -> Unit,
    onStopClick: () -> Unit,
    onRestartClick: () -> Unit
) {
    Div({
        style {
            display(DisplayStyle.Grid)
            gridTemplateColumns("2fr 1fr 1fr 1fr 1fr 1fr")
            padding(12.px)
            borderBottom("1px", "solid", "#e0e0e0")
            cursor("pointer")
            hover {
                backgroundColor(Color("#f5f5f5"))
            }
        }
        onClick { onClick() }
    }) {
        // Name
        Div({
            style {
                fontWeight("500")
            }
        }) {
            Text(container.name)
        }
        
        // Image
        Div {
            Text(container.image.split(":").first())
        }
        
        // Status
        Div {
            ContainerStatusBadge(container.state)
        }
        
        // Created
        Div {
            Text(formatTimestamp(container.created))
        }
        
        // Ports
        Div {
            if (container.ports.isNotEmpty()) {
                Text(container.ports.joinToString(", ") { 
                    "${it.publicPort ?: "-"}:${it.privatePort}" 
                })
            } else {
                Text("-")
            }
        }
        
        // Actions
        Div({
            style {
                display(DisplayStyle.Flex)
                gap(8.px)
            }
        }) {
            when (container.state) {
                ContainerState.RUNNING -> {
                    ActionButton("Stop", "stop", onStopClick)
                    ActionButton("Restart", "restart", onRestartClick)
                }
                ContainerState.STOPPED, ContainerState.CREATED, ContainerState.DEAD -> {
                    ActionButton("Start", "play", onStartClick)
                }
                else -> {
                    // For other states, show a disabled button
                    ActionButton("Wait", "hourglass", {}, disabled = true)
                }
            }
        }
    }
}

/**
 * Container status badge component.
 */
@Composable
fun ContainerStatusBadge(state: ContainerState) {
    val (backgroundColor, textColor) = when (state) {
        ContainerState.RUNNING -> Color("#4caf50") to Color.white
        ContainerState.STOPPED, ContainerState.DEAD -> Color("#f44336") to Color.white
        ContainerState.PAUSED -> Color("#ff9800") to Color.white
        ContainerState.RESTARTING -> Color("#2196f3") to Color.white
        ContainerState.REMOVING -> Color("#9c27b0") to Color.white
        ContainerState.CREATED -> Color("#607d8b") to Color.white
    }
    
    Span({
        style {
            backgroundColor(backgroundColor)
            color(textColor)
            padding(4.px, 8.px)
            borderRadius(4.px)
            fontSize(12.px)
            fontWeight("500")
            display(DisplayStyle.InlineBlock)
        }
    }) {
        Text(state.name)
    }
}

/**
 * Action button component.
 */
@Composable
fun ActionButton(
    label: String,
    icon: String,
    onClick: () -> Unit,
    disabled: Boolean = false
) {
    Button({
        style {
            padding(6.px, 12.px)
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
        // We would use an icon here in a real implementation
        Text(label)
    }
}

/**
 * Empty state component.
 */
@Composable
fun EmptyStateContainer(title: String, message: String) {
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
        H3({
            style {
                marginBottom(8.px)
            }
        }) {
            Text(title)
        }
        P {
            Text(message)
        }
    }
}

/**
 * Format a Unix timestamp to a human-readable date.
 */
fun formatTimestamp(timestamp: Long): String {
    // In a real implementation, this would use proper date formatting
    // For now, just return a simplified string
    return "Timestamp: $timestamp"
}