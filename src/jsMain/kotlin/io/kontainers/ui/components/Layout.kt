package io.kontainers.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import io.kontainers.router.HashRouter
import io.kontainers.state.Screen
import io.kontainers.ui.theme.ThemeManager
import io.kontainers.ui.theme.ThemeMode
import io.kontainers.ui.util.*
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*

/**
 * Main layout component for the application.
 */
@Composable
fun AppLayout(content: @Composable () -> Unit) {
    val themeState by ThemeManager.themeState.collectAsState()
    // Always keep sidebar open
    val isSidebarOpen = true
    
    // Listen for system theme changes
    ThemeManager.ListenForSystemThemeChanges()
    
    Div({
        style {
            display(DisplayStyle.Flex)
            flexDirection(FlexDirection.Column)
            height(100.percent)
            width(100.percent)
            backgroundColor(Color(themeState.colors.background))
            color(Color(themeState.colors.onBackground))
        }
    }) {
        AppHeader(
            onMenuClick = { /* No-op, sidebar is always open */ },
            onThemeToggle = { ThemeManager.toggleTheme() },
            isDarkMode = themeState.isDark
        )
        Div({
            style {
                display(DisplayStyle.Flex)
                flexDirection(FlexDirection.Row)
                flexGrow(1)
            }
        }) {
            Sidebar(
                isOpen = isSidebarOpen,
                onClose = { /* No-op, sidebar is always open */ }
            )
            MainContent(content)
        }
        AppFooter()
    }
}

/**
 * Header component.
 */
@Composable
fun AppHeader(
    onMenuClick: () -> Unit,
    onThemeToggle: () -> Unit,
    isDarkMode: Boolean
) {
    val themeState by ThemeManager.themeState.collectAsState()
    
    Header({
        style {
            padding(16.px)
            backgroundColor(Color(themeState.colors.primary))
            color(Color(themeState.colors.onPrimary))
            boxShadow("0 2px 4px ${themeState.colors.shadow}")
            display(DisplayStyle.Flex)
            justifyContent(JustifyContent.SpaceBetween)
            alignItems(AlignItems.Center)
        }
    }) {
        // Left section with menu button and title
        Div({
            style {
                display(DisplayStyle.Flex)
                alignItems(AlignItems.Center)
                gap(16.px)
            }
        }) {
            // Mobile menu button removed - sidebar is always visible
            
            H1({
                style {
                    margin(0.px)
                    fontSize(24.px)
                }
            }) {
                Text("Kontainers")
            }
        }
        
        // Right section with theme toggle and keyboard shortcut help
        Div({
            style {
                display(DisplayStyle.Flex)
                alignItems(AlignItems.Center)
                gap(16.px)
            }
        }) {
            // Theme toggle button
            Button({
                style {
                    padding(8.px)
                    backgroundColor(Color("transparent"))
                    border("0", "none", "transparent")
                    color(Color(themeState.colors.onPrimary))
                    cursor("pointer")
                    fontSize(20.px)
                }
                onClick { onThemeToggle() }
                attr("title", "Toggle theme")
                attr("aria-label", "Toggle dark/light theme")
            }) {
                Text(if (isDarkMode) "🌞" else "🌙")
            }
            
            // Keyboard shortcuts help button
            Button({
                style {
                    padding(8.px)
                    backgroundColor(Color("transparent"))
                    border("0", "none", "transparent")
                    color(Color(themeState.colors.onPrimary))
                    cursor("pointer")
                    fontSize(20.px)
                }
                onClick { /* Show keyboard shortcuts dialog */ }
                attr("title", "Keyboard shortcuts")
                attr("aria-label", "Show keyboard shortcuts")
                attr("data-shortcut", "?")
            }) {
                Text("⌨")
            }
        }
    }
}

/**
 * Sidebar navigation component.
 */
@Composable
fun Sidebar(
    isOpen: Boolean = true,
    onClose: () -> Unit
) {
    val appState by io.kontainers.state.AppStateManager.state.collectAsState()
    val themeState by ThemeManager.themeState.collectAsState()
    val currentScreen = appState.currentScreen
    
    Nav({
        style {
            width(250.px)
            backgroundColor(Color(themeState.colors.surface))
            padding(16.px)
            borderRight("1px", "solid", themeState.colors.border)
            
            // Always visible sidebar, even on mobile
            position(Position.Relative)
            height(100.percent)
        }
    }) {
        // No close button needed as sidebar is always visible
        
        // Navigation items
        Ul({
            style {
                listStyleType("none")
                padding(0.px)
                margin(0.px)
                marginTop(0.px)
            }
        }) {
            NavItem("Dashboard", "dashboard", currentScreen == Screen.DASHBOARD)
            NavItem("Containers", "containers", currentScreen == Screen.CONTAINERS)
            NavItem("Metrics", "metrics", currentScreen == Screen.METRICS)
            NavItem("Proxy Rules", "proxy", currentScreen == Screen.PROXY)
            NavItem("Proxy Analytics", "proxy_analytics", currentScreen == Screen.PROXY_ANALYTICS)
            NavItem("Settings", "settings", currentScreen == Screen.SETTINGS)
        }
    }
    
    // No overlay needed as sidebar is always visible
}

/**
 * Navigation item component.
 */
@Composable
fun NavItem(label: String, route: String, active: Boolean = false) {
    val themeState by ThemeManager.themeState.collectAsState()
    
    Li({
        style {
            marginBottom(8.px)
        }
    }) {
        Div({
            style {
                padding(12.px)
                borderRadius(4.px)
                if (active) {
                    backgroundColor(Color(if (themeState.isDark) "#1e3a5f" else "#e3f2fd"))
                    color(Color(themeState.colors.primary))
                } else {
                    color(Color(themeState.colors.onSurface))
                }
                property("transition", "background-color 0.2s")
                hover {
                    backgroundColor(Color(if (themeState.isDark) "#1e3a5f" else "#e3f2fd"))
                    cursor("pointer")
                }
            }
            onClick {
                val screen = when (route) {
                    "dashboard" -> Screen.DASHBOARD
                    "containers" -> Screen.CONTAINERS
                    "metrics" -> Screen.METRICS
                    "proxy" -> Screen.PROXY
                    "proxy_analytics" -> Screen.PROXY_ANALYTICS
                    "settings" -> Screen.SETTINGS
                    else -> Screen.DASHBOARD
                }
                HashRouter.navigateTo(screen)
            }
            // Add keyboard shortcut attributes
            when (route) {
                "dashboard" -> attr("data-shortcut", "Alt+1")
                "containers" -> attr("data-shortcut", "Alt+2")
                "metrics" -> attr("data-shortcut", "Alt+3")
                "proxy" -> attr("data-shortcut", "Alt+4")
                "proxy_analytics" -> attr("data-shortcut", "Alt+5")
                "settings" -> attr("data-shortcut", "Alt+6")
            }
        }) {
            Text(label)
        }
    }
}

/**
 * Main content container.
 */
@Composable
fun MainContent(content: @Composable () -> Unit) {
    val themeState by ThemeManager.themeState.collectAsState()
    
    Main({
        style {
            flexGrow(1)
            padding(24.px)
            backgroundColor(Color(themeState.colors.background))
            color(Color(themeState.colors.onBackground))
            overflowY("auto")
            
            // Responsive padding
            media(mediaMaxWidth(768.px)) {
                padding(16.px)
            }
        }
    }) {
        content()
    }
}

/**
 * Footer component.
 */
@Composable
fun AppFooter() {
    val themeState by ThemeManager.themeState.collectAsState()
    
    Footer({
        style {
            padding(16.px)
            backgroundColor(Color(themeState.colors.surface))
            borderTop("1px", "solid", themeState.colors.border)
            textAlign("center")
            color(Color(themeState.colors.onSurface))
            fontSize(14.px)
            opacity(0.7)
        }
    }) {
        Text("Kontainers © 2025 - A Modern Container Management Platform")
    }
}

/**
 * Media query helper for max-width.
 */
fun mediaMaxWidth(width: CSSNumeric) =
    "(max-width: $width)"