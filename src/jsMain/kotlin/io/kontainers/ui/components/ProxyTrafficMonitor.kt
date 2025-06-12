package io.kontainers.ui.components

import androidx.compose.runtime.Composable
import kotlin.math.log
import kotlin.math.pow
import io.kontainers.model.ProxyRule
import io.kontainers.model.ProxyTrafficData
import io.kontainers.model.ProxyTrafficSummary
import io.kontainers.state.AppStateManager
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*
import org.jetbrains.compose.web.renderComposable
import io.kontainers.api.KontainersApiClient
import io.kontainers.ui.util.*
import kotlinx.browser.document
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import org.w3c.dom.HTMLCanvasElement
import kotlin.math.min

/**
 * Component for displaying proxy traffic monitoring data.
 */
class ProxyTrafficMonitor(
    private val apiClient: KontainersApiClient,
    private val coroutineScope: CoroutineScope
) {
    private val timeRanges = listOf("last_hour", "last_day", "last_week")
    
    /**
     * Renders the proxy traffic monitor component.
     */
    @Composable
    fun render(rule: ProxyRule) {
        val selectedTimeRange = AppStateManager.state.value.selectedTimeRange
        val trafficData = AppStateManager.state.value.proxyTrafficData[rule.id] ?: emptyList()
        val trafficSummary = AppStateManager.state.value.proxyTrafficSummaries[rule.id]
        
        Div(attrs = {
            classes("proxy-traffic-monitor")
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
                Text("Proxy Traffic Monitor")
            }
            
            // Time range selector
            Div(attrs = {
                classes("time-range-selector")
                style {
                    display(DisplayStyle.Flex)
                    alignItems(AlignItems.Center)
                    gap(8.px)
                    marginBottom(16.px)
                }
            }) {
                Text("Time Range: ")
                Select(attrs = {
                    onChange {
                        val newRange = it.target.value
                        AppStateManager.setSelectedTimeRange(newRange)
                        loadTrafficData(rule.id, newRange)
                    }
                }) {
                    timeRanges.forEach { range ->
                        Option(
                            value = range,
                            attrs = {
                                if (range == selectedTimeRange) {
                                    attr("selected", "true")
                                }
                            }
                        ) {
                            Text(formatTimeRange(range))
                        }
                    }
                }
                
                Button(attrs = {
                    onClick {
                        loadTrafficData(rule.id, selectedTimeRange)
                    }
                    style {
                        marginLeft(8.px)
                    }
                }) {
                    Text("Refresh")
                }
            }
            
            // Traffic summary
            if (trafficSummary != null) {
                renderTrafficSummary(trafficSummary)
            } else {
                Div(attrs = {
                    classes("loading-indicator")
                    style {
                        textAlign("center")
                        padding(16.px)
                    }
                }) {
                    Text("Loading traffic data...")
                }
            }
            
            // Traffic charts
            if (trafficData.isNotEmpty()) {
                renderTrafficCharts(trafficData)
            }
        }
    }
    
    /**
     * Renders the traffic summary.
     */
    @Composable
    private fun ElementScope<*>.renderTrafficSummary(summary: ProxyTrafficSummary) {
        Div(attrs = {
            classes("traffic-summary")
            style {
                display(DisplayStyle.Grid)
                gridTemplateColumns("repeat(auto-fit, minmax(200px, 1fr))")
                gap(16.px)
                marginBottom(16.px)
            }
        }) {
            // Summary cards
            renderSummaryCard("Total Requests", summary.totalRequests.toString(), "mdi-chart-line")
            renderSummaryCard("Total Responses", summary.totalResponses.toString(), "mdi-check-circle")
            renderSummaryCard("Avg Response Time", "${String.format("%.2f", summary.avgResponseTime)} ms", "mdi-clock-outline")
            renderSummaryCard("Data Received", formatBytes(summary.totalBytesReceived), "mdi-download")
            renderSummaryCard("Data Sent", formatBytes(summary.totalBytesSent), "mdi-upload")
        }
        
        // Status code distribution
        if (summary.statusCodeDistribution.isNotEmpty()) {
            H3 {
                Text("Status Code Distribution")
            }
            
            Div(attrs = {
                classes("status-code-distribution")
                style {
                    display(DisplayStyle.Flex)
                    flexWrap(FlexWrap.Wrap)
                    gap(8.px)
                    marginBottom(16.px)
                }
            }) {
                summary.statusCodeDistribution.entries.sortedBy { it.key }.forEach { (code, count) ->
                    val colorClass = when {
                        code < 300 -> "success"
                        code < 400 -> "info"
                        code < 500 -> "warning"
                        else -> "error"
                    }
                    
                    Div(attrs = {
                        classes("status-code-badge", colorClass)
                        style {
                            padding(8.px, 12.px)
                            borderRadius(4.px)
                            fontWeight("bold")
                            color(Color("white"))
                            display(DisplayStyle.Flex)
                            alignItems(AlignItems.Center)
                            gap(8.px)
                        }
                    }) {
                        Span(attrs = {
                            style {
                                fontSize(14.px)
                            }
                        }) {
                            Text("$code")
                        }
                        Span(attrs = {
                            style {
                                fontSize(12.px)
                                backgroundColor(Color("rgba(255, 255, 255, 0.2)"))
                                padding(2.px, 6.px)
                                borderRadius(10.px)
                            }
                        }) {
                            Text("$count")
                        }
                    }
                }
            }
        }
        
        // Top paths
        if (summary.topPaths.isNotEmpty()) {
            H3 {
                Text("Top Paths")
            }
            
            Table(attrs = {
                classes("data-table")
                style {
                    width(100.percent)
                    borderCollapse("collapse")
                    marginBottom(16.px)
                }
            }) {
                Thead {
                    Tr {
                        Th(attrs = { style { textAlign("left") } }) { Text("Path") }
                        Th(attrs = { style { textAlign("right") } }) { Text("Hits") }
                    }
                }
                Tbody {
                    summary.topPaths.forEach { (path, hits) ->
                        Tr {
                            Td(attrs = { 
                                style { 
                                    maxWidth(300.px)
                                    overflow("hidden")
                                    textOverflow("ellipsis")
                                    whiteSpace("nowrap")
                                }
                            }) { Text(path) }
                            Td(attrs = { style { textAlign("right") } }) { Text("$hits") }
                        }
                    }
                }
            }
        }
        
        // Top clients
        if (summary.topClientIps.isNotEmpty()) {
            H3 {
                Text("Top Client IPs")
            }
            
            Table(attrs = {
                classes("data-table")
                style {
                    width(100.percent)
                    borderCollapse("collapse")
                    marginBottom(16.px)
                }
            }) {
                Thead {
                    Tr {
                        Th(attrs = { style { textAlign("left") } }) { Text("IP Address") }
                        Th(attrs = { style { textAlign("right") } }) { Text("Requests") }
                    }
                }
                Tbody {
                    summary.topClientIps.forEach { (ip, count) ->
                        Tr {
                            Td { Text(ip) }
                            Td(attrs = { style { textAlign("right") } }) { Text("$count") }
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
                    color(Color("#1976d2"))
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
     * Renders traffic charts.
     */
    @Composable
    private fun ElementScope<*>.renderTrafficCharts(trafficData: List<ProxyTrafficData>) {
        H3 {
            Text("Traffic Over Time")
        }
        
        // Create canvas for chart
        Canvas(attrs = {
            id("traffic-chart")
            attr("width", "800")
            attr("height", "300")
            style {
                width(100.percent)
                height(300.px)
                marginBottom(16.px)
                backgroundColor(Color("white"))
                borderRadius(8.px)
            }
        })
        
        // In a real implementation, we would use a charting library like Chart.js
        // For this example, we'll just show a placeholder
        Div(attrs = {
            style {
                textAlign("center")
                color(Color("#666"))
                fontSize(12.px)
            }
        }) {
            Text("Chart would display request and response counts over time")
        }
    }
    
    /**
     * Loads traffic data for a proxy rule.
     */
    private fun loadTrafficData(ruleId: String, timeRange: String) {
        AppStateManager.setLoading(true)
        
        coroutineScope.launch {
            try {
                // Load traffic data
                val trafficData = apiClient.getProxyTrafficData(ruleId)
                AppStateManager.updateProxyTrafficData(ruleId, trafficData)
                
                // Load traffic summary
                val trafficSummary = apiClient.getProxyTrafficSummary(ruleId, timeRange)
                AppStateManager.updateProxyTrafficSummary(ruleId, trafficSummary)
            } catch (e: Exception) {
                console.error("Failed to load traffic data: ${e.message}")
                AppStateManager.setError("Failed to load traffic data: ${e.message}")
            } finally {
                AppStateManager.setLoading(false)
            }
        }
    }
    
    /**
     * Formats a time range for display.
     */
    private fun formatTimeRange(range: String): String {
        return when (range) {
            "last_hour" -> "Last Hour"
            "last_day" -> "Last 24 Hours"
            "last_week" -> "Last 7 Days"
            else -> range
        }
    }
    
    /**
     * Formats bytes for display.
     */
    private fun formatBytes(bytes: Long): String {
        if (bytes < 1024) return "$bytes B"
        val exp = (log(bytes.toDouble(), 1024.0)).toInt()
        val pre = "KMGTPE"[exp - 1]
        return String.format("%.1f %sB", bytes / 1024.0.pow(exp.toDouble()), pre)
    }
}