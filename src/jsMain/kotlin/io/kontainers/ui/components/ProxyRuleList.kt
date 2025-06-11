package io.kontainers.ui.components

import androidx.compose.runtime.Composable
import io.kontainers.model.ProxyRule
import io.kontainers.ui.util.*
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*

/**
 * Component for displaying a list of proxy rules.
 */
@Composable
fun ProxyRuleList(
    rules: List<ProxyRule>,
    onEditClick: (ProxyRule) -> Unit,
    onDeleteClick: (ProxyRule) -> Unit,
    onToggleClick: (ProxyRule, Boolean) -> Unit
) {
    if (rules.isEmpty()) {
        EmptyStateProxy("No proxy rules found", "Create a new rule to get started")
    } else {
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
                Div { Text("Source") }
                Div { Text("Target") }
                Div { Text("Protocol") }
                Div { Text("Status") }
                Div { Text("Actions") }
            }
            
            // Rule rows
            rules.forEach { rule ->
                ProxyRuleRow(
                    rule = rule,
                    onEditClick = { onEditClick(rule) },
                    onDeleteClick = { onDeleteClick(rule) },
                    onToggleClick = { enabled -> onToggleClick(rule, enabled) }
                )
            }
        }
    }
}

/**
 * Component for displaying a single proxy rule row.
 */
@Composable
fun ProxyRuleRow(
    rule: ProxyRule,
    onEditClick: () -> Unit,
    onDeleteClick: () -> Unit,
    onToggleClick: (Boolean) -> Unit
) {
    Div({
        style {
            display(DisplayStyle.Grid)
            gridTemplateColumns("2fr 1fr 1fr 1fr 1fr 1fr")
            padding(12.px)
            borderBottom("1px", "solid", "#e0e0e0")
        }
    }) {
        // Name
        Div({
            style {
                fontWeight("500")
            }
        }) {
            Text(rule.name)
        }
        
        // Source
        Div {
            Text("${rule.sourceHost}${rule.sourcePath}")
        }
        
        // Target
        Div {
            Text("${rule.targetContainer}:${rule.targetPort}")
        }
        
        // Protocol
        Div {
            ProxyProtocolBadge(rule.protocol.name, rule.sslEnabled)
        }
        
        // Status
        Div {
            StatusToggle(rule.enabled) { enabled ->
                onToggleClick(enabled)
            }
        }
        
        // Actions
        Div({
            style {
                display(DisplayStyle.Flex)
                gap(8.px)
            }
        }) {
            // Edit button
            Button({
                style {
                    padding(6.px, 12.px)
                    borderRadius(4.px)
                    border("0", "none", "transparent")
                    backgroundColor(Color("#1976d2"))
                    color(Color.white)
                    cursor("pointer")
                    fontSize(14.px)
                }
                onClick { onEditClick() }
            }) {
                Text("Edit")
            }
            
            // Delete button
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
                onClick { onDeleteClick() }
            }) {
                Text("Delete")
            }
        }
    }
}

/**
 * Component for displaying a proxy protocol badge.
 */
@Composable
fun ProxyProtocolBadge(protocol: String, ssl: Boolean) {
    val (backgroundColor, textColor) = when {
        ssl -> Color("#4caf50") to Color.white
        protocol == "HTTP" -> Color("#2196f3") to Color.white
        protocol == "TCP" -> Color("#ff9800") to Color.white
        else -> Color("#9e9e9e") to Color.white
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
        Text(if (ssl) "HTTPS" else protocol)
    }
}

/**
 * Component for toggling a proxy rule's enabled state.
 */
@Composable
fun StatusToggle(enabled: Boolean, onToggle: (Boolean) -> Unit) {
    Div({
        style {
            display(DisplayStyle.Flex)
            alignItems(AlignItems.Center)
            gap(8.px)
        }
    }) {
        // Toggle switch
        Div({
            style {
                width(40.px)
                height(20.px)
                backgroundColor(if (enabled) Color("#4caf50") else Color("#9e9e9e"))
                borderRadius(10.px)
                position(Position.Relative)
                cursor("pointer")
                property("transition", "background-color 0.3s")
            }
            onClick { onToggle(!enabled) }
        }) {
            Div({
                style {
                    width(16.px)
                    height(16.px)
                    backgroundColor(Color.white)
                    borderRadius(8.px)
                    position(Position.Absolute)
                    top(2.px)
                    left(if (enabled) 22.px else 2.px)
                    property("transition", "left 0.3s")
                }
            }) {}
        }
        
        // Status text
        Span({
            style {
                fontSize(14.px)
                color(if (enabled) Color("#4caf50") else Color("#9e9e9e"))
            }
        }) {
            Text(if (enabled) "Active" else "Inactive")
        }
    }
}

/**
 * Component for displaying an empty state.
 */
@Composable
fun EmptyStateProxy(title: String, message: String) {
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