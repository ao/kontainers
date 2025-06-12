package io.kontainers.ui.util

import androidx.compose.runtime.Composable
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*

/**
 * Loading indicator component.
 */
@Composable
fun UtilLoadingIndicator() {
    Div({
        style {
            display(DisplayStyle.Flex)
            justifyContent(JustifyContent.Center)
            alignItems(AlignItems.Center)
            padding(32.px)
        }
    }) {
        Div({
            style {
                width(48.px)
                height(48.px)
                border(2.px, LineStyle.Solid, Color("#1976d2"))
                borderRadius(50.percent)
                property("border-top-color", "transparent")
                property("animation", "spin 1s linear infinite")
            }
        })
        
        Div({
            style {
                property("display", "none")
            }
            attr("data-keyframes", "spin")
            attr("data-from", "transform: rotate(0deg)")
            attr("data-to", "transform: rotate(360deg)")
        })
    }
}