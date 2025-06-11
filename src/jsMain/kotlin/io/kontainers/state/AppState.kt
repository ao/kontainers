package io.kontainers.state

import io.kontainers.model.Container
import io.kontainers.model.ProxyRule
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * Enum representing different screens in the application.
 */
enum class Screen {
    DASHBOARD,
    CONTAINERS,
    PROXY,
    SETTINGS
}

/**
 * Data class representing the application state.
 */
data class AppState(
    val currentScreen: Screen = Screen.DASHBOARD,
    val containers: List<Container> = emptyList(),
    val proxyRules: List<ProxyRule> = emptyList(),
    val selectedContainerId: String? = null,
    val isLoading: Boolean = false,
    val error: String? = null
)

/**
 * Singleton object for managing application state.
 */
object AppStateManager {
    private val _state = MutableStateFlow(AppState())
    val state: StateFlow<AppState> = _state.asStateFlow()
    
    /**
     * Updates the current screen.
     */
    fun navigateTo(screen: Screen) {
        _state.update { it.copy(currentScreen = screen) }
    }
    
    /**
     * Updates the containers list.
     */
    fun updateContainers(containers: List<Container>) {
        _state.update { it.copy(containers = containers) }
    }
    
    /**
     * Updates the proxy rules list.
     */
    fun updateProxyRules(rules: List<ProxyRule>) {
        _state.update { it.copy(proxyRules = rules) }
    }
    
    /**
     * Selects a container by ID.
     */
    fun selectContainer(id: String?) {
        _state.update { it.copy(selectedContainerId = id) }
    }
    
    /**
     * Gets the currently selected container.
     */
    fun getSelectedContainer(): Container? {
        val id = state.value.selectedContainerId ?: return null
        return state.value.containers.find { it.id == id }
    }
    
    /**
     * Sets the loading state.
     */
    fun setLoading(loading: Boolean) {
        _state.update { it.copy(isLoading = loading) }
    }
    
    /**
     * Sets an error message.
     */
    fun setError(message: String?) {
        _state.update { it.copy(error = message) }
    }
    
    /**
     * Clears the error message.
     */
    fun clearError() {
        _state.update { it.copy(error = null) }
    }
    
    /**
     * Resets the state to its initial values.
     */
    fun reset() {
        _state.value = AppState()
    }
}