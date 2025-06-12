package io.kontainers.ui.components

import androidx.compose.runtime.Composable
import io.kontainers.model.Container
import io.kontainers.model.ContainerState
import io.kontainers.ui.util.*
import org.jetbrains.compose.web.attributes.InputType
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*

/**
 * Container row component.
 */
@Composable
fun ContainerRow(
    container: Container,
    isSelected: Boolean,
    onToggleSelect: () -> Unit,
    onClick: () -> Unit,
    onStartClick: () -> Unit,
    onStopClick: () -> Unit,
    onRestartClick: () -> Unit
) {
    Div({
        style {
            display(DisplayStyle.Grid)
            gridTemplateColumns("auto 2fr 1fr 1fr 1fr 1fr 1fr")
            padding(12.px)
            borderBottom("1px", "solid", "#e0e0e0")
            cursor("pointer")
            backgroundColor(if (isSelected) Color("#e3f2fd") else Color.white)
            hover {
                backgroundColor(if (isSelected) Color("#bbdefb") else Color("#f5f5f5"))
            }
        }
    }) {
        // Checkbox for selecting container
        Div({
            style {
                display(DisplayStyle.Flex)
                alignItems(AlignItems.Center)
                justifyContent(JustifyContent.Center)
            }
            onClick { 
                onToggleSelect()
                it.stopPropagation()
            }
        }) {
            Input(InputType.Checkbox) {
                style {
                    cursor("pointer")
                    width(18.px)
                    height(18.px)
                }
                checked(isSelected)
                onChange { onToggleSelect() }
            }
        }
        
        // Name
        Div({
            style {
                fontWeight("500")
            }
            onClick { onClick() }
        }) {
            Text(container.name)
        }
        
        // Image
        Div({
            onClick { onClick() }
        }) {
            Text(container.image.split(":").first())
        }
        
        // Status
        Div({
            onClick { onClick() }
        }) {
            ContainerStatusBadge(container.state)
        }
        
        // Created
        Div({
            onClick { onClick() }
        }) {
            Text(formatTimestamp(container.created))
        }
        
        // Ports
        Div({
            onClick { onClick() }
        }) {
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
 * Format a Unix timestamp to a human-readable date.
 */
fun formatTimestamp(timestamp: Long): String {
    // In a real implementation, this would use proper date formatting
    // For now, just return a simplified string
    return "Timestamp: $timestamp"
}