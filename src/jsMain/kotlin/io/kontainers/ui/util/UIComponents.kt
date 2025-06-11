package io.kontainers.ui.util

import androidx.compose.runtime.Composable
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*

/**
 * Information message component.
 * Used for displaying non-error informational messages to the user.
 */
@Composable
fun InfoMessage(message: String, subtitle: String? = null, onDismiss: () -> Unit) {
    Div({
        style {
            backgroundColor(Color("#e3f2fd"))
            color(Color("#1976d2"))
            padding(16.px)
            borderRadius(4.px)
            marginBottom(16.px)
            display(DisplayStyle.Flex)
            flexDirection(FlexDirection.Column)
            gap(8.px)
        }
    }) {
        Div {
            Text(message)
        }
        
        if (subtitle != null) {
            Div({
                style {
                    fontSize(14.px)
                    opacity(0.8)
                }
            }) {
                Text(subtitle)
            }
        }
        
        Button({
            style {
                padding(8.px, 16.px)
                backgroundColor(Color("#1976d2"))
                color(Color.white)
                border("0", "none", "transparent")
                borderRadius(4.px)
                cursor("pointer")
                alignSelf(AlignSelf.FlexStart)
            }
            onClick { onDismiss() }
        }) {
            Text("Dismiss")
        }
    }
}

/**
 * Error message component.
 * Used for displaying error messages to the user.
 */
@Composable
fun ErrorMessage(message: String, onRetry: () -> Unit) {
    Div({
        style {
            backgroundColor(Color("#ffebee"))
            color(Color("#c62828"))
            padding(16.px)
            borderRadius(4.px)
            marginBottom(16.px)
            display(DisplayStyle.Flex)
            flexDirection(FlexDirection.Column)
            gap(8.px)
        }
    }) {
        Div {
            Text(message)
        }
        Button({
            style {
                padding(8.px, 16.px)
                backgroundColor(Color("#c62828"))
                color(Color.white)
                border("0", "none", "transparent")
                borderRadius(4.px)
                cursor("pointer")
                alignSelf(AlignSelf.FlexStart)
            }
            onClick { onRetry() }
        }) {
            Text("Retry")
        }
    }
}