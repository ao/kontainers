package io.kontainers.ui.components

import androidx.compose.runtime.Composable
import io.kontainers.ui.util.*
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*

/**
 * A component for displaying error messages.
 */
@Composable
fun ErrorMessage(message: String, onDismiss: (() -> Unit)? = null) {
    Div(attrs = {
        classes("error-message")
        style {
            backgroundColor(Color("#ffebee"))
            color(Color("#b71c1c"))
            padding(12.px, 16.px)
            borderRadius(4.px)
            border(1.px, LineStyle.Solid, Color("#ef9a9a"))
            marginBottom(16.px)
            display(DisplayStyle.Flex)
            justifyContent(JustifyContent.SpaceBetween)
            alignItems(AlignItems.Center)
        }
    }) {
        // Error icon and message
        Div(attrs = {
            style {
                display(DisplayStyle.Flex)
                alignItems(AlignItems.Center)
                gap(8.px)
            }
        }) {
            // Error icon
            I(attrs = {
                classes("mdi", "mdi-alert-circle")
                style {
                    fontSize(18.px)
                }
            })
            
            // Error message
            Span {
                Text(message)
            }
        }
        
        // Dismiss button (optional)
        if (onDismiss != null) {
            Button(attrs = {
                classes("error-dismiss-button")
                style {
                    backgroundColor(Color.transparent)
                    border(0.px)
                    color(Color("#b71c1c"))
                    cursor("pointer")
                    padding(4.px)
                    fontSize(16.px)
                    fontWeight("bold")
                }
                onClick {
                    onDismiss()
                }
            }) {
                Text("×")
            }
        }
    }
}