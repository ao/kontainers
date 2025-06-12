package io.kontainers.ui.screens

import androidx.compose.runtime.Composable
import io.kontainers.api.KontainersApiClient
import io.kontainers.state.AppStateManager
import io.kontainers.ui.components.*
import io.kontainers.ui.util.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*

/**
 * Screen for displaying proxy analytics and monitoring data.
 */
class ProxyAnalyticsScreen(
    private val apiClient: KontainersApiClient,
    private val coroutineScope: CoroutineScope = CoroutineScope(Dispatchers.Main)
) {
    // Component instances
    private val proxyTrafficMonitor = ProxyTrafficMonitor(apiClient, coroutineScope)
    private val requestResponseLogger = RequestResponseLogger(apiClient, coroutineScope)
    private val proxyPerformanceMetrics = ProxyPerformanceMetrics(apiClient, coroutineScope)
    private val errorRateTracker = ErrorRateTracker(apiClient, coroutineScope)
    
    // Tab selection
    private var selectedTab = "traffic"
    
    /**
     * Renders the proxy analytics screen.
     */
    @Composable
    fun render() {
        val proxyRules = AppStateManager.state.value.proxyRules
        val selectedRuleId = AppStateManager.state.value.selectedProxyRuleId
        val selectedRule = proxyRules.find { it.id == selectedRuleId }
        
        Div(attrs = {
            classes("proxy-analytics-screen")
            style {
                padding(16.px)
            }
        }) {
            H1 {
                Text("Proxy Analytics & Monitoring")
            }
            
            // Rule selector
            Div(attrs = {
                classes("rule-selector")
                style {
                    marginBottom(24.px)
                }
            }) {
                Label(attrs = {
                    attr("for", "rule-select")
                    style {
                        display(DisplayStyle.Block)
                        marginBottom(8.px)
                        fontWeight("bold")
                    }
                }) {
                    Text("Select Proxy Rule:")
                }
                
                Select(attrs = {
                    id("rule-select")
                    style {
                        padding(8.px)
                        borderRadius(4.px)
                        border(1.px, LineStyle.Solid, Color("#ccc"))
                        width(300.px)
                    }
                    onChange {
                        val newRuleId = it.target.value
                        AppStateManager.selectProxyRule(newRuleId)
                        
                        // Load data for the selected rule
                        loadDataForRule(newRuleId)
                    }
                }) {
                    if (proxyRules.isEmpty()) {
                        Option(value = "") {
                            Text("No proxy rules available")
                        }
                    } else {
                        Option(value = "", attrs = {
                            if (selectedRuleId == null) {
                                attr("selected", "true")
                            }
                        }) {
                            Text("-- Select a proxy rule --")
                        }
                        
                        proxyRules.forEach { rule ->
                            Option(value = rule.id, attrs = {
                                if (rule.id == selectedRuleId) {
                                    attr("selected", "true")
                                }
                            }) {
                                Text("${rule.name} (${rule.sourceHost}${rule.sourcePath} → ${rule.targetContainer}:${rule.targetPort})")
                            }
                        }
                    }
                }
            }
            
            if (selectedRule != null) {
                // Tabs
                Div(attrs = {
                    classes("analytics-tabs")
                    style {
                        display(DisplayStyle.Flex)
                        borderBottom("1px", "solid", "#ccc")
                        marginBottom(16.px)
                    }
                }) {
                    renderTab("traffic", "Traffic Monitor", "mdi-chart-line")
                    renderTab("logs", "Request/Response Logs", "mdi-text-box-outline")
                    renderTab("performance", "Performance Metrics", "mdi-speedometer")
                    renderTab("errors", "Error Tracking", "mdi-alert-circle-outline")
                }
                
                // Tab content
                Div(attrs = {
                    classes("tab-content")
                }) {
                    when (selectedTab) {
                        "traffic" -> proxyTrafficMonitor.render(selectedRule)
                        "logs" -> requestResponseLogger.render(selectedRule)
                        "performance" -> proxyPerformanceMetrics.render(selectedRule)
                        "errors" -> errorRateTracker.render(selectedRule)
                    }
                }
            } else {
                // No rule selected
                Div(attrs = {
                    style {
                        padding(32.px)
                        textAlign("center")
                        backgroundColor(Color("#f5f5f5"))
                        borderRadius(8.px)
                    }
                }) {
                    if (proxyRules.isEmpty()) {
                        P {
                            Text("No proxy rules have been created yet. Create a proxy rule to start monitoring traffic.")
                        }
                        
                        Button(attrs = {
                            onClick {
                                AppStateManager.navigateTo(io.kontainers.state.Screen.PROXY)
                            }
                            style {
                                padding(8.px, 16.px)
                                backgroundColor(Color("#1976d2"))
                                color(Color("white"))
                                border(0.px)
                                borderRadius(4.px)
                                cursor("pointer")
                            }
                        }) {
                            Text("Go to Proxy Management")
                        }
                    } else {
                        P {
                            Text("Select a proxy rule from the dropdown above to view analytics data.")
                        }
                    }
                }
            }
        }
    }
    
    /**
     * Renders a tab button.
     */
    @Composable
    private fun ElementScope<*>.renderTab(id: String, label: String, iconClass: String) {
        Button(attrs = {
            classes("tab-button", if (selectedTab == id) "active" else "")
            onClick {
                selectedTab = id
            }
            style {
                padding(12.px, 16.px)
                backgroundColor(if (selectedTab == id) Color("#f5f5f5") else Color.transparent)
                border(0.px)
                borderBottom(
                    if (selectedTab == id) "2px" else "0px",
                    "solid",
                    if (selectedTab == id) "#1976d2" else "transparent"
                )
                cursor("pointer")
                fontWeight(if (selectedTab == id) "bold" else "normal")
                color(if (selectedTab == id) Color("#1976d2") else Color("#666"))
                display(DisplayStyle.Flex)
                alignItems(AlignItems.Center)
                gap(8.px)
            }
        }) {
            I(attrs = {
                classes("mdi", iconClass)
                style {
                    fontSize(18.px)
                }
            })
            Text(label)
        }
    }
    
    /**
     * Loads data for the selected rule.
     */
    private fun loadDataForRule(ruleId: String) {
        if (ruleId.isBlank()) return
        
        AppStateManager.setLoading(true)
        
        coroutineScope.launch {
            try {
                // Load traffic data
                val trafficData = apiClient.getProxyTrafficData(ruleId)
                AppStateManager.updateProxyTrafficData(ruleId, trafficData)
                
                // Load traffic summary
                val trafficSummary = apiClient.getProxyTrafficSummary(ruleId)
                AppStateManager.updateProxyTrafficSummary(ruleId, trafficSummary)
                
                // Load errors
                val errors = apiClient.getProxyErrors(ruleId)
                AppStateManager.updateProxyErrors(ruleId, errors)
                
                // Load error summary
                val errorSummary = apiClient.getProxyErrorSummary(ruleId)
                AppStateManager.updateProxyErrorSummary(ruleId, errorSummary)
                
                // Load request logs
                val logs = apiClient.getRequestLogs(ruleId)
                AppStateManager.updateRequestLogs(ruleId, logs)
                
                // Load alert configurations
                val alertConfigs = apiClient.getAlertConfigs()
                AppStateManager.updateAlertConfigs(alertConfigs)
                
                // Load active alerts
                val activeAlerts = apiClient.getActiveAlerts()
                AppStateManager.updateActiveAlerts(activeAlerts)
            } catch (e: Exception) {
                console.error("Failed to load data for rule: ${e.message}")
                AppStateManager.setError("Failed to load data for rule: ${e.message}")
            } finally {
                AppStateManager.setLoading(false)
            }
        }
    }
}