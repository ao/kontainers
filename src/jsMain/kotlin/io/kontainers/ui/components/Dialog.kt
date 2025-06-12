package io.kontainers.ui.components

import androidx.compose.runtime.Composable
import io.kontainers.ui.util.*
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*

/**
 * A simple dialog component.
 */
@Composable
fun Dialog(
    onDismissRequest: () -> Unit,
    content: @Composable () -> Unit
) {
    Div(attrs = {
        classes("dialog-overlay")
        style {
            position(Position.Fixed)
            top(0.px)
            left(0.px)
            right(0.px)
            bottom(0.px)
            backgroundColor(Color("rgba(0, 0, 0, 0.5)"))
            display(DisplayStyle.Flex)
            justifyContent(JustifyContent.Center)
            alignItems(AlignItems.Center)
            zIndex(1000)
        }
        onClick {
            onDismissRequest()
        }
    }) {
        Div(attrs = {
            classes("dialog-content")
            style {
                backgroundColor(Color("white"))
                borderRadius(8.px)
                padding(24.px)
                boxShadow("0 4px 8px rgba(0, 0, 0, 0.1)")
                minWidth(400.px)
                maxWidth(90.percent)
                maxHeight(90.percent)
                overflow("auto")
                position(Position.Relative)
                zIndex(1001)
            }
            onClick {
                // Stop propagation to prevent closing when clicking inside the dialog
                it.stopPropagation()
            }
        }) {
            // Close button
            Button(attrs = {
                classes("dialog-close-button")
                style {
                    position(Position.Absolute)
                    top(8.px)
                    right(8.px)
                    border(0.px)
                    backgroundColor(Color.transparent)
                    cursor("pointer")
                    fontSize(20.px)
                    fontWeight("bold")
                    color(Color("#666"))
                }
                onClick {
                    onDismissRequest()
                }
            }) {
                Text("×")
            }
            
            // Dialog content
            content()
        }
    }
}