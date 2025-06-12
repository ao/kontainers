package io.kontainers.ui.util

import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import io.kontainers.ui.theme.ThemeManager
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*
import org.jetbrains.compose.web.events.SyntheticInputEvent
import org.w3c.dom.Element
import org.w3c.dom.HTMLInputElement
import org.w3c.dom.HTMLTableCellElement
import kotlin.js.Date

/**
 * CSS extensions for Compose Web.
 */

// Generic property function
/**
 * Generic property function that works with any StyleScope implementation.
 * This is a workaround for the different StyleScope implementations in Compose Web.
 */
fun StyleScope.property(name: String, value: String) {
    // Direct property application for StyleScopeBuilder
    try {
        if (this is StyleScopeBuilder) {
            // If we can cast directly, use the built-in method
            this.property(name, value)
            return
        }
    } catch (e: Exception) {
        // Fall through to standard implementations
    }
    
    // Standard CSS properties implementation
    when (name.lowercase()) {
        "padding" -> {
            // Parse padding values
            val parts = value.split(" ")
            when (parts.size) {
                1 -> {
                    val size = parseCssSize(parts[0])
                    padding(size)
                }
                2 -> {
                    val v = parseCssSize(parts[0])
                    val h = parseCssSize(parts[1])
                    padding(v, h)
                }
                4 -> {
                    val top = parseCssSize(parts[0])
                    val right = parseCssSize(parts[1])
                    val bottom = parseCssSize(parts[2])
                    val left = parseCssSize(parts[3])
                    padding(top, right, bottom, left)
                }
                else -> {
                    // Cannot directly set CSS property
                    println("Cannot parse padding value: $value")
                }
            }
        }
        "background-color" -> backgroundColor(Color(value))
        "color" -> color(Color(value))
        "text-align" -> property("text-align", value)
        "white-space" -> property("white-space", value)
        "overflow" -> property("overflow", value)
        "font-weight" -> fontWeight(value)
        "border" -> {
            val parts = value.split(" ")
            if (parts.size >= 3) {
                border(parts[0], parts[1], parts[2])
            } else {
                println("Cannot parse border value: $value")
            }
        }
        "border-radius" -> {
            try {
                val size = parseCssSize(value)
                borderRadius(size)
            } catch (e: Exception) {
                println("Cannot parse border-radius value: $value")
            }
        }
        "font-size" -> {
            try {
                val size = parseCssSize(value)
                fontSize(size)
            } catch (e: Exception) {
                println("Cannot parse font-size value: $value")
            }
        }
        "display" -> {
            when (value.lowercase()) {
                "inline-block" -> display(DisplayStyle.InlineBlock)
                "block" -> display(DisplayStyle.Block)
                "flex" -> display(DisplayStyle.Flex)
                "inline" -> display(DisplayStyle.Inline)
                "none" -> display(DisplayStyle.None)
                "grid" -> display(DisplayStyle.Grid)
                else -> println("Unsupported display value: $value")
            }
        }
        "z-index" -> {
            try {
                val index = value.toInt()
                zIndex(index)
            } catch (e: Exception) {
                println("Cannot parse z-index value: $value")
            }
        }
        "text-overflow" -> textOverflow(value)
        "border-collapse" -> property("border-collapse", value)
        "box-shadow" -> boxShadow(value)
        "cursor" -> cursor(value)
        else -> {
            // For other properties, we can't do much
            println("Unsupported CSS property: $name=$value")
        }
    }
}

// Helper function to parse CSS size values
private fun parseCssSize(value: String): CSSNumeric {
    // Try to parse px values
    val pxMatch = Regex("(\\d+)px").find(value)
    if (pxMatch != null) {
        return pxMatch.groupValues[1].toInt().px
    }
    
    // Try to parse em values
    val emMatch = Regex("(\\d+(\\.\\d+)?)em").find(value)
    if (emMatch != null) {
        return emMatch.groupValues[1].toDouble().em
    }
    
    // Try to parse rem values
    val remMatch = Regex("(\\d+(\\.\\d+)?)rem").find(value)
    if (remMatch != null) {
        val value = remMatch.groupValues[1].toDouble()
        // Use the built-in rem function
        // Create a proper CSS rem unit
        return CSSUnitValueTyped(value.toFloat(), CSSUnit.rem)
    }
    
    // Try to parse % values
    val percentMatch = Regex("(\\d+)%").find(value)
    if (percentMatch != null) {
        return percentMatch.groupValues[1].toInt().percent
    }
    
    // Default to pixels if just a number
    val numMatch = Regex("^(\\d+)$").find(value)
    if (numMatch != null) {
        return numMatch.groupValues[1].toInt().px
    }
    
    // Default fallback
    return 0.px
}

// Border extensions
fun StyleScope.border(width: String, style: String, color: String) {
    property("border", "$width $style $color")
}

// Border with CSSBorder-like interface
fun StyleScope.border(block: BorderScope.() -> Unit) {
    val borderScope = BorderScope()
    borderScope.block()
    property("border", "${borderScope.width} ${borderScope.style} ${borderScope.color}")
}

// Border scope class
class BorderScope {
    var width: String = "1px"
    var style: String = "solid"
    var color: String = "#000"
}

fun StyleScope.borderBottom(width: String, style: String, color: String) {
    property("border-bottom", "$width $style $color")
}

fun StyleScope.borderBottom(width: CSSLengthValue, style: LineStyle, color: CSSColorValue) {
    property("border-bottom", "${width} ${style.name.lowercase()} ${color}")
}

// Additional border functions for StyleScope
// Keep the original name for compatibility
fun StyleScope.borderBottom() {
    property("border-bottom", "1px solid #ccc")
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

// Additional border functions - keep original names for compatibility
fun StyleScope.borderCollapse() {
    property("border-collapse", "collapse")
}

fun StyleScope.borderSeparate() {
    property("border-collapse", "separate")
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

// Z-index extension
fun StyleScope.zIndex(value: Int) {
    property("z-index", value.toString())
}

// Text overflow extension
fun StyleScope.textOverflow(value: String) {
    property("text-overflow", value)
}

// Text align extension - renamed to avoid conflict with built-in function
// Removed textAlign function to avoid ambiguity with built-in function

// White space extension - renamed to avoid conflict with built-in function
// Removed whiteSpace function to avoid ambiguity with built-in function

// Cursor extension
fun StyleScope.cursor(value: String) {
    property("cursor", value)
}

// Overflow extension - renamed to avoid conflict with built-in function
// Removed overflow function to avoid ambiguity with built-in function

// Font weight extension - renamed to avoid conflict with built-in function
// Removed fontWeight function to avoid ambiguity with built-in function

// Placeholder extension
fun StyleScope.placeholder(block: StyleScope.() -> Unit) {
    // Just execute the block directly
    block()
}

// Disabled extension - keep original name for compatibility
fun StyleScope.disabled(block: StyleScope.() -> Unit) {
    // Just execute the block directly
    block()
}

// Disabled property
fun StyleScope.disabled(value: String) {
    property("disabled", value)
}

// Hover extension - keep original name for compatibility
fun StyleScope.hover(block: StyleScope.() -> Unit) {
    // Just execute the block directly
    block()
}

// Hover property
fun StyleScope.hoverProperty(value: String) {
    property("hover", value)
}

// Additional hover function
fun StyleScope.hover() {
    property("hover", "pointer")
    cursor("pointer")
}

// Additional helper functions for common CSS properties
// Completely removed to avoid ambiguity with built-in function
// Use the built-in boxSizing function instead

fun StyleScope.boxSizingBorderBox() {
    property("box-sizing", "border-box")
}

fun StyleScope.boxSizingContentBox() {
    property("box-sizing", "content-box")
}

// String format function similar to Java's String.format
fun String.format(vararg args: Any?): String {
    var result = this
    
    // Handle both %s and %d style formats and %1 style formats
    val standardFormatRegex = Regex("%[sd]")
    val indexedFormatRegex = Regex("%\\d+")
    
    if (standardFormatRegex.containsMatchIn(this)) {
        // Handle standard format specifiers like %s, %d
        args.forEachIndexed { index, arg ->
            val placeholder = when (index) {
                0 -> "%s"
                1 -> "%d"
                else -> "%s"
            }
            result = result.replaceFirst(placeholder, arg?.toString() ?: "null")
        }
    } else if (indexedFormatRegex.containsMatchIn(this)) {
        // Handle indexed format specifiers like %1, %2
        args.forEachIndexed { index, arg ->
            result = result.replace("%${index + 1}", arg?.toString() ?: "null")
        }
    }
    
    return result
}

// Extension function to make String.format work on any object
fun Any.format(vararg args: Any?): String {
    return this.toString().format(*args)
}

// Global format function that can be used without a receiver
fun format(format: String, vararg args: Any?): String {
    return format.format(*args)
}

// System object for JS Date operations
object System {
    fun currentTimeMillis(): Long = Date().getTime().toLong()
}

// External JS Math functions
external object Math {
    fun round(value: Double): Int
    fun floor(value: Double): Int
    fun ceil(value: Double): Int
    fun min(a: Double, b: Double): Double
    fun max(a: Double, b: Double): Double
    fun pow(x: Double, y: Double): Double
    fun log10(x: Double): Double
}

// External JS crypto object
@JsName("crypto")
external object crypto {
    fun getRandomValues(array: dynamic): dynamic
}

// Add InputType enum for input type attribute
enum class InputType(val value: String) {
    TEXT("text"),
    PASSWORD("password"),
    EMAIL("email"),
    NUMBER("number"),
    CHECKBOX("checkbox"),
    RADIO("radio"),
    DATE("date"),
    TIME("time"),
    FILE("file"),
    SUBMIT("submit"),
    RESET("reset"),
    BUTTON("button")
}

// Canvas text align enum
enum class CanvasTextAlign(val value: String) {
    LEFT("left"),
    RIGHT("right"),
    CENTER("center"),
    START("start"),
    END("end")
}

// Canvas text baseline enum
enum class CanvasTextBaseline(val value: String) {
    TOP("top"),
    HANGING("hanging"),
    MIDDLE("middle"),
    ALPHABETIC("alphabetic"),
    IDEOGRAPHIC("ideographic"),
    BOTTOM("bottom")
}

// Input type constants
object TextType {
    const val TYPE = "text"
}

object NumberType {
    const val TYPE = "number"
}

// We'll use the built-in Text component from org.jetbrains.compose.web.dom directly
// We're NOT creating our own Text function to avoid ambiguity

// TextComponent for backward compatibility - renamed to make it more explicit
@Composable
fun KontainersTextComponent(text: String) {
    org.jetbrains.compose.web.dom.Text(text)
}

// We're removing the custom Text function to avoid ambiguity with the built-in one
// Use org.jetbrains.compose.web.dom.Text directly instead

// NumberComponent for backward compatibility
@Composable
fun NumberComponent(value: Any) {
    org.jetbrains.compose.web.dom.Text(value.toString())
}

// We'll use the built-in Input component directly
// No custom Input component to avoid conflicts

// Number component for backward compatibility - renamed to NumberText to avoid conflicts
@Composable
fun NumberText(value: Any) {
    org.jetbrains.compose.web.dom.Text(value.toString())
}

// onInput extension for AttrsScope - fixed to avoid recursion
// Using the correct type for the receiver
// We're removing our custom onInput function since it's causing recursion
// Use the built-in onInput function directly from org.jetbrains.compose.web.attributes

// Log function for debugging
fun logMessage(message: String) {
    println(message)
}

// Log function with tag
fun logMessage(tag: String, message: String) {
    println("[$tag] $message")
}

// HTML attribute helper functions
fun <T : Element> ElementScope<T>.attr(name: String, value: String) {
    // In a real implementation, this would set the attribute on the element
    // For now, we'll just print a message
    println("Setting attribute $name=$value")
}

fun <T : Element> ElementScope<T>.id(value: String) {
    attr("id", value)
}

fun <T : Element> ElementScope<T>.onChange(handler: (dynamic) -> Unit) {
    // In a real implementation, this would add an event listener
    println("Setting onChange handler")
}

fun <T : Element> ElementScope<T>.onClick(handler: () -> Unit) {
    // In a real implementation, this would add an event listener
    println("Setting onClick handler")
}

fun <T : Element> ElementScope<T>.type(value: String) {
    attr("type", value)
}

fun <T : Element> ElementScope<T>.value(value: String) {
    attr("value", value)
}

fun <T : Element> ElementScope<T>.colSpan(value: Int) {
    attr("colspan", value.toString())
}

fun <T : Element> ElementScope<T>.checked(value: Boolean) {
    if (value) {
        attr("checked", "true")
    }
}

fun <T : Element> ElementScope<T>.required(value: Boolean = true) {
    if (value) {
        attr("required", "true")
    }
}

fun <T : Element> ElementScope<T>.placeholder(value: String) {
    attr("placeholder", value)
}

fun <T : Element> ElementScope<T>.min(value: String) {
    attr("min", value)
}

fun <T : Element> ElementScope<T>.max(value: String) {
    attr("max", value)
}

fun <T : Element> ElementScope<T>.step(value: String) {
    attr("step", value)
}

fun <T : Element> ElementScope<T>.selected(value: Boolean = true) {
    if (value) {
        attr("selected", "true")
    }
}

// Disabled attribute for HTML elements
fun <T : Element> ElementScope<T>.disabled(value: Boolean = true) {
    if (value) {
        attr("disabled", "true")
    }
}

// Border bottom with CSSNumeric
fun StyleScope.borderBottomNumeric(width: CSSNumeric, style: LineStyle, color: CSSColorValue) {
    property("border-bottom", "$width $style $color")
}

// onSubmit function for form submission
fun <T : Element> ElementScope<T>.onSubmit(handler: (dynamic) -> Unit) {
    attr("onsubmit", "event.preventDefault();")
    // In a real implementation, this would add an event listener
    println("Setting onSubmit handler")
}

// Media query function for StyleScope
fun StyleScope.media(query: String, block: StyleScope.() -> Unit) {
    // This is a stub implementation that just applies the block directly
    // In a real implementation, this would create a media query
    block()
}

// Type conversion helpers
// Color conversion functions - fixed to properly convert between types
fun colorToCSSColorValue(color: Color): CSSColorValue {
    // Convert Color to CSSColorValue
    return org.jetbrains.compose.web.css.Color(color.toString())
}

// This function is used to convert CSSColorValue to a string representation
// that can be used to create a Color object
fun cssColorValueToString(cssColor: CSSColorValue): String {
    return cssColor.toString()
}

// Helper function to convert Color to CSSColorValue for use in style functions
fun StyleScope.cssColor(color: Color): CSSColorValue {
    return colorToCSSColorValue(color)
}

// Extension functions for Color and CSSColorValue conversion
fun Color.toCSSColorValue(): CSSColorValue {
    return org.jetbrains.compose.web.css.Color(this.toString())
}

// Extension function to get string representation of CSSColorValue
fun CSSColorValue.toColorString(): String {
    return this.toString()
}

// Helper function to convert between Color and CSSColorValue
fun convertColor(color: Any): Any {
    return when (color) {
        is Color -> color.toCSSColorValue()
        is String -> org.jetbrains.compose.web.css.Color(color)
        else -> {
            // Try to handle CSSColorValue without direct type checking
            try {
                val colorStr = color.toString()
                if (colorStr.startsWith("CSSColor")) {
                    // Likely a CSSColorValue
                    color
                } else {
                    color
                }
            } catch (e: Exception) {
                color
            }
        }
    }
}

// Helper function to convert String to CSSColorValue
fun stringToCSSColorValue(color: String): CSSColorValue {
    return org.jetbrains.compose.web.css.Color(color)
}

// Helper function to convert String to CSSColorValue
fun stringToCSSColor(color: String): CSSColorValue {
    // Create a CSSColorValue from a string
    return org.jetbrains.compose.web.css.Color(color)
}

// Value function for StyleScope
fun StyleScope.value(value: String) {
    property("value", value)
}

// Self function for StyleScope
fun StyleScope.self(block: StyleScope.() -> Unit) {
    block()
}

// Dialog component
@Composable
fun Dialog(
    onDismissRequest: () -> Unit,
    title: String? = null,
    onClose: (() -> Unit)? = null,
    content: @Composable () -> Unit
) {
    // This is a stub implementation that just renders the content
    // In a real implementation, this would create a modal dialog
    org.jetbrains.compose.web.dom.Div(attrs = {
        style {
            position(Position.Fixed)
            top(0.px)
            left(0.px)
            width(100.percent)
            height(100.percent)
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
        org.jetbrains.compose.web.dom.Div(attrs = {
            style {
                backgroundColor(Color("white"))
                borderRadius(4.px)
                padding(16.px)
                boxShadow("0 4px 8px rgba(0, 0, 0, 0.1)")
                maxWidth(500.px)
                width(100.percent)
            }
            onClick {
                // Stop propagation to prevent closing when clicking inside
                it.stopPropagation()
            }
        }) {
            // Dialog header
            if (title != null) {
                org.jetbrains.compose.web.dom.Div(attrs = {
                    style {
                        display(DisplayStyle.Flex)
                        justifyContent(JustifyContent.SpaceBetween)
                        alignItems(AlignItems.Center)
                        marginBottom(16.px)
                    }
                }) {
                    org.jetbrains.compose.web.dom.H3(attrs = {
                        style {
                            margin(0.px)
                        }
                    }) {
                        org.jetbrains.compose.web.dom.Text(title)
                    }
                    
                    if (onClose != null) {
                        org.jetbrains.compose.web.dom.Button(attrs = {
                            style {
                                border(0.px)
                                backgroundColor(Color("transparent"))
                                cursor("pointer")
                                fontSize(20.px)
                            }
                            onClick {
                                onClose()
                            }
                        }) {
                            org.jetbrains.compose.web.dom.Text("×")
                        }
                    }
                }
            }
            
            // Dialog content
            content()
        }
    }
}

// ErrorMessage component
@Composable
fun ErrorMessage(message: String) {
    org.jetbrains.compose.web.dom.Div(attrs = {
        style {
            backgroundColor(Color("#ffebee"))
            color(Color("#c62828"))
            padding(12.px)
            borderRadius(4.px)
            marginBottom(16.px)
            display(DisplayStyle.Flex)
            alignItems(AlignItems.Center)
            gap(8.px)
        }
    }) {
        org.jetbrains.compose.web.dom.I(attrs = {
            style {
                fontSize(20.px)
            }
            attr("class", "mdi mdi-alert-circle")
        })
        org.jetbrains.compose.web.dom.Text(message)
    }
}

// We're removing the LoadingIndicator component from here to avoid conflicts
// It's already defined in LoadingIndicator.kt

// ThemeManager implementation to replace the stub
object ThemeManager {
    private val isDarkMode = mutableStateOf(false)
    val themeState = isDarkMode
    
    fun isDarkMode(): Boolean {
        return isDarkMode.value
    }
    
    fun setDarkMode(value: Boolean) {
        isDarkMode.value = value
        applyTheme()
    }
    
    fun toggleDarkMode() {
        isDarkMode.value = !isDarkMode.value
        applyTheme()
    }
    
    private fun applyTheme() {
        // In a real implementation, this would apply the theme to the document
        println("Applying theme: ${if (isDarkMode.value) "dark" else "light"}")
    }
}

// External JS document object with proper type
@JsName("document")
external val document: Document

// External JS window object with proper type
@JsName("window")
external val window: Window

// External JS interfaces
external interface Document {
    val documentElement: Element?
}

external interface Element {
    fun setAttribute(name: String, value: String)
}

external interface Window {
    fun matchMedia(query: String): MediaQueryList
}

external interface MediaQueryList {
    val matches: Boolean
}

