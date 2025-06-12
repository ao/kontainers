package io.kontainers.ui.components

import androidx.compose.runtime.*
import io.kontainers.api.KontainersApiClient
import io.kontainers.model.ContainerCreationRequest
import io.kontainers.model.PortMapping
import io.kontainers.model.VolumeMount
import io.kontainers.state.AppStateManager
import io.kontainers.ui.util.*
import io.kontainers.ui.util.NumberText
import kotlinx.coroutines.launch
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*
import org.jetbrains.compose.web.attributes.InputType
import org.w3c.dom.HTMLInputElement
import org.w3c.dom.HTMLSelectElement
import org.w3c.dom.HTMLTextAreaElement

/**
 * Container Creation Wizard component.
 * 
 * @param onClose Callback when the wizard is closed
 */
@Composable
fun ContainerCreationWizard(onClose: () -> Unit) {
    val apiClient = remember { KontainersApiClient() }
    val coroutineScope = rememberCoroutineScope()
    
    // Wizard state
    var currentStep by remember { mutableStateOf(0) }
    var isLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    
    // Container configuration state
    var containerName by remember { mutableStateOf("") }
    var containerImage by remember { mutableStateOf("") }
    var ports by remember { mutableStateOf(listOf<PortMapping>()) }
    var volumes by remember { mutableStateOf(listOf<VolumeMount>()) }
    var envVars by remember { mutableStateOf(listOf<String>()) }
    var networks by remember { mutableStateOf(listOf<String>()) }
    
    // Temporary state for adding new items
    var newPrivatePort by remember { mutableStateOf("") }
    var newPublicPort by remember { mutableStateOf("") }
    var newVolumeSource by remember { mutableStateOf("") }
    var newVolumeDestination by remember { mutableStateOf("") }
    var newVolumeMode by remember { mutableStateOf("rw") }
    var newEnvVar by remember { mutableStateOf("") }
    var newNetwork by remember { mutableStateOf("") }
    
    // Steps configuration
    val steps = listOf(
        "Basic Settings",
        "Ports",
        "Volumes",
        "Environment",
        "Networks",
        "Review"
    )
    
    // Function to handle container creation
    fun createContainer() {
        isLoading = true
        error = null
        
        val request = ContainerCreationRequest(
            name = containerName,
            image = containerImage,
            ports = ports,
            volumes = volumes,
            env = envVars,
            networks = networks
        )
        
        coroutineScope.launch {
            try {
                val result = apiClient.createContainer(request)
                
                if (result.success) {
                    // Refresh containers list
                    AppStateManager.setLoading(true)
                    val containers = apiClient.getContainers(true)
                    AppStateManager.updateContainers(containers)
                    AppStateManager.setLoading(false)
                    
                    // Close wizard
                    onClose()
                } else {
                    error = result.message ?: "Failed to create container"
                    isLoading = false
                }
            } catch (e: Exception) {
                error = "Error creating container: ${e.message}"
                isLoading = false
            }
        }
    }
    
    // Wizard modal
    Div({
        style {
            position(Position.Fixed)
            top(0.px)
            left(0.px)
            width(100.percent)
            height(100.percent)
            backgroundColor(rgba(0, 0, 0, 0.5))
            display(DisplayStyle.Flex)
            justifyContent(JustifyContent.Center)
            alignItems(AlignItems.Center)
            zIndex(1000)
        }
    }) {
        // Wizard content
        Div({
            style {
                width(600.px)
                maxWidth(90.percent)
                backgroundColor(Color.white)
                borderRadius(4.px)
                boxShadow("0 4px 8px rgba(0, 0, 0, 0.1)")
                display(DisplayStyle.Flex)
                flexDirection(FlexDirection.Column)
                maxHeight(90.vh)
            }
        }) {
            // Header
            Div({
                style {
                    padding(16.px)
                    borderBottom("1px", "solid", "#e0e0e0")
                    display(DisplayStyle.Flex)
                    justifyContent(JustifyContent.SpaceBetween)
                    alignItems(AlignItems.Center)
                }
            }) {
                H2({
                    style {
                        margin(0.px)
                        fontSize(18.px)
                    }
                }) {
                    Text("Create Container - ${steps[currentStep]}")
                }
                
                Button({
                    style {
                        backgroundColor(Color.transparent)
                        border("0", "none", "transparent")
                        fontSize(20.px)
                        cursor("pointer")
                    }
                    onClick { onClose() }
                }) {
                    Text("×")
                }
            }
            
            // Error message
            if (error != null) {
                ErrorMessage(error!!) {
                    error = null
                }
            }
            
            // Loading indicator
            if (isLoading) {
                Div({
                    style {
                        padding(16.px)
                        display(DisplayStyle.Flex)
                        justifyContent(JustifyContent.Center)
                    }
                }) {
                    Text("Loading...")
                }
            } else {
                // Step content
                Div({
                    style {
                        padding(16.px)
                        overflowY("auto")
                        flexGrow(1)
                    }
                }) {
                    when (currentStep) {
                        0 -> {
                            // Basic Settings
                            FormGroup("Container Name") {
                                Input(InputType.Text) {
                                    style {
                                        width(100.percent)
                                        padding(8.px)
                                        border("1px", "solid", "#ccc")
                                        borderRadius(4.px)
                                    }
                                    value(containerName)
                                    onInput { event ->
                                        containerName = (event.target as HTMLInputElement).value
                                    }
                                }
                            }
                            
                            FormGroup("Container Image") {
                                Input(InputType.Text) {
                                    style {
                                        width(100.percent)
                                        padding(8.px)
                                        border("1px", "solid", "#ccc")
                                        borderRadius(4.px)
                                    }
                                    placeholder("e.g., nginx:latest")
                                    value(containerImage)
                                    onInput { event ->
                                        containerImage = (event.target as HTMLInputElement).value
                                    }
                                }
                            }
                        }
                        
                        1 -> {
                            // Ports
                            FormGroup("Port Mappings") {
                                // List existing port mappings
                                if (ports.isNotEmpty()) {
                                    Table({
                                        style {
                                            width(100.percent)
                                            borderCollapse("collapse")
                                            marginBottom(16.px)
                                        }
                                    }) {
                                        Thead {
                                            Tr {
                                                Th({ style { textAlign("left"); padding(8.px) } }) { Text("Container Port") }
                                                Th({ style { textAlign("left"); padding(8.px) } }) { Text("Host Port") }
                                                Th({ style { textAlign("left"); padding(8.px) } }) { Text("Actions") }
                                            }
                                        }
                                        Tbody {
                                            ports.forEachIndexed { index, port ->
                                                Tr({
                                                    style {
                                                        borderBottom("1px", "solid", "#e0e0e0")
                                                    }
                                                }) {
                                                    Td({ style { padding(8.px) } }) { Text(port.privatePort.toString()) }
                                                    Td({ style { padding(8.px) } }) { Text(port.publicPort?.toString() ?: "Auto") }
                                                    Td({ style { padding(8.px) } }) {
                                                        Button({
                                                            style {
                                                                padding(4.px, 8.px)
                                                                backgroundColor(Color("#f44336"))
                                                                color(Color.white)
                                                                border("0", "none", "transparent")
                                                                borderRadius(4.px)
                                                                cursor("pointer")
                                                            }
                                                            onClick {
                                                                ports = ports.filterIndexed { i, _ -> i != index }
                                                            }
                                                        }) {
                                                            Text("Remove")
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                } else {
                                    P({ style { color(Color("#757575")) } }) {
                                        Text("No port mappings configured")
                                    }
                                }
                                
                                // Add new port mapping
                                Div({
                                    style {
                                        display(DisplayStyle.Flex)
                                        gap(8.px)
                                        marginTop(8.px)
                                    }
                                }) {
                                    Input(InputType.Number) {
                                        style {
                                            padding(8.px)
                                            border("1px", "solid", "#ccc")
                                            borderRadius(4.px)
                                            flexGrow(1)
                                        }
                                        placeholder("Container Port")
                                        value(newPrivatePort)
                                        onInput { event ->
                                            newPrivatePort = (event.target as HTMLInputElement).value
                                        }
                                    }
                                    
                                    Input(InputType.Number) {
                                        style {
                                            padding(8.px)
                                            border("1px", "solid", "#ccc")
                                            borderRadius(4.px)
                                            flexGrow(1)
                                        }
                                        placeholder("Host Port (optional)")
                                        value(newPublicPort)
                                        onInput { event ->
                                            newPublicPort = (event.target as HTMLInputElement).value
                                        }
                                    }
                                    
                                    Button({
                                        style {
                                            padding(8.px, 16.px)
                                            backgroundColor(Color("#2196f3"))
                                            color(Color.white)
                                            border("0", "none", "transparent")
                                            borderRadius(4.px)
                                            cursor("pointer")
                                        }
                                        onClick {
                                            if (newPrivatePort.isNotEmpty()) {
                                                val privatePort = newPrivatePort.toIntOrNull() ?: 0
                                                val publicPort = newPublicPort.toIntOrNull()
                                                
                                                if (privatePort > 0) {
                                                    ports = ports + PortMapping(
                                                        privatePort = privatePort,
                                                        publicPort = publicPort
                                                    )
                                                    
                                                    // Reset inputs
                                                    newPrivatePort = ""
                                                    newPublicPort = ""
                                                }
                                            }
                                        }
                                    }) {
                                        Text("Add")
                                    }
                                }
                            }
                        }
                        
                        2 -> {
                            // Volumes
                            FormGroup("Volume Mounts") {
                                // List existing volume mounts
                                if (volumes.isNotEmpty()) {
                                    Table({
                                        style {
                                            width(100.percent)
                                            borderCollapse("collapse")
                                            marginBottom(16.px)
                                        }
                                    }) {
                                        Thead {
                                            Tr {
                                                Th({ style { textAlign("left"); padding(8.px) } }) { Text("Host Path") }
                                                Th({ style { textAlign("left"); padding(8.px) } }) { Text("Container Path") }
                                                Th({ style { textAlign("left"); padding(8.px) } }) { Text("Mode") }
                                                Th({ style { textAlign("left"); padding(8.px) } }) { Text("Actions") }
                                            }
                                        }
                                        Tbody {
                                            volumes.forEachIndexed { index, volume ->
                                                Tr({
                                                    style {
                                                        borderBottom("1px", "solid", "#e0e0e0")
                                                    }
                                                }) {
                                                    Td({ style { padding(8.px) } }) { Text(volume.source) }
                                                    Td({ style { padding(8.px) } }) { Text(volume.destination) }
                                                    Td({ style { padding(8.px) } }) { Text(volume.mode) }
                                                    Td({ style { padding(8.px) } }) {
                                                        Button({
                                                            style {
                                                                padding(4.px, 8.px)
                                                                backgroundColor(Color("#f44336"))
                                                                color(Color.white)
                                                                border("0", "none", "transparent")
                                                                borderRadius(4.px)
                                                                cursor("pointer")
                                                            }
                                                            onClick {
                                                                volumes = volumes.filterIndexed { i, _ -> i != index }
                                                            }
                                                        }) {
                                                            Text("Remove")
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                } else {
                                    P({ style { color(Color("#757575")) } }) {
                                        Text("No volume mounts configured")
                                    }
                                }
                                
                                // Add new volume mount
                                Div({
                                    style {
                                        display(DisplayStyle.Flex)
                                        flexDirection(FlexDirection.Column)
                                        gap(8.px)
                                        marginTop(8.px)
                                    }
                                }) {
                                    Input(InputType.Text) {
                                        style {
                                            padding(8.px)
                                            border("1px", "solid", "#ccc")
                                            borderRadius(4.px)
                                        }
                                        placeholder("Host Path")
                                        value(newVolumeSource)
                                        onInput { event ->
                                            newVolumeSource = (event.target as HTMLInputElement).value
                                        }
                                    }
                                    
                                    Input(InputType.Text) {
                                        style {
                                            padding(8.px)
                                            border("1px", "solid", "#ccc")
                                            borderRadius(4.px)
                                        }
                                        placeholder("Container Path")
                                        value(newVolumeDestination)
                                        onInput { event ->
                                            newVolumeDestination = (event.target as HTMLInputElement).value
                                        }
                                    }
                                    
                                    Select(attrs = {
                                        style {
                                            padding(8.px)
                                            property("border", "1px solid #ccc")
                                            property("border-radius", "4px")
                                        }
                                        attr("value", newVolumeMode)
                                        onChange { event ->
                                            newVolumeMode = (event.target as HTMLSelectElement).value
                                        }
                                        
                                    }) {
                                        Option("rw", attrs = {
                                            attr("value", "rw")
                                        }) {
                                            Text("Read-Write")
                                        }
                                        Option("ro", attrs = {
                                            attr("value", "ro")
                                        }) {
                                            Text("Read-Only")
                                        }
                                    }
                                    
                                    Button({
                                        style {
                                            padding(8.px, 16.px)
                                            backgroundColor(Color("#2196f3"))
                                            color(Color.white)
                                            border("0", "none", "transparent")
                                            borderRadius(4.px)
                                            cursor("pointer")
                                            alignSelf(AlignSelf.FlexStart)
                                            marginTop(8.px)
                                        }
                                        onClick {
                                            if (newVolumeSource.isNotEmpty() && newVolumeDestination.isNotEmpty()) {
                                                volumes = volumes + VolumeMount(
                                                    source = newVolumeSource,
                                                    destination = newVolumeDestination,
                                                    mode = newVolumeMode
                                                )
                                                
                                                // Reset inputs
                                                newVolumeSource = ""
                                                newVolumeDestination = ""
                                                newVolumeMode = "rw"
                                            }
                                        }
                                    }) {
                                        Text("Add Volume")
                                    }
                                }
                            }
                        }
                        
                        3 -> {
                            // Environment Variables
                            FormGroup("Environment Variables") {
                                // List existing environment variables
                                if (envVars.isNotEmpty()) {
                                    Table({
                                        style {
                                            width(100.percent)
                                            borderCollapse("collapse")
                                            marginBottom(16.px)
                                        }
                                    }) {
                                        Thead {
                                            Tr {
                                                Th({ style { textAlign("left"); padding(8.px) } }) { Text("Variable") }
                                                Th({ style { textAlign("left"); padding(8.px) } }) { Text("Actions") }
                                            }
                                        }
                                        Tbody {
                                            envVars.forEachIndexed { index, env ->
                                                Tr({
                                                    style {
                                                        borderBottom("1px", "solid", "#e0e0e0")
                                                    }
                                                }) {
                                                    Td({ style { padding(8.px) } }) { Text(env) }
                                                    Td({ style { padding(8.px) } }) {
                                                        Button({
                                                            style {
                                                                padding(4.px, 8.px)
                                                                backgroundColor(Color("#f44336"))
                                                                color(Color.white)
                                                                border("0", "none", "transparent")
                                                                borderRadius(4.px)
                                                                cursor("pointer")
                                                            }
                                                            onClick {
                                                                envVars = envVars.filterIndexed { i, _ -> i != index }
                                                            }
                                                        }) {
                                                            Text("Remove")
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                } else {
                                    P({ style { color(Color("#757575")) } }) {
                                        Text("No environment variables configured")
                                    }
                                }
                                
                                // Add new environment variable
                                Div({
                                    style {
                                        display(DisplayStyle.Flex)
                                        gap(8.px)
                                        marginTop(8.px)
                                    }
                                }) {
                                    Input(InputType.Text) {
                                        style {
                                            padding(8.px)
                                            border("1px", "solid", "#ccc")
                                            borderRadius(4.px)
                                            flexGrow(1)
                                        }
                                        placeholder("KEY=value")
                                        value(newEnvVar)
                                        onInput { event ->
                                            newEnvVar = (event.target as HTMLInputElement).value
                                        }
                                    }
                                    
                                    Button({
                                        style {
                                            padding(8.px, 16.px)
                                            backgroundColor(Color("#2196f3"))
                                            color(Color.white)
                                            border("0", "none", "transparent")
                                            borderRadius(4.px)
                                            cursor("pointer")
                                        }
                                        onClick {
                                            if (newEnvVar.isNotEmpty()) {
                                                envVars = envVars + newEnvVar
                                                newEnvVar = ""
                                            }
                                        }
                                    }) {
                                        Text("Add")
                                    }
                                }
                            }
                        }
                        
                        4 -> {
                            // Networks
                            FormGroup("Networks") {
                                // List existing networks
                                if (networks.isNotEmpty()) {
                                    Table({
                                        style {
                                            width(100.percent)
                                            borderCollapse("collapse")
                                            marginBottom(16.px)
                                        }
                                    }) {
                                        Thead {
                                            Tr {
                                                Th({ style { textAlign("left"); padding(8.px) } }) { Text("Network") }
                                                Th({ style { textAlign("left"); padding(8.px) } }) { Text("Actions") }
                                            }
                                        }
                                        Tbody {
                                            networks.forEachIndexed { index, network ->
                                                Tr({
                                                    style {
                                                        borderBottom("1px", "solid", "#e0e0e0")
                                                    }
                                                }) {
                                                    Td({ style { padding(8.px) } }) { Text(network) }
                                                    Td({ style { padding(8.px) } }) {
                                                        Button({
                                                            style {
                                                                padding(4.px, 8.px)
                                                                backgroundColor(Color("#f44336"))
                                                                color(Color.white)
                                                                border("0", "none", "transparent")
                                                                borderRadius(4.px)
                                                                cursor("pointer")
                                                            }
                                                            onClick {
                                                                networks = networks.filterIndexed { i, _ -> i != index }
                                                            }
                                                        }) {
                                                            Text("Remove")
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                } else {
                                    P({ style { color(Color("#757575")) } }) {
                                        Text("No networks configured")
                                    }
                                }
                                
                                // Add new network
                                Div({
                                    style {
                                        display(DisplayStyle.Flex)
                                        gap(8.px)
                                        marginTop(8.px)
                                    }
                                }) {
                                    Input(InputType.Text) {
                                        style {
                                            padding(8.px)
                                            border("1px", "solid", "#ccc")
                                            borderRadius(4.px)
                                            flexGrow(1)
                                        }
                                        placeholder("Network name")
                                        value(newNetwork)
                                        onInput { event ->
                                            newNetwork = (event.target as HTMLInputElement).value
                                        }
                                    }
                                    
                                    Button({
                                        style {
                                            padding(8.px, 16.px)
                                            backgroundColor(Color("#2196f3"))
                                            color(Color.white)
                                            border("0", "none", "transparent")
                                            borderRadius(4.px)
                                            cursor("pointer")
                                        }
                                        onClick {
                                            if (newNetwork.isNotEmpty()) {
                                                networks = networks + newNetwork
                                                newNetwork = ""
                                            }
                                        }
                                    }) {
                                        Text("Add")
                                    }
                                }
                            }
                        }
                        
                        5 -> {
                            // Review
                            H3({ style { marginTop(0.px) } }) { Text("Container Configuration") }
                            
                            Div({
                                style {
                                    border("1px", "solid", "#e0e0e0")
                                    borderRadius(4.px)
                                    padding(16.px)
                                    marginBottom(16.px)
                                }
                            }) {
                                P { 
                                    B { Text("Name: ") }
                                    Text(containerName)
                                }
                                P { 
                                    B { Text("Image: ") }
                                    Text(containerImage)
                                }
                            }
                            
                            H4 { Text("Port Mappings") }
                            if (ports.isNotEmpty()) {
                                Ul {
                                    ports.forEach { port ->
                                        Li {
                                            Text("${port.privatePort} → ${port.publicPort ?: "Auto"}")
                                        }
                                    }
                                }
                            } else {
                                P({ style { color(Color("#757575")) } }) {
                                    Text("No port mappings configured")
                                }
                            }
                            
                            H4 { Text("Volume Mounts") }
                            if (volumes.isNotEmpty()) {
                                Ul {
                                    volumes.forEach { volume ->
                                        Li {
                                            Text("${volume.source} → ${volume.destination} (${volume.mode})")
                                        }
                                    }
                                }
                            } else {
                                P({ style { color(Color("#757575")) } }) {
                                    Text("No volume mounts configured")
                                }
                            }
                            
                            H4 { Text("Environment Variables") }
                            if (envVars.isNotEmpty()) {
                                Ul {
                                    envVars.forEach { env ->
                                        Li {
                                            Text(env)
                                        }
                                    }
                                }
                            } else {
                                P({ style { color(Color("#757575")) } }) {
                                    Text("No environment variables configured")
                                }
                            }
                            
                            H4 { Text("Networks") }
                            if (networks.isNotEmpty()) {
                                Ul {
                                    networks.forEach { network ->
                                        Li {
                                            Text(network)
                                        }
                                    }
                                }
                            } else {
                                P({ style { color(Color("#757575")) } }) {
                                    Text("No networks configured")
                                }
                            }
                        }
                    }
                }
            }
            
            // Footer with navigation buttons
            Div({
                style {
                    padding(16.px)
                    borderTop("1px", "solid", "#e0e0e0")
                    display(DisplayStyle.Flex)
                    justifyContent(JustifyContent.SpaceBetween)
                }
            }) {
                // Back button
                if (currentStep > 0) {
                    Button({
                        style {
                            padding(8.px, 16.px)
                            backgroundColor(Color("#e0e0e0"))
                            color(Color("#333"))
                            border("0", "none", "transparent")
                            borderRadius(4.px)
                            cursor("pointer")
                        }
                        onClick {
                            currentStep--
                        }
                    }) {
                        Text("Back")
                    }
                } else {
                    Div() {}
                }
                
                // Next/Create button
                Button({
                    style {
                        padding(8.px, 16.px)
                        backgroundColor(Color("#2196f3"))
                        color(Color.white)
                        border("0", "none", "transparent")
                        borderRadius(4.px)
                        cursor("pointer")
                    }
                    onClick {
                        if (currentStep == steps.size - 1) {
                            // Final step - create container
                            createContainer()
                        } else {
                            // Move to next step
                            currentStep++
                        }
                    }
                    disabled(isLoading || (currentStep == 0 && (containerName.isEmpty() || containerImage.isEmpty())))
                }) {
                    Text(if (currentStep == steps.size - 1) "Create Container" else "Next")
                }
            }
        }
    }
}

/**
 * Form group component.
 */
@Composable
private fun FormGroup(label: String, content: @Composable () -> Unit) {
    Div({
        style {
            marginBottom(16.px)
        }
    }) {
        Label(attrs = {
            style {
                display(DisplayStyle.Block)
                marginBottom(8.px)
                fontWeight("500")
            }
        }) {
            org.jetbrains.compose.web.dom.Text(label)
        }
        content()
    }
}