package io.kontainers.ui.components

import androidx.compose.runtime.*
import io.kontainers.model.Container
import io.kontainers.model.ProxyRule
import io.kontainers.model.ProxyProtocol
import io.kontainers.model.HealthCheck
import org.jetbrains.compose.web.attributes.InputType
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*

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
    
    // Form state
    var name by remember { mutableStateOf(rule?.name ?: "") }
    var sourceHost by remember { mutableStateOf(rule?.sourceHost ?: "") }
    var sourcePath by remember { mutableStateOf(rule?.sourcePath ?: "/") }
    var targetContainer by remember { mutableStateOf(rule?.targetContainer ?: "") }
    var targetPort by remember { mutableStateOf(rule?.targetPort?.toString() ?: "") }
    var protocol by remember { mutableStateOf(rule?.protocol ?: ProxyProtocol.HTTP) }
    var sslEnabled by remember { mutableStateOf(rule?.sslEnabled ?: false) }
    var sslCertPath by remember { mutableStateOf(rule?.sslCertPath ?: "") }
    var healthCheckEnabled by remember { mutableStateOf(rule?.healthCheck != null) }
    var healthCheckPath by remember { mutableStateOf(rule?.healthCheck?.path ?: "/health") }
    var healthCheckInterval by remember { mutableStateOf(rule?.healthCheck?.interval?.toString() ?: "30") }
    
    // Validation state
    var nameError by remember { mutableStateOf<String?>(null) }
    var sourceHostError by remember { mutableStateOf<String?>(null) }
    var targetContainerError by remember { mutableStateOf<String?>(null) }
    var targetPortError by remember { mutableStateOf<String?>(null) }
    
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
        
        return isValid
    }
    
    // Handle form submission
    fun handleSubmit() {
        if (validateForm()) {
            val healthCheck = if (healthCheckEnabled) {
                HealthCheck(
                    path = healthCheckPath,
                    interval = healthCheckInterval.toIntOrNull() ?: 30
                )
            } else {
                null
            }
            
            val newRule = ProxyRule(
                id = rule?.id ?: "",
                name = name,
                sourceHost = sourceHost,
                sourcePath = sourcePath,
                targetContainer = targetContainer,
                targetPort = targetPort.toIntOrNull() ?: 80,
                protocol = protocol,
                sslEnabled = sslEnabled,
                sslCertPath = if (sslEnabled) sslCertPath else null,
                healthCheck = healthCheck,
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
            maxWidth(800.px)
        }
    }) {
        H2 {
            Text(if (isEditing) "Edit Proxy Rule" else "Create New Proxy Rule")
        }
        
        Div({
            style {
                width(100.percent)
            }
        }) {
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
                            onChange { event -> sslEnabled = event.value }
                        }
                        Label { Text("Enable SSL/HTTPS") }
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
                            onChange { event -> healthCheckEnabled = event.value }
                        }
                        Label { Text("Enable Health Check") }
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
                fontSize(18.px)
                marginTop(0.px)
                marginBottom(16.px)
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
fun FormField(label: String, error: String? = null, content: @Composable () -> Unit) {
    Div({
        style {
            marginBottom(16.px)
        }
    }) {
        Div({
            style {
                marginBottom(8.px)
            }
        }) {
            Text(label)
        }
        
        content()
        
        if (error != null) {
            Div({
                style {
                    color(Color("#f44336"))
                    fontSize(12.px)
                    marginTop(4.px)
                }
            }) {
                Text(error)
            }
        }
    }
}