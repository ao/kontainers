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
    var selectedContainers by remember { mutableStateOf<Set<String>>(emptySet()) }
    var showBulkActionConfirmation by remember { mutableStateOf(false) }
    var bulkAction by remember { mutableStateOf<BulkAction?>(null) }
    
    // Filter containers based on search query and selected state
    val filteredContainers = containers.filter { container ->
        val matchesSearch = searchQuery.isEmpty() ||
            container.name.contains(searchQuery, ignoreCase = true) ||
            container.image.contains(searchQuery, ignoreCase = true)
        val matchesState = selectedState == null || container.state == selectedState
        matchesSearch && matchesState
    }
    
    // Toggle container selection
    fun toggleContainerSelection(containerId: String) {
        selectedContainers = if (selectedContainers.contains(containerId)) {
            selectedContainers - containerId
        } else {
            selectedContainers + containerId
        }
    }
    
    // Toggle all containers selection
    fun toggleAllContainers() {
        selectedContainers = if (selectedContainers.size == filteredContainers.size) {
            emptySet()
        } else {
            filteredContainers.map { it.id }.toSet()
        }
    }
    
    // Execute bulk action
    fun executeBulkAction() {
        val selectedContainersList = filteredContainers.filter { selectedContainers.contains(it.id) }
        when (bulkAction) {
            BulkAction.START -> selectedContainersList.forEach { onStartClick(it) }
            BulkAction.STOP -> selectedContainersList.forEach { onStopClick(it) }
            BulkAction.RESTART -> selectedContainersList.forEach { onRestartClick(it) }
            null -> {}
        }
        showBulkActionConfirmation = false
        bulkAction = null
    }
    
    // Show confirmation dialog for bulk action
    fun confirmBulkAction(action: BulkAction) {
        bulkAction = action
        showBulkActionConfirmation = true
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
            
            // Bulk action buttons (only visible when containers are selected)
            if (selectedContainers.isNotEmpty()) {
                Div({
                    style {
                        display(DisplayStyle.Flex)
                        gap(8.px)
                        alignItems(AlignItems.Center)
                        marginTop(16.px)
                        padding(8.px)
                        backgroundColor(Color("#e3f2fd"))
                        borderRadius(4.px)
                    }
                }) {
                    Text("${selectedContainers.size} containers selected: ")
                    
                    // Bulk action buttons
                    Button({
                        style {
                            padding(6.px, 12.px)
                            borderRadius(4.px)
                            border("0", "none", "transparent")
                            backgroundColor(Color("#4caf50"))
                            color(Color.white)
                            cursor("pointer")
                            fontSize(14.px)
                        }
                        onClick { confirmBulkAction(BulkAction.START) }
                    }) {
                        Text("Start All")
                    }
                    
                    Button({
                        style {
                            padding(6.px, 12.px)
                            borderRadius(4.px)
                            border("0", "none", "transparent")
                            backgroundColor(Color("#f44336"))
                            color(Color.white)
                            cursor("pointer")
                            fontSize(14.px)
                        }
                        onClick { confirmBulkAction(BulkAction.STOP) }
                    }) {
                        Text("Stop All")
                    }
                    
                    Button({
                        style {
                            padding(6.px, 12.px)
                            borderRadius(4.px)
                            border("0", "none", "transparent")
                            backgroundColor(Color("#2196f3"))
                            color(Color.white)
                            cursor("pointer")
                            fontSize(14.px)
                        }
                        onClick { confirmBulkAction(BulkAction.RESTART) }
                    }) {
                        Text("Restart All")
                    }
                    
                    // Clear selection button
                    Button({
                        style {
                            padding(6.px, 12.px)
                            borderRadius(4.px)
                            border("0", "none", "transparent")
                            backgroundColor(Color("#9e9e9e"))
                            color(Color.white)
                            cursor("pointer")
                            fontSize(14.px)
                            marginLeft(8.px)
                        }
                        onClick { selectedContainers = emptySet() }
                    }) {
                        Text("Clear Selection")
                    }
                }
            }
            
            // Results count
            Div({
                style {
                    fontSize(14.px)
                    color(Color("#757575"))
                    marginTop(8.px)
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
                    gridTemplateColumns("auto 2fr 1fr 1fr 1fr 1fr 1fr")
                    padding(12.px)
                    backgroundColor(Color("#f5f5f5"))
                    borderRadius(4.px)
                    fontWeight("bold")
                    alignItems(AlignItems.Center)
                }
            }) {
                // Checkbox for selecting all containers
                Div({
                    style {
                        display(DisplayStyle.Flex)
                        alignItems(AlignItems.Center)
                        justifyContent(JustifyContent.Center)
                    }
                }) {
                    Input(InputType.Checkbox) {
                        style {
                            cursor("pointer")
                            width(18.px)
                            height(18.px)
                        }
                        checked(selectedContainers.size == filteredContainers.size && filteredContainers.isNotEmpty())
                        onChange { toggleAllContainers() }
                    }
                }
                
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
                        gridColumn("1 / span 7")
                    }
                }) {
                    Text("No containers match your search criteria")
                }
            } else {
                filteredContainers.forEach { container ->
                    ContainerRow(
                        container = container,
                        isSelected = selectedContainers.contains(container.id),
                        onToggleSelect = { toggleContainerSelection(container.id) },
                        onClick = { onContainerClick(container) },
                        onStartClick = { onStartClick(container) },
                        onStopClick = { onStopClick(container) },
                        onRestartClick = { onRestartClick(container) }
                    )
                }
            }
        }
        
        // Confirmation dialog for bulk actions
        if (showBulkActionConfirmation && bulkAction != null) {
            BulkActionConfirmationDialog(
                action = bulkAction!!,
                containerCount = selectedContainers.size,
                onConfirm = { executeBulkAction() },
                onCancel = {
                    showBulkActionConfirmation = false
                    bulkAction = null
                }
            )
        }
    }
}

/**
 * Enum representing bulk actions.
 */
enum class BulkAction {
    START,
    STOP,
    RESTART
}

/**
 * Bulk action confirmation dialog component.
 */
@Composable
fun BulkActionConfirmationDialog(
    action: BulkAction,
    containerCount: Int,
    onConfirm: () -> Unit,
    onCancel: () -> Unit
) {
    // Modal overlay
    Div({
        style {
            position(Position.Fixed)
            top(0.px)
            left(0.px)
            right(0.px)
            bottom(0.px)
            backgroundColor(Color("rgba(0, 0, 0, 0.5)"))
            display(DisplayStyle.Flex)
            justifyContent(JustifyContent.Center)
            alignItems(AlignItems.Center)
            zIndex(1000)
        }
    }) {
        // Modal dialog
        Div({
            style {
                backgroundColor(Color.white)
                borderRadius(8.px)
                padding(24.px)
                width(400.px)
                maxWidth(90.percent)
            }
            onClick { it.stopPropagation() }
        }) {
            H3({
                style {
                    margin(0.px)
                    marginBottom(16.px)
                }
            }) {
                Text("Confirm Bulk Action")
            }
            
            P({
                style {
                    marginBottom(24.px)
                }
            }) {
                val actionText = when (action) {
                    BulkAction.START -> "start"
                    BulkAction.STOP -> "stop"
                    BulkAction.RESTART -> "restart"
                }
                
                Text("Are you sure you want to $actionText $containerCount containers?")
            }
            
            // Action buttons
            Div({
                style {
                    display(DisplayStyle.Flex)
                    justifyContent(JustifyContent.FlexEnd)
                    gap(16.px)
                }
            }) {
                Button({
                    style {
                        padding(8.px, 16.px)
                        backgroundColor(Color("#f5f5f5"))
                        border("1px", "solid", "#ccc")
                        borderRadius(4.px)
                        cursor("pointer")
                    }
                    onClick { onCancel() }
                }) {
                    Text("Cancel")
                }
                
                Button({
                    style {
                        padding(8.px, 16.px)
                        backgroundColor(
                            when (action) {
                                BulkAction.START -> Color("#4caf50")
                                BulkAction.STOP -> Color("#f44336")
                                BulkAction.RESTART -> Color("#2196f3")
                            }
                        )
                        color(Color.white)
                        border("0", "none", "transparent")
                        borderRadius(4.px)
                        cursor("pointer")
                    }
                    onClick { onConfirm() }
                }) {
                    Text("Confirm")
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

// ContainerRow implementation moved to ContainerRow.kt

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

// formatTimestamp function moved to ContainerRow.kt