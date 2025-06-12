package io.kontainers.ui.components

import androidx.compose.runtime.Composable
import io.kontainers.model.ProxyRule
import io.kontainers.ui.util.*
import org.jetbrains.compose.web.attributes.InputType
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*

/**
 * Component for displaying a single proxy rule row.
 */
@Composable
fun ProxyRuleRow(
    rule: ProxyRule,
    isSelected: Boolean,
    onToggleSelect: () -> Unit,
    onEditClick: () -> Unit,
    onDeleteClick: () -> Unit,
    onToggleClick: (Boolean) -> Unit
) {
    Div({
        style {
            display(DisplayStyle.Grid)
            gridTemplateColumns("auto 2fr 1fr 1fr 1fr 1fr 1fr")
            padding(12.px)
            borderBottom("1px", "solid", "#e0e0e0")
            backgroundColor(if (isSelected) Color("#e3f2fd") else Color.white)
            hover {
                backgroundColor(if (isSelected) Color("#bbdefb") else Color("#f5f5f5"))
            }
        }
    }) {
        // Checkbox for selecting rule
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