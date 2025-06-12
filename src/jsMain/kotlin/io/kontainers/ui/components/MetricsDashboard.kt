package io.kontainers.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import io.kontainers.api.KontainersApiClient
import io.kontainers.model.Container
import io.kontainers.model.DetailedContainerStats
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*

/**
 * Component for displaying a comprehensive metrics dashboard.
 */
@Composable
fun MetricsDashboard(
    container: Container,
    apiClient: KontainersApiClient
) {
    var isLoading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var currentStats by remember { mutableStateOf<DetailedContainerStats?>(null) }
    val statsHistory = remember { MutableStateFlow<List<DetailedContainerStats>>(emptyList()) }
    val history by statsHistory.collectAsState()
    
    // Load initial stats and history
    LaunchedEffect(container.id) {
        try {
            isLoading = true
            error = null
            
            // Get current stats
            val stats = apiClient.getContainerStats(container.id, detailed = true) as DetailedContainerStats
            currentStats = stats
            
            // Get stats history
            val historyData = apiClient.getContainerStatsHistory(container.id)
            statsHistory.value = historyData
            
            isLoading = false
        } catch (e: Exception) {
            error = "Failed to load metrics: ${e.message}"
            isLoading = false
        }
    }
    
    // Stream stats updates
    LaunchedEffect(container.id) {
        try {
            apiClient.streamContainerStats(container.id, interval = 2000, detailed = true).collect { stats ->
                if (stats is DetailedContainerStats) {
                    currentStats = stats
                    
                    // Update history
                    val currentHistory = statsHistory.value.toMutableList()
                    currentHistory.add(stats)
                    
                    // Keep only the last 60 data points (2 minutes at 2-second intervals)
                    if (currentHistory.size > 60) {
                        statsHistory.value = currentHistory.takeLast(60)
                    } else {
                        statsHistory.value = currentHistory
                    }
                }
            }
        } catch (e: Exception) {
            error = "Failed to stream metrics: ${e.message}"
        }
    }
    
    Div({
        style {
            padding(16.px)
        }
    }) {
        // Header
        Div({
            style {
                display(DisplayStyle.Flex)
                justifyContent(JustifyContent.SpaceBetween)
                alignItems(AlignItems.Center)
                marginBottom(24.px)
            }
        }) {
            Div {
                H1({ style { margin(0.px) } }) { Text("Container Metrics") }
                P({ style { margin(0.px) } }) { Text("Real-time performance monitoring for ${container.name}") }
            }
            
            // Refresh button
            Button({
                style {
                    padding(8.px, 16.px)
                    backgroundColor(Color("#2196f3"))
                    color(Color.white)
                    property("border", "0px none transparent")
                    borderRadius(4.px)
                    cursor("pointer")
                }
                onClick {
                    kotlinx.coroutines.MainScope().launch {
                        try {
                            isLoading = true
                            error = null
                            
                            // Get current stats
                            val stats = apiClient.getContainerStats(container.id, detailed = true) as DetailedContainerStats
                            currentStats = stats
                            
                            // Get stats history
                            val historyData = apiClient.getContainerStatsHistory(container.id)
                            statsHistory.value = historyData
                            
                            isLoading = false
                        } catch (e: Exception) {
                            error = "Failed to refresh metrics: ${e.message}"
                            isLoading = false
                        }
                    }
                }
            }) {
                Text("Refresh")
            }
        }
        
        if (error != null) {
            ErrorMessage(error!!) {
                error = null
                kotlinx.coroutines.MainScope().launch {
                    try {
                        isLoading = true
                        
                        // Get current stats
                        val stats = apiClient.getContainerStats(container.id, detailed = true) as DetailedContainerStats
                        currentStats = stats
                        
                        // Get stats history
                        val historyData = apiClient.getContainerStatsHistory(container.id)
                        statsHistory.value = historyData
                        
                        isLoading = false
                    } catch (e: Exception) {
                        error = "Failed to load metrics: ${e.message}"
                        isLoading = false
                    }
                }
            }
        }
        
        if (isLoading) {
            LoadingIndicator()
        } else if (currentStats != null) {
            // Dashboard layout
            Div({
                style {
                    display(DisplayStyle.Grid)
                    gridTemplateColumns("1fr 300px")
                    gap(24.px)
                    
                    // Make it responsive
                    property("@media (max-width: 768px)", "{")
                    property("grid-template-columns", "1fr")
                    property("}", "")
                }
            }) {
                // Left column: Resource usage graphs
                Div({
                    style {
                        display(DisplayStyle.Flex)
                        flexDirection(FlexDirection.Column)
                        gap(24.px)
                    }
                }) {
                    // Resource usage graphs
                    ResourceUsageGraphs(
                        statsHistory = history,
                        maxDataPoints = 60,
                        height = 200,
                        width = 600
                    )
                    
                    // Container info
                    ContainerInfoCard(container)
                }
                
                // Right column: Health status and key metrics
                Div({
                    style {
                        display(DisplayStyle.Flex)
                        flexDirection(FlexDirection.Column)
                        gap(24.px)
                    }
                }) {
                    // Health status indicator
                    HealthStatusIndicator(currentStats!!)
                    
                    // Key metrics
                    KeyMetricsCard(currentStats!!)
                }
            }
        }
    }
}

/**
 * Component for displaying container information.
 */
@Composable
private fun ContainerInfoCard(container: Container) {
    Div({
        style {
            padding(16.px)
            borderRadius(8.px)
            backgroundColor(Color("#f5f5f5"))
            border(1.px, LineStyle.Solid, Color("#e0e0e0"))
        }
    }) {
        H3({
            style {
                margin(0.px)
                marginBottom(16.px)
                fontSize(18.px)
                fontWeight("500")
            }
        }) {
            Text("Container Information")
        }
        
        Table({
            style {
                width(100.percent)
                property("border-collapse", "collapse")
            }
        }) {
            Tbody {
                // ID
                Tr {
                    Td({
                        style {
                            padding(8.px)
                            fontWeight("500")
                            width(120.px)
                        }
                    }) {
                        Text("ID")
                    }
                    Td({
                        style {
                            padding(8.px)
                            fontFamily("monospace")
                        }
                    }) {
                        Text(container.id.take(12))
                    }
                }
                
                // Name
                Tr {
                    Td({
                        style {
                            padding(8.px)
                            fontWeight("500")
                        }
                    }) {
                        Text("Name")
                    }
                    Td({
                        style {
                            padding(8.px)
                        }
                    }) {
                        Text(container.name)
                    }
                }
                
                // Image
                Tr {
                    Td({
                        style {
                            padding(8.px)
                            fontWeight("500")
                        }
                    }) {
                        Text("Image")
                    }
                    Td({
                        style {
                            padding(8.px)
                        }
                    }) {
                        Text(container.image)
                    }
                }
                
                // Status
                Tr {
                    Td({
                        style {
                            padding(8.px)
                            fontWeight("500")
                        }
                    }) {
                        Text("Status")
                    }
                    Td({
                        style {
                            padding(8.px)
                        }
                    }) {
                        Text(container.status)
                    }
                }
                
                // Created
                Tr {
                    Td({
                        style {
                            padding(8.px)
                            fontWeight("500")
                        }
                    }) {
                        Text("Created")
                    }
                    Td({
                        style {
                            padding(8.px)
                        }
                    }) {
                        val timestamp = container.created * 1000
                        val date = js("new Date").apply {
                            asDynamic().setTime(timestamp)
                        }
                        val dateString = date.asDynamic().toLocaleString() as String
                        Text(dateString)
                    }
                }
            }
        }
    }
}

/**
 * Component for displaying key metrics.
 */
@Composable
private fun KeyMetricsCard(stats: DetailedContainerStats) {
    Div({
        style {
            padding(16.px)
            borderRadius(8.px)
            backgroundColor(Color("#f5f5f5"))
            border(1.px, LineStyle.Solid, Color("#e0e0e0"))
        }
    }) {
        H3({
            style {
                margin(0.px)
                marginBottom(16.px)
                fontSize(18.px)
                fontWeight("500")
            }
        }) {
            Text("Key Metrics")
        }
        
        Table({
            style {
                width(100.percent)
                property("border-collapse", "collapse")
            }
        }) {
            Tbody {
                // CPU Usage
                Tr {
                    Td({
                        style {
                            padding(8.px)
                            fontWeight("500")
                        }
                    }) {
                        Text("CPU Usage")
                    }
                    Td({
                        style {
                            padding(8.px)
                        }
                    }) {
                        Text("${stats.cpuUsage.toInt()}%")
                    }
                }
                
                // Memory Usage
                Tr {
                    Td({
                        style {
                            padding(8.px)
                            fontWeight("500")
                        }
                    }) {
                        Text("Memory Usage")
                    }
                    Td({
                        style {
                            padding(8.px)
                        }
                    }) {
                        val usedMB = stats.memoryUsage / (1024 * 1024)
                        val limitMB = stats.memoryLimit / (1024 * 1024)
                        Text("$usedMB MB / $limitMB MB (${(stats.memoryUsagePercentage * 100).toInt()}%)")
                    }
                }
                
                // Network I/O
                Tr {
                    Td({
                        style {
                            padding(8.px)
                            fontWeight("500")
                        }
                    }) {
                        Text("Network I/O")
                    }
                    Td({
                        style {
                            padding(8.px)
                        }
                    }) {
                        val rxMB = stats.networkRx / (1024 * 1024)
                        val txMB = stats.networkTx / (1024 * 1024)
                        Text("↓ $rxMB MB / ↑ $txMB MB")
                    }
                }
                
                // Disk I/O
                Tr {
                    Td({
                        style {
                            padding(8.px)
                            fontWeight("500")
                        }
                    }) {
                        Text("Disk I/O")
                    }
                    Td({
                        style {
                            padding(8.px)
                        }
                    }) {
                        val readMB = stats.blockRead / (1024 * 1024)
                        val writeMB = stats.blockWrite / (1024 * 1024)
                        Text("↓ $readMB MB / ↑ $writeMB MB")
                    }
                }
                
                // Process Count
                Tr {
                    Td({
                        style {
                            padding(8.px)
                            fontWeight("500")
                        }
                    }) {
                        Text("Process Count")
                    }
                    Td({
                        style {
                            padding(8.px)
                        }
                    }) {
                        Text("${stats.pids}")
                    }
                }
                
                // Restart Count
                Tr {
                    Td({
                        style {
                            padding(8.px)
                            fontWeight("500")
                        }
                    }) {
                        Text("Restart Count")
                    }
                    Td({
                        style {
                            padding(8.px)
                        }
                    }) {
                        Text("${stats.restartCount}")
                    }
                }
            }
        }
    }
}