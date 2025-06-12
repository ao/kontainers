package io.kontainers.ui.components

import androidx.compose.runtime.*
import io.kontainers.api.KontainersApiClient
import io.kontainers.system.HealthCheckResult
import io.kontainers.system.HealthStatus
import io.kontainers.system.SystemResourceMetrics
import io.kontainers.ui.util.*
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*
import kotlin.math.roundToInt

/**
 * Component for displaying system health information.
 */
@Composable
fun SystemHealthMonitor() {
    val apiClient = remember { KontainersApiClient() }
    val coroutineScope = rememberCoroutineScope()
    
    var healthChecks by remember { mutableStateOf<List<HealthCheckResult>>(emptyList()) }
    var systemMetrics by remember { mutableStateOf<SystemResourceMetrics?>(null) }
    var overallHealth by remember { mutableStateOf<String>("UNKNOWN") }
    var isLoading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    
    // Load health data on initial render
    LaunchedEffect(Unit) {
        try {
            // Get overall health
            val healthResponse = apiClient.getSystemHealth()
            overallHealth = healthResponse["status"] as String
            
            // Get health checks
            healthChecks = apiClient.getHealthChecks()
            
            // Get latest metrics
            systemMetrics = apiClient.getLatestSystemResourceMetrics()
            
            isLoading = false
        } catch (e: Exception) {
            error = "Failed to load health data: ${e.message}"
            isLoading = false
        }
    }
    
    // Subscribe to real-time updates
    LaunchedEffect(Unit) {
        // Subscribe to health check updates
        apiClient.streamHealthChecks()
            .onEach { healthCheck ->
                healthChecks = healthChecks.filter { it.componentId != healthCheck.componentId } + healthCheck
            }
            .catch { e ->
                console.error("Error in health check stream: ${e.message}")
            }
            .launchIn(coroutineScope)
        
        // Subscribe to metrics updates
        apiClient.streamSystemResourceMetrics()
            .onEach { metrics ->
                systemMetrics = metrics
            }
            .catch { e ->
                console.error("Error in metrics stream: ${e.message}")
            }
            .launchIn(coroutineScope)
    }
    
    Div({
        style {
            padding(16.px)
            maxWidth(1200.px)
            property("margin", "0px auto")
        }
    }) {
        if (error != null) {
            ErrorMessage(error!!) {
                error = null
                isLoading = true
                coroutineScope.launch {
                    try {
                        // Reload data
                        val healthResponse = apiClient.getSystemHealth()
                        overallHealth = healthResponse["status"] as String
                        healthChecks = apiClient.getHealthChecks()
                        systemMetrics = apiClient.getLatestSystemResourceMetrics()
                        isLoading = false
                    } catch (e: Exception) {
                        error = "Failed to load health data: ${e.message}"
                        isLoading = false
                    }
                }
            }
        }
        
        H2 { Text("System Health") }
        
        if (isLoading) {
            LoadingIndicator()
        } else {
            // Overall health status
            Div({
                style {
                    display(DisplayStyle.Flex)
                    alignItems(AlignItems.Center)
                    gap(16.px)
                    padding(16.px)
                    marginBottom(24.px)
                    borderRadius(8.px)
                    backgroundColor(
                        when (overallHealth) {
                            "HEALTHY" -> Color("#e8f5e9")
                            "DEGRADED" -> Color("#fff8e1")
                            "UNHEALTHY" -> Color("#ffebee")
                            else -> Color("#f5f5f5")
                        }
                    )
                }
            }) {
                Div({
                    style {
                        width(48.px)
                        height(48.px)
                        borderRadius(50.percent)
                        backgroundColor(
                            when (overallHealth) {
                                "HEALTHY" -> Color("#4caf50")
                                "DEGRADED" -> Color("#ff9800")
                                "UNHEALTHY" -> Color("#f44336")
                                else -> Color("#9e9e9e")
                            }
                        )
                        display(DisplayStyle.Flex)
                        justifyContent(JustifyContent.Center)
                        alignItems(AlignItems.Center)
                        color(Color.white)
                        fontSize(24.px)
                    }
                }) {
                    when (overallHealth) {
                        "HEALTHY" -> Text("✓")
                        "DEGRADED" -> Text("!")
                        "UNHEALTHY" -> Text("✗")
                        else -> Text("?")
                    }
                }
                
                Div({
                    style {
                        display(DisplayStyle.Flex)
                        flexDirection(FlexDirection.Column)
                    }
                }) {
                    H3({
                        style {
                            margin(0.px)
                            fontSize(20.px)
                        }
                    }) {
                        Text("System Status: $overallHealth")
                    }
                    
                    P({
                        style {
                            margin(4.px, 0.px, 0.px)
                            fontSize(14.px)
                            color(Color("#666"))
                        }
                    }) {
                        Text(
                            when (overallHealth) {
                                "HEALTHY" -> "All systems are operating normally"
                                "DEGRADED" -> "Some systems are experiencing issues"
                                "UNHEALTHY" -> "Critical systems are down"
                                else -> "System status is unknown"
                            }
                        )
                    }
                }
            }
            
            // System resource metrics
            if (systemMetrics != null) {
                H3 { Text("System Resources") }
                
                Div({
                    style {
                        display(DisplayStyle.Grid)
                        property("grid-template-columns", "repeat(auto-fit, minmax(250px, 1fr))")
                        gap(16.px)
                        marginBottom(24.px)
                    }
                }) {
                    // CPU usage
                    ResourceMetricCard(
                        title = "CPU Usage",
                        value = "${systemMetrics!!.cpuUsage.roundToInt()}%",
                        percentage = systemMetrics!!.cpuUsage.toFloat() / 100f,
                        icon = "🔄"
                    )
                    
                    // Memory usage
                    val memoryPercentage = (systemMetrics!!.memoryUsage.toFloat() / systemMetrics!!.memoryTotal.toFloat()) * 100f
                    ResourceMetricCard(
                        title = "Memory Usage",
                        value = "${formatBytes(systemMetrics!!.memoryUsage)} / ${formatBytes(systemMetrics!!.memoryTotal)}",
                        percentage = memoryPercentage / 100f,
                        icon = "💾"
                    )
                    
                    // Disk usage
                    val diskPercentage = (systemMetrics!!.diskUsage.toFloat() / systemMetrics!!.diskTotal.toFloat()) * 100f
                    ResourceMetricCard(
                        title = "Disk Usage",
                        value = "${formatBytes(systemMetrics!!.diskUsage)} / ${formatBytes(systemMetrics!!.diskTotal)}",
                        percentage = diskPercentage / 100f,
                        icon = "💿"
                    )
                }
            }
            
            // Health checks
            H3 { Text("Component Health") }
            
            if (healthChecks.isEmpty()) {
                P { Text("No health check data available") }
            } else {
                Div({
                    style {
                        display(DisplayStyle.Flex)
                        flexDirection(FlexDirection.Column)
                        gap(16.px)
                    }
                }) {
                    healthChecks.forEach { healthCheck ->
                        HealthCheckCard(healthCheck)
                    }
                }
            }
        }
    }
}

/**
 * Component for displaying a resource metric card.
 */
@Composable
fun ResourceMetricCard(
    title: String,
    value: String,
    percentage: Float,
    icon: String
) {
    Div({
        style {
            padding(16.px)
            borderRadius(8.px)
            backgroundColor(Color.white)
            boxShadow("0px 2px 4px rgba(0, 0, 0, 0.1)")
        }
    }) {
        Div({
            style {
                display(DisplayStyle.Flex)
                justifyContent(JustifyContent.SpaceBetween)
                alignItems(AlignItems.Center)
                marginBottom(8.px)
            }
        }) {
            H4({
                style {
                    margin(0.px)
                    fontSize(16.px)
                    fontWeight(500)
                }
            }) {
                Text(title)
            }
            
            Span({
                style {
                    fontSize(20.px)
                }
            }) {
                Text(icon)
            }
        }
        
        Div({
            style {
                fontSize(24.px)
                fontWeight(700) // Bold
                marginBottom(8.px)
            }
        }) {
            Text(value)
        }
        
        // Progress bar
        Div({
            style {
                width(100.percent)
                height(8.px)
                backgroundColor(Color("#e0e0e0"))
                borderRadius(4.px)
                overflow("hidden")
            }
        }) {
            Div({
                style {
                    width((percentage * 100).percent)
                    height(100.percent)
                    backgroundColor(
                        when {
                            percentage < 0.7f -> Color("#4caf50")
                            percentage < 0.9f -> Color("#ff9800")
                            else -> Color("#f44336")
                        }
                    )
                }
            }) {}
        }
    }
}

/**
 * Component for displaying a health check card.
 */
@Composable
fun HealthCheckCard(healthCheck: HealthCheckResult) {
    Div({
        style {
            padding(16.px)
            borderRadius(8.px)
            backgroundColor(Color.white)
            boxShadow("0 2px 4px rgba(0, 0, 0, 0.1)")
            borderLeft("4px", "solid",
                when (healthCheck.status) {
                    HealthStatus.HEALTHY -> "#4caf50"
                    HealthStatus.DEGRADED -> "#ff9800"
                    HealthStatus.UNHEALTHY -> "#f44336"
                    HealthStatus.UNKNOWN -> "#9e9e9e"
                }
            )
        }
    }) {
        Div({
            style {
                display(DisplayStyle.Flex)
                justifyContent(JustifyContent.SpaceBetween)
                alignItems(AlignItems.Center)
                marginBottom(8.px)
            }
        }) {
            H4({
                style {
                    margin(0.px)
                    fontSize(16.px)
                    fontWeight("500")
                }
            }) {
                Text(healthCheck.componentName)
            }
            
            Div({
                style {
                    padding(4.px, 8.px)
                    borderRadius(4.px)
                    fontSize(12.px)
                    fontWeight("bold")
                    backgroundColor(
                        when (healthCheck.status) {
                            HealthStatus.HEALTHY -> Color("#e8f5e9")
                            HealthStatus.DEGRADED -> Color("#fff8e1")
                            HealthStatus.UNHEALTHY -> Color("#ffebee")
                            HealthStatus.UNKNOWN -> Color("#f5f5f5")
                        }
                    )
                    color(
                        when (healthCheck.status) {
                            HealthStatus.HEALTHY -> Color("#2e7d32")
                            HealthStatus.DEGRADED -> Color("#ef6c00")
                            HealthStatus.UNHEALTHY -> Color("#c62828")
                            HealthStatus.UNKNOWN -> Color("#616161")
                        }
                    )
                }
            }) {
                Text(healthCheck.status.toString())
            }
        }
        
        if (healthCheck.message != null) {
            P({
                style {
                    margin(8.px, 0.px)
                    fontSize(14.px)
                }
            }) {
                Text(healthCheck.message)
            }
        }
        
        if (healthCheck.details.isNotEmpty()) {
            Div({
                style {
                    marginTop(8.px)
                    padding(8.px)
                    backgroundColor(Color("#f5f5f5"))
                    borderRadius(4.px)
                    fontSize(12.px)
                }
            }) {
                healthCheck.details.forEach { (key, value) ->
                    Div({
                        style {
                            display(DisplayStyle.Flex)
                            justifyContent(JustifyContent.SpaceBetween)
                            marginBottom(4.px)
                        }
                    }) {
                        Span({
                            style {
                                fontWeight("500")
                            }
                        }) {
                            Text(key)
                        }
                        Span {
                            Text(value)
                        }
                    }
                }
            }
        }
        
        // Timestamp
        Div({
            style {
                marginTop(8.px)
                fontSize(12.px)
                color(Color("#9e9e9e"))
                textAlign("right")
            }
        }) {
            val date = js("new Date(healthCheck.timestamp)").toString()
            Text("Last updated: $date")
        }
    }
}

/**
 * Formats bytes to a human-readable string.
 */
private fun formatBytes(bytes: Long): String {
    val units = arrayOf("B", "KB", "MB", "GB", "TB")
    var value = bytes.toDouble()
    var unitIndex = 0
    
    while (value > 1024 && unitIndex < units.size - 1) {
        value /= 1024
        unitIndex++
    }
    
    return String.format("%.2f %s", value, units[unitIndex])
}