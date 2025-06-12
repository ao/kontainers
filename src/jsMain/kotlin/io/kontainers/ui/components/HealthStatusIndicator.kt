package io.kontainers.ui.components

import androidx.compose.runtime.Composable
import io.kontainers.model.DetailedContainerStats
import io.kontainers.model.HealthStatus
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*

/**
 * Component for displaying container health status.
 */
@Composable
fun HealthStatusIndicator(stats: DetailedContainerStats) {
    Div({
        style {
            display(DisplayStyle.Flex)
            flexDirection(FlexDirection.Column)
            gap(8.px)
            padding(16.px)
            borderRadius(8.px)
            backgroundColor(getHealthStatusBackgroundColor(stats.healthStatus))
            border(1.px, LineStyle.Solid, getHealthStatusBorderColor(stats.healthStatus))
        }
    }) {
        // Health Status Header
        Div({
            style {
                display(DisplayStyle.Flex)
                alignItems(AlignItems.Center)
                gap(8.px)
            }
        }) {
            // Status Icon
            Div({
                style {
                    width(16.px)
                    height(16.px)
                    borderRadius(50.percent)
                    backgroundColor(getHealthStatusColor(stats.healthStatus))
                }
            })
            
            // Status Text
            H3({
                style {
                    margin(0.px)
                    color(getHealthStatusTextColor(stats.healthStatus))
                    fontSize(18.px)
                    fontWeight("500")
                }
            }) {
                Text(getHealthStatusText(stats.healthStatus))
            }
        }
        
        // Health Metrics
        Div({
            style {
                marginTop(12.px)
                display(DisplayStyle.Flex)
                flexDirection(FlexDirection.Column)
                gap(8.px)
            }
        }) {
            // CPU Usage
            HealthMetric(
                label = "CPU Usage",
                value = "${stats.cpuUsage.toInt()}%",
                status = getMetricStatus(stats.cpuUsage, 80.0, 95.0)
            )
            
            // Memory Usage
            HealthMetric(
                label = "Memory Usage",
                value = "${(stats.memoryUsagePercentage * 100).toInt()}%",
                status = getMetricStatus(stats.memoryUsagePercentage * 100, 80.0, 95.0)
            )
            
            // Restart Count
            HealthMetric(
                label = "Restart Count",
                value = stats.restartCount.toString(),
                status = getMetricStatus(stats.restartCount.toDouble(), 3.0, 5.0)
            )
            
            // Process Count
            HealthMetric(
                label = "Process Count",
                value = stats.pids.toString(),
                status = MetricStatus.NORMAL
            )
        }
        
        // Health Check Logs
        if (stats.healthCheckLogs.isNotEmpty()) {
            Div({
                style {
                    marginTop(16.px)
                }
            }) {
                H4({
                    style {
                        margin(0.px)
                        marginBottom(8.px)
                        fontSize(14.px)
                    }
                }) {
                    Text("Health Check Logs")
                }
                
                Div({
                    style {
                        maxHeight(150.px)
                        overflowY("auto")
                        padding(8.px)
                        backgroundColor(Color("#f5f5f5"))
                        borderRadius(4.px)
                        fontSize(12.px)
                        fontFamily("monospace")
                    }
                }) {
                    stats.healthCheckLogs.takeLast(5).forEach { log ->
                        Div({
                            style {
                                marginBottom(4.px)
                            }
                        }) {
                            Text(log)
                        }
                    }
                }
            }
        }
    }
}

/**
 * Component for displaying a health metric.
 */
@Composable
private fun HealthMetric(
    label: String,
    value: String,
    status: MetricStatus
) {
    Div({
        style {
            display(DisplayStyle.Flex)
            justifyContent(JustifyContent.SpaceBetween)
            alignItems(AlignItems.Center)
        }
    }) {
        // Label
        Span({
            style {
                fontSize(14.px)
                fontWeight("500")
            }
        }) {
            Text(label)
        }
        
        // Value with status indicator
        Div({
            style {
                display(DisplayStyle.Flex)
                alignItems(AlignItems.Center)
                gap(8.px)
            }
        }) {
            // Status indicator
            Div({
                style {
                    width(8.px)
                    height(8.px)
                    borderRadius(50.percent)
                    backgroundColor(getMetricStatusColor(status))
                }
            })
            
            // Value
            Span({
                style {
                    fontSize(14.px)
                    fontWeight("bold")
                }
            }) {
                Text(value)
            }
        }
    }
}

/**
 * Enum for metric status.
 */
private enum class MetricStatus {
    NORMAL,
    WARNING,
    CRITICAL
}

/**
 * Gets the metric status based on thresholds.
 */
private fun getMetricStatus(value: Double, warningThreshold: Double, criticalThreshold: Double): MetricStatus {
    return when {
        value >= criticalThreshold -> MetricStatus.CRITICAL
        value >= warningThreshold -> MetricStatus.WARNING
        else -> MetricStatus.NORMAL
    }
}

/**
 * Gets the color for a metric status.
 */
private fun getMetricStatusColor(status: MetricStatus): CSSColorValue {
    return when (status) {
        MetricStatus.NORMAL -> Color("#4caf50")
        MetricStatus.WARNING -> Color("#ff9800")
        MetricStatus.CRITICAL -> Color("#f44336")
    }
}

/**
 * Gets the background color for a health status.
 */
private fun getHealthStatusBackgroundColor(status: HealthStatus): CSSColorValue {
    return when (status) {
        HealthStatus.HEALTHY -> Color("#e8f5e9")
        HealthStatus.UNHEALTHY -> Color("#ffebee")
        HealthStatus.STARTING -> Color("#fff8e1")
        HealthStatus.UNKNOWN -> Color("#f5f5f5")
    }
}

/**
 * Gets the border color for a health status.
 */
private fun getHealthStatusBorderColor(status: HealthStatus): CSSColorValue {
    return when (status) {
        HealthStatus.HEALTHY -> Color("#c8e6c9")
        HealthStatus.UNHEALTHY -> Color("#ffcdd2")
        HealthStatus.STARTING -> Color("#ffecb3")
        HealthStatus.UNKNOWN -> Color("#e0e0e0")
    }
}

/**
 * Gets the text color for a health status.
 */
private fun getHealthStatusTextColor(status: HealthStatus): CSSColorValue {
    return when (status) {
        HealthStatus.HEALTHY -> Color("#2e7d32")
        HealthStatus.UNHEALTHY -> Color("#c62828")
        HealthStatus.STARTING -> Color("#ef6c00")
        HealthStatus.UNKNOWN -> Color("#616161")
    }
}

/**
 * Gets the color for a health status.
 */
private fun getHealthStatusColor(status: HealthStatus): CSSColorValue {
    return when (status) {
        HealthStatus.HEALTHY -> Color("#4caf50")
        HealthStatus.UNHEALTHY -> Color("#f44336")
        HealthStatus.STARTING -> Color("#ff9800")
        HealthStatus.UNKNOWN -> Color("#9e9e9e")
    }
}

/**
 * Gets the text for a health status.
 */
private fun getHealthStatusText(status: HealthStatus): String {
    return when (status) {
        HealthStatus.HEALTHY -> "Healthy"
        HealthStatus.UNHEALTHY -> "Unhealthy"
        HealthStatus.STARTING -> "Starting"
        HealthStatus.UNKNOWN -> "Unknown"
    }
}