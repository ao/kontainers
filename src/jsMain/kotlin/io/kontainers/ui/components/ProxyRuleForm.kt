package io.kontainers.ui.components

import androidx.compose.runtime.*
import io.kontainers.model.*
import io.kontainers.api.KontainersApiClient
import kotlinx.coroutines.launch
import org.jetbrains.compose.web.attributes.InputType
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*

/**
 * Component for displaying a form section with a title.
 */
@Composable
fun FormSection(title: String, content: @Composable () -> Unit) {
    Div({
        style {
            marginBottom(24.px)
        }
    }) {
        H3({
            style {
                marginTop(0.px)
                marginBottom(16.px)
                fontSize(18.px)
                fontWeight("500")
                color(Color("#424242"))
            }
        }) {
            Text(title)
        }
        
        content()
    }
}

/**
 * Component for displaying a form field with a label and optional error message.
 */
@Composable
fun FormField(label: String, errorMessage: String? = null, content: @Composable () -> Unit) {
    Div({
        style {
            marginBottom(16.px)
        }
    }) {
        Label(attrs = {
            style {
                display(DisplayStyle.Block)
                marginBottom(8.px)
                fontSize(14.px)
                fontWeight("500")
                color(Color("#424242"))
            }
        }) {
            Text(label)
        }
        
        content()
        
        if (errorMessage != null) {
            Div({
                style {
                    marginTop(4.px)
                    fontSize(12.px)
                    color(Color("#f44336"))
                }
            }) {
                Text(errorMessage)
            }
        }
    }
}

/**
 * Component for creating or editing a proxy rule.
 */
@Composable
fun ProxyRuleForm(
    rule: ProxyRule?,
    containers: List<Container>,
    onSave: (ProxyRule) -> Unit,
    onCancel: () -> Unit
) {
    val isEditing = rule != null
    
    val apiClient = remember { KontainersApiClient() }
    var certificates by remember { mutableStateOf<List<String>>(emptyList()) }
    var nginxTemplates by remember { mutableStateOf<List<String>>(emptyList()) }
    var showTester by remember { mutableStateOf(false) }
    
    // Basic form state
    var name by remember { mutableStateOf(rule?.name ?: "") }
    var sourceHost by remember { mutableStateOf(rule?.sourceHost ?: "") }
    var sourcePath by remember { mutableStateOf(rule?.sourcePath ?: "/") }
    var targetContainer by remember { mutableStateOf(rule?.targetContainer ?: "") }
    var targetPort by remember { mutableStateOf(rule?.targetPort?.toString() ?: "") }
    var protocol by remember { mutableStateOf(rule?.protocol ?: ProxyProtocol.HTTP) }
    
    // SSL configuration
    var sslEnabled by remember { mutableStateOf(rule?.sslEnabled ?: false) }
    var sslCertPath by remember { mutableStateOf(rule?.sslCertPath ?: "") }
    var sslKeyPath by remember { mutableStateOf(rule?.sslKeyPath ?: "") }
    
    // Health check configuration
    var healthCheckEnabled by remember { mutableStateOf(rule?.healthCheck != null) }
    var healthCheckPath by remember { mutableStateOf(rule?.healthCheck?.path ?: "/health") }
    var healthCheckInterval by remember { mutableStateOf(rule?.healthCheck?.interval?.toString() ?: "30") }
    var healthCheckTimeout by remember { mutableStateOf(rule?.healthCheck?.timeout?.toString() ?: "5") }
    var healthCheckRetries by remember { mutableStateOf(rule?.healthCheck?.retries?.toString() ?: "3") }
    var healthCheckSuccessCodes by remember { mutableStateOf(rule?.healthCheck?.successCodes ?: "200-399") }
    
    // Load balancing configuration
    var loadBalancingEnabled by remember { mutableStateOf(rule?.loadBalancing != null) }
    var loadBalancingMethod by remember { mutableStateOf(rule?.loadBalancing?.method ?: LoadBalancingMethod.ROUND_ROBIN) }
    var loadBalancingSticky by remember { mutableStateOf(rule?.loadBalancing?.sticky ?: false) }
    var loadBalancingCookieName by remember { mutableStateOf(rule?.loadBalancing?.cookieName ?: "") }
    var loadBalancingCookieExpiry by remember { mutableStateOf(rule?.loadBalancing?.cookieExpiry?.toString() ?: "") }
    var loadBalancingTargets by remember { mutableStateOf(rule?.loadBalancing?.targets ?: emptyList()) }
    
    // Headers configuration
    var requestHeaders by remember { mutableStateOf(rule?.headers ?: emptyMap()) }
    var responseHeaders by remember { mutableStateOf(rule?.responseHeaders ?: emptyMap()) }
    
    // Advanced configuration
    var advancedConfigEnabled by remember { mutableStateOf(rule?.advancedConfig != null) }
    var clientMaxBodySize by remember { mutableStateOf(rule?.advancedConfig?.clientMaxBodySize ?: "") }
    var proxyConnectTimeout by remember { mutableStateOf(rule?.advancedConfig?.proxyConnectTimeout?.toString() ?: "60") }
    var proxySendTimeout by remember { mutableStateOf(rule?.advancedConfig?.proxySendTimeout?.toString() ?: "60") }
    var proxyReadTimeout by remember { mutableStateOf(rule?.advancedConfig?.proxyReadTimeout?.toString() ?: "60") }
    var cacheEnabled by remember { mutableStateOf(rule?.advancedConfig?.cacheEnabled ?: false) }
    var cacheDuration by remember { mutableStateOf(rule?.advancedConfig?.cacheDuration ?: "") }
    var corsEnabled by remember { mutableStateOf(rule?.advancedConfig?.corsEnabled ?: false) }
    var corsAllowOrigin by remember { mutableStateOf(rule?.advancedConfig?.corsAllowOrigin ?: "*") }
    var corsAllowMethods by remember { mutableStateOf(rule?.advancedConfig?.corsAllowMethods ?: "GET, POST, OPTIONS") }
    var corsAllowHeaders by remember { mutableStateOf(rule?.advancedConfig?.corsAllowHeaders ?: "DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range") }
    var corsAllowCredentials by remember { mutableStateOf(rule?.advancedConfig?.corsAllowCredentials ?: false) }
    
    // Custom Nginx configuration
    var useCustomNginxConfig by remember { mutableStateOf(rule?.customNginxConfig != null) }
    var customNginxConfig by remember { mutableStateOf(rule?.customNginxConfig ?: "") }
    var selectedNginxTemplate by remember { mutableStateOf<String?>(null) }
    
    // UI state
    var activeTab by remember { mutableStateOf("basic") }
    
    // Validation state
    var nameError by remember { mutableStateOf<String?>(null) }
    var sourceHostError by remember { mutableStateOf<String?>(null) }
    var targetContainerError by remember { mutableStateOf<String?>(null) }
    var targetPortError by remember { mutableStateOf<String?>(null) }
    
    // Load certificates and templates on initial render
    LaunchedEffect(Unit) {
        try {
            certificates = apiClient.getCertificates()
            nginxTemplates = apiClient.getNginxTemplates()
        } catch (e: Exception) {
            // Handle error
        }
    }
    
    // Validate form
    fun validateForm(): Boolean {
        var isValid = true
        
        if (name.isBlank()) {
            nameError = "Name is required"
            isValid = false
        } else {
            nameError = null
        }
        
        if (sourceHost.isBlank()) {
            sourceHostError = "Source host is required"
            isValid = false
        } else {
            sourceHostError = null
        }
        
        // If load balancing is not enabled, target container and port are required
        if (!loadBalancingEnabled) {
            if (targetContainer.isBlank()) {
                targetContainerError = "Target container is required"
                isValid = false
            } else {
                targetContainerError = null
            }
            
            if (targetPort.isBlank() || targetPort.toIntOrNull() == null) {
                targetPortError = "Valid target port is required"
                isValid = false
            } else {
                targetPortError = null
            }
        } else {
            // If load balancing is enabled, at least one target is required
            if (loadBalancingTargets.isEmpty()) {
                targetContainerError = "At least one load balancing target is required"
                isValid = false
            } else {
                targetContainerError = null
            }
        }
        
        // If sticky sessions are enabled, cookie name is required
        if (loadBalancingEnabled && loadBalancingSticky && loadBalancingCookieName.isBlank()) {
            isValid = false
            // We would add an error for cookie name here
        }
        
        return isValid
    }
    
    // Handle form submission
    fun handleSubmit() {
        if (validateForm()) {
            // Build health check configuration
            val healthCheck = if (healthCheckEnabled) {
                HealthCheck(
                    path = healthCheckPath,
                    interval = healthCheckInterval.toIntOrNull() ?: 30,
                    timeout = healthCheckTimeout.toIntOrNull() ?: 5,
                    retries = healthCheckRetries.toIntOrNull() ?: 3,
                    successCodes = healthCheckSuccessCodes
                )
            } else {
                null
            }
            
            // Build load balancing configuration
            val loadBalancing = if (loadBalancingEnabled) {
                LoadBalancingConfig(
                    method = loadBalancingMethod,
                    targets = loadBalancingTargets,
                    sticky = loadBalancingSticky,
                    cookieName = if (loadBalancingSticky) loadBalancingCookieName else null,
                    cookieExpiry = if (loadBalancingSticky && loadBalancingCookieExpiry.isNotBlank()) 
                        loadBalancingCookieExpiry.toIntOrNull() else null
                )
            } else {
                null
            }
            
            // Build advanced configuration
            val advancedConfig = if (advancedConfigEnabled) {
                AdvancedProxyConfig(
                    clientMaxBodySize = if (clientMaxBodySize.isNotBlank()) clientMaxBodySize else null,
                    proxyConnectTimeout = proxyConnectTimeout.toIntOrNull() ?: 60,
                    proxySendTimeout = proxySendTimeout.toIntOrNull() ?: 60,
                    proxyReadTimeout = proxyReadTimeout.toIntOrNull() ?: 60,
                    cacheEnabled = cacheEnabled,
                    cacheDuration = if (cacheEnabled && cacheDuration.isNotBlank()) cacheDuration else null,
                    corsEnabled = corsEnabled,
                    corsAllowOrigin = if (corsEnabled) corsAllowOrigin else null,
                    corsAllowMethods = if (corsEnabled) corsAllowMethods else null,
                    corsAllowHeaders = if (corsEnabled) corsAllowHeaders else null,
                    corsAllowCredentials = if (corsEnabled) corsAllowCredentials else false
                )
            } else {
                null
            }
            
            val newRule = ProxyRule(
                id = rule?.id ?: "",
                name = name,
                sourceHost = sourceHost,
                sourcePath = sourcePath,
                targetContainer = if (!loadBalancingEnabled) targetContainer else "",
                targetPort = if (!loadBalancingEnabled) targetPort.toIntOrNull() ?: 80 else 0,
                protocol = protocol,
                sslEnabled = sslEnabled,
                sslCertPath = if (sslEnabled) sslCertPath else null,
                sslKeyPath = if (sslEnabled) sslKeyPath else null,
                headers = requestHeaders,
                responseHeaders = responseHeaders,
                healthCheck = healthCheck,
                loadBalancing = loadBalancing,
                advancedConfig = advancedConfig,
                customNginxConfig = if (useCustomNginxConfig) customNginxConfig else null,
                created = rule?.created ?: 0L,
                enabled = rule?.enabled ?: true
            )
            
            onSave(newRule)
        }
    }
    
    Div({
        style {
            backgroundColor(Color.white)
            borderRadius(8.px)
            property("box-shadow", "0 2px 4px rgba(0,0,0,0.1)")
            padding(24.px)
            maxWidth(900.px)
        }
    }) {
        // Header with title and test button
        Div({
            style {
                display(DisplayStyle.Flex)
                justifyContent(JustifyContent.SpaceBetween)
                alignItems(AlignItems.Center)
                marginBottom(16.px)
            }
        }) {
            H2 {
                Text(if (isEditing) "Edit Proxy Rule" else "Create New Proxy Rule")
            }
            
            if (isEditing) {
                Button({
                    style {
                        padding(8.px, 16.px)
                        backgroundColor(Color("#4caf50"))
                        color(Color.white)
                        border(0.px, LineStyle.None, Color.transparent)
                        borderRadius(4.px)
                        cursor("pointer")
                        fontSize(14.px)
                    }
                    onClick { showTester = true }
                }) {
                    Text("Test Rule")
                }
            }
        }
        
        // Show tester if requested
        if (showTester) {
            rule?.let {
                ProxyRuleTester(
                    rule = it,
                    onClose = { showTester = false }
                )
            }
        } else {
            // Tabs for different configuration sections
            Div({
                style {
                    marginBottom(24.px)
                }
            }) {
                Div({
                    style {
                        display(DisplayStyle.Flex)
                        property("border-bottom", "1px solid #e0e0e0")
                    }
                }) {
                    Div({
                        style {
                            display(DisplayStyle.Flex)
                            alignItems(AlignItems.Center)
                        }
                    }) {
                        Button({
                            style {
                                padding(12.px, 16.px)
                                backgroundColor(if (activeTab == "basic") Color("#f5f5f5") else Color.transparent)
                                color(if (activeTab == "basic") Color("#1976d2") else Color("#424242"))
                                border(0.px, LineStyle.None, Color.transparent)
                                if (activeTab == "basic") {
                                    property("border-bottom", "2px solid #1976d2")
                                } else {
                                    property("border-bottom", "0px solid transparent")
                                }
                                cursor("pointer")
                                fontSize(14.px)
                                property("font-weight", if (activeTab == "basic") "500" else "normal")
                            }
                            onClick { activeTab = "basic" }
                            attr("type", "button")
                        }) {
                            Text("Basic")
                        }
                        
                        Button({
                            style {
                                padding(12.px, 16.px)
                                backgroundColor(if (activeTab == "ssl") Color("#f5f5f5") else Color.transparent)
                                color(if (activeTab == "ssl") Color("#1976d2") else Color("#424242"))
                                border(0.px, LineStyle.None, Color.transparent)
                                if (activeTab == "ssl") {
                                    property("border-bottom", "2px solid #1976d2")
                                } else {
                                    property("border-bottom", "0px solid transparent")
                                }
                                cursor("pointer")
                                fontSize(14.px)
                                property("font-weight", if (activeTab == "ssl") "500" else "normal")
                            }
                            onClick { activeTab = "ssl" }
                            attr("type", "button")
                        }) {
                            Text("SSL")
                        }
                        
                        Button({
                            style {
                                padding(12.px, 16.px)
                                backgroundColor(if (activeTab == "health") Color("#f5f5f5") else Color.transparent)
                                color(if (activeTab == "health") Color("#1976d2") else Color("#424242"))
                                border(0.px, LineStyle.None, Color.transparent)
                                if (activeTab == "health") {
                                    property("border-bottom", "2px solid #1976d2")
                                } else {
                                    property("border-bottom", "0px solid transparent")
                                }
                                cursor("pointer")
                                fontSize(14.px)
                                property("font-weight", if (activeTab == "health") "500" else "normal")
                            }
                            onClick { activeTab = "health" }
                            attr("type", "button")
                        }) {
                            Text("Health Check")
                        }
                        
                        Button({
                            style {
                                padding(12.px, 16.px)
                                backgroundColor(if (activeTab == "loadbalancing") Color("#f5f5f5") else Color.transparent)
                                color(if (activeTab == "loadbalancing") Color("#1976d2") else Color("#424242"))
                                border(0.px, LineStyle.None, Color.transparent)
                                if (activeTab == "loadbalancing") {
                                    property("border-bottom", "2px solid #1976d2")
                                } else {
                                    property("border-bottom", "0px solid transparent")
                                }
                                cursor("pointer")
                                fontSize(14.px)
                                property("font-weight", if (activeTab == "loadbalancing") "500" else "normal")
                            }
                            onClick { activeTab = "loadbalancing" }
                            attr("type", "button")
                        }) {
                            Text("Load Balancing")
                        }
                        
                        Button({
                            style {
                                padding(12.px, 16.px)
                                backgroundColor(if (activeTab == "headers") Color("#f5f5f5") else Color.transparent)
                                color(if (activeTab == "headers") Color("#1976d2") else Color("#424242"))
                                border(0.px, LineStyle.None, Color.transparent)
                                if (activeTab == "headers") {
                                    property("border-bottom", "2px solid #1976d2")
                                } else {
                                    property("border-bottom", "0px solid transparent")
                                }
                                cursor("pointer")
                                fontSize(14.px)
                                property("font-weight", if (activeTab == "headers") "500" else "normal")
                            }
                            onClick { activeTab = "headers" }
                            attr("type", "button")
                        }) {
                            Text("Headers")
                        }
                        
                        Button({
                            style {
                                padding(12.px, 16.px)
                                backgroundColor(if (activeTab == "advanced") Color("#f5f5f5") else Color.transparent)
                                color(if (activeTab == "advanced") Color("#1976d2") else Color("#424242"))
                                border(0.px, LineStyle.None, Color.transparent)
                                if (activeTab == "advanced") {
                                    property("border-bottom", "2px solid #1976d2")
                                } else {
                                    property("border-bottom", "0px solid transparent")
                                }
                                cursor("pointer")
                                fontSize(14.px)
                                property("font-weight", if (activeTab == "advanced") "500" else "normal")
                            }
                            onClick { activeTab = "advanced" }
                            attr("type", "button")
                        }) {
                            Text("Advanced")
                        }
                        
                        Button({
                            style {
                                padding(12.px, 16.px)
                                backgroundColor(if (activeTab == "custom") Color("#f5f5f5") else Color.transparent)
                                color(if (activeTab == "custom") Color("#1976d2") else Color("#424242"))
                                border(0.px, LineStyle.None, Color.transparent)
                                if (activeTab == "custom") {
                                    property("border-bottom", "2px solid #1976d2")
                                } else {
                                    property("border-bottom", "0px solid transparent")
                                }
                                cursor("pointer")
                                fontSize(14.px)
                                property("font-weight", if (activeTab == "custom") "500" else "normal")
                            }
                            onClick { activeTab = "custom" }
                            attr("type", "button")
                        }) {
                            Text("Custom Config")
                        }
                    }
                }
            }
            
            Div({
                style {
                    width(100.percent)
                }
            }) {
                // Basic Information Tab
                if (activeTab == "basic") {
                    // Basic Information
                    FormSection("Basic Information") {
                        // Name
                        FormField("Name", nameError) {
                            Input(InputType.Text) {
                                style {
                                    width(100.percent)
                                    padding(8.px)
                                    borderRadius(4.px)
                                    border(1.px, LineStyle.Solid, if (nameError != null) Color("#f44336") else Color("#e0e0e0"))
                                }
                                value(name)
                                onInput { event -> name = event.value }
                                attr("placeholder", "My Proxy Rule")
                            }
                        }
                        
                        // Source Host
                        FormField("Source Host", sourceHostError) {
                            Input(InputType.Text) {
                                style {
                                    width(100.percent)
                                    padding(8.px)
                                    borderRadius(4.px)
                                    border(1.px, LineStyle.Solid, if (sourceHostError != null) Color("#f44336") else Color("#e0e0e0"))
                                }
                                value(sourceHost)
                                onInput { event -> sourceHost = event.value }
                                attr("placeholder", "example.com")
                            }
                        }
                        
                        // Source Path
                        FormField("Source Path") {
                            Input(InputType.Text) {
                                style {
                                    width(100.percent)
                                    padding(8.px)
                                    borderRadius(4.px)
                                    border(1.px, LineStyle.Solid, Color("#e0e0e0"))
                                }
                                value(sourcePath)
                                onInput { event -> sourcePath = event.value }
                                attr("placeholder", "/")
                            }
                        }
                    }
                    
                    // Target Configuration
                    FormSection("Target Configuration") {
                        // Target Container
                        FormField("Target Container", targetContainerError) {
                            Select({
                                style {
                                    width(100.percent)
                                    padding(8.px)
                                    borderRadius(4.px)
                                    border(1.px, LineStyle.Solid, if (targetContainerError != null) Color("#f44336") else Color("#e0e0e0"))
                                }
                                onChange { event -> targetContainer = event.value ?: "" }
                            }) {
                                Option(value = "") {
                                    Text("Select a container")
                                }
                                
                                containers.forEach { container ->
                                    Option(
                                        value = container.name,
                                        {
                                            if (targetContainer == container.name) {
                                                attr("selected", "true")
                                            }
                                        }
                                    ) {
                                        Text(container.name)
                                    }
                                }
                            }
                        }
                        
                        // Target Port
                        FormField("Target Port", targetPortError) {
                            Input(InputType.Number) {
                                style {
                                    width(100.percent)
                                    padding(8.px)
                                    borderRadius(4.px)
                                    border(1.px, LineStyle.Solid, if (targetPortError != null) Color("#f44336") else Color("#e0e0e0"))
                                }
                                value(targetPort)
                                onInput { event -> targetPort = event.value?.toString() ?: "" }
                                attr("placeholder", "80")
                                attr("min", "1")
                                attr("max", "65535")
                            }
                        }
                        
                        // Protocol
                        FormField("Protocol") {
                            Select({
                                style {
                                    width(100.percent)
                                    padding(8.px)
                                    borderRadius(4.px)
                                    border(1.px, LineStyle.Solid, Color("#e0e0e0"))
                                }
                                onChange { event ->
                                    event.value?.let {
                                        protocol = ProxyProtocol.valueOf(it)
                                    }
                                }
                            }) {
                                ProxyProtocol.values().forEach { p ->
                                    Option(
                                        value = p.name,
                                        {
                                            if (protocol == p) {
                                                attr("selected", "true")
                                            }
                                        }
                                    ) {
                                        Text(p.name)
                                    }
                                }
                            }
                        }
                    }
                } else if (activeTab == "ssl") {
                    // SSL Configuration
                    FormSection("SSL Configuration") {
                        // SSL Enabled
                        FormField("SSL Enabled") {
                            Div({
                                style {
                                    display(DisplayStyle.Flex)
                                    alignItems(AlignItems.Center)
                                    gap(8.px)
                                }
                            }) {
                                Input(InputType.Checkbox) {
                                    checked(sslEnabled)
                                    onChange { event -> sslEnabled = event.value as? Boolean ?: false }
                                }
                                Label(attrs = {}) { Text("Enable SSL/HTTPS") }
                            }
                        }
                        
                        // SSL Certificate Path (only shown if SSL is enabled)
                        if (sslEnabled) {
                            FormField("SSL Certificate Path") {
                                Input(InputType.Text) {
                                    style {
                                        width(100.percent)
                                        padding(8.px)
                                        borderRadius(4.px)
                                        border(1.px, LineStyle.Solid, Color("#e0e0e0"))
                                    }
                                    value(sslCertPath)
                                    onInput { event -> sslCertPath = event.value }
                                    attr("placeholder", "/path/to/certificate.crt")
                                }
                            }
                        }
                    }
                } else if (activeTab == "health") {
                    // Health Check Configuration
                    FormSection("Health Check") {
                        // Health Check Enabled
                        FormField("Health Check Enabled") {
                            Div({
                                style {
                                    display(DisplayStyle.Flex)
                                    alignItems(AlignItems.Center)
                                    gap(8.px)
                                }
                            }) {
                                Input(InputType.Checkbox) {
                                    checked(healthCheckEnabled)
                                    onChange { event -> healthCheckEnabled = event.value as? Boolean ?: false }
                                }
                                Label(attrs = {}) { Text("Enable Health Check") }
                            }
                        }
                        
                        // Health Check Path (only shown if health check is enabled)
                        if (healthCheckEnabled) {
                            FormField("Health Check Path") {
                                Input(InputType.Text) {
                                    style {
                                        width(100.percent)
                                        padding(8.px)
                                        borderRadius(4.px)
                                        border(1.px, LineStyle.Solid, Color("#e0e0e0"))
                                    }
                                    value(healthCheckPath)
                                    onInput { event -> healthCheckPath = event.value }
                                    attr("placeholder", "/health")
                                }
                            }
                            
                            FormField("Health Check Interval (seconds)") {
                                Input(InputType.Number) {
                                    style {
                                        width(100.percent)
                                        padding(8.px)
                                        borderRadius(4.px)
                                        border(1.px, LineStyle.Solid, Color("#e0e0e0"))
                                    }
                                    value(healthCheckInterval)
                                    onInput { event -> healthCheckInterval = event.value?.toString() ?: "" }
                                    attr("placeholder", "30")
                                    attr("min", "1")
                                }
                            }
                        }
                    }
                } else if (activeTab == "loadbalancing") {
                    // Load Balancing Configuration (placeholder)
                    FormSection("Load Balancing") {
                        FormField("Load Balancing Enabled") {
                            Div({
                                style {
                                    display(DisplayStyle.Flex)
                                    alignItems(AlignItems.Center)
                                    gap(8.px)
                                }
                            }) {
                                Input(InputType.Checkbox) {
                                    checked(loadBalancingEnabled)
                                    onChange { event -> loadBalancingEnabled = event.value as? Boolean ?: false }
                                }
                                Label(attrs = {}) { Text("Enable Load Balancing") }
                            }
                        }
                    }
                } else if (activeTab == "headers") {
                    // Headers Configuration (placeholder)
                    FormSection("Headers") {
                        FormField("Request Headers") {
                            Text("Header configuration will be implemented here")
                        }
                    }
                } else if (activeTab == "advanced") {
                    // Advanced Configuration (placeholder)
                    FormSection("Advanced Configuration") {
                        FormField("Advanced Config Enabled") {
                            Div({
                                style {
                                    display(DisplayStyle.Flex)
                                    alignItems(AlignItems.Center)
                                    gap(8.px)
                                }
                            }) {
                                Input(InputType.Checkbox) {
                                    checked(advancedConfigEnabled)
                                    onChange { event -> advancedConfigEnabled = event.value as? Boolean ?: false }
                                }
                                Label(attrs = {}) { Text("Enable Advanced Configuration") }
                            }
                        }
                    }
                } else if (activeTab == "custom") {
                    // Custom Nginx Configuration (placeholder)
                    FormSection("Custom Nginx Configuration") {
                        FormField("Use Custom Nginx Config") {
                            Div({
                                style {
                                    display(DisplayStyle.Flex)
                                    alignItems(AlignItems.Center)
                                    gap(8.px)
                                }
                            }) {
                                Input(InputType.Checkbox) {
                                    checked(useCustomNginxConfig)
                                    onChange { event -> useCustomNginxConfig = event.value as? Boolean ?: false }
                                }
                                Label(attrs = {}) { Text("Use Custom Nginx Configuration") }
                            }
                        }
                    }
                }
            
            // Form Actions
            Div({
                style {
                    display(DisplayStyle.Flex)
                    justifyContent(JustifyContent.FlexEnd)
                    gap(16.px)
                    marginTop(24.px)
                }
            }) {
                Button({
                    attr("type", "button")
                    style {
                        padding(8.px, 16.px)
                        borderRadius(4.px)
                        border(1.px, LineStyle.Solid, Color("#e0e0e0"))
                        backgroundColor(Color.white)
                        color(Color("#424242"))
                        cursor("pointer")
                    }
                    onClick { onCancel() }
                }) {
                    Text("Cancel")
                }
                
                Button({
                    attr("type", "button")
                    onClick { handleSubmit() }
                    style {
                        padding(8.px, 16.px)
                        borderRadius(4.px)
                        border(0.px, LineStyle.None, Color.transparent)
                        backgroundColor(Color("#1976d2"))
                        color(Color.white)
                        cursor("pointer")
                    }
                }) {
                    Text(if (isEditing) "Update Rule" else "Create Rule")
                }
            }
        }
    }
}
}
