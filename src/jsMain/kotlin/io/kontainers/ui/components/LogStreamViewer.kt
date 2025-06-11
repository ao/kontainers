package io.kontainers.ui.components

import androidx.compose.runtime.*
import io.kontainers.api.KontainersApiClient
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.onEach
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*

/**
 * Log stream viewer component that displays real-time container logs.
 */
@Composable
fun LogStreamViewer(
    containerId: String,
    apiClient: KontainersApiClient,
    maxLines: Int = 500
) {
    var logs by remember { mutableStateOf<List<String>>(emptyList()) }
    var isStreaming by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    
    // Stream logs when the component is mounted
    LaunchedEffect(containerId, isStreaming) {
        if (isStreaming) {
            try {
                apiClient.streamContainerLogs(containerId)
                    .onEach { logLine ->
                        logs = (logs + logLine).takeLast(maxLines)
                    }
                    .catch { e ->
                        error = "Error streaming logs: ${e.message}"
                        isStreaming = false
                    }
                    .collect()
            } catch (e: Exception) {
                error = "Error streaming logs: ${e.message}"
                isStreaming = false
            }
        }
    }
    
    Div({
        style {
            display(DisplayStyle.Flex)
            flexDirection(FlexDirection.Column)
            gap(16.px)
            width(100.percent)
        }
    }) {
        // Controls
        Div({
            style {
                display(DisplayStyle.Flex)
                justifyContent(JustifyContent.SpaceBetween)
                alignItems(AlignItems.Center)
                marginBottom(8.px)
            }
        }) {
            H3({
                style {
                    margin(0.px)
                }
            }) {
                Text("Container Logs")
            }
            
            Button({
                style {
                    padding(8.px, 16.px)
                    borderRadius(4.px)
                    border(0.px, LineStyle.None, Color.transparent)
                    backgroundColor(if (isStreaming) Color("#f44336") else Color("#4caf50"))
                    color(Color.white)
                    cursor("pointer")
                    fontSize(14.px)
                }
                onClick { isStreaming = !isStreaming }
            }) {
                Text(if (isStreaming) "Pause" else "Resume")
            }
        }
        
        // Error message
        if (error != null) {
            Div({
                style {
                    backgroundColor(Color("#ffebee"))
                    color(Color("#c62828"))
                    padding(16.px)
                    borderRadius(4.px)
                    marginBottom(16.px)
                }
            }) {
                Text(error!!)
            }
        }
        
        // Log content
        Pre({
            style {
                backgroundColor(Color("#f5f5f5"))
                padding(16.px)
                borderRadius(4.px)
                overflowX("auto")
                overflowY("auto")
                maxHeight(500.px)
                margin(0.px)
                fontSize(14.px)
                fontFamily("monospace")
                width(100.percent)
            }
        }) {
            if (logs.isEmpty()) {
                Text("No logs available")
            } else {
                logs.forEach { line ->
                    Div {
                        Text(line)
                    }
                }
            }
        }
    }
}