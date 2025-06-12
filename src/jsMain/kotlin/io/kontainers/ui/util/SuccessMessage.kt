package io.kontainers.ui.util

import androidx.compose.runtime.Composable
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*

/**
 * Success message component.
 * Used for displaying success messages to the user.
 */
@Composable
fun SuccessMessage(message: String, onDismiss: () -> Unit) {
    Div({
        style {
            backgroundColor(Color("#e8f5e9"))
            color(Color("#2e7d32"))
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
                backgroundColor(Color("#2e7d32"))
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