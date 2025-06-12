package io.kontainers.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import io.kontainers.model.ProxyRule
import io.kontainers.ui.util.*
import kotlinx.browser.window
import kotlinx.coroutines.delay
import org.jetbrains.compose.web.attributes.InputType
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
    var selectedRules by remember { mutableStateOf<Set<String>>(emptySet()) }
    var showBulkActionConfirmation by remember { mutableStateOf(false) }
    var bulkAction by remember { mutableStateOf<ProxyBulkAction?>(null) }
    var visibleRules by remember { mutableStateOf<List<ProxyRule>>(emptyList()) }
    var currentPage by remember { mutableStateOf(1) }
    var isLoading by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }
    
    // Pagination settings
    val pageSize = 10
    val totalPages = (rules.size + pageSize - 1) / pageSize
    
    // Filter rules based on search query
    val filteredRules = remember(rules, searchQuery) {
        if (searchQuery.isBlank()) {
            rules
        } else {
            rules.filter { rule ->
                rule.name.contains(searchQuery, ignoreCase = true) ||
                rule.sourceHost.contains(searchQuery, ignoreCase = true) ||
                rule.targetContainer.contains(searchQuery, ignoreCase = true)
            }
        }
    }
    
    // Update visible rules when page changes or filtered rules change
    LaunchedEffect(currentPage, filteredRules) {
        isLoading = true
        
        // Simulate network delay for demonstration purposes
        delay(300)
        
        val startIndex = (currentPage - 1) * pageSize
        visibleRules = filteredRules
            .drop(startIndex)
            .take(pageSize)
        
        isLoading = false
    }
    
    // Toggle rule selection
    fun toggleRuleSelection(ruleId: String) {
        selectedRules = if (selectedRules.contains(ruleId)) {
            selectedRules - ruleId
        } else {
            selectedRules + ruleId
        }
    }
    
    // Toggle all rules selection
    fun toggleAllRules() {
        selectedRules = if (selectedRules.size == rules.size) {
            emptySet()
        } else {
            rules.map { it.id }.toSet()
        }
    }
    
    // Execute bulk action
    fun executeBulkAction() {
        val selectedRulesList = rules.filter { selectedRules.contains(it.id) }
        when (bulkAction) {
            ProxyBulkAction.ENABLE -> selectedRulesList.forEach { onToggleClick(it, true) }
            ProxyBulkAction.DISABLE -> selectedRulesList.forEach { onToggleClick(it, false) }
            ProxyBulkAction.DELETE -> selectedRulesList.forEach { onDeleteClick(it) }
            null -> {}
        }
        showBulkActionConfirmation = false
        bulkAction = null
    }
    
    // Show confirmation dialog for bulk action
    fun confirmBulkAction(action: ProxyBulkAction) {
        bulkAction = action
        showBulkActionConfirmation = true
    }
    
    if (filteredRules.isEmpty()) {
        if (searchQuery.isNotBlank()) {
            EmptyStateProxy("No matching rules found", "Try a different search term")
        } else {
            EmptyStateProxy("No proxy rules found", "Create a new rule to get started")
        }
    } else {
        Div({
            style {
                display(DisplayStyle.Flex)
                flexDirection(FlexDirection.Column)
                gap(16.px)
            }
        }) {
            // Search bar
            Div({
                style {
                    marginBottom(16.px)
                }
            }) {
                Input(InputType.Text) {
                    style {
                        padding(8.px)
                        width(100.percent)
                        maxWidth(400.px)
                        borderRadius(4.px)
                        border(1.px, LineStyle.Solid, Color("#ccc"))
                    }
                    placeholder("Search rules...")
                    value(searchQuery)
                    onInput { searchQuery = it.value }
                }
            }
            
            // Bulk action buttons (only visible when rules are selected)
            if (selectedRules.isNotEmpty()) {
                Div({
                    style {
                        display(DisplayStyle.Flex)
                        gap(8.px)
                        alignItems(AlignItems.Center)
                        marginBottom(16.px)
                        padding(8.px)
                        backgroundColor(Color("#e3f2fd"))
                        borderRadius(4.px)
                    }
                }) {
                    Text("${selectedRules.size} rules selected: ")
                    
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
                        onClick { confirmBulkAction(ProxyBulkAction.ENABLE) }
                    }) {
                        Text("Enable All")
                    }
                    
                    Button({
                        style {
                            padding(6.px, 12.px)
                            borderRadius(4.px)
                            border("0", "none", "transparent")
                            backgroundColor(Color("#ff9800"))
                            color(Color.white)
                            cursor("pointer")
                            fontSize(14.px)
                        }
                        onClick { confirmBulkAction(ProxyBulkAction.DISABLE) }
                    }) {
                        Text("Disable All")
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
                        onClick { confirmBulkAction(ProxyBulkAction.DELETE) }
                    }) {
                        Text("Delete All")
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
                        onClick { selectedRules = emptySet() }
                    }) {
                        Text("Clear Selection")
                    }
                }
            }
            
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
                // Checkbox for selecting all rules
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
                        checked(selectedRules.size == rules.size && rules.isNotEmpty())
                        onChange { toggleAllRules() }
                    }
                }
                
                Div { Text("Name") }
                Div { Text("Source") }
                Div { Text("Target") }
                Div { Text("Protocol") }
                Div { Text("Status") }
                Div { Text("Actions") }
            }
            
            // Loading indicator
            if (isLoading) {
                Div({
                    style {
                        padding(16.px)
                        textAlign("center")
                    }
                }) {
                    LoadingIndicator()
                }
            } else {
                // Rule rows
                visibleRules.forEach { rule ->
                    ProxyRuleRow(
                        rule = rule,
                        isSelected = selectedRules.contains(rule.id),
                        onToggleSelect = { toggleRuleSelection(rule.id) },
                        onEditClick = { onEditClick(rule) },
                        onDeleteClick = { onDeleteClick(rule) },
                        onToggleClick = { enabled -> onToggleClick(rule, enabled) }
                    )
                }
                
                // Pagination controls
                if (totalPages > 1) {
                    Div({
                        style {
                            display(DisplayStyle.Flex)
                            justifyContent(JustifyContent.Center)
                            alignItems(AlignItems.Center)
                            gap(8.px)
                            marginTop(16.px)
                        }
                    }) {
                        // Previous page button
                        Button({
                            style {
                                padding(6.px, 12.px)
                                borderRadius(4.px)
                                border(1.px, LineStyle.Solid, Color("#ccc"))
                                backgroundColor(Color.white)
                                cursor(if (currentPage > 1) "pointer" else "not-allowed")
                                opacity(if (currentPage > 1) 1 else 0.5)
                            }
                            disabled(currentPage <= 1)
                            onClick { if (currentPage > 1) currentPage-- }
                        }) {
                            Text("Previous")
                        }
                        
                        // Page indicator
                        Span({
                            style {
                                padding(6.px, 12.px)
                            }
                        }) {
                            Text("Page $currentPage of $totalPages")
                        }
                        
                        // Next page button
                        Button({
                            style {
                                padding(6.px, 12.px)
                                borderRadius(4.px)
                                border(1.px, LineStyle.Solid, Color("#ccc"))
                                backgroundColor(Color.white)
                                cursor(if (currentPage < totalPages) "pointer" else "not-allowed")
                                opacity(if (currentPage < totalPages) 1 else 0.5)
                            }
                            disabled(currentPage >= totalPages)
                            onClick { if (currentPage < totalPages) currentPage++ }
                        }) {
                            Text("Next")
                        }
                    }
                }
            }
        }
        
        // Confirmation dialog for bulk actions
        if (showBulkActionConfirmation && bulkAction != null) {
            ProxyBulkActionConfirmationDialog(
                action = bulkAction!!,
                ruleCount = selectedRules.size,
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
 * Enum representing bulk actions for proxy rules.
 */
enum class ProxyBulkAction {
    ENABLE,
    DISABLE,
    DELETE
}

/**
 * Bulk action confirmation dialog component.
 */
@Composable
fun ProxyBulkActionConfirmationDialog(
    action: ProxyBulkAction,
    ruleCount: Int,
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
                    ProxyBulkAction.ENABLE -> "enable"
                    ProxyBulkAction.DISABLE -> "disable"
                    ProxyBulkAction.DELETE -> "delete"
                }
                
                Text("Are you sure you want to $actionText $ruleCount proxy rules?")
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
                                ProxyBulkAction.ENABLE -> Color("#4caf50")
                                ProxyBulkAction.DISABLE -> Color("#ff9800")
                                ProxyBulkAction.DELETE -> Color("#f44336")
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

// ProxyRuleRow implementation moved to ProxyRuleRow.kt

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