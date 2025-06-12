package io.kontainers.ui.screens

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import io.kontainers.ui.components.ConfigurationBackupRestore
import io.kontainers.ui.theme.ThemeManager
import io.kontainers.ui.theme.ThemeMode
import io.kontainers.ui.util.KeyboardShortcutDialogState
import io.kontainers.ui.util.KeyboardShortcutManager
import kotlinx.browser.localStorage
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*
import org.w3c.dom.HTMLSelectElement
import org.w3c.dom.get
import org.w3c.dom.set

/**
 * Settings screen component.
 */
@Composable
fun SettingsScreen() {
    val themeState by ThemeManager.themeState.collectAsState()
    
    Div({
        style {
            padding(16.px)
        }
    }) {
        H1 { Text("Settings") }
        P { Text("Configure application settings and preferences") }
        
        // Settings sections
        SettingsSection("Appearance") {
            // Theme settings
            SettingItem("Theme") {
                ThemeSelector(
                    currentTheme = themeState.mode,
                    onThemeChange = { ThemeManager.setThemeMode(it) }
                )
            }
            
            // Font size settings
            SettingItem("Font Size") {
                FontSizeSelector()
            }
        }
        
        SettingsSection("Accessibility") {
            // High contrast mode
            SettingItem("High Contrast Mode") {
                ToggleSwitch(
                    isChecked = localStorage["high_contrast_mode"] == "true",
                    onToggle = { isChecked ->
                        localStorage["high_contrast_mode"] = isChecked.toString()
                        // Apply high contrast mode
                    }
                )
            }
            
            // Reduced motion
            SettingItem("Reduced Motion") {
                ToggleSwitch(
                    isChecked = localStorage["reduced_motion"] == "true",
                    onToggle = { isChecked ->
                        localStorage["reduced_motion"] = isChecked.toString()
                        // Apply reduced motion
                    }
                )
            }
        }
        
        SettingsSection("Keyboard Shortcuts") {
            // Show keyboard shortcuts button
            Button({
                style {
                    padding(8.px, 16.px)
                    backgroundColor(Color("#1976d2"))
                    color(Color.white)
                    border {
                        width = 0.px
                        style = LineStyle.None
                        color = Color.transparent
                    }
                    borderRadius(4.px)
                    cursor("pointer")
                    marginTop(8.px)
                }
                onClick { KeyboardShortcutDialogState.showDialog() }
            }) {
                Text("View Keyboard Shortcuts")
            }
        }
        
        SettingsSection("Dashboard") {
            // Reset dashboard widgets
            Button({
                style {
                    padding(8.px, 16.px)
                    backgroundColor(Color("#f44336"))
                    color(Color.white)
                    border {
                        width = 0.px
                        style = LineStyle.None
                        color = Color.transparent
                    }
                    borderRadius(4.px)
                    cursor("pointer")
                    marginTop(8.px)
                }
                onClick { 
                    localStorage.removeItem("dashboard_widgets")
                }
            }) {
                Text("Reset Dashboard to Default")
            }
        }
        
        SettingsSection("System") {
            // Configuration backup and restore
            Div({
                style {
                    marginTop(16.px)
                }
            }) {
                ConfigurationBackupRestore()
            }
        }
    }
}

/**
 * Settings section component.
 */
@Composable
fun SettingsSection(title: String, content: @Composable () -> Unit) {
    Div({
        style {
            marginBottom(32.px)
        }
    }) {
        H2({
            style {
                fontSize(20.px)
                marginBottom(16.px)
                paddingBottom(8.px)
                property("border-bottom", "1px solid #e0e0e0")
            }
        }) {
            Text(title)
        }
        
        content()
    }
}

/**
 * Setting item component.
 */
@Composable
fun SettingItem(label: String, content: @Composable () -> Unit) {
    Div({
        style {
            display(DisplayStyle.Flex)
            justifyContent(JustifyContent.SpaceBetween)
            alignItems(AlignItems.Center)
            marginBottom(16.px)
            
            // Responsive layout
            property("@media (max-width: 768px)", "{")
            property("flex-direction", "column")
            property("align-items", "flex-start")
            property("gap", "8px")
            property("}", "")
        }
    }) {
        Label(attrs = {
            style {
                fontWeight("500")
            }
        }) {
            Text(label)
        }
        
        Div({
            style {
                minWidth(200.px)
            }
        }) {
            content()
        }
    }
}

/**
 * Theme selector component.
 */
@Composable
fun ThemeSelector(
    currentTheme: ThemeMode,
    onThemeChange: (ThemeMode) -> Unit
) {
    Div({
        style {
            display(DisplayStyle.Flex)
            gap(16.px)
        }
    }) {
        ThemeOption(
            label = "Light",
            icon = "🌞",
            isSelected = currentTheme == ThemeMode.LIGHT,
            onClick = { onThemeChange(ThemeMode.LIGHT) }
        )
        
        ThemeOption(
            label = "Dark",
            icon = "🌙",
            isSelected = currentTheme == ThemeMode.DARK,
            onClick = { onThemeChange(ThemeMode.DARK) }
        )
        
        ThemeOption(
            label = "System",
            icon = "⚙️",
            isSelected = currentTheme == ThemeMode.SYSTEM,
            onClick = { onThemeChange(ThemeMode.SYSTEM) }
        )
    }
}

/**
 * Theme option component.
 */
@Composable
fun ThemeOption(
    label: String,
    icon: String,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    Div({
        style {
            display(DisplayStyle.Flex)
            flexDirection(FlexDirection.Column)
            alignItems(AlignItems.Center)
            gap(8.px)
            padding(8.px)
            borderRadius(4.px)
            cursor("pointer")
            if (isSelected) {
                backgroundColor(Color("#e3f2fd"))
                border(2.px, LineStyle.Solid, Color("#1976d2"))
            } else {
                backgroundColor(Color("#f5f5f5"))
                border(2.px, LineStyle.Solid, Color("transparent"))
            }
        }
        onClick { onClick() }
    }) {
        Div({
            style {
                fontSize(24.px)
            }
        }) {
            Text(icon)
        }
        
        Div {
            Text(label)
        }
    }
}

/**
 * Font size selector component.
 */
@Composable
fun FontSizeSelector() {
    var currentFontSize by remember { mutableStateOf(localStorage["font_size"] ?: "medium") }
    
    Select({
        style {
            padding(8.px)
            width(100.percent)
            borderRadius(4.px)
            border(1.px, LineStyle.Solid, Color("#ccc"))
        }
        attr("value", currentFontSize ?: "")
        onChange { event ->
            currentFontSize = (event.target as HTMLSelectElement).value
            localStorage["font_size"] = currentFontSize
            
            // Apply font size
            val rootElement = kotlinx.browser.document.documentElement
            val fontSize = when (currentFontSize) {
                "small" -> "14px"
                "medium" -> "16px"
                "large" -> "18px"
                "x-large" -> "20px"
                else -> "16px"
            }
            rootElement.asDynamic().style.setProperty("font-size", fontSize)
        }
    }) {
        Option("small") { Text("Small") }
        Option("medium") { Text("Medium") }
        Option("large") { Text("Large") }
        Option("x-large") { Text("Extra Large") }
    }
}

/**
 * Toggle switch component.
 */
@Composable
fun ToggleSwitch(
    isChecked: Boolean,
    onToggle: (Boolean) -> Unit
) {
    var checked by remember { mutableStateOf(isChecked) }
    
    Div({
        style {
            display(DisplayStyle.Flex)
            alignItems(AlignItems.Center)
            gap(8.px)
        }
    }) {
        Div({
            style {
                width(40.px)
                height(20.px)
                backgroundColor(if (checked) Color("#1976d2") else Color("#ccc"))
                borderRadius(10.px)
                position(Position.Relative)
                cursor("pointer")
                property("transition", "background-color 0.2s")
            }
            onClick {
                checked = !checked
                onToggle(checked)
            }
        }) {
            Div({
                style {
                    width(16.px)
                    height(16.px)
                    backgroundColor(Color.white)
                    borderRadius(8.px)
                    position(Position.Absolute)
                    top(2.px)
                    left(if (checked) 22.px else 2.px)
                    property("transition", "left 0.2s")
                }
            }) {}
        }
        
        Text(if (checked) "On" else "Off")
    }
}