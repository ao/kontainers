package io.kontainers.ui.theme

import androidx.compose.runtime.NoLiveLiterals

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import kotlinx.browser.document
import kotlinx.browser.localStorage
import kotlinx.browser.window
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import org.jetbrains.compose.web.css.*
import org.w3c.dom.get
import org.w3c.dom.set

/**
 * Enum representing different theme modes.
 */
enum class ThemeMode {
    LIGHT,
    DARK,
    SYSTEM
}

/**
 * Data class representing theme colors.
 */
data class ThemeColors(
    val primary: String,
    val primaryDark: String,
    val primaryLight: String,
    val secondary: String,
    val background: String,
    val surface: String,
    val error: String,
    val onPrimary: String,
    val onSecondary: String,
    val onBackground: String,
    val onSurface: String,
    val onError: String,
    val border: String,
    val shadow: String
)

/**
 * Data class representing the theme state.
 */
data class ThemeState(
    val mode: ThemeMode = ThemeMode.SYSTEM,
    val isDark: Boolean = false,
    val colors: ThemeColors = lightColors
)

/**
 * Light theme colors.
 */
val lightColors = ThemeColors(
    primary = "#1976d2",
    primaryDark = "#1565c0",
    primaryLight = "#42a5f5",
    secondary = "#ff9800",
    background = "#f5f5f5",
    surface = "#ffffff",
    error = "#f44336",
    onPrimary = "#ffffff",
    onSecondary = "#000000",
    onBackground = "#212121",
    onSurface = "#212121",
    onError = "#ffffff",
    border = "#e0e0e0",
    shadow = "rgba(0, 0, 0, 0.1)"
)

/**
 * Dark theme colors.
 */
val darkColors = ThemeColors(
    primary = "#90caf9",
    primaryDark = "#64b5f6",
    primaryLight = "#bbdefb",
    secondary = "#ffb74d",
    background = "#121212",
    surface = "#1e1e1e",
    error = "#ef5350",
    onPrimary = "#000000",
    onSecondary = "#000000",
    onBackground = "#ffffff",
    onSurface = "#ffffff",
    onError = "#000000",
    border = "#424242",
    shadow = "rgba(0, 0, 0, 0.3)"
)

/**
 * Singleton object for managing theme state.
 */
object ThemeManager {
    private val _themeState = MutableStateFlow(ThemeState())
    val themeState: StateFlow<ThemeState> = _themeState.asStateFlow()
    
    init {
        // Initialize theme from localStorage or system preference
        val savedThemeMode = localStorage["theme_mode"]
        val mode = when (savedThemeMode) {
            "LIGHT" -> ThemeMode.LIGHT
            "DARK" -> ThemeMode.DARK
            else -> ThemeMode.SYSTEM
        }
        
        setThemeMode(mode)
    }
    
    /**
     * Sets the theme mode.
     */
    fun setThemeMode(mode: ThemeMode) {
        val isDark = when (mode) {
            ThemeMode.LIGHT -> false
            ThemeMode.DARK -> true
            ThemeMode.SYSTEM -> isSystemDarkMode()
        }
        
        _themeState.update { 
            it.copy(
                mode = mode,
                isDark = isDark,
                colors = if (isDark) darkColors else lightColors
            )
        }
        
        // Save to localStorage
        localStorage["theme_mode"] = mode.name
        
        // Apply theme to document
        applyThemeToDocument(isDark)
    }
    
    /**
     * Toggles between light and dark theme.
     */
    fun toggleTheme() {
        val currentMode = _themeState.value.mode
        val newMode = when (currentMode) {
            ThemeMode.LIGHT -> ThemeMode.DARK
            ThemeMode.DARK -> ThemeMode.LIGHT
            ThemeMode.SYSTEM -> if (_themeState.value.isDark) ThemeMode.LIGHT else ThemeMode.DARK
        }
        
        setThemeMode(newMode)
    }
    
    /**
     * Checks if the system is in dark mode.
     */
    private fun isSystemDarkMode(): Boolean {
        return window.matchMedia("(prefers-color-scheme: dark)").matches
    }
    
    /**
     * Applies the theme to the document.
     */
    @NoLiveLiterals
    private fun applyThemeToDocument(isDark: Boolean) {
        val root = document.documentElement
        
        // Apply theme class to root element
        val classList = root?.classList ?: return
        if (isDark) {
            classList.add("dark-theme")
            classList.remove("light-theme")
        } else {
            classList.add("light-theme")
            classList.remove("dark-theme")
        }
        
        // Apply CSS variables
        val colors = if (isDark) darkColors else lightColors
        
        // Apply CSS variables using dynamic access
        root.asDynamic().style.setProperty("--color-primary", colors.primary)
        root.asDynamic().style.setProperty("--color-primary-dark", colors.primaryDark)
        root.asDynamic().style.setProperty("--color-primary-light", colors.primaryLight)
        root.asDynamic().style.setProperty("--color-secondary", colors.secondary)
        root.asDynamic().style.setProperty("--color-background", colors.background)
        root.asDynamic().style.setProperty("--color-surface", colors.surface)
        root.asDynamic().style.setProperty("--color-error", colors.error)
        root.asDynamic().style.setProperty("--color-on-primary", colors.onPrimary)
        root.asDynamic().style.setProperty("--color-on-secondary", colors.onSecondary)
        root.asDynamic().style.setProperty("--color-on-background", colors.onBackground)
        root.asDynamic().style.setProperty("--color-on-surface", colors.onSurface)
        root.asDynamic().style.setProperty("--color-on-error", colors.onError)
        root.asDynamic().style.setProperty("--color-border", colors.border)
        root.asDynamic().style.setProperty("--color-shadow", colors.shadow)
    }
    
    /**
     * Listens for system theme changes.
     */
    @Composable
    fun ListenForSystemThemeChanges() {
        LaunchedEffect(Unit) {
            val mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
            
            val listener: (dynamic) -> Unit = { event ->
                if (_themeState.value.mode == ThemeMode.SYSTEM) {
                    val systemIsDark = event.matches as Boolean
                    _themeState.update { 
                        it.copy(
                            isDark = systemIsDark,
                            colors = if (systemIsDark) darkColors else lightColors
                        )
                    }
                    applyThemeToDocument(systemIsDark)
                }
            }
            
            mediaQuery.addEventListener("change", listener)
        }
    }
}

/**
 * Extension function to get theme-aware color.
 */
fun StyleScope.themeAwareColor(lightColor: String, darkColor: String) {
    property("color", "var(--color-on-surface)")
}

/**
 * Extension function to get theme-aware background color.
 */
fun StyleScope.themeAwareBackground(lightColor: String, darkColor: String) {
    property("background-color", "var(--color-surface)")
}

/**
 * Extension function to get theme-aware border color.
 */
fun StyleScope.themeAwareBorder(width: String, style: String) {
    property("border", "$width $style var(--color-border)")
}

/**
 * Extension function to get theme-aware box shadow.
 */
fun StyleScope.themeAwareShadow(elevation: Int) {
    when (elevation) {
        1 -> property("box-shadow", "0 1px 3px var(--color-shadow)")
        2 -> property("box-shadow", "0 2px 4px var(--color-shadow)")
        3 -> property("box-shadow", "0 3px 6px var(--color-shadow)")
        4 -> property("box-shadow", "0 4px 8px var(--color-shadow)")
        5 -> property("box-shadow", "0 6px 12px var(--color-shadow)")
        else -> property("box-shadow", "0 1px 3px var(--color-shadow)")
    }
}