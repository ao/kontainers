package io.kontainers.ui.components

import androidx.compose.runtime.Composable
import io.kontainers.model.ProxyRule
import io.kontainers.model.ProxyTrafficData
import io.kontainers.model.ProxyTrafficSummary
import io.kontainers.state.AppStateManager
import kotlinx.coroutines.launch
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*
import io.kontainers.api.KontainersApiClient
import io.kontainers.ui.util.*
import kotlinx.coroutines.CoroutineScope
import org.w3c.dom.HTMLCanvasElement
import kotlin.math.log
import kotlin.math.pow
import kotlin.math.roundToInt

/**
 * Component for displaying proxy performance metrics.
 */
class ProxyPerformanceMetrics(
    private val apiClient: KontainersApiClient,
    private val coroutineScope: CoroutineScope
) {
    /**
     * Renders the proxy performance metrics component.
     */
    @Composable
    fun render(rule: ProxyRule) {
        val selectedTimeRange = AppStateManager.state.value.selectedTimeRange
        val trafficData = AppStateManager.state.value.proxyTrafficData[rule.id] ?: emptyList()
        val trafficSummary = AppStateManager.state.value.proxyTrafficSummaries[rule.id]
        
        Div(attrs = {
            classes("proxy-performance-metrics")
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
                Text("Proxy Performance Metrics")
            }
            
            // Performance metrics grid
            Div(attrs = {
                classes("performance-metrics-grid")
                style {
                    display(DisplayStyle.Grid)
                    gridTemplateColumns("repeat(auto-fit, minmax(250px, 1fr))")
                    gap(16.px)
                }
            }) {
                // Response time metrics
                renderMetricCard(
                    title = "Response Time",
                    metrics = listOf(
                        "Average" to "${String.format("%.2f", trafficSummary?.avgResponseTime ?: 0.0)} ms",
                        "P95" to calculatePercentile(trafficData, 95),
                        "P99" to calculatePercentile(trafficData, 99),
                        "Max" to calculateMaxResponseTime(trafficData)
                    ),
                    icon = "mdi-clock-outline"
                )
                
                // Throughput metrics
                renderMetricCard(
                    title = "Throughput",
                    metrics = listOf(
                        "Requests/sec" to calculateRequestsPerSecond(trafficData, selectedTimeRange),
                        "Total Requests" to "${trafficSummary?.totalRequests ?: 0}",
                        "Total Responses" to "${trafficSummary?.totalResponses ?: 0}",
                        "Success Rate" to calculateSuccessRate(trafficSummary)
                    ),
                    icon = "mdi-chart-line"
                )
                
                // Data transfer metrics
                renderMetricCard(
                    title = "Data Transfer",
                    metrics = listOf(
                        "Total Received" to formatBytes(trafficSummary?.totalBytesReceived ?: 0),
                        "Total Sent" to formatBytes(trafficSummary?.totalBytesSent ?: 0),
                        "Avg Request Size" to calculateAvgRequestSize(trafficSummary),
                        "Avg Response Size" to calculateAvgResponseSize(trafficSummary)
                    ),
                    icon = "mdi-swap-horizontal"
                )
                
                // Status code metrics
                renderMetricCard(
                    title = "Status Codes",
                    metrics = calculateStatusCodeMetrics(trafficSummary),
                    icon = "mdi-check-circle-outline"
                )
            }
            
            // Performance charts
            Div(attrs = {
                classes("performance-charts")
                style {
                    marginTop(24.px)
                }
            }) {
                H3 {
                    Text("Response Time Distribution")
                }
                
                // Response time distribution chart
                Canvas(attrs = {
                    id("response-time-chart")
                    attr("width", "800")
                    attr("height", "300")
                    style {
                        width(100.percent)
                        height(300.px)
                        marginBottom(24.px)
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
                        marginBottom(24.px)
                    }
                }) {
                    Text("Chart would display response time distribution")
                }
                
                H3 {
                    Text("Throughput Over Time")
                }
                
                // Throughput chart
                Canvas(attrs = {
                    id("throughput-chart")
                    attr("width", "800")
                    attr("height", "300")
                    style {
                        width(100.percent)
                        height(300.px)
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
                    Text("Chart would display requests per second over time")
                }
            }
            
            // Performance recommendations
            Div(attrs = {
                classes("performance-recommendations")
                style {
                    marginTop(24.px)
                    padding(16.px)
                    backgroundColor(Color("white"))
                    borderRadius(8.px)
                    border(1.px, LineStyle.Solid, Color("#e0e0e0"))
                }
            }) {
                H3(attrs = {
                    style {
                        display(DisplayStyle.Flex)
                        alignItems(AlignItems.Center)
                        gap(8.px)
                        margin(0.px)
                        marginBottom(12.px)
                    }
                }) {
                    I(attrs = {
                        classes("mdi", "mdi-lightbulb-outline")
                        style {
                            color(Color("#ff9800"))
                            fontSize(24.px)
                        }
                    })
                    Text("Performance Recommendations")
                }
                
                Ul(attrs = {
                    style {
                        paddingLeft(20.px)
                        margin(0.px)
                    }
                }) {
                    // Generate recommendations based on metrics
                    val recommendations = generateRecommendations(trafficSummary, trafficData)
                    
                    if (recommendations.isEmpty()) {
                        Li {
                            Text("No recommendations at this time. Performance looks good!")
                        }
                    } else {
                        recommendations.forEach { recommendation ->
                            Li(attrs = {
                                style {
                                    marginBottom(8.px)
                                }
                            }) {
                                Text(recommendation)
                            }
                        }
                    }
                }
            }
        }
    }
    
    /**
     * Renders a metric card.
     */
    @Composable
    private fun ElementScope<*>.renderMetricCard(title: String, metrics: List<Pair<String, String>>, icon: String) {
        Div(attrs = {
            classes("metric-card")
            style {
                backgroundColor(Color("white"))
                padding(16.px)
                borderRadius(8.px)
                boxShadow("0 1px 3px rgba(0, 0, 0, 0.1)")
            }
        }) {
            // Card header
            Div(attrs = {
                style {
                    display(DisplayStyle.Flex)
                    alignItems(AlignItems.Center)
                    gap(8.px)
                    marginBottom(12.px)
                }
            }) {
                I(attrs = {
                    classes("mdi", icon)
                    style {
                        fontSize(20.px)
                        color(Color("#1976d2"))
                    }
                })
                H3(attrs = {
                    style {
                        margin(0.px)
                        fontSize(16.px)
                    }
                }) {
                    Text(title)
                }
            }
            
            // Metrics
            Div(attrs = {
                style {
                    display(DisplayStyle.Grid)
                    gridTemplateColumns("1fr 1fr")
                    gap(12.px, 8.px)
                }
            }) {
                metrics.forEach { (label, value) ->
                    // Label
                    Div(attrs = {
                        style {
                            fontSize(12.px)
                            color(Color("#666"))
                        }
                    }) {
                        Text(label)
                    }
                    
                    // Value
                    Div(attrs = {
                        style {
                            fontSize(14.px)
                            fontWeight("bold")
                            textAlign("right")
                        }
                    }) {
                        Text(value)
                    }
                }
            }
        }
    }
    
    /**
     * Calculates the percentile response time.
     */
    private fun calculatePercentile(trafficData: List<ProxyTrafficData>, percentile: Int): String {
        if (trafficData.isEmpty()) return "0 ms"
        
        val responseTimes = trafficData.map { it.avgResponseTime }.sorted()
        val index = ((percentile / 100.0) * responseTimes.size).toInt().coerceAtMost(responseTimes.size - 1)
        
        return "${String.format("%.2f", responseTimes[index])} ms"
    }
    
    /**
     * Calculates the maximum response time.
     */
    private fun calculateMaxResponseTime(trafficData: List<ProxyTrafficData>): String {
        if (trafficData.isEmpty()) return "0 ms"
        
        val maxResponseTime = trafficData.maxOfOrNull { it.avgResponseTime } ?: 0.0
        return "${String.format("%.2f", maxResponseTime)} ms"
    }
    
    /**
     * Calculates the requests per second.
     */
    private fun calculateRequestsPerSecond(trafficData: List<ProxyTrafficData>, timeRange: String): String {
        if (trafficData.isEmpty()) return "0"
        
        val totalRequests = trafficData.sumOf { it.requestCount }
        val seconds = when (timeRange) {
            "last_hour" -> 3600
            "last_day" -> 86400
            "last_week" -> 604800
            else -> 3600
        }
        
        val rps = totalRequests.toDouble() / seconds
        return String.format("%.2f", rps)
    }
    
    /**
     * Calculates the success rate.
     */
    private fun calculateSuccessRate(summary: ProxyTrafficSummary?): String {
        if (summary == null || summary.totalResponses == 0L) return "0%"
        
        val successResponses = summary.statusCodeDistribution
            .filter { it.key < 400 }
            .values
            .sum()
        
        val successRate = (successResponses.toDouble() / summary.totalResponses) * 100
        return "${String.format("%.1f", successRate)}%"
    }
    
    /**
     * Calculates the average request size.
     */
    private fun calculateAvgRequestSize(summary: ProxyTrafficSummary?): String {
        if (summary == null || summary.totalRequests == 0L) return "0 B"
        
        val avgSize = summary.totalBytesReceived.toDouble() / summary.totalRequests
        return formatBytes(avgSize.roundToInt().toLong())
    }
    
    /**
     * Calculates the average response size.
     */
    private fun calculateAvgResponseSize(summary: ProxyTrafficSummary?): String {
        if (summary == null || summary.totalResponses == 0L) return "0 B"
        
        val avgSize = summary.totalBytesSent.toDouble() / summary.totalResponses
        return formatBytes(avgSize.roundToInt().toLong())
    }
    
    /**
     * Calculates status code metrics.
     */
    private fun calculateStatusCodeMetrics(summary: ProxyTrafficSummary?): List<Pair<String, String>> {
        if (summary == null) return emptyList()
        
        val metrics = mutableListOf<Pair<String, String>>()
        
        val status2xx = summary.statusCodeDistribution.filter { it.key in 200..299 }.values.sum()
        val status3xx = summary.statusCodeDistribution.filter { it.key in 300..399 }.values.sum()
        val status4xx = summary.statusCodeDistribution.filter { it.key in 400..499 }.values.sum()
        val status5xx = summary.statusCodeDistribution.filter { it.key in 500..599 }.values.sum()
        
        val total = summary.totalResponses.toDouble()
        
        if (total > 0) {
            metrics.add("2xx" to "${String.format("%.1f", (status2xx / total) * 100)}%")
            metrics.add("3xx" to "${String.format("%.1f", (status3xx / total) * 100)}%")
            metrics.add("4xx" to "${String.format("%.1f", (status4xx / total) * 100)}%")
            metrics.add("5xx" to "${String.format("%.1f", (status5xx / total) * 100)}%")
        } else {
            metrics.add("2xx" to "0%")
            metrics.add("3xx" to "0%")
            metrics.add("4xx" to "0%")
            metrics.add("5xx" to "0%")
        }
        
        return metrics
    }
    
    /**
     * Generates performance recommendations.
     */
    private fun generateRecommendations(
        summary: ProxyTrafficSummary?,
        trafficData: List<ProxyTrafficData>
    ): List<String> {
        val recommendations = mutableListOf<String>()
        
        if (summary == null) return recommendations
        
        // Check for high error rate
        val errorResponses = summary.statusCodeDistribution
            .filter { it.key >= 500 }
            .values
            .sum()
        
        if (summary.totalResponses > 0) {
            val errorRate = (errorResponses.toDouble() / summary.totalResponses)
            if (errorRate > 0.05) {
                recommendations.add("High server error rate (${String.format("%.1f", errorRate * 100)}%). Consider investigating server-side issues.")
            }
        }
        
        // Check for high client error rate
        val clientErrorResponses = summary.statusCodeDistribution
            .filter { it.key in 400..499 }
            .values
            .sum()
        
        if (summary.totalResponses > 0) {
            val clientErrorRate = (clientErrorResponses.toDouble() / summary.totalResponses)
            if (clientErrorRate > 0.10) {
                recommendations.add("High client error rate (${String.format("%.1f", clientErrorRate * 100)}%). Review client requests for potential issues.")
            }
        }
        
        // Check for high response time
        if (summary.avgResponseTime > 500) {
            recommendations.add("High average response time (${String.format("%.2f", summary.avgResponseTime)} ms). Consider optimizing backend performance.")
        }
        
        // Check for large response sizes
        if (summary.totalResponses > 0) {
            val avgResponseSize = summary.totalBytesSent.toDouble() / summary.totalResponses
            if (avgResponseSize > 1024 * 1024) { // 1 MB
                recommendations.add("Large average response size (${formatBytes(avgResponseSize.roundToInt().toLong())}). Consider implementing compression or response size optimization.")
            }
        }
        
        // Check for potential caching opportunities
        val repeatedPaths = summary.topPaths.filter { it.second > 10 }
        if (repeatedPaths.isNotEmpty()) {
            recommendations.add("Consider implementing caching for frequently accessed paths: ${repeatedPaths.take(3).joinToString(", ") { it.first }}")
        }
        
        return recommendations
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