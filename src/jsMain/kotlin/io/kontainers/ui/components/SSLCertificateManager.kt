package io.kontainers.ui.components

import androidx.compose.runtime.*
import io.kontainers.api.KontainersApiClient
import kotlinx.coroutines.launch
// Removed React import as we're using Compose Web
import org.jetbrains.compose.web.attributes.InputType
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*
import io.kontainers.ui.util.*
import org.w3c.files.File
import org.w3c.files.FileReader
import org.w3c.files.get

/**
 * Component for managing SSL certificates.
 */
@Composable
fun SSLCertificateManager() {
    val apiClient = remember { KontainersApiClient() }
    var certificates by remember { mutableStateOf<List<String>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var success by remember { mutableStateOf<String?>(null) }
    var isUploading by remember { mutableStateOf(false) }
    
    // Form state
    var certificateName by remember { mutableStateOf("") }
    var certificateFile by remember { mutableStateOf<File?>(null) }
    var keyFile by remember { mutableStateOf<File?>(null) }
    
    // Load certificates on initial render
    LaunchedEffect(Unit) {
        loadCertificates(apiClient) { certs, err ->
            certificates = certs
            error = err
        }
    }
    
    Div({
        style {
            padding(16.px)
            maxWidth(800.px)
        }
    }) {
        H2 { Text("SSL Certificate Manager") }
        P { Text("Upload and manage SSL certificates for your proxy rules") }
        
        // Error message
        if (error != null) {
            Div({
                style {
                    backgroundColor(Color("#f8d7da"))
                    color(Color("#721c24"))
                    padding(12.px)
                    borderRadius(4.px)
                    marginBottom(16.px)
                }
            }) {
                Text(error!!)
                Button({
                    style {
                        marginLeft(8.px)
                        padding(4.px, 8.px)
                        backgroundColor(Color.transparent)
                        border(1.px, LineStyle.Solid, Color("#721c24"))
                        borderRadius(4.px)
                        cursor("pointer")
                    }
                    onClick { error = null }
                }) {
                    Text("×")
                }
            }
        }
        
        // Success message
        if (success != null) {
            Div({
                style {
                    backgroundColor(Color("#d4edda"))
                    color(Color("#155724"))
                    padding(12.px)
                    borderRadius(4.px)
                    marginBottom(16.px)
                }
            }) {
                Text(success!!)
                Button({
                    style {
                        marginLeft(8.px)
                        padding(4.px, 8.px)
                        backgroundColor(Color.transparent)
                        border(1.px, LineStyle.Solid, Color("#155724"))
                        borderRadius(4.px)
                        cursor("pointer")
                    }
                    onClick { success = null }
                }) {
                    Text("×")
                }
            }
        }
        
        // Certificate upload form
        Div({
            style {
                backgroundColor(Color.white)
                borderRadius(8.px)
                property("box-shadow", "0 2px 4px rgba(0,0,0,0.1)")
                padding(24.px)
                marginBottom(24.px)
            }
        }) {
            H3 { Text("Upload Certificate") }
            
            // Certificate name
            FormField("Certificate Name") {
                Input(InputType.Text) {
                    style {
                        width(100.percent)
                        padding(8.px)
                        borderRadius(4.px)
                        border(1.px, LineStyle.Solid, Color("#e0e0e0"))
                    }
                    value(certificateName)
                    onInput { event -> certificateName = event.value }
                    attr("placeholder", "my-certificate")
                }
            }
            
            // Certificate file
            FormField("Certificate File (.crt, .pem)") {
                Input(InputType.File) {
                    style {
                        width(100.percent)
                        padding(8.px)
                        borderRadius(4.px)
                        border(1.px, LineStyle.Solid, Color("#e0e0e0"))
                    }
                    onChange { event ->
                        val files = event.target.files
                        if (files != null && files.length > 0) {
                            certificateFile = files[0]
                        }
                    }
                    attr("accept", ".crt,.pem")
                }
            }
            
            // Key file
            FormField("Key File (.key)") {
                Input(InputType.File) {
                    style {
                        width(100.percent)
                        padding(8.px)
                        borderRadius(4.px)
                        border(1.px, LineStyle.Solid, Color("#e0e0e0"))
                    }
                    onChange { event ->
                        val files = event.target.files
                        if (files != null && files.length > 0) {
                            keyFile = files[0]
                        }
                    }
                    attr("accept", ".key")
                }
            }
            
            // Upload button
            Button({
                style {
                    marginTop(16.px)
                    padding(8.px, 16.px)
                    backgroundColor(Color("#1976d2"))
                    color(Color.white)
                    border(0.px, LineStyle.None, Color.transparent)
                    borderRadius(4.px)
                    cursor("pointer")
                    fontSize(14.px)
                }
                onClick { 
                    if (validateForm()) {
                        uploadCertificate(apiClient, certificateName, certificateFile!!, keyFile)
                    }
                }
                disabled(isUploading)
            }) {
                Text(if (isUploading) "Uploading..." else "Upload Certificate")
            }
        }
        
        // Certificate list
        Div({
            style {
                backgroundColor(Color.white)
                borderRadius(8.px)
                property("box-shadow", "0 2px 4px rgba(0,0,0,0.1)")
                padding(24.px)
            }
        }) {
            H3 { Text("Certificates") }
            
            if (isLoading) {
                Div({
                    style {
                        display(DisplayStyle.Flex)
                        justifyContent(JustifyContent.Center)
                        padding(24.px)
                    }
                }) {
                    Text("Loading certificates...")
                }
            } else if (certificates.isEmpty()) {
                Div({
                    style {
                        padding(16.px)
                        textAlign("center")
                        color(Color("#757575"))
                    }
                }) {
                    Text("No certificates found")
                }
            } else {
                Table({
                    style {
                        width(100.percent)
                        borderCollapse("collapse")
                    }
                }) {
                    Thead {
                        Tr {
                            Th({
                                style {
                                    textAlign("left")
                                    padding(8.px)
                                    borderBottom("1px", "solid", "#e0e0e0")
                                }
                            }) {
                                Text("Certificate Name")
                            }
                            Th({
                                style {
                                    textAlign("right")
                                    padding(8.px)
                                    borderBottom("1px", "solid", "#e0e0e0")
                                }
                            }) {
                                Text("Actions")
                            }
                        }
                    }
                    Tbody {
                        certificates.forEach { cert ->
                            Tr({
                                style {
                                    property("&:hover", "{background-color: #f5f5f5;}")
                                }
                            }) {
                                Td({
                                    style {
                                        padding(8.px)
                                        borderBottom("1px", "solid", "#e0e0e0")
                                    }
                                }) {
                                    Text(cert)
                                }
                                Td({
                                    style {
                                        padding(8.px)
                                        borderBottom("1px", "solid", "#e0e0e0")
                                        textAlign("right")
                                    }
                                }) {
                                    Button({
                                        style {
                                            padding(6.px, 12.px)
                                            backgroundColor(Color("#f44336"))
                                            color(Color.white)
                                            border(0.px, LineStyle.None, Color.transparent)
                                            borderRadius(4.px)
                                            cursor("pointer")
                                            fontSize(14.px)
                                        }
                                        onClick { deleteCertificate(apiClient, cert) }
                                    }) {
                                        Text("Delete")
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * Validates the certificate upload form.
 */
private fun validateForm(): Boolean {
    // Add validation logic here
    return true
}

/**
 * Loads certificates from the API.
 */
private fun loadCertificates(
    apiClient: KontainersApiClient,
    callback: (List<String>, String?) -> Unit
) {
    kotlinx.coroutines.MainScope().launch {
        try {
            val certificates = apiClient.getCertificates()
            callback(certificates, null)
        } catch (e: Exception) {
            callback(emptyList(), "Failed to load certificates: ${e.message}")
        }
    }
}

/**
 * Uploads a certificate to the API.
 */
private fun uploadCertificate(
    apiClient: KontainersApiClient,
    name: String,
    certFile: File,
    keyFile: File?
) {
    kotlinx.coroutines.MainScope().launch {
        try {
            val success = apiClient.uploadCertificate(name, certFile, keyFile)
            if (success) {
                // Reload certificates
                loadCertificates(apiClient) { certs, err ->
                    // Update state
                }
            } else {
                // Handle error
            }
        } catch (e: Exception) {
            // Handle error
        }
    }
}

/**
 * Deletes a certificate from the API.
 */
private fun deleteCertificate(
    apiClient: KontainersApiClient,
    name: String
) {
    kotlinx.coroutines.MainScope().launch {
        try {
            val success = apiClient.deleteCertificate(name)
            if (success) {
                // Reload certificates
                loadCertificates(apiClient) { certs, err ->
                    // Update state
                }
            } else {
                // Handle error
            }
        } catch (e: Exception) {
            // Handle error
        }
    }
}