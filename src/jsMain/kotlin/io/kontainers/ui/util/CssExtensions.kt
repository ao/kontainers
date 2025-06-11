package io.kontainers.ui.util

import org.jetbrains.compose.web.css.*

/**
 * CSS extensions for Compose Web.
 */

// Border extensions
fun StyleScope.border(width: String, style: String, color: String) {
    property("border", "$width $style $color")
}

fun StyleScope.borderBottom(width: String, style: String, color: String) {
    property("border-bottom", "$width $style $color")
}

fun StyleScope.borderTop(width: String, style: String, color: String) {
    property("border-top", "$width $style $color")
}

fun StyleScope.borderRight(width: String, style: String, color: String) {
    property("border-right", "$width $style $color")
}

fun StyleScope.borderLeft(width: String, style: String, color: String) {
    property("border-left", "$width $style $color")
}

fun StyleScope.borderCollapse(value: String) {
    property("border-collapse", value)
}

// Text extensions
fun StyleScope.textTransform(value: String) {
    property("text-transform", value)
}

fun StyleScope.wordBreak(value: String) {
    property("word-break", value)
}

// Box extensions
fun StyleScope.boxShadow(value: String) {
    property("box-shadow", value)
}

// Hover extension
fun StyleScope.hover(block: StyleScope.() -> Unit) {
    property("&:hover", "")
    block()
}