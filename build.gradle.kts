import org.jetbrains.kotlin.gradle.targets.js.webpack.KotlinWebpack

plugins {
    kotlin("multiplatform") version "1.9.0"
    kotlin("plugin.serialization") version "1.9.0"
    id("org.jetbrains.compose") version "1.5.0"
    application
}

group = "io.kontainers"
version = "0.1.0"

repositories {
    mavenCentral()
    maven("https://maven.pkg.jetbrains.space/public/p/compose/dev")
    google()
}

kotlin {
    jvm {
        compilations.all {
            kotlinOptions.jvmTarget = "17"
        }
        withJava()
        testRuns["test"].executionTask.configure {
            useJUnitPlatform()
        }
    }
    js(IR) {
        browser {
            commonWebpackConfig(Action {
                cssSupport {
                    enabled.set(true)
                }
            })
            testTask(Action {
                useKarma {
                    useChromeHeadless()
                }
            })
        }
        binaries.executable()
    }
    sourceSets {
        val commonMain by getting {
            dependencies {
                implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
                implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.0")
                implementation("org.jetbrains.kotlinx:kotlinx-datetime:0.4.0")
                implementation("io.ktor:ktor-client-core:2.3.4")
                implementation("io.ktor:ktor-client-content-negotiation:2.3.4")
                implementation("io.ktor:ktor-serialization-kotlinx-json:2.3.4")
            }
        }
        val commonTest by getting {
            dependencies {
                implementation(kotlin("test"))
                implementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.7.3")
                // Removed mockk from here as it's not compatible with JS
            }
        }
        val jvmMain by getting {
            dependsOn(commonMain)
            dependencies {
                implementation("io.ktor:ktor-server-core-jvm:2.3.4")
                implementation("io.ktor:ktor-server-netty-jvm:2.3.4")
                implementation("io.ktor:ktor-server-websockets-jvm:2.3.4")
                implementation("io.ktor:ktor-server-cors-jvm:2.3.4")
                implementation("io.ktor:ktor-server-content-negotiation-jvm:2.3.4")
                implementation("io.ktor:ktor-serialization-kotlinx-json-jvm:2.3.4")
                implementation("io.ktor:ktor-server-html-builder-jvm:2.3.4")
                implementation("com.github.docker-java:docker-java:3.3.3")
                implementation("com.github.docker-java:docker-java-transport-httpclient5:3.3.3")
                implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
                implementation("ch.qos.logback:logback-classic:1.4.11")
                implementation("org.yaml:snakeyaml:2.0")
                implementation(compose.runtime)
            }
        }
        val jvmTest by getting {
            dependsOn(commonTest)
            dependencies {
                implementation("io.ktor:ktor-server-test-host:2.3.4")
                implementation("org.junit.jupiter:junit-jupiter-api:5.9.3")
                implementation("org.junit.jupiter:junit-jupiter-engine:5.9.3")
                implementation("io.mockk:mockk:1.13.5") // Moved mockk here
            }
        }
        val jsMain by getting {
            dependsOn(commonMain)
            dependencies {
                implementation(compose.html.core)
                implementation(compose.material)
                implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core-js:1.7.3")
                implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.0")
                implementation("io.ktor:ktor-client-js:2.3.4")
                implementation("io.ktor:ktor-client-websockets:2.3.4")
                implementation("io.ktor:ktor-client-content-negotiation:2.3.4")
                implementation("io.ktor:ktor-serialization-kotlinx-json:2.3.4")
            }
        }
        val jsTest by getting {
            dependsOn(commonTest)
            dependencies {
                implementation(kotlin("test-js"))
            }
        }
    }
}

application {
    mainClass.set("io.kontainers.ApplicationKt")
}

// Configure Java toolchain to match Kotlin's JVM target
java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(17))
    }
}

tasks.named<Copy>("jvmProcessResources") {
    val jsBrowserDistribution = tasks.named("jsBrowserDistribution")
    from(jsBrowserDistribution)
}

tasks.named<JavaExec>("run") {
    dependsOn(tasks.named<Jar>("jvmJar"))
    classpath(tasks.named<Jar>("jvmJar"))
}

tasks.register("runJvm", JavaExec::class) {
    group = "application"
    mainClass.set("io.kontainers.ApplicationKt")
    classpath(configurations.named("jvmRuntimeClasspath").get())
    classpath(kotlin.jvm().compilations["main"].output.allOutputs)
    standardInput = System.`in`
}

tasks.register("runJs") {
    group = "application"
    dependsOn(tasks.named<KotlinWebpack>("jsBrowserDevelopmentWebpack"))
    doLast {
        println("JS application is now running at http://localhost:8080")
    }
}