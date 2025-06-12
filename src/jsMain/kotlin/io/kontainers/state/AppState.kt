package io.kontainers.state

import io.kontainers.model.*
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
    SETTINGS,
    METRICS,
    PROXY_ANALYTICS
}

/**
 * Data class representing the application state.
 */
data class AppState(
    val currentScreen: Screen = Screen.DASHBOARD,
    val containers: List<Container> = emptyList(),
    val proxyRules: List<ProxyRule> = emptyList(),
    val selectedContainerId: String? = null,
    val selectedProxyRuleId: String? = null,
    val proxyTrafficData: Map<String, List<ProxyTrafficData>> = emptyMap(),
    val proxyTrafficSummaries: Map<String, ProxyTrafficSummary> = emptyMap(),
    val proxyErrors: Map<String, List<ProxyError>> = emptyMap(),
    val proxyErrorSummaries: Map<String, ProxyErrorSummary> = emptyMap(),
    val requestLogs: Map<String, List<RequestResponseLog>> = emptyMap(),
    val alertConfigs: List<ErrorAlertConfig> = emptyList(),
    val activeAlerts: List<ErrorAlert> = emptyList(),
    val selectedTimeRange: String = "last_hour",
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
    
    /**
     * Selects a proxy rule by ID.
     */
    fun selectProxyRule(id: String?) {
        _state.update { it.copy(selectedProxyRuleId = id) }
    }
    
    /**
     * Gets the currently selected proxy rule.
     */
    fun getSelectedProxyRule(): ProxyRule? {
        val id = state.value.selectedProxyRuleId ?: return null
        return state.value.proxyRules.find { it.id == id }
    }
    
    /**
     * Updates the proxy traffic data.
     */
    fun updateProxyTrafficData(ruleId: String, data: List<ProxyTrafficData>) {
        _state.update {
            val updatedMap = it.proxyTrafficData.toMutableMap()
            updatedMap[ruleId] = data
            it.copy(proxyTrafficData = updatedMap)
        }
    }
    
    /**
     * Updates the proxy traffic summary.
     */
    fun updateProxyTrafficSummary(ruleId: String, summary: ProxyTrafficSummary) {
        _state.update {
            val updatedMap = it.proxyTrafficSummaries.toMutableMap()
            updatedMap[ruleId] = summary
            it.copy(proxyTrafficSummaries = updatedMap)
        }
    }
    
    /**
     * Updates the proxy errors.
     */
    fun updateProxyErrors(ruleId: String, errors: List<ProxyError>) {
        _state.update {
            val updatedMap = it.proxyErrors.toMutableMap()
            updatedMap[ruleId] = errors
            it.copy(proxyErrors = updatedMap)
        }
    }
    
    /**
     * Updates the proxy error summary.
     */
    fun updateProxyErrorSummary(ruleId: String, summary: ProxyErrorSummary) {
        _state.update {
            val updatedMap = it.proxyErrorSummaries.toMutableMap()
            updatedMap[ruleId] = summary
            it.copy(proxyErrorSummaries = updatedMap)
        }
    }
    
    /**
     * Updates the request logs.
     */
    fun updateRequestLogs(ruleId: String, logs: List<RequestResponseLog>) {
        _state.update {
            val updatedMap = it.requestLogs.toMutableMap()
            updatedMap[ruleId] = logs
            it.copy(requestLogs = updatedMap)
        }
    }
    
    /**
     * Updates the alert configurations.
     */
    fun updateAlertConfigs(configs: List<ErrorAlertConfig>) {
        _state.update { it.copy(alertConfigs = configs) }
    }
    
    /**
     * Updates the active alerts.
     */
    fun updateActiveAlerts(alerts: List<ErrorAlert>) {
        _state.update { it.copy(activeAlerts = alerts) }
    }
    
    /**
     * Sets the selected time range.
     */
    fun setSelectedTimeRange(range: String) {
        _state.update { it.copy(selectedTimeRange = range) }
    }
}