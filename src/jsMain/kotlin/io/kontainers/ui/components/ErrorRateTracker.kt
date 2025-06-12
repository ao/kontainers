package io.kontainers.ui.components

import androidx.compose.runtime.Composable
import io.kontainers.model.*
import io.kontainers.state.AppStateManager
import kotlinx.coroutines.launch
import kotlinx.datetime.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.css.Color
import org.jetbrains.compose.web.dom.*
import io.kontainers.api.KontainersApiClient
import io.kontainers.ui.util.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.onEach
import org.jetbrains.compose.web.attributes.InputType
import org.w3c.dom.HTMLInputElement
import org.w3c.dom.HTMLSelectElement

/**
 * Component for tracking and alerting on error rates.
 */
class ErrorRateTracker(
    private val apiClient: KontainersApiClient,
    private val coroutineScope: CoroutineScope
) {
    private var isStreamingAlerts = false
    private var showCreateAlertForm = false
    private var editingAlertConfig: ErrorAlertConfig? = null
    
    /**
     * Renders the error rate tracker component.
     */
    @Composable
    fun render(rule: ProxyRule) {
        val errors = AppStateManager.state.value.proxyErrors[rule.id] ?: emptyList()
        val errorSummary = AppStateManager.state.value.proxyErrorSummaries[rule.id]
        val alertConfigs = AppStateManager.state.value.alertConfigs.filter { it.ruleId == null || it.ruleId == rule.id }
        val activeAlerts = AppStateManager.state.value.activeAlerts.filter { it.ruleId == rule.id }
        
        Div(attrs = {
            classes("error-rate-tracker")
            style {
                display(DisplayStyle.Flex)
                flexDirection(FlexDirection.Column)
                gap(16.px)
                padding(16.px)
                backgroundColor(Color("#f5f5f5"))
                borderRadius(8.px)
                boxShadow("0 2px 4px rgba(0, 0, 0, 0.1)")
            }
        }) {
            H2 {
                Text("Error Rate Tracker")
            }
            
            // Controls
            Div(attrs = {
                classes("error-tracker-controls")
                style {
                    display(DisplayStyle.Flex)
                    justifyContent(JustifyContent.SpaceBetween)
                    alignItems(AlignItems.Center)
                    marginBottom(16.px)
                }
            }) {
                // Refresh and stream buttons
                Div(attrs = {
                    style {
                        display(DisplayStyle.Flex)
                        gap(8.px)
                    }
                }) {
                    Button(attrs = {
                        onClick {
                            loadErrorData(rule.id)
                        }
                    }) {
                        Text("Refresh")
                    }
                    
                    Button(attrs = {
                        onClick {
                            toggleAlertStreaming()
                        }
                        style {
                            backgroundColor(if (isStreamingAlerts) Color("#f44336") else Color("#4caf50"))
                        }
                    }) {
                        Text(if (isStreamingAlerts) "Stop Streaming" else "Start Streaming")
                    }
                    
                    Button(attrs = {
                        onClick {
                            showCreateAlertForm = !showCreateAlertForm
                            editingAlertConfig = null
                        }
                        style {
                            backgroundColor(Color("#1976d2"))
                        }
                    }) {
                        Text(if (showCreateAlertForm) "Cancel" else "Create Alert")
                    }
                }
                
                // Error count
                Span(attrs = {
                    style {
                        fontSize(14.px)
                        color(Color("#666"))
                    }
                }) {
                    Text("${errors.size} errors")
                }
            }
            
            // Alert form
            if (showCreateAlertForm) {
                renderAlertForm(rule.id)
            }
            
            // Error summary
            if (errorSummary != null) {
                renderErrorSummary(errorSummary)
            }
            
            // Active alerts
            if (activeAlerts.isNotEmpty()) {
                H3 {
                    Text("Active Alerts")
                }
                
                Div(attrs = {
                    classes("active-alerts")
                    style {
                        display(DisplayStyle.Flex)
                        flexDirection(FlexDirection.Column)
                        gap(8.px)
                        marginBottom(16.px)
                    }
                }) {
                    activeAlerts.forEach { alert ->
                        renderAlertCard(alert)
                    }
                }
            }
            
            // Alert configurations
            if (alertConfigs.isNotEmpty()) {
                H3 {
                    Text("Alert Configurations")
                }
                
                Table(attrs = {
                    classes("alert-configs-table")
                    style {
                        width(100.percent)
                        borderCollapse("collapse")
                        fontSize(14.px)
                        marginBottom(16.px)
                    }
                }) {
                    Thead {
                        Tr {
                            Th { Text("Name") }
                            Th { Text("Type") }
                            Th { Text("Threshold") }
                            Th { Text("Status") }
                            Th { Text("Actions") }
                        }
                    }
                    Tbody {
                        alertConfigs.forEach { config ->
                            Tr {
                                Td { Text(config.name) }
                                Td { 
                                    Text(
                                        when {
                                            config.errorType != null -> config.errorType.toString()
                                            config.statusCode != null -> "Status ${config.statusCode}"
                                            else -> "Any Error"
                                        }
                                    ) 
                                }
                                Td { Text("${String.format("%.1f", config.threshold * 100)}%") }
                                Td { 
                                    Span(attrs = {
                                        style {
                                            display(DisplayStyle.InlineBlock)
                                            padding(2.px, 6.px)
                                            borderRadius(4.px)
                                            fontSize(12.px)
                                            fontWeight("bold")
                                            color(Color("white"))
                                            backgroundColor(if (config.enabled) Color("#4caf50") else Color("#9e9e9e"))
                                        }
                                    }) {
                                        Text(if (config.enabled) "Enabled" else "Disabled")
                                    }
                                }
                                Td {
                                    Div(attrs = {
                                        style {
                                            display(DisplayStyle.Flex)
                                            gap(8.px)
                                        }
                                    }) {
                                        Button(attrs = {
                                            onClick {
                                                editingAlertConfig = config
                                                showCreateAlertForm = true
                                            }
                                            style {
                                                padding(4.px, 8.px)
                                                fontSize(12.px)
                                            }
                                        }) {
                                            Text("Edit")
                                        }
                                        
                                        Button(attrs = {
                                            onClick {
                                                deleteAlertConfig(config.id)
                                            }
                                            style {
                                                padding(4.px, 8.px)
                                                fontSize(12.px)
                                                backgroundColor(Color("#f44336"))
                                            }
                                        }) {
                                            Text("Delete")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            // Error list
            H3 {
                Text("Recent Errors")
            }
            
            if (errors.isNotEmpty()) {
                Table(attrs = {
                    classes("errors-table")
                    style {
                        width(100.percent)
                        borderCollapse("collapse")
                        fontSize(14.px)
                    }
                }) {
                    Thead {
                        Tr {
                            Th(attrs = { style { width(160.px) } }) { Text("Time") }
                            Th { Text("Type") }
                            Th(attrs = { style { width(80.px) } }) { Text("Status") }
                            Th { Text("Message") }
                            Th(attrs = { style { width(100.px) } }) { Text("Client IP") }
                            Th(attrs = { style { width(80.px) } }) { Text("Resolved") }
                        }
                    }
                    Tbody {
                        errors.forEach { error ->
                            Tr(attrs = {
                                style {
                                    backgroundColor(if (error.resolved) Color("#e8f5e9") else Color.transparent)
                                }
                            }) {
                                // Timestamp
                                Td {
                                    val dateTime = Instant.fromEpochMilliseconds(error.timestamp)
                                        .toLocalDateTime(TimeZone.currentSystemDefault())
                                    Text("${dateTime.date} ${dateTime.time}")
                                }
                                
                                // Error type
                                Td {
                                    Span(attrs = {
                                        style {
                                            display(DisplayStyle.InlineBlock)
                                            padding(2.px, 6.px)
                                            borderRadius(4.px)
                                            fontSize(12.px)
                                            fontWeight("bold")
                                            color(Color("white"))
                                            backgroundColor(getErrorTypeColor(error.errorType))
                                        }
                                    }) {
                                        Text(error.errorType.toString())
                                    }
                                }
                                
                                // Status code
                                Td {
                                    if (error.statusCode != null) {
                                        Text("${error.statusCode}")
                                    } else {
                                        Text("-")
                                    }
                                }
                                
                                // Message
                                Td(attrs = {
                                    style {
                                        maxWidth(300.px)
                                        overflow("hidden")
                                        textOverflow("ellipsis")
                                        whiteSpace("nowrap")
                                    }
                                }) {
                                    Text(error.message)
                                }
                                
                                // Client IP
                                Td {
                                    Text(error.clientIp ?: "-")
                                }
                                
                                // Resolved status
                                Td {
                                    if (error.resolved) {
                                        I(attrs = {
                                            classes("mdi", "mdi-check")
                                            style {
                                                color(Color("#4caf50"))
                                                fontSize(18.px)
                                            }
                                        })
                                    } else {
                                        Button(attrs = {
                                            onClick {
                                                markErrorResolved(error.id)
                                            }
                                            style {
                                                padding(2.px, 6.px)
                                                fontSize(12.px)
                                            }
                                        }) {
                                            Text("Resolve")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                Div(attrs = {
                    style {
                        padding(32.px)
                        textAlign("center")
                        color(Color("#666"))
                    }
                }) {
                    Text("No errors recorded. That's good news!")
                }
            }
        }
    }
    
    /**
     * Renders the error summary.
     */
    @Composable
    private fun ElementScope<*>.renderErrorSummary(summary: ProxyErrorSummary) {
        Div(attrs = {
            classes("error-summary")
            style {
                display(DisplayStyle.Grid)
                gridTemplateColumns("repeat(auto-fit, minmax(200px, 1fr))")
                gap(16.px)
                marginBottom(16.px)
            }
        }) {
            // Summary cards
            renderSummaryCard("Total Errors", summary.totalErrors.toString(), "mdi-alert-circle-outline")
            renderSummaryCard("Error Rate", "${String.format("%.2f", summary.errorRate * 100)}%", "mdi-chart-line")
            
            // Error type distribution
            Div(attrs = {
                style {
                    gridColumn("1 / -1")
                    backgroundColor(Color("white"))
                    padding(16.px)
                    borderRadius(8.px)
                    boxShadow("0 1px 3px rgba(0, 0, 0, 0.1)")
                }
            }) {
                H4(attrs = {
                    style {
                        margin(0.px)
                        marginBottom(12.px)
                    }
                }) {
                    Text("Error Type Distribution")
                }
                
                Div(attrs = {
                    style {
                        display(DisplayStyle.Flex)
                        flexWrap(FlexWrap.Wrap)
                        gap(8.px)
                    }
                }) {
                    summary.errorsByType.entries.sortedByDescending { it.value }.forEach { (type, count) ->
                        Div(attrs = {
                            style {
                                display(DisplayStyle.Flex)
                                alignItems(AlignItems.Center)
                                gap(8.px)
                                padding(8.px, 12.px)
                                borderRadius(4.px)
                                backgroundColor(Color("#f5f5f5"))
                            }
                        }) {
                            Span(attrs = {
                                style {
                                    display(DisplayStyle.InlineBlock)
                                    width(12.px)
                                    height(12.px)
                                    borderRadius(6.px)
                                    backgroundColor(getErrorTypeColor(type))
                                }
                            })
                            
                            Span(attrs = {
                                style {
                                    fontSize(14.px)
                                }
                            }) {
                                Text("$type")
                            }
                            
                            Span(attrs = {
                                style {
                                    fontSize(14.px)
                                    fontWeight("bold")
                                    marginLeft(8.px)
                                }
                            }) {
                                Text("$count")
                            }
                        }
                    }
                }
            }
        }
    }
    
    /**
     * Renders a summary card.
     */
    @Composable
    private fun ElementScope<*>.renderSummaryCard(title: String, value: String, iconClass: String) {
        Div(attrs = {
            classes("summary-card")
            style {
                backgroundColor(Color("white"))
                padding(16.px)
                borderRadius(8.px)
                boxShadow("0 1px 3px rgba(0, 0, 0, 0.1)")
                display(DisplayStyle.Flex)
                flexDirection(FlexDirection.Column)
                alignItems(AlignItems.Center)
                textAlign("center")
            }
        }) {
            I(attrs = {
                classes("mdi", iconClass)
                style {
                    fontSize(24.px)
                    marginBottom(8.px)
                    color(Color("#f44336"))
                }
            })
            Div(attrs = {
                style {
                    fontSize(12.px)
                    color(Color("#666"))
                    marginBottom(4.px)
                }
            }) {
                Text(title)
            }
            Div(attrs = {
                style {
                    fontSize(20.px)
                    fontWeight("bold")
                }
            }) {
                Text(value)
            }
        }
    }
    
    /**
     * Renders an alert card.
     */
    @Composable
    private fun ElementScope<*>.renderAlertCard(alert: ErrorAlert) {
        Div(attrs = {
            classes("alert-card")
            style {
                backgroundColor(getAlertStatusColor(alert.status))
                padding(16.px)
                borderRadius(8.px)
                boxShadow("0 2px 4px rgba(0, 0, 0, 0.1)")
                color(Color("white"))
            }
        }) {
            // Alert header
            Div(attrs = {
                style {
                    display(DisplayStyle.Flex)
                    justifyContent(JustifyContent.SpaceBetween)
                    alignItems(AlignItems.Center)
                    marginBottom(8.px)
                }
            }) {
                // Alert title and status
                Div(attrs = {
                    style {
                        display(DisplayStyle.Flex)
                        alignItems(AlignItems.Center)
                        gap(8.px)
                    }
                }) {
                    I(attrs = {
                        classes("mdi", "mdi-alert-circle")
                        style {
                            fontSize(20.px)
                        }
                    })
                    
                    H4(attrs = {
                        style {
                            margin(0.px)
                        }
                    }) {
                        Text("Alert: High Error Rate")
                    }
                    
                    Span(attrs = {
                        style {
                            fontSize(12.px)
                            padding(2.px, 6.px)
                            backgroundColor(Color("rgba(255, 255, 255, 0.2)"))
                            borderRadius(10.px)
                        }
                    }) {
                        Text(alert.status.toString())
                    }
                }
                
                // Timestamp
                Span(attrs = {
                    style {
                        fontSize(12.px)
                    }
                }) {
                    val dateTime = Instant.fromEpochMilliseconds(alert.timestamp)
                        .toLocalDateTime(TimeZone.currentSystemDefault())
                    Text("${dateTime.date} ${dateTime.time}")
                }
            }
            
            // Alert message
            P(attrs = {
                style {
                    margin(0.px)
                    marginBottom(12.px)
                }
            }) {
                Text(alert.message)
            }
            
            // Alert actions
            Div(attrs = {
                style {
                    display(DisplayStyle.Flex)
                    gap(8.px)
                    justifyContent(JustifyContent.FlexEnd)
                }
            }) {
                if (alert.status == AlertStatus.ACTIVE) {
                    Button(attrs = {
                        onClick {
                            acknowledgeAlert(alert.id)
                        }
                        style {
                            backgroundColor(Color("rgba(255, 255, 255, 0.2)"))
                            color(Color("white"))
                            border(0.px)
                            padding(6.px, 12.px)
                            borderRadius(4.px)
                            cursor("pointer")
                        }
                    }) {
                        Text("Acknowledge")
                    }
                }
                
                if (alert.status != AlertStatus.RESOLVED) {
                    Button(attrs = {
                        onClick {
                            resolveAlert(alert.id)
                        }
                        style {
                            backgroundColor(Color("rgba(255, 255, 255, 0.2)"))
                            color(Color("white"))
                            border(0.px)
                            padding(6.px, 12.px)
                            borderRadius(4.px)
                            cursor("pointer")
                        }
                    }) {
                        Text("Resolve")
                    }
                }
            }
        }
    }
    
    /**
     * Renders the alert configuration form.
     */
    @Composable
    private fun ElementScope<*>.renderAlertForm(ruleId: String) {
        val isEditing = editingAlertConfig != null
        val config = editingAlertConfig ?: ErrorAlertConfig(
            id = "",
            ruleId = ruleId,
            name = "",
            errorType = null,
            statusCode = null,
            threshold = 0.05,
            timeWindow = 300000, // 5 minutes
            minRequests = 10,
            enabled = true,
            notificationChannels = emptyList()
        )
        
        Div(attrs = {
            classes("alert-form")
            style {
                backgroundColor(Color("white"))
                padding(16.px)
                borderRadius(8.px)
                boxShadow("0 2px 4px rgba(0, 0, 0, 0.1)")
                marginBottom(16.px)
            }
        }) {
            H3 {
                Text(if (isEditing) "Edit Alert Configuration" else "Create Alert Configuration")
            }
            
            Form(attrs = {
                onSubmit { event ->
                    event.preventDefault()
                    saveAlertConfig(config)
                }
                style {
                    display(DisplayStyle.Grid)
                    gridTemplateColumns("1fr 1fr")
                    gap(16.px)
                }
            }) {
                // Alert name
                Div(attrs = {
                    style {
                        gridColumn("1 / 3")
                    }
                }) {
                    Label(attrs = { attr("for", "alert-name") }) {
                        Text("Alert Name")
                    }
                    Input(InputType.Text, attrs = {
                        id("alert-name")
                        value(config.name)
                        attr("placeholder", "Enter alert name")
                        attr("required", "true")
                        style {
                            width(100.percent)
                            padding(8.px)
                            marginTop(4.px)
                            borderRadius(4.px)
                            border(1.px, LineStyle.Solid, Color("#ccc"))
                        }
                        onChange {
                            editingAlertConfig = config.copy(name = it.target.value)
                        }
                    })
                }
                
                // Error type
                Div {
                    Label(attrs = { attr("for", "error-type") }) {
                        Text("Error Type")
                    }
                    Select(attrs = {
                        id("error-type")
                        style {
                            width(100.percent)
                            padding(8.px)
                            marginTop(4.px)
                            borderRadius(4.px)
                            border(1.px, LineStyle.Solid, Color("#ccc"))
                        }
                        onChange {
                            val value = (it.target as HTMLSelectElement).value
                            val errorType = if (value == "ANY") null else ProxyErrorType.valueOf(value)
                            editingAlertConfig = config.copy(errorType = errorType)
                        }
                    }) {
                        Option(value = "ANY", attrs = {
                            if (config.errorType == null) {
                                attr("selected", "true")
                            }
                        }) { Text("Any Error Type") }
                        
                        ProxyErrorType.values().forEach { type ->
                            Option(value = type.toString(), attrs = {
                                if (config.errorType == type) {
                                    attr("selected", "true")
                                }
                            }) { Text(type.toString()) }
                        }
                    }
                }
                
                // Status code
                Div {
                    Label(attrs = { attr("for", "status-code") }) {
                        Text("Status Code")
                    }
                    Input(InputType.Number, attrs = {
                        id("status-code")
                        value(config.statusCode?.toString() ?: "")
                        attr("placeholder", "Any status code")
                        attr("min", "400")
                        attr("max", "599")
                        style {
                            width(100.percent)
                            padding(8.px)
                            marginTop(4.px)
                            borderRadius(4.px)
                            border(1.px, LineStyle.Solid, Color("#ccc"))
                        }
                        onChange {
                            val value = (it.target as HTMLInputElement).value
                            val statusCode = value.toIntOrNull()
                            editingAlertConfig = config.copy(statusCode = statusCode)
                        }
                    })
                }
                
                // Threshold
                Div {
                    Label(attrs = { attr("for", "threshold") }) {
                        Text("Error Rate Threshold (%)")
                    }
                    Input(InputType.Number, attrs = {
                        id("threshold")
                        value((config.threshold * 100).toString())
                        attr("required", "true")
                        attr("min", "0.1")
                        attr("max", "100")
                        attr("step", "0.1")
                        style {
                            width(100.percent)
                            padding(8.px)
                            marginTop(4.px)
                            borderRadius(4.px)
                            border(1.px, LineStyle.Solid, Color("#ccc"))
                        }
                        onChange {
                            val value = (it.target as HTMLInputElement).value.toDoubleOrNull() ?: 5.0
                            editingAlertConfig = config.copy(threshold = value / 100.0)
                        }
                    })
                }
                
                // Time window
                Div {
                    Label(attrs = { attr("for", "time-window") }) {
                        Text("Time Window (seconds)")
                    }
                    Input(InputType.Number, attrs = {
                        id("time-window")
                        value((config.timeWindow / 1000).toString())
                        attr("required", "true")
                        attr("min", "10")
                        style {
                            width(100.percent)
                            padding(8.px)
                            marginTop(4.px)
                            borderRadius(4.px)
                            border(1.px, LineStyle.Solid, Color("#ccc"))
                        }
                        onChange {
                            val value = (it.target as HTMLInputElement).value.toIntOrNull() ?: 300
                            editingAlertConfig = config.copy(timeWindow = value * 1000L)
                        }
                    })
                }
                
                // Minimum requests
                Div {
                    Label(attrs = { attr("for", "min-requests") }) {
                        Text("Minimum Requests")
                    }
                    Input(InputType.Number, attrs = {
                        id("min-requests")
                        value(config.minRequests.toString())
                        attr("required", "true")
                        attr("min", "1")
                        style {
                            width(100.percent)
                            padding(8.px)
                            marginTop(4.px)
                            borderRadius(4.px)
                            border(1.px, LineStyle.Solid, Color("#ccc"))
                        }
                        onChange {
                            val value = (it.target as HTMLInputElement).value.toIntOrNull() ?: 10
                            editingAlertConfig = config.copy(minRequests = value)
                        }
                    })
                }
                
                // Enabled
                Div {
                    Label(attrs = {
                        style {
                            display(DisplayStyle.Flex)
                            alignItems(AlignItems.Center)
                            gap(8.px)
                            cursor("pointer")
                        }
                    }) {
                        Input(InputType.Checkbox, attrs = {
                            id("enabled")
                            if (config.enabled) {
                                attr("checked", "true")
                            }
                            onChange {
                                val checked = (it.target as HTMLInputElement).checked
                                editingAlertConfig = config.copy(enabled = checked)
                            }
                        })
                        Text("Enabled")
                    }
                }
                
                // Form actions
                Div(attrs = {
                    style {
                        gridColumn("1 / 3")
                        display(DisplayStyle.Flex)
                        justifyContent(JustifyContent.FlexEnd)
                        gap(8.px)
                        marginTop(16.px)
                    }
                }) {
                    Button(attrs = {
                        type("button")
                        onClick {
                            showCreateAlertForm = false
                            editingAlertConfig = null
                        }
                    }) {
                        Text("Cancel")
                    }
                    
                    Button(attrs = {
                        type("submit")
                        style {
                            backgroundColor(Color("#1976d2"))
                            color(Color("white"))
                        }
                    }) {
                        Text(if (isEditing) "Update Alert" else "Create Alert")
                    }
                }
            }
        }
    }
    
    /**
     * Loads error data for a proxy rule.
     */
    private fun loadErrorData(ruleId: String) {
        AppStateManager.setLoading(true)
        
        coroutineScope.launch {
            try {
                // Load errors
                val errors = apiClient.getProxyErrors(ruleId)
                AppStateManager.updateProxyErrors(ruleId, errors)
                
                // Load error summary
                val errorSummary = apiClient.getProxyErrorSummary(ruleId)
                AppStateManager.updateProxyErrorSummary(ruleId, errorSummary)
                
                // Load alert configurations
                val alertConfigs = apiClient.getAlertConfigs()
                AppStateManager.updateAlertConfigs(alertConfigs)
                
                // Load active alerts
                val activeAlerts = apiClient.getActiveAlerts()
                AppStateManager.updateActiveAlerts(activeAlerts)
            } catch (e: Exception) {
                console.error("Failed to load error data: ${e.message}")
                AppStateManager.setError("Failed to load error data: ${e.message}")
            } finally {
                AppStateManager.setLoading(false)
            }
        }
    }
    
    /**
     * Toggles alert streaming.
     */
    private fun toggleAlertStreaming() {
        isStreamingAlerts = !isStreamingAlerts
        
        if (isStreamingAlerts) {
            coroutineScope.launch {
                try {
                    apiClient.streamAlerts().onEach { alert ->
                        val currentAlerts = AppStateManager.state.value.activeAlerts
                        val updatedAlerts = currentAlerts.filter { it.id != alert.id } + alert
                        AppStateManager.updateActiveAlerts(updatedAlerts)
                    }.collect()
                } catch (e: Exception) {
                    console.error("Alert streaming error: ${e.message}")
                    isStreamingAlerts = false
                }
            }
        }
    }
    
    /**
     * Saves an alert configuration.
     */
    private fun saveAlertConfig(config: ErrorAlertConfig) {
        AppStateManager.setLoading(true)
        
        coroutineScope.launch {
            try {
                val savedConfig = if (config.id.isBlank()) {
                    apiClient.createAlertConfig(config)
                } else {
                    apiClient.updateAlertConfig(config.id, config)
                }
                
                // Refresh alert configurations
                val alertConfigs = apiClient.getAlertConfigs()
                AppStateManager.updateAlertConfigs(alertConfigs)
                
                // Hide the form
                showCreateAlertForm = false
                editingAlertConfig = null
            } catch (e: Exception) {
                console.error("Failed to save alert configuration: ${e.message}")
                AppStateManager.setError("Failed to save alert configuration: ${e.message}")
            } finally {
                AppStateManager.setLoading(false)
            }
        }
    }
    
    /**
     * Deletes an alert configuration.
     */
    private fun deleteAlertConfig(id: String) {
        AppStateManager.setLoading(true)
        
        coroutineScope.launch {
            try {
                val success = apiClient.deleteAlertConfig(id)
                
                if (success) {
                    // Refresh alert configurations
                    val alertConfigs = apiClient.getAlertConfigs()
                    AppStateManager.updateAlertConfigs(alertConfigs)
                } else {
                    AppStateManager.setError("Failed to delete alert configuration")
                }
            } catch (e: Exception) {
                console.error("Failed to delete alert configuration: ${e.message}")
                AppStateManager.setError("Failed to delete alert configuration: ${e.message}")
            } finally {
                AppStateManager.setLoading(false)
            }
        }
    }
    
    /**
     * Acknowledges an alert.
     */
    private fun acknowledgeAlert(id: String) {
        AppStateManager.setLoading(true)
        
        coroutineScope.launch {
            try {
                val updatedAlert = apiClient.acknowledgeAlert(id, "user")
                
                if (updatedAlert != null) {
                    // Refresh active alerts
                    val activeAlerts = apiClient.getActiveAlerts()
                    AppStateManager.updateActiveAlerts(activeAlerts)
                } else {
                    AppStateManager.setError("Failed to acknowledge alert")
                }
            } catch (e: Exception) {
                console.error("Failed to acknowledge alert: ${e.message}")
                AppStateManager.setError("Failed to acknowledge alert: ${e.message}")
            } finally {
                AppStateManager.setLoading(false)
            }
        }
    }
    
    /**
     * Resolves an alert.
     */
    private fun resolveAlert(id: String) {
        AppStateManager.setLoading(true)
        
        coroutineScope.launch {
            try {
                val updatedAlert = apiClient.resolveAlert(id)
                
                if (updatedAlert != null) {
                    // Refresh active alerts
                    val activeAlerts = apiClient.getActiveAlerts()
                    AppStateManager.updateActiveAlerts(activeAlerts)
                } else {
                    AppStateManager.setError("Failed to resolve alert")
                }
            } catch (e: Exception) {
                console.error("Failed to resolve alert: ${e.message}")
                AppStateManager.setError("Failed to resolve alert: ${e.message}")
            } finally {
                AppStateManager.setLoading(false)
            }
        }
    }
    
    /**
     * Marks an error as resolved.
     */
    private fun markErrorResolved(id: String) {
        // In a real implementation, we would call an API to mark the error as resolved
        // For now, we'll just update the UI
        AppStateManager.setLoading(true)
        
        coroutineScope.launch {
            try {
                // This is a placeholder for a real API call
                // apiClient.markErrorResolved(id)
                
                // Refresh errors
                // For now, we'll just simulate the update
                val currentErrors = AppStateManager.state.value.proxyErrors
                currentErrors.forEach { (ruleId, errors) ->
                    val updatedErrors = errors.map { error ->
                        if (error.id == id) {
                            error.copy(resolved = true, resolvedAt = System.currentTimeMillis())
                        } else {
                            error
                        }
                    }
                    AppStateManager.updateProxyErrors(ruleId, updatedErrors)
                }
            } catch (e: Exception) {
                console.error("Failed to mark error as resolved: ${e.message}")
                AppStateManager.setError("Failed to mark error as resolved: ${e.message}")
            } finally {
                AppStateManager.setLoading(false)
            }
        }
    }
    
    /**
     * Gets the color for an error type.
     */
    private fun getErrorTypeColor(errorType: ProxyErrorType): CSSColorValue {
        return when (errorType) {
            ProxyErrorType.CONNECTION_REFUSED -> org.jetbrains.compose.web.css.Color("#e53935")
            ProxyErrorType.TIMEOUT -> org.jetbrains.compose.web.css.Color("#f57c00")
            ProxyErrorType.SSL_ERROR -> org.jetbrains.compose.web.css.Color("#7b1fa2")
            ProxyErrorType.BAD_GATEWAY -> org.jetbrains.compose.web.css.Color("#d32f2f")
            ProxyErrorType.GATEWAY_TIMEOUT -> org.jetbrains.compose.web.css.Color("#ff9800")
            ProxyErrorType.CLIENT_ERROR -> org.jetbrains.compose.web.css.Color("#2196f3")
            ProxyErrorType.SERVER_ERROR -> org.jetbrains.compose.web.css.Color("#d32f2f")
            ProxyErrorType.RATE_LIMIT_EXCEEDED -> org.jetbrains.compose.web.css.Color("#ff5722")
            ProxyErrorType.CONFIGURATION_ERROR -> org.jetbrains.compose.web.css.Color("#9c27b0")
            ProxyErrorType.UNKNOWN -> org.jetbrains.compose.web.css.Color("#757575")
        }
    }
    
    /**
     * Gets the color for an alert status.
     */
    private fun getAlertStatusColor(status: AlertStatus): CSSColorValue {
        return when (status) {
            AlertStatus.ACTIVE -> org.jetbrains.compose.web.css.Color("#f44336")
            AlertStatus.ACKNOWLEDGED -> org.jetbrains.compose.web.css.Color("#ff9800")
            AlertStatus.RESOLVED -> org.jetbrains.compose.web.css.Color("#4caf50")
        }
    }
}