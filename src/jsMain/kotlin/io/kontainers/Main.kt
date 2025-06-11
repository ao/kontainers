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
import io.kontainers.ui.screens.ProxyScreen
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
    
    renderComposable(rootElementId = "root") {
        App()
    }
}

/**
 * Main application component.
 */
@Composable
fun App() {
    val appState by AppStateManager.state.collectAsState()
    
    AppLayout {
        when (appState.currentScreen) {
            Screen.DASHBOARD -> DashboardScreen()
            Screen.CONTAINERS -> ContainersScreen()
            Screen.PROXY -> ProxyScreen()
            Screen.SETTINGS -> ComingSoonScreen("Settings")
        }
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