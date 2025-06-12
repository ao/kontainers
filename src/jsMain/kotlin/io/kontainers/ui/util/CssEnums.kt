package io.kontainers.ui.util

import org.jetbrains.compose.web.css.*

/**
 * CSS Overflow enum
 */
enum class Overflow(val value: String) {
    Visible("visible"),
    Hidden("hidden"),
    Scroll("scroll"),
    Auto("auto")
}

/**
 * CSS Cursor enum
 */
enum class Cursor(val value: String) {
    Default("default"),
    Pointer("pointer"),
    Move("move"),
    Text("text"),
    Wait("wait"),
    Help("help"),
    NotAllowed("not-allowed")
}

/**
 * CSS Box Sizing enum
 */
enum class BoxSizing(val value: String) {
    ContentBox("content-box"),
    BorderBox("border-box")
}

/**
 * CSS User Select enum
 */
enum class UserSelect(val value: String) {
    None("none"),
    Auto("auto"),
    Text("text"),
    All("all")
}

/**
 * CSS Font Weight enum
 */
enum class FontWeight(val value: String) {
    Normal("normal"),
    Bold("bold"),
    Bolder("bolder"),
    Lighter("lighter"),
    W100("100"),
    W200("200"),
    W300("300"),
    W400("400"),
    W500("500"),
    W600("600"),
    W700("700"),
    W800("800"),
    W900("900")
}

/**
 * Extension function for overflow
 */
fun StyleScope.overflow(value: Overflow) {
    property("overflow", value.value)
}

/**
 * Extension function for cursor
 */
fun StyleScope.cursor(value: Cursor) {
    property("cursor", value.value)
}

/**
 * Extension function for boxSizing
 */
fun StyleScope.boxSizing(value: BoxSizing) {
    property("box-sizing", value.value)
}

/**
 * Extension function for userSelect
 */
fun StyleScope.userSelect(value: UserSelect) {
    property("user-select", value.value)
}

/**
 * Extension function for fontWeight
 */
fun StyleScope.fontWeight(value: FontWeight) {
    property("font-weight", value.value)
}