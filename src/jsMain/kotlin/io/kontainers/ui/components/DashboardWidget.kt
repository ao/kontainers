package io.kontainers.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlinx.serialization.Serializable
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*

/**
 * Enum representing different types of dashboard widgets.
 */
enum class WidgetType {
    CONTAINER_STATUS,
    RECENT_CONTAINERS,
    SYSTEM_INFO,
    QUICK_ACTIONS,
    PROXY_STATUS,
    SYSTEM_METRICS,
    ERROR_RATE,
    CUSTOM
}

/**
 * Data class representing a dashboard widget configuration.
 */
@Serializable
data class WidgetConfig(
    val id: String,
    val type: WidgetType,
    val title: String,
    val width: Int = 1,
    val height: Int = 1,
    val position: Int = -1,
    val customData: Map<String, String> = emptyMap()
)

/**
 * Dashboard widget component.
 * This component renders a widget based on its configuration.
 */
@Composable
fun DashboardWidget(
    config: WidgetConfig,
    onRemove: (String) -> Unit,
    onEdit: (WidgetConfig) -> Unit,
    content: @Composable () -> Unit
) {
    var isMenuOpen by remember { mutableStateOf(false) }
    
    Div({
        style {
            backgroundColor(Color.white)
            property("border-radius", "8px")
            property("box-shadow", "0 2px 4px rgba(0,0,0,0.1)")
            property("overflow", "hidden")
            width(300.px)
            minHeight(200.px)
            position(Position.Relative)
            flexGrow(1)
            flexShrink(0)
            flexBasis(300.px)
            maxWidth(450.px)
        }
        attr("data-widget-id", config.id)
    }) {
        // Widget header
        Div({
            style {
                padding(16.px)
                property("border-bottom", "1px solid #e0e0e0")
                backgroundColor(Color("#f5f5f5"))
                display(DisplayStyle.Flex)
                justifyContent(JustifyContent.SpaceBetween)
                alignItems(AlignItems.Center)
            }
        }) {
            H3({
                style {
                    margin(0.px)
                    fontSize(18.px)
                }
            }) {
                Text(config.title)
            }
            
            // Widget actions
            Div({
                style {
                    display(DisplayStyle.Flex)
                    property("gap", "8px")
                    position(Position.Relative)
                }
            }) {
                // Menu button
                Button({
                    style {
                        padding(4.px, 8.px)
                        backgroundColor(Color("transparent"))
                        property("border", "0px none transparent")
                        property("cursor", "pointer")
                        fontSize(16.px)
                    }
                    onClick { isMenuOpen = !isMenuOpen }
                }) {
                    Text("⋮")
                }
                
                // Menu dropdown
                if (isMenuOpen) {
                    Div({
                        style {
                            position(Position.Absolute)
                            top(100.percent)
                            right(0.px)
                            backgroundColor(Color.white)
                            property("border-radius", "4px")
                            property("box-shadow", "0 2px 8px rgba(0,0,0,0.1)")
                            property("z-index", "10")
                            width(150.px)
                        }
                        onClick { event -> event.stopPropagation() }
                    }) {
                        Div({
                            style {
                                padding(8.px, 16.px)
                                property("cursor", "pointer")
                            }
                            onClick { 
                                onEdit(config)
                                isMenuOpen = false
                            }
                        }) {
                            Text("Edit")
                        }
                        
                        Div({
                            style {
                                padding(8.px, 16.px)
                                property("cursor", "pointer")
                            }
                            onClick { 
                                onRemove(config.id)
                                isMenuOpen = false
                            }
                        }) {
                            Text("Remove")
                        }
                    }
                }
            }
        }
        
        // Widget content
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
 * Widget editor dialog component.
 */
@Composable
fun WidgetEditorDialog(
    widget: WidgetConfig?,
    onSave: (WidgetConfig) -> Unit,
    onCancel: () -> Unit
) {
    if (widget == null) return
    
    var title by remember { mutableStateOf(widget.title) }
    var width by remember { mutableStateOf(widget.width) }
    var height by remember { mutableStateOf(widget.height) }
    
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
            property("z-index", "1000")
        }
    }) {
        // Modal dialog
        Div({
            style {
                backgroundColor(Color.white)
                property("border-radius", "8px")
                padding(24.px)
                width(400.px)
                maxWidth(90.percent)
            }
            onClick { event -> event.stopPropagation() }
        }) {
            H2({
                style {
                    margin(0.px)
                    marginBottom(16.px)
                }
            }) {
                Text("Edit Widget")
            }
            
            // Action buttons
            Div({
                style {
                    display(DisplayStyle.Flex)
                    justifyContent(JustifyContent.FlexEnd)
                    property("gap", "16px")
                }
            }) {
                Button({
                    style {
                        padding(8.px, 16.px)
                        backgroundColor(Color("#f5f5f5"))
                        property("border", "1px solid #ccc")
                        property("border-radius", "4px")
                        property("cursor", "pointer")
                    }
                    onClick { onCancel() }
                }) {
                    Text("Cancel")
                }
                
                Button({
                    style {
                        padding(8.px, 16.px)
                        backgroundColor(Color("#1976d2"))
                        color(Color.white)
                        property("border", "0px none transparent")
                        property("border-radius", "4px")
                        property("cursor", "pointer")
                    }
                    onClick { 
                        onSave(widget.copy(
                            title = title,
                            width = width,
                            height = height
                        ))
                    }
                }) {
                    Text("Save")
                }
            }
        }
    }
}

/**
 * Add widget button component.
 */
@Composable
fun AddWidgetButton(onClick: () -> Unit) {
    Button({
        style {
            padding(16.px)
            backgroundColor(Color("#f5f5f5"))
            property("border", "2px dashed #ccc")
            property("border-radius", "8px")
            property("cursor", "pointer")
            display(DisplayStyle.Flex)
            flexDirection(FlexDirection.Column)
            justifyContent(JustifyContent.Center)
            alignItems(AlignItems.Center)
            property("gap", "8px")
            width(100.percent)
            height(100.percent)
            property("box-sizing", "border-box")
        }
        onClick { onClick() }
    }) {
        Div({
            style {
                fontSize(24.px)
                property("font-weight", "bold")
            }
        }) {
            Text("+")
        }
        Div {
            Text("Add Widget")
        }
    }
}

/**
 * Add widget dialog component.
 */
@Composable
fun AddWidgetDialog(
    onAdd: (WidgetConfig) -> Unit,
    onCancel: () -> Unit
) {
    var selectedType by remember { mutableStateOf(WidgetType.CONTAINER_STATUS) }
    var title by remember { mutableStateOf("") }
    var width by remember { mutableStateOf(1) }
    var height by remember { mutableStateOf(1) }
    
    // Update title based on selected type
    fun updateTitleBasedOnType() {
        title = when (selectedType) {
            WidgetType.CONTAINER_STATUS -> "Container Status"
            WidgetType.RECENT_CONTAINERS -> "Recent Containers"
            WidgetType.SYSTEM_INFO -> "System Info"
            WidgetType.QUICK_ACTIONS -> "Quick Actions"
            WidgetType.PROXY_STATUS -> "Proxy Status"
            WidgetType.SYSTEM_METRICS -> "System Metrics"
            WidgetType.ERROR_RATE -> "Error Rate"
            WidgetType.CUSTOM -> "Custom Widget"
        }
    }
    
    // Initialize title
    remember { updateTitleBasedOnType() }
    
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
            property("z-index", "1000")
        }
    }) {
        // Modal dialog
        Div({
            style {
                backgroundColor(Color.white)
                property("border-radius", "8px")
                padding(24.px)
                width(400.px)
                maxWidth(90.percent)
            }
            onClick { event -> event.stopPropagation() }
        }) {
            H2({
                style {
                    margin(0.px)
                    marginBottom(16.px)
                }
            }) {
                Text("Add Widget")
            }
            
            // Action buttons
            Div({
                style {
                    display(DisplayStyle.Flex)
                    justifyContent(JustifyContent.FlexEnd)
                    property("gap", "16px")
                }
            }) {
                Button({
                    style {
                        padding(8.px, 16.px)
                        backgroundColor(Color("#f5f5f5"))
                        property("border", "1px solid #ccc")
                        property("border-radius", "4px")
                        property("cursor", "pointer")
                    }
                    onClick { onCancel() }
                }) {
                    Text("Cancel")
                }
                
                Button({
                    style {
                        padding(8.px, 16.px)
                        backgroundColor(Color("#1976d2"))
                        color(Color.white)
                        property("border", "0px none transparent")
                        property("border-radius", "4px")
                        property("cursor", "pointer")
                    }
                    onClick {
                        val timestamp = js("Date.now()")
                        onAdd(WidgetConfig(
                            id = "widget-$timestamp",
                            type = selectedType,
                            title = title,
                            width = width,
                            height = height
                        ))
                    }
                }) {
                    Text("Add")
                }
            }
        }
    }
}

// Helper function to capitalize strings
private fun String.capitalize(): String {
    return this.lowercase().replaceFirstChar { it.uppercase() }
}