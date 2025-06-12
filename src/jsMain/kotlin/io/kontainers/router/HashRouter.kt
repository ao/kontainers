package io.kontainers.router

import io.kontainers.state.AppStateManager
import io.kontainers.state.Screen
import kotlinx.browser.window

/**
 * Router that handles hash-based navigation.
 */
object HashRouter {
    /**
     * Initialize the router by setting up hash change listeners.
     */
    fun init() {
        // Handle initial hash
        handleHashChange()
        
        // Listen for hash changes
        window.addEventListener("hashchange", { handleHashChange() })
    }
    
    /**
     * Handle hash change events by updating the AppStateManager's currentScreen.
     */
    private fun handleHashChange() {
        val hash = window.location.hash.removePrefix("#/")
        
        val screen = when (hash) {
            "dashboard", "" -> Screen.DASHBOARD
            "containers" -> Screen.CONTAINERS
            "proxy" -> Screen.PROXY
            "proxy_analytics" -> Screen.PROXY_ANALYTICS
            "settings" -> Screen.SETTINGS
            "metrics" -> Screen.METRICS
            else -> Screen.DASHBOARD
        }
        
        AppStateManager.navigateTo(screen)
    }
    
    /**
     * Navigate to a specific screen by updating the URL hash.
     */
    fun navigateTo(screen: Screen) {
        val hash = when (screen) {
            Screen.DASHBOARD -> "dashboard"
            Screen.CONTAINERS -> "containers"
            Screen.PROXY -> "proxy"
            Screen.PROXY_ANALYTICS -> "proxy_analytics"
            Screen.SETTINGS -> "settings"
            Screen.METRICS -> "metrics"
        }
        
        window.location.hash = "#/$hash"
    }
}