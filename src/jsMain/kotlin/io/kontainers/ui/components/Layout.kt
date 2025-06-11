package io.kontainers.ui.components

import androidx.compose.runtime.Composable
import io.kontainers.ui.util.*
import org.jetbrains.compose.web.css.*
import org.jetbrains.compose.web.dom.*

/**
 * Main layout component for the application.
 */
@Composable
fun AppLayout(content: @Composable () -> Unit) {
    Div({
        style {
            display(DisplayStyle.Flex)
            flexDirection(FlexDirection.Column)
            height(100.percent)
            width(100.percent)
        }
    }) {
        AppHeader()
        Div({
            style {
                display(DisplayStyle.Flex)
                flexDirection(FlexDirection.Row)
                flexGrow(1)
            }
        }) {
            Sidebar()
            MainContent(content)
        }
        AppFooter()
    }
}

/**
 * Header component.
 */
@Composable
fun AppHeader() {
    Header({
        style {
            padding(16.px)
            backgroundColor(Color("#1976d2"))
            color(Color.white)
            boxShadow("0 2px 4px rgba(0,0,0,0.1)")
        }
    }) {
        H1({
            style {
                margin(0.px)
                fontSize(24.px)
            }
        }) {
            Text("Kontainers")
        }
    }
}

/**
 * Sidebar navigation component.
 */
@Composable
fun Sidebar() {
    Nav({
        style {
            width(250.px)
            backgroundColor(Color("#f5f5f5"))
            padding(16.px)
            borderRight("1px", "solid", "#e0e0e0")
        }
    }) {
        Ul({
            style {
                listStyleType("none")
                padding(0.px)
                margin(0.px)
            }
        }) {
            NavItem("Dashboard", "dashboard", true)
            NavItem("Containers", "containers")
            NavItem("Proxy Rules", "proxy")
            NavItem("Settings", "settings")
        }
    }
}

/**
 * Navigation item component.
 */
@Composable
fun NavItem(label: String, route: String, active: Boolean = false) {
    Li({
        style {
            marginBottom(8.px)
        }
    }) {
        A(href = "#/$route") {
            Div({
                style {
                    padding(12.px)
                    borderRadius(4.px)
                    if (active) {
                        backgroundColor(Color("#e3f2fd"))
                        color(Color("#1976d2"))
                    } else {
                        color(Color("#424242"))
                    }
                    property("transition", "background-color 0.2s")
                    hover {
                        backgroundColor(Color("#e3f2fd"))
                    }
                }
            }) {
                Text(label)
            }
        }
    }
}

/**
 * Main content container.
 */
@Composable
fun MainContent(content: @Composable () -> Unit) {
    Main({
        style {
            flexGrow(1)
            padding(24.px)
            backgroundColor(Color.white)
            overflowY("auto")
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
    Footer({
        style {
            padding(16.px)
            backgroundColor(Color("#f5f5f5"))
            borderTop("1px", "solid", "#e0e0e0")
            textAlign("center")
            color(Color("#757575"))
            fontSize(14.px)
        }
    }) {
        Text("Kontainers © 2025 - A Modern Container Management Platform")
    }
}