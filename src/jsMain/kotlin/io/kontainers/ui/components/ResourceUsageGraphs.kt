package io.kontainers.ui.components

import androidx.compose.runtime.NoLiveLiterals

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import io.kontainers.model.DetailedContainerStats
import io.kontainers.ui.util.crypto
import kotlinx.browser.document
import kotlinx.browser.window
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*
import org.w3c.dom.CanvasRenderingContext2D
import org.w3c.dom.HTMLCanvasElement
import kotlin.math.max
import kotlin.math.min

/**
 * Component for displaying resource usage graphs.
 */
@Composable
fun ResourceUsageGraphs(
    statsHistory: List<DetailedContainerStats>,
    maxDataPoints: Int = 60,
    height: Int = 200,
    width: Int = 600
) {
    val processedData = remember(statsHistory) {
        processStatsHistory(statsHistory, maxDataPoints)
    }
    
    Div({
        style {
            display(DisplayStyle.Flex)
            flexDirection(FlexDirection.Column)
            gap(16.px)
            width(100.percent)
        }
    }) {
        // CPU Usage Graph
        ResourceGraph(
            title = "CPU Usage",
            data = processedData.map { it.cpuUsage },
            maxValue = 100.0, // CPU usage is in percentage
            unit = "%",
            height = height,
            width = width,
            color = "rgba(66, 133, 244, 0.8)",
            timestamps = processedData.map { it.timestamp }
        )
        
        // Memory Usage Graph
        ResourceGraph(
            title = "Memory Usage",
            data = processedData.map { it.memoryUsagePercentage * 100 },
            maxValue = 100.0, // Memory usage is in percentage
            unit = "%",
            height = height,
            width = width,
            color = "rgba(52, 168, 83, 0.8)",
            timestamps = processedData.map { it.timestamp }
        )
        
        // Network Usage Graph
        ResourceGraph(
            title = "Network I/O",
            data = processedData.map { (it.networkRx + it.networkTx) / (1024.0 * 1024.0) }, // Convert to MB
            maxValue = processedData.maxOfOrNull { (it.networkRx + it.networkTx) / (1024.0 * 1024.0) }?.let { max(it, 1.0) } ?: 1.0,
            unit = "MB",
            height = height,
            width = width,
            color = "rgba(234, 67, 53, 0.8)",
            timestamps = processedData.map { it.timestamp }
        )
        
        // Disk I/O Graph
        ResourceGraph(
            title = "Disk I/O",
            data = processedData.map { (it.blockRead + it.blockWrite) / (1024.0 * 1024.0) }, // Convert to MB
            maxValue = processedData.maxOfOrNull { (it.blockRead + it.blockWrite) / (1024.0 * 1024.0) }?.let { max(it, 1.0) } ?: 1.0,
            unit = "MB",
            height = height,
            width = width,
            color = "rgba(251, 188, 5, 0.8)",
            timestamps = processedData.map { it.timestamp }
        )
    }
}

/**
 * Component for displaying a single resource graph.
 */
@Composable
fun ResourceGraph(
    title: String,
    data: List<Double>,
    maxValue: Double,
    unit: String,
    height: Int,
    width: Int,
    color: String,
    timestamps: List<Long>
) {
    val canvasId = remember { "canvas-${title.replace(" ", "-").lowercase()}-${crypto.getRandomValues(ByteArray(4)).contentHashCode()}" }
    
    Div({
        style {
            display(DisplayStyle.Flex)
            flexDirection(FlexDirection.Column)
            gap(8.px)
            width(100.percent)
            maxWidth(width.px)
        }
    }) {
        // Title
        H3({
            style {
                margin(0.px)
                fontSize(16.px)
                fontWeight("500")
            }
        }) {
            Text(title)
        }
        
        // Graph
        Canvas({
            id(canvasId)
            attr("width", width.toString())
            attr("height", height.toString())
            style {
                border(1.px, LineStyle.Solid, Color("#e0e0e0"))
                borderRadius(4.px)
                backgroundColor(Color("#f9f9f9"))
            }
        })
        
        // Draw the graph
        LaunchedEffect(data, canvasId) {
            val canvas = document.getElementById(canvasId) as? HTMLCanvasElement ?: return@LaunchedEffect
            val ctx = canvas.getContext("2d") as? CanvasRenderingContext2D ?: return@LaunchedEffect
            
            drawGraph(ctx, data, maxValue, color, width, height, timestamps)
        }
    }
}

/**
 * Draws a graph on a canvas.
 */
@NoLiveLiterals
private fun drawGraph(
    ctx: CanvasRenderingContext2D,
    data: List<Double>,
    maxValue: Double,
    color: String,
    width: Int,
    height: Int,
    timestamps: List<Long>
) {
    // Clear the canvas
    ctx.clearRect(0.0, 0.0, width.toDouble(), height.toDouble())
    
    if (data.isEmpty()) return
    
    val padding = 30
    val graphWidth = width - padding * 2
    val graphHeight = height - padding * 2
    
    // Draw axes
    ctx.beginPath()
    ctx.strokeStyle = "#ccc"
    ctx.lineWidth = 1.0
    
    // Y-axis
    ctx.moveTo(padding.toDouble(), padding.toDouble())
    ctx.lineTo(padding.toDouble(), (height - padding).toDouble())
    
    // X-axis
    ctx.moveTo(padding.toDouble(), (height - padding).toDouble())
    ctx.lineTo((width - padding).toDouble(), (height - padding).toDouble())
    ctx.stroke()
    
    // Draw Y-axis labels
    ctx.fillStyle = "#666"
    ctx.font = "10px Arial"
    ctx.asDynamic().textAlign = "right"
    ctx.asDynamic().textBaseline = "middle"
    
    val ySteps = 5
    for (i in 0..ySteps) {
        val y = padding + (graphHeight * (ySteps - i) / ySteps)
        val value = maxValue * i / ySteps
        ctx.fillText("${value.toInt()}", (padding - 5).toDouble(), y.toDouble())
    }
    
    // Draw X-axis labels (timestamps)
    ctx.asDynamic().textAlign = "center"
    ctx.asDynamic().textBaseline = "top"
    
    if (timestamps.isNotEmpty()) {
        val xSteps = min(data.size, 5)
        for (i in 0 until xSteps) {
            val index = (data.size - 1) * i / (xSteps - 1)
            if (index < timestamps.size) {
                val x = padding + (graphWidth * i / (xSteps - 1))
                val timestamp = timestamps[index]
                val date = js("new Date(timestamp)")
                val timeString = js("date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })")
                ctx.fillText(timeString as String, x.toDouble(), (height - padding + 5).toDouble())
            }
        }
    }
    
    // Draw the graph line
    if (data.size > 1) {
        ctx.beginPath()
        ctx.strokeStyle = color
        ctx.lineWidth = 2.0
        
        val step = graphWidth.toDouble() / (data.size - 1)
        
        for (i in data.indices) {
            val x = padding + i * step
            val normalizedValue = data[i] / maxValue
            val y = padding + graphHeight - (normalizedValue * graphHeight)
            
            if (i == 0) {
                ctx.moveTo(x, y)
            } else {
                ctx.lineTo(x, y)
            }
        }
        
        ctx.stroke()
        
        // Fill area under the graph
        ctx.lineTo(padding + (data.size - 1) * step, (height - padding).toDouble())
        ctx.lineTo(padding.toDouble(), (height - padding).toDouble())
        ctx.closePath()
        ctx.fillStyle = color.replace("0.8", "0.2")
        ctx.fill()
    }
}

/**
 * Processes stats history to ensure we have a consistent number of data points.
 */
private fun processStatsHistory(
    statsHistory: List<DetailedContainerStats>,
    maxDataPoints: Int
): List<DetailedContainerStats> {
    return if (statsHistory.size <= maxDataPoints) {
        statsHistory
    } else {
        // Take the most recent data points
        statsHistory.takeLast(maxDataPoints)
    }
}