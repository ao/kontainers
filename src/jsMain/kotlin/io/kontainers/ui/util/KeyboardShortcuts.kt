package io.kontainers.ui.util

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import io.kontainers.router.HashRouter
import io.kontainers.state.AppStateManager
import io.kontainers.state.Screen
import io.kontainers.ui.theme.ThemeManager
import kotlinx.browser.document
import kotlinx.browser.window
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*
import org.w3c.dom.HTMLElement
import org.w3c.dom.events.Event
import org.w3c.dom.events.KeyboardEvent

/**
 * Data class representing a keyboard shortcut.
 */
data class KeyboardShortcut(
    val key: String,
    val description: String,
    val altKey: Boolean = false,
    val ctrlKey: Boolean = false,
    val shiftKey: Boolean = false,
    val metaKey: Boolean = false,
    val action: () -> Unit
)

/**
 * Singleton object for managing keyboard shortcuts.
 */
object KeyboardShortcutManager {
    private val shortcuts = mutableListOf<KeyboardShortcut>()
    
    /**
     * Registers a keyboard shortcut.
     */
    fun registerShortcut(shortcut: KeyboardShortcut) {
        shortcuts.add(shortcut)
    }
    
    /**
     * Registers multiple keyboard shortcuts.
     */
    fun registerShortcuts(newShortcuts: List<KeyboardShortcut>) {
        shortcuts.addAll(newShortcuts)
    }
    
    /**
     * Clears all registered shortcuts.
     */
    fun clearShortcuts() {
        shortcuts.clear()
    }
    
    /**
     * Gets all registered shortcuts.
     */
    fun getShortcuts(): List<KeyboardShortcut> {
        return shortcuts.toList()
    }
    
    /**
     * Handles a keyboard event.
     */
    fun handleKeyDown(event: KeyboardEvent): Boolean {
        // Ignore keyboard events when typing in input fields
        val target = event.target
        if (target is HTMLElement) {
            val tagName = target.tagName.lowercase()
            if (tagName == "input" || tagName == "textarea" || target.getAttribute("contenteditable") == "true") {
                return false
            }
        }
        
        // Check if the event matches any registered shortcut
        for (shortcut in shortcuts) {
            if (event.key.equals(shortcut.key, ignoreCase = true) &&
                event.altKey == shortcut.altKey &&
                event.ctrlKey == shortcut.ctrlKey &&
                event.shiftKey == shortcut.shiftKey &&
                event.metaKey == shortcut.metaKey) {
                
                event.preventDefault()
                shortcut.action()
                return true
            }
        }
        
        return false
    }
    
    /**
     * Initializes default keyboard shortcuts.
     */
    fun initDefaultShortcuts() {
        clearShortcuts()
        
        // Navigation shortcuts
        registerShortcut(KeyboardShortcut("1", "Go to Dashboard", altKey = true) {
            HashRouter.navigateTo(Screen.DASHBOARD)
        })
        
        registerShortcut(KeyboardShortcut("2", "Go to Containers", altKey = true) {
            HashRouter.navigateTo(Screen.CONTAINERS)
        })
        
        registerShortcut(KeyboardShortcut("3", "Go to Metrics", altKey = true) {
            HashRouter.navigateTo(Screen.METRICS)
        })
        
        registerShortcut(KeyboardShortcut("4", "Go to Proxy Rules", altKey = true) {
            HashRouter.navigateTo(Screen.PROXY)
        })
        
        registerShortcut(KeyboardShortcut("5", "Go to Proxy Analytics", altKey = true) {
            HashRouter.navigateTo(Screen.PROXY_ANALYTICS)
        })
        
        registerShortcut(KeyboardShortcut("6", "Go to Settings", altKey = true) {
            HashRouter.navigateTo(Screen.SETTINGS)
        })
        
        // Action shortcuts
        registerShortcut(KeyboardShortcut("r", "Refresh current view", ctrlKey = true) {
            window.location.reload()
        })
        
        registerShortcut(KeyboardShortcut("t", "Toggle theme", altKey = true) {
            ThemeManager.toggleTheme()
        })
        
        // Help shortcut
        registerShortcut(KeyboardShortcut("?", "Show keyboard shortcuts") {
            KeyboardShortcutDialogState.showDialog()
        })
        
        // Escape to close dialogs
        registerShortcut(KeyboardShortcut("Escape", "Close dialogs") {
            KeyboardShortcutDialogState.hideDialog()
        })
    }
}

/**
 * Object to manage the keyboard shortcut dialog state.
 */
object KeyboardShortcutDialogState {
    private val _isVisible = mutableStateOf(false)
    val isVisible: Boolean get() = _isVisible.value
    
    fun showDialog() {
        _isVisible.value = true
    }
    
    fun hideDialog() {
        _isVisible.value = false
    }
    
    fun toggleDialog() {
        _isVisible.value = !_isVisible.value
    }
}

/**
 * Composable function to initialize keyboard shortcuts.
 */
@Composable
fun InitKeyboardShortcuts() {
    DisposableEffect(Unit) {
        // Initialize default shortcuts
        KeyboardShortcutManager.initDefaultShortcuts()
        
        // Add event listener for keyboard events
        val keydownListener: (Event) -> Unit = { event ->
            if (event is KeyboardEvent) {
                KeyboardShortcutManager.handleKeyDown(event)
            }
        }
        
        document.addEventListener("keydown", keydownListener)
        
        // Remove event listener when the composable is disposed
        onDispose {
            document.removeEventListener("keydown", keydownListener)
        }
    }
}

/**
 * Keyboard shortcut help dialog component.
 */
@Composable
fun KeyboardShortcutDialog() {
    var isVisible by remember { mutableStateOf(KeyboardShortcutDialogState.isVisible) }
    
    // Update visibility when the dialog state changes
    LaunchedEffect(KeyboardShortcutDialogState.isVisible) {
        isVisible = KeyboardShortcutDialogState.isVisible
    }
    
    if (isVisible) {
        // Modal overlay
        Div({
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
            onClick { KeyboardShortcutDialogState.hideDialog() }
        }) {
            // Modal dialog
            Div({
                style {
                    backgroundColor(Color.white)
                    borderRadius(8.px)
                    padding(24.px)
                    width(500.px)
                    maxWidth(90.percent)
                    maxHeight(80.percent)
                    overflowY("auto")
                }
                onClick { it.stopPropagation() }
            }) {
                H2({
                    style {
                        margin(0.px)
                        marginBottom(16.px)
                    }
                }) {
                    Text("Keyboard Shortcuts")
                }
                
                // Shortcut categories
                ShortcutCategory("Navigation")
                ShortcutItem("Alt + 1", "Go to Dashboard")
                ShortcutItem("Alt + 2", "Go to Containers")
                ShortcutItem("Alt + 3", "Go to Metrics")
                ShortcutItem("Alt + 4", "Go to Proxy Rules")
                ShortcutItem("Alt + 5", "Go to Proxy Analytics")
                ShortcutItem("Alt + 6", "Go to Settings")
                
                ShortcutCategory("Actions")
                ShortcutItem("Ctrl + R", "Refresh current view")
                ShortcutItem("Alt + T", "Toggle theme")
                ShortcutItem("?", "Show keyboard shortcuts")
                ShortcutItem("Esc", "Close dialogs")
                
                ShortcutCategory("Container Operations")
                ShortcutItem("Alt + N", "Create new container")
                ShortcutItem("Alt + S", "Stop selected container")
                ShortcutItem("Alt + P", "Start selected container")
                ShortcutItem("Alt + R", "Restart selected container")
                
                ShortcutCategory("Proxy Operations")
                ShortcutItem("Alt + N", "Create new proxy rule")
                ShortcutItem("Alt + E", "Edit selected proxy rule")
                ShortcutItem("Alt + D", "Delete selected proxy rule")
                
                // Close button
                Div({
                    style {
                        marginTop(24.px)
                        textAlign("right")
                    }
                }) {
                    Button({
                        style {
                            padding(8.px, 16.px)
                            backgroundColor(Color("#1976d2"))
                            color(Color.white)
                            border("0", "none", "transparent")
                            borderRadius(4.px)
                            cursor("pointer")
                        }
                        onClick { KeyboardShortcutDialogState.hideDialog() }
                    }) {
                        Text("Close")
                    }
                }
            }
        }
    }
}

/**
 * Shortcut category component.
 */
@Composable
private fun ShortcutCategory(title: String) {
    H3({
        style {
            marginTop(24.px)
            marginBottom(8.px)
            fontSize(18.px)
            borderBottom("1px", "solid", "#e0e0e0")
            paddingBottom(8.px)
        }
    }) {
        Text(title)
    }
}

/**
 * Shortcut item component.
 */
@Composable
private fun ShortcutItem(keys: String, description: String) {
    Div({
        style {
            display(DisplayStyle.Flex)
            justifyContent(JustifyContent.SpaceBetween)
            alignItems(AlignItems.Center)
            padding(8.px, 0.px)
        }
    }) {
        Div({
            style {
                color(Color("#424242"))
            }
        }) {
            Text(description)
        }
        
        Kbd({
            style {
                backgroundColor(Color("#f5f5f5"))
                border("1px", "solid", "#e0e0e0")
                borderRadius(4.px)
                padding(4.px, 8.px)
                fontFamily("monospace")
                fontSize(14.px)
            }
        }) {
            Text(keys)
        }
    }
}

/**
 * Keyboard element for displaying keyboard shortcuts.
 */
@Composable
fun Kbd(
    attrs: AttrBuilderContext<*> = {},
    content: ContentBuilder<HTMLElement>
) = TagElement("kbd", attrs, content)