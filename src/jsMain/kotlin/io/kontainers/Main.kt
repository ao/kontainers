package io.kontainers

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import io.kontainers.router.HashRouter
import io.kontainers.state.AppStateManager
import io.kontainers.state.Screen
import io.kontainers.ui.components.AppLayout
import io.kontainers.ui.screens.ContainersScreen
import io.kontainers.ui.screens.DashboardScreen
import io.kontainers.ui.screens.MetricsScreen
import io.kontainers.ui.screens.ProxyScreen
import io.kontainers.ui.screens.ProxyAnalyticsScreen
import io.kontainers.ui.screens.SettingsScreen
import io.kontainers.api.KontainersApiClient
import io.kontainers.ui.theme.ThemeManager
import io.kontainers.ui.util.InitKeyboardShortcuts
import io.kontainers.ui.util.KeyboardShortcutDialog
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.browser.document
import org.jetbrains.compose.web.renderComposable
import org.jetbrains.compose.web.dom.Div
import org.jetbrains.compose.web.dom.H2
import org.jetbrains.compose.web.dom.P
import org.jetbrains.compose.web.dom.Text
import org.jetbrains.compose.web.css.*

/**
 * Main entry point for the frontend application.
 */
fun main() {
    // Initialize the hash router
    HashRouter.init()
    
    // Initialize API client
    val apiClient = KontainersApiClient()
    val coroutineScope = CoroutineScope(Dispatchers.Main)
    
    // Initialize theme
    ThemeManager.setThemeMode(io.kontainers.ui.theme.ThemeMode.SYSTEM)
    
    renderComposable(rootElementId = "root") {
        App(apiClient, coroutineScope)
    }
}

/**
 * Main application component.
 */
@Composable
fun App(apiClient: KontainersApiClient, coroutineScope: CoroutineScope) {
    val appState by AppStateManager.state.collectAsState()
    
    // Initialize keyboard shortcuts
    InitKeyboardShortcuts()
    
    AppLayout {
        when (appState.currentScreen) {
            Screen.DASHBOARD -> DashboardScreen()
            Screen.CONTAINERS -> ContainersScreen()
            Screen.METRICS -> MetricsScreen()
            Screen.PROXY -> ProxyScreen()
            Screen.PROXY_ANALYTICS -> ProxyAnalyticsScreen(apiClient, coroutineScope).render()
            Screen.SETTINGS -> SettingsScreen()
        }
        
        // Keyboard shortcut dialog (always present but only visible when triggered)
        KeyboardShortcutDialog()
    }
}

/**
 * Placeholder for screens that are not yet implemented.
 */
@Composable
fun ComingSoonScreen(feature: String) {
    Div({
        style {
            padding(32.px)
            textAlign("center")
        }
    }) {
        H2 {
            Text("$feature Coming Soon")
        }
        P {
            Text("This feature is under development and will be available soon.")
        }
    }
}