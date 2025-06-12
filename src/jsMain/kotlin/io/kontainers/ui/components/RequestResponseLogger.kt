package io.kontainers.ui.components

import androidx.compose.runtime.Composable
import io.kontainers.model.ProxyRule
import io.kontainers.model.RequestResponseLog
import io.kontainers.state.AppStateManager
import kotlinx.coroutines.launch
import kotlinx.datetime.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*
import io.kontainers.api.KontainersApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.onEach
import org.jetbrains.compose.web.attributes.InputType
import org.w3c.dom.HTMLInputElement
import org.w3c.dom.HTMLSelectElement
import io.kontainers.ui.util.*

/**
 * Component for displaying request/response logs.
 */
class RequestResponseLogger(
    private val apiClient: KontainersApiClient,
    private val coroutineScope: CoroutineScope
) {
    private var isStreamingLogs = false
    private var expandedLogId: String? = null
    
    // Search filters
    private var clientIpFilter: String? = null
    private var methodFilter: String? = null
    private var pathFilter: String? = null
    private var statusCodeFilter: Int? = null
    private var minResponseTimeFilter: Double? = null
    private var maxResponseTimeFilter: Double? = null
    
    /**
     * Renders the request/response logger component.
     */
    @Composable
    fun render(rule: ProxyRule) {
        val logs = AppStateManager.state.value.requestLogs[rule.id] ?: emptyList()
        
        Div(attrs = {
            classes("request-response-logger")
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
                Text("Request/Response Logger")
            }
            
            // Controls
            Div(attrs = {
                classes("logger-controls")
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
                            loadLogs(rule.id)
                        }
                    }) {
                        Text("Refresh")
                    }
                    
                    Button(attrs = {
                        onClick {
                            toggleLogStreaming(rule.id)
                        }
                        style {
                            backgroundColor(if (isStreamingLogs) Color("#f44336") else Color("#4caf50"))
                        }
                    }) {
                        Text(if (isStreamingLogs) "Stop Streaming" else "Start Streaming")
                    }
                }
                
                // Log count
                Span(attrs = {
                    style {
                        fontSize(14.px)
                        color(Color("#666"))
                    }
                }) {
                    Text("${logs.size} logs")
                }
            }
            
            // Search filters
            Div(attrs = {
                classes("search-filters")
                style {
                    display(DisplayStyle.Flex)
                    flexWrap(FlexWrap.Wrap)
                    gap(8.px)
                    marginBottom(16.px)
                    padding(12.px)
                    backgroundColor(Color("white"))
                    borderRadius(4.px)
                }
            }) {
                H3(attrs = {
                    style {
                        width(100.percent)
                        margin(0.px)
                        marginBottom(8.px)
                        fontSize(16.px)
                    }
                }) {
                    Text("Search Filters")
                }
                
                // Client IP filter
                Div(attrs = {
                    style {
                        display(DisplayStyle.Flex)
                        flexDirection(FlexDirection.Column)
                        gap(4.px)
                    }
                }) {
                    Label(attrs = { attr("for", "client-ip-filter") }) {
                        Text("Client IP")
                    }
                    Input(InputType.Text, attrs = {
                        id("client-ip-filter")
                        attr("placeholder", "Filter by IP")
                        style {
                            padding(6.px, 8.px)
                            borderRadius(4.px)
                            border(1.px, LineStyle.Solid, Color("#ccc"))
                        }
                        onChange {
                            clientIpFilter = it.target.value.takeIf { it.isNotBlank() }
                        }
                    })
                }
                
                // Method filter
                Div(attrs = {
                    style {
                        display(DisplayStyle.Flex)
                        flexDirection(FlexDirection.Column)
                        gap(4.px)
                    }
                }) {
                    Label(attrs = { attr("for", "method-filter") }) {
                        Text("Method")
                    }
                    Select(attrs = {
                        id("method-filter")
                        style {
                            padding(6.px, 8.px)
                            borderRadius(4.px)
                            border(1.px, LineStyle.Solid, Color("#ccc"))
                        }
                        onChange {
                            val value = (it.target as HTMLSelectElement).value
                            methodFilter = if (value == "all") null else value
                        }
                    }) {
                        Option(value = "all") { Text("All") }
                        listOf("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD").forEach { method ->
                            Option(value = method) { Text(method) }
                        }
                    }
                }
                
                // Path filter
                Div(attrs = {
                    style {
                        display(DisplayStyle.Flex)
                        flexDirection(FlexDirection.Column)
                        gap(4.px)
                    }
                }) {
                    Label(attrs = { attr("for", "path-filter") }) {
                        Text("Path")
                    }
                    Input(InputType.Text, attrs = {
                        id("path-filter")
                        attr("placeholder", "Filter by path")
                        style {
                            padding(6.px, 8.px)
                            borderRadius(4.px)
                            border(1.px, LineStyle.Solid, Color("#ccc"))
                        }
                        onChange {
                            pathFilter = it.target.value.takeIf { it.isNotBlank() }
                        }
                    })
                }
                
                // Status code filter
                Div(attrs = {
                    style {
                        display(DisplayStyle.Flex)
                        flexDirection(FlexDirection.Column)
                        gap(4.px)
                    }
                }) {
                    Label(attrs = { attr("for", "status-code-filter") }) {
                        Text("Status Code")
                    }
                    Input(InputType.Number, attrs = {
                        id("status-code-filter")
                        attr("placeholder", "e.g. 200, 404")
                        style {
                            padding(6.px, 8.px)
                            borderRadius(4.px)
                            border(1.px, LineStyle.Solid, Color("#ccc"))
                        }
                        onChange {
                            val value = (it.target as HTMLInputElement).value
                            statusCodeFilter = value.toIntOrNull()
                        }
                    })
                }
                
                // Apply filters button
                Button(attrs = {
                    style {
                        property("margin-left", "auto")
                        alignSelf(AlignSelf.FlexEnd)
                    }
                    onClick {
                        searchLogs(rule.id)
                    }
                }) {
                    Text("Apply Filters")
                }
            }
            
            // Logs table
            if (logs.isNotEmpty()) {
                Table(attrs = {
                    classes("logs-table")
                    style {
                        width(100.percent)
                        borderCollapse("collapse")
                        fontSize(14.px)
                    }
                }) {
                    Thead {
                        Tr {
                            Th(attrs = { style { width(160.px) } }) { Text("Time") }
                            Th(attrs = { style { width(80.px) } }) { Text("Method") }
                            Th(attrs = { style { width(80.px) } }) { Text("Status") }
                            Th { Text("Path") }
                            Th(attrs = { style { width(100.px) } }) { Text("Client IP") }
                            Th(attrs = { style { width(100.px) } }) { Text("Response Time") }
                            Th(attrs = { style { width(40.px) } }) { Text("") }
                        }
                    }
                    Tbody {
                        logs.forEach { log ->
                            val isExpanded = log.id == expandedLogId
                            
                            Tr(attrs = {
                                classes("log-row")
                                onClick {
                                    expandedLogId = if (isExpanded) null else log.id
                                }
                                style {
                                    cursor("pointer")
                                    backgroundColor(if (isExpanded) Color("#e3f2fd") else Color.transparent)
                                    hover {
                                        backgroundColor(Color("#f5f5f5"))
                                    }
                                }
                            }) {
                                // Timestamp
                                Td {
                                    val dateTime = Instant.fromEpochMilliseconds(log.timestamp)
                                        .toLocalDateTime(TimeZone.currentSystemDefault())
                                    Text("${dateTime.date} ${dateTime.time}")
                                }
                                
                                // Method
                                Td(attrs = {
                                    style {
                                        fontWeight("bold")
                                        color(getMethodColor(log.method))
                                    }
                                }) {
                                    Text(log.method)
                                }
                                
                                // Status code
                                Td {
                                    Span(attrs = {
                                        classes("status-badge", getStatusClass(log.statusCode))
                                        style {
                                            padding(2.px, 6.px)
                                            borderRadius(4.px)
                                            fontSize(12.px)
                                            fontWeight("bold")
                                            color(org.jetbrains.compose.web.css.Color("white"))
                                        }
                                    }) {
                                        Text("${log.statusCode}")
                                    }
                                }
                                
                                // Path
                                Td(attrs = {
                                    style {
                                        maxWidth(300.px)
                                        overflow("hidden")
                                        textOverflow("ellipsis")
                                        whiteSpace("nowrap")
                                    }
                                }) {
                                    Text(log.path + (log.queryString?.let { "?$it" } ?: ""))
                                }
                                
                                // Client IP
                                Td {
                                    Text(log.clientIp)
                                }
                                
                                // Response time
                                Td {
                                    Text("${String.format("%.2f", log.responseTime)} ms")
                                }
                                
                                // Expand/collapse button
                                Td {
                                    I(attrs = {
                                        classes("mdi", if (isExpanded) "mdi-chevron-up" else "mdi-chevron-down")
                                    })
                                }
                            }
                            
                            // Expanded details
                            if (isExpanded) {
                                Tr(attrs = {
                                    classes("log-details")
                                }) {
                                    Td(attrs = {
                                        colSpan(7)
                                        style {
                                            padding(16.px)
                                            backgroundColor(Color("#e3f2fd"))
                                        }
                                    }) {
                                        // Request details
                                        Div(attrs = {
                                            style {
                                                marginBottom(16.px)
                                            }
                                        }) {
                                            H4(attrs = {
                                                style {
                                                    margin(0.px)
                                                    marginBottom(8.px)
                                                }
                                            }) {
                                                Text("Request")
                                            }
                                            
                                            // Request headers
                                            if (log.requestHeaders != null && log.requestHeaders.isNotEmpty()) {
                                                Div(attrs = {
                                                    style {
                                                        marginBottom(8.px)
                                                    }
                                                }) {
                                                    H5(attrs = {
                                                        style {
                                                            margin(0.px)
                                                            marginBottom(4.px)
                                                            fontSize(14.px)
                                                        }
                                                    }) {
                                                        Text("Headers")
                                                    }
                                                    
                                                    Pre(attrs = {
                                                        style {
                                                            backgroundColor(Color("#f8f9fa"))
                                                            padding(8.px)
                                                            borderRadius(4.px)
                                                            overflow("auto")
                                                            maxHeight(200.px)
                                                            margin(0.px)
                                                        }
                                                    }) {
                                                        Text(log.requestHeaders.entries.joinToString("\n") { "${it.key}: ${it.value}" })
                                                    }
                                                }
                                            }
                                            
                                            // Request body
                                            if (!log.requestBody.isNullOrBlank()) {
                                                Div {
                                                    H5(attrs = {
                                                        style {
                                                            margin(0.px)
                                                            marginBottom(4.px)
                                                            fontSize(14.px)
                                                        }
                                                    }) {
                                                        Text("Body")
                                                    }
                                                    
                                                    Pre(attrs = {
                                                        style {
                                                            backgroundColor(Color("#f8f9fa"))
                                                            padding(8.px)
                                                            borderRadius(4.px)
                                                            overflow("auto")
                                                            maxHeight(200.px)
                                                            margin(0.px)
                                                        }
                                                    }) {
                                                        Text(log.requestBody)
                                                    }
                                                }
                                            }
                                        }
                                        
                                        // Response details
                                        Div {
                                            H4(attrs = {
                                                style {
                                                    margin(0.px)
                                                    marginBottom(8.px)
                                                }
                                            }) {
                                                Text("Response")
                                            }
                                            
                                            // Response headers
                                            if (log.responseHeaders != null && log.responseHeaders.isNotEmpty()) {
                                                Div(attrs = {
                                                    style {
                                                        marginBottom(8.px)
                                                    }
                                                }) {
                                                    H5(attrs = {
                                                        style {
                                                            margin(0.px)
                                                            marginBottom(4.px)
                                                            fontSize(14.px)
                                                        }
                                                    }) {
                                                        Text("Headers")
                                                    }
                                                    
                                                    Pre(attrs = {
                                                        style {
                                                            backgroundColor(Color("#f8f9fa"))
                                                            padding(8.px)
                                                            borderRadius(4.px)
                                                            overflow("auto")
                                                            maxHeight(200.px)
                                                            margin(0.px)
                                                        }
                                                    }) {
                                                        Text(log.responseHeaders.entries.joinToString("\n") { "${it.key}: ${it.value}" })
                                                    }
                                                }
                                            }
                                            
                                            // Response body
                                            if (!log.responseBody.isNullOrBlank()) {
                                                Div {
                                                    H5(attrs = {
                                                        style {
                                                            margin(0.px)
                                                            marginBottom(4.px)
                                                            fontSize(14.px)
                                                        }
                                                    }) {
                                                        Text("Body")
                                                    }
                                                    
                                                    Pre(attrs = {
                                                        style {
                                                            backgroundColor(Color("#f8f9fa"))
                                                            padding(8.px)
                                                            borderRadius(4.px)
                                                            overflow("auto")
                                                            maxHeight(200.px)
                                                            margin(0.px)
                                                        }
                                                    }) {
                                                        Text(log.responseBody)
                                                    }
                                                }
                                            }
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
                    Text("No logs available. Click 'Refresh' to load logs.")
                }
            }
        }
    }
    
    /**
     * Loads logs for a proxy rule.
     */
    private fun loadLogs(ruleId: String) {
        AppStateManager.setLoading(true)
        
        coroutineScope.launch {
            try {
                val logs = apiClient.getRequestLogs(ruleId)
                AppStateManager.updateRequestLogs(ruleId, logs)
            } catch (e: Exception) {
                console.error("Failed to load logs: ${e.message}")
                AppStateManager.setError("Failed to load logs: ${e.message}")
            } finally {
                AppStateManager.setLoading(false)
            }
        }
    }
    
    /**
     * Searches logs for a proxy rule.
     */
    private fun searchLogs(ruleId: String) {
        AppStateManager.setLoading(true)
        
        coroutineScope.launch {
            try {
                val logs = apiClient.searchRequestLogs(
                    ruleId = ruleId,
                    clientIp = clientIpFilter,
                    method = methodFilter,
                    path = pathFilter,
                    statusCode = statusCodeFilter,
                    minResponseTime = minResponseTimeFilter,
                    maxResponseTime = maxResponseTimeFilter
                )
                AppStateManager.updateRequestLogs(ruleId, logs)
            } catch (e: Exception) {
                console.error("Failed to search logs: ${e.message}")
                AppStateManager.setError("Failed to search logs: ${e.message}")
            } finally {
                AppStateManager.setLoading(false)
            }
        }
    }
    
    /**
     * Toggles log streaming.
     */
    private fun toggleLogStreaming(ruleId: String) {
        isStreamingLogs = !isStreamingLogs
        
        if (isStreamingLogs) {
            coroutineScope.launch {
                try {
                    apiClient.streamRequestLogs().onEach { log ->
                        if (log.ruleId == ruleId) {
                            val currentLogs = AppStateManager.state.value.requestLogs[ruleId] ?: emptyList()
                            val updatedLogs = (currentLogs + log).takeLast(100) // Keep only the last 100 logs
                            AppStateManager.updateRequestLogs(ruleId, updatedLogs)
                        }
                    }.collect()
                } catch (e: Exception) {
                    console.error("Log streaming error: ${e.message}")
                    isStreamingLogs = false
                }
            }
        }
    }
    
    /**
     * Gets the color for an HTTP method.
     */
    private fun getMethodColor(method: String): CSSColorValue {
        return when (method) {
            "GET" -> org.jetbrains.compose.web.css.Color("#2196f3")
            "POST" -> org.jetbrains.compose.web.css.Color("#4caf50")
            "PUT" -> org.jetbrains.compose.web.css.Color("#ff9800")
            "DELETE" -> org.jetbrains.compose.web.css.Color("#f44336")
            "PATCH" -> org.jetbrains.compose.web.css.Color("#9c27b0")
            else -> org.jetbrains.compose.web.css.Color("#757575")
        }
    }
    
    /**
     * Gets the CSS class for a status code.
     */
    private fun getStatusClass(statusCode: Int): String {
        return when {
            statusCode < 300 -> "success"
            statusCode < 400 -> "info"
            statusCode < 500 -> "warning"
            else -> "error"
        }
    }
}