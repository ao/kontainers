package io.kontainers.ui.components

import androidx.compose.runtime.*
import io.kontainers.api.KontainersApiClient
import io.kontainers.model.ProxyRule
import kotlinx.coroutines.launch
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*
import io.kontainers.ui.util.*

/**
 * Component for testing and validating proxy rules.
 */
@Composable
fun ProxyRuleTester(
    rule: ProxyRule,
    onClose: () -> Unit
) {
    val apiClient = remember { KontainersApiClient() }
    var isLoading by remember { mutableStateOf(false) }
    var testResult by remember { mutableStateOf<Boolean?>(null) }
    var validationResult by remember { mutableStateOf<Map<String, Any>?>(null) }
    var validationIssues by remember { mutableStateOf<List<String>>(emptyList()) }
    
    // Run validation on initial render
    LaunchedEffect(rule) {
        validateRule(apiClient, rule) { result ->
            validationResult = result
            validationIssues = (result["issues"] as? List<*>)?.filterIsInstance<String>() ?: emptyList()
        }
    }
    
    Div({
        style {
            backgroundColor(Color.white)
            borderRadius(8.px)
            property("box-shadow", "0 2px 4px rgba(0,0,0,0.1)")
            padding(24.px)
            maxWidth(800.px)
        }
    }) {
        // Header
        Div({
            style {
                display(DisplayStyle.Flex)
                justifyContent(JustifyContent.SpaceBetween)
                alignItems(AlignItems.Center)
                marginBottom(16.px)
            }
        }) {
            H3({
                style {
                    margin(0.px)
                }
            }) {
                Text("Proxy Rule Tester")
            }
            
            Button({
                style {
                    padding(6.px, 12.px)
                    backgroundColor(Color.transparent)
                    color(Color("#424242"))
                    border(1.px, LineStyle.Solid, Color("#e0e0e0"))
                    borderRadius(4.px)
                    cursor("pointer")
                    fontSize(14.px)
                }
                onClick { onClose() }
            }) {
                Text("Close")
            }
        }
        
        // Rule summary
        Div({
            style {
                backgroundColor(Color("#f5f5f5"))
                padding(16.px)
                borderRadius(4.px)
                marginBottom(24.px)
            }
        }) {
            H4({
                style {
                    margin(0.px, 0.px, 8.px, 0.px)
                }
            }) {
                Text("Rule Summary")
            }
            
            Div({
                style {
                    display(DisplayStyle.Grid)
                    gridTemplateColumns("1fr 1fr")
                    gap(8.px)
                }
            }) {
                // Source
                Div {
                    Span({
                        style {
                            fontWeight("bold")
                        }
                    }) { Text("Source: ") }
                    Text("${rule.protocol}://${rule.sourceHost}${rule.sourcePath}")
                }
                
                // Target
                Div {
                    Span({
                        style {
                            fontWeight("bold")
                        }
                    }) { Text("Target: ") }
                    if (rule.loadBalancing != null && rule.loadBalancing.targets.isNotEmpty()) {
                        Text("Load balanced (${rule.loadBalancing.targets.size} targets)")
                    } else {
                        Text("${rule.targetContainer}:${rule.targetPort}")
                    }
                }
                
                // SSL
                Div {
                    Span({
                        style {
                            fontWeight("bold")
                        }
                    }) { Text("SSL: ") }
                    Text(if (rule.sslEnabled) "Enabled" else "Disabled")
                }
                
                // Status
                Div {
                    Span({
                        style {
                            fontWeight("bold")
                        }
                    }) { Text("Status: ") }
                    Text(if (rule.enabled) "Active" else "Inactive")
                }
            }
        }
        
        // Validation results
        Div({
            style {
                marginBottom(24.px)
            }
        }) {
            H4 { Text("Validation") }
            
            if (validationResult == null) {
                Div({
                    style {
                        display(DisplayStyle.Flex)
                        justifyContent(JustifyContent.Center)
                        padding(16.px)
                    }
                }) {
                    Text("Validating rule...")
                }
            } else {
                val isValid = validationResult!!["valid"] as Boolean
                
                Div({
                    style {
                        backgroundColor(if (isValid) Color("#d4edda") else Color("#f8d7da"))
                        color(if (isValid) Color("#155724") else Color("#721c24"))
                        padding(16.px)
                        borderRadius(4.px)
                        marginBottom(if (validationIssues.isNotEmpty()) 16.px else 0.px)
                    }
                }) {
                    if (isValid) {
                        Text("✓ Rule configuration is valid")
                    } else {
                        Text("✗ Rule configuration has issues")
                    }
                }
                
                if (validationIssues.isNotEmpty()) {
                    Ul({
                        style {
                            backgroundColor(Color("#f8d7da"))
                            color(Color("#721c24"))
                            padding(16.px, 16.px, 16.px, 40.px)
                            borderRadius(4.px)
                            margin(0.px)
                        }
                    }) {
                        validationIssues.forEach { issue ->
                            Li { Text(issue) }
                        }
                    }
                }
            }
        }
        
        // Connection test
        Div {
            H4 { Text("Connection Test") }
            
            P { 
                Text("Test if the proxy can connect to the target container. " +
                     "This will attempt to establish a connection to the target container " +
                     "and verify that it's responding.")
            }
            
            if (testResult == null) {
                Button({
                    style {
                        padding(8.px, 16.px)
                        backgroundColor(Color("#1976d2"))
                        color(Color.white)
                        border(0.px, LineStyle.None, Color.transparent)
                        borderRadius(4.px)
                        cursor("pointer")
                        fontSize(14.px)
                    }
                    onClick { testConnection(apiClient, rule) }
                    disabled(isLoading)
                }) {
                    Text(if (isLoading) "Testing..." else "Test Connection")
                }
            } else {
                Div({
                    style {
                        backgroundColor(if (testResult == true) Color("#d4edda") else Color("#f8d7da"))
                        color(if (testResult == true) Color("#155724") else Color("#721c24"))
                        padding(16.px)
                        borderRadius(4.px)
                        marginBottom(16.px)
                    }
                }) {
                    if (testResult == true) {
                        Text("✓ Connection successful! The proxy can reach the target container.")
                    } else {
                        Text("✗ Connection failed. The proxy cannot reach the target container.")
                    }
                }
                
                Button({
                    style {
                        padding(8.px, 16.px)
                        backgroundColor(Color("#6c757d"))
                        color(Color.white)
                        border(0.px, LineStyle.None, Color.transparent)
                        borderRadius(4.px)
                        cursor("pointer")
                        fontSize(14.px)
                    }
                    onClick { testResult = null }
                }) {
                    Text("Test Again")
                }
            }
        }
    }
}

/**
 * Tests the connection to the target container.
 */
private fun testConnection(
    apiClient: KontainersApiClient,
    rule: ProxyRule
) {
    kotlinx.coroutines.MainScope().launch {
        try {
            val result = apiClient.testProxyRule(rule)
            // Update state with result
        } catch (e: Exception) {
            // Handle error
        }
    }
}

/**
 * Validates a proxy rule.
 */
private fun validateRule(
    apiClient: KontainersApiClient,
    rule: ProxyRule,
    callback: (Map<String, Any>) -> Unit
) {
    kotlinx.coroutines.MainScope().launch {
        try {
            val result = apiClient.validateProxyRule(rule)
            callback(result)
        } catch (e: Exception) {
            callback(mapOf("valid" to false, "issues" to listOf("Failed to validate rule: ${e.message}")))
        }
    }
}