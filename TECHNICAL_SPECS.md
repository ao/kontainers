# Kontainers Technical Specifications

This document provides detailed technical requirements, architecture specifications, and implementation guidelines for the Kontainers MVP development.

## 🏗️ System Architecture

### High-Level Architecture

![HLD](./architecture_diagrams/hld.svg)


## 🛠️ Technology Stack Specifications

### Frontend (Kotlin/JS + Compose)

#### Core Dependencies
```kotlin
// build.gradle.kts (jsMain)
dependencies {
    implementation("org.jetbrains.compose.html:html-core:1.5.4")
    implementation("org.jetbrains.compose.material:material:1.5.4")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core-js:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.0")
    implementation("io.ktor:ktor-client-js:2.3.4")
    implementation("io.ktor:ktor-client-websockets:2.3.4")
    implementation("io.ktor:ktor-client-content-negotiation:2.3.4")
    implementation("io.ktor:ktor-serialization-kotlinx-json:2.3.4")
}
```

#### UI Component Architecture
```kotlin
// Component Structure
sealed class Screen {
    object Dashboard : Screen()
    object Containers : Screen()
    object Proxy : Screen()
    object Settings : Screen()
}

// State Management
data class AppState(
    val currentScreen: Screen = Screen.Dashboard,
    val containers: List<Container> = emptyList(),
    val proxyRules: List<ProxyRule> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null
)

// API Client
class KontainersApiClient {
    private val client = HttpClient(Js) {
        install(ContentNegotiation) {
            json()
        }
        install(WebSockets)
    }
    
    suspend fun getContainers(): List<Container>
    suspend fun startContainer(id: String): Boolean
    suspend fun stopContainer(id: String): Boolean
    suspend fun getProxyRules(): List<ProxyRule>
    suspend fun createProxyRule(rule: ProxyRule): ProxyRule
}
```

### Backend (Ktor Server)

#### Core Dependencies
```kotlin
// build.gradle.kts (jvmMain)
dependencies {
    implementation("io.ktor:ktor-server-core-jvm:2.3.4")
    implementation("io.ktor:ktor-server-netty-jvm:2.3.4")
    implementation("io.ktor:ktor-server-websockets-jvm:2.3.4")
    implementation("io.ktor:ktor-server-cors-jvm:2.3.4")
    implementation("io.ktor:ktor-server-content-negotiation-jvm:2.3.4")
    implementation("io.ktor:ktor-serialization-kotlinx-json-jvm:2.3.4")
    implementation("com.github.docker-java:docker-java:3.3.3")
    implementation("com.github.docker-java:docker-java-transport-httpclient5:3.3.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
    implementation("ch.qos.logback:logback-classic:1.4.11")
}
```

#### Server Configuration
```kotlin
// Application.kt
fun Application.module() {
    install(CORS) {
        allowMethod(HttpMethod.Options)
        allowMethod(HttpMethod.Put)
        allowMethod(HttpMethod.Delete)
        allowMethod(HttpMethod.Patch)
        allowHeader(HttpHeaders.Authorization)
        allowHeader(HttpHeaders.ContentType)
        anyHost()
    }
    
    install(ContentNegotiation) {
        json()
    }
    
    install(WebSockets) {
        pingPeriod = Duration.ofSeconds(15)
        timeout = Duration.ofSeconds(15)
        maxFrameSize = Long.MAX_VALUE
        masking = false
    }
    
    configureRouting()
}
```

## 📊 Data Models

### Core Domain Models
```kotlin
// Container.kt
@Serializable
data class Container(
    val id: String,
    val name: String,
    val image: String,
    val state: ContainerState,
    val status: String,
    val ports: List<PortMapping>,
    val volumes: List<VolumeMount>,
    val networks: List<String>,
    val created: Long,
    val labels: Map<String, String> = emptyMap(),
    val env: List<String> = emptyList()
)

@Serializable
enum class ContainerState {
    RUNNING, STOPPED, PAUSED, RESTARTING, REMOVING, DEAD, CREATED
}

@Serializable
data class PortMapping(
    val privatePort: Int,
    val publicPort: Int?,
    val type: String = "tcp",
    val ip: String = "0.0.0.0"
)

@Serializable
data class VolumeMount(
    val source: String,
    val destination: String,
    val mode: String = "rw"
)

// ProxyRule.kt
@Serializable
data class ProxyRule(
    val id: String,
    val name: String,
    val sourceHost: String,
    val sourcePath: String = "/",
    val targetContainer: String,
    val targetPort: Int,
    val protocol: ProxyProtocol = ProxyProtocol.HTTP,
    val sslEnabled: Boolean = false,
    val sslCertPath: String? = null,
    val headers: Map<String, String> = emptyMap(),
    val healthCheck: HealthCheck? = null,
    val created: Long,
    val enabled: Boolean = true
)

@Serializable
enum class ProxyProtocol {
    HTTP, HTTPS, TCP, UDP
}

@Serializable
data class HealthCheck(
    val path: String = "/health",
    val interval: Int = 30,
    val timeout: Int = 5,
    val retries: Int = 3
)

// ContainerStats.kt
@Serializable
data class ContainerStats(
    val containerId: String,
    val timestamp: Long,
    val cpuUsage: Double,
    val memoryUsage: Long,
    val memoryLimit: Long,
    val networkRx: Long,
    val networkTx: Long,
    val blockRead: Long,
    val blockWrite: Long
)
```

## 🔌 API Specifications

### REST API Endpoints

#### Container Management
```kotlin
// Container Routes
GET    /api/containers              // List all containers
GET    /api/containers/{id}         // Get container details
POST   /api/containers/{id}/start   // Start container
POST   /api/containers/{id}/stop    // Stop container
POST   /api/containers/{id}/restart // Restart container
DELETE /api/containers/{id}         // Remove container
GET    /api/containers/{id}/logs    // Get container logs
GET    /api/containers/{id}/stats   // Get container statistics

// Container Creation (Phase 2)
POST   /api/containers              // Create new container
PUT    /api/containers/{id}         // Update container configuration
```

#### Proxy Management
```kotlin
// Proxy Routes
GET    /api/proxy/rules             // List all proxy rules
GET    /api/proxy/rules/{id}        // Get proxy rule details
POST   /api/proxy/rules             // Create new proxy rule
PUT    /api/proxy/rules/{id}        // Update proxy rule
DELETE /api/proxy/rules/{id}        // Delete proxy rule
POST   /api/proxy/rules/{id}/test   // Test proxy rule
GET    /api/proxy/config            // Get current proxy configuration
POST   /api/proxy/reload            // Reload proxy configuration
```

#### System Management
```kotlin
// System Routes
GET    /api/system/info             // System information
GET    /api/system/health           // Health check
GET    /api/system/version          // Application version
GET    /api/system/config           // Configuration
PUT    /api/system/config           // Update configuration
```

### WebSocket Events
```kotlin
// WebSocket Message Types
@Serializable
sealed class WebSocketMessage {
    @Serializable
    data class ContainerEvent(
        val type: EventType,
        val container: Container
    ) : WebSocketMessage()
    
    @Serializable
    data class ProxyEvent(
        val type: EventType,
        val rule: ProxyRule
    ) : WebSocketMessage()
    
    @Serializable
    data class StatsUpdate(
        val stats: List<ContainerStats>
    ) : WebSocketMessage()
    
    @Serializable
    data class LogEntry(
        val containerId: String,
        val timestamp: Long,
        val message: String,
        val level: LogLevel = LogLevel.INFO
    ) : WebSocketMessage()
}

@Serializable
enum class EventType {
    CREATED, STARTED, STOPPED, REMOVED, UPDATED
}

@Serializable
enum class LogLevel {
    DEBUG, INFO, WARN, ERROR
}
```

## 🐳 Docker Integration

### Docker API Client Configuration
```kotlin
// DockerClientConfig.kt
class DockerClientConfig {
    companion object {
        fun create(): DockerClient {
            val config = DefaultDockerClientConfig.createDefaultConfigBuilder()
                .withDockerHost("unix:///var/run/docker.sock")
                .withDockerTlsVerify(false)
                .build()
            
            val httpClient = DockerHttpClient.Builder()
                .dockerHost(config.dockerHost)
                .sslConfig(config.sslConfig)
                .build()
            
            return DockerClientImpl.getInstance(config, httpClient)
        }
    }
}

// ContainerService.kt
class ContainerService(private val dockerClient: DockerClient) {
    suspend fun listContainers(all: Boolean = true): List<Container> {
        return withContext(Dispatchers.IO) {
            dockerClient.listContainersCmd()
                .withShowAll(all)
                .exec()
                .map { it.toContainer() }
        }
    }
    
    suspend fun startContainer(containerId: String): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                dockerClient.startContainerCmd(containerId).exec()
                true
            } catch (e: Exception) {
                false
            }
        }
    }
    
    suspend fun getContainerLogs(containerId: String): Flow<String> {
        return flow {
            dockerClient.logContainerCmd(containerId)
                .withStdOut(true)
                .withStdErr(true)
                .withFollowStream(true)
                .exec(object : ResultCallback.Adapter<Frame>() {
                    override fun onNext(frame: Frame) {
                        emit(String(frame.payload))
                    }
                })
        }.flowOn(Dispatchers.IO)
    }
}
```

## 🔄 Reverse Proxy Integration

### Nginx Configuration Management
```kotlin
// NginxConfigGenerator.kt
class NginxConfigGenerator {
    fun generateConfig(rules: List<ProxyRule>): String {
        return buildString {
            appendLine("events { worker_connections 1024; }")
            appendLine("http {")
            appendLine("    include /etc/nginx/mime.types;")
            appendLine("    default_type application/octet-stream;")
            appendLine()
            
            rules.forEach { rule ->
                if (rule.enabled) {
                    appendLine(generateServerBlock(rule))
                }
            }
            
            appendLine("}")
        }
    }
    
    private fun generateServerBlock(rule: ProxyRule): String {
        return buildString {
            appendLine("    server {")
            appendLine("        listen ${if (rule.sslEnabled) "443 ssl" else "80"};")
            appendLine("        server_name ${rule.sourceHost};")
            
            if (rule.sslEnabled && rule.sslCertPath != null) {
                appendLine("        ssl_certificate ${rule.sslCertPath};")
                appendLine("        ssl_certificate_key ${rule.sslCertPath.replace(".crt", ".key")};")
            }
            
            appendLine("        location ${rule.sourcePath} {")
            appendLine("            proxy_pass http://localhost:${rule.targetPort};")
            appendLine("            proxy_set_header Host \\$host;")
            appendLine("            proxy_set_header X-Real-IP \\$remote_addr;")
            appendLine("            proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;")
            appendLine("            proxy_set_header X-Forwarded-Proto \\$scheme;")
            
            rule.headers.forEach { (key, value) ->
                appendLine("            proxy_set_header $key $value;")
            }
            
            if (rule.healthCheck != null) {
                appendLine("            # Health check: ${rule.healthCheck.path}")
            }
            
            appendLine("        }")
            appendLine("    }")
        }
    }
}

// ProxyService.kt
class ProxyService {
    private val configGenerator = NginxConfigGenerator()
    private val configPath = "/etc/nginx/nginx.conf"
    
    suspend fun updateProxyConfig(rules: List<ProxyRule>) {
        withContext(Dispatchers.IO) {
            val config = configGenerator.generateConfig(rules)
            File(configPath).writeText(config)
            reloadNginx()
        }
    }
    
    private suspend fun reloadNginx() {
        withContext(Dispatchers.IO) {
            ProcessBuilder("nginx", "-s", "reload")
                .start()
                .waitFor()
        }
    }
}
```

## 📊 Database Schema (Phase 3)

### Database Configuration
```kotlin
// DatabaseConfig.kt
object DatabaseConfig {
    fun createDataSource(): HikariDataSource {
        val config = HikariConfig().apply {
            driverClassName = "org.h2.Driver"
            jdbcUrl = "jdbc:h2:file:./data/kontainers;DB_CLOSE_DELAY=-1"
            username = "sa"
            password = ""
            maximumPoolSize = 10
        }
        return HikariDataSource(config)
    }
}

// Database Tables
object Users : Table() {
    val id = uuid("id").autoGenerate()
    val username = varchar("username", 50).uniqueIndex()
    val email = varchar("email", 100).uniqueIndex()
    val passwordHash = varchar("password_hash", 255)
    val role = enumeration("role", UserRole::class)
    val createdAt = timestamp("created_at").defaultExpression(CurrentTimestamp())
    val updatedAt = timestamp("updated_at").defaultExpression(CurrentTimestamp())
    
    override val primaryKey = PrimaryKey(id)
}

object ProxyRules : Table() {
    val id = uuid("id").autoGenerate()
    val userId = uuid("user_id").references(Users.id)
    val name = varchar("name", 100)
    val sourceHost = varchar("source_host", 255)
    val sourcePath = varchar("source_path", 255).default("/")
    val targetContainer = varchar("target_container", 100)
    val targetPort = integer("target_port")
    val protocol = enumeration("protocol", ProxyProtocol::class)
    val sslEnabled = bool("ssl_enabled").default(false)
    val sslCertPath = varchar("ssl_cert_path", 500).nullable()
    val enabled = bool("enabled").default(true)
    val createdAt = timestamp("created_at").defaultExpression(CurrentTimestamp())
    val updatedAt = timestamp("updated_at").defaultExpression(CurrentTimestamp())
    
    override val primaryKey = PrimaryKey(id)
}
```

## 🔒 Security Specifications

### Authentication & Authorization (Phase 3)
```kotlin
// JWT Configuration
class JWTConfig {
    companion object {
        const val SECRET = "your-secret-key"
        const val ISSUER = "kontainers"
        const val AUDIENCE = "kontainers-users"
        const val REALM = "Kontainers"
        const val EXPIRATION_TIME = 3600000L // 1 hour
    }
}

// Security Middleware
fun Application.configureSecurity() {
    install(Authentication) {
        jwt("auth-jwt") {
            realm = JWTConfig.REALM
            verifier(
                JWT.require(Algorithm.HMAC256(JWTConfig.SECRET))
                    .withAudience(JWTConfig.AUDIENCE)
                    .withIssuer(JWTConfig.ISSUER)
                    .build()
            )
            validate { credential ->
                if (credential.payload.getClaim("username").asString() != "") {
                    JWTPrincipal(credential.payload)
                } else {
                    null
                }
            }
        }
    }
}

// Role-based Access Control
enum class UserRole {
    ADMIN, USER, VIEWER
}

fun Route.withRole(role: UserRole, build: Route.() -> Unit) {
    authenticate("auth-jwt") {
        intercept(ApplicationCallPipeline.Call) {
            val principal = call.principal<JWTPrincipal>()
            val userRole = principal?.payload?.getClaim("role")?.asString()
            
            if (userRole == null || UserRole.valueOf(userRole).ordinal < role.ordinal) {
                call.respond(HttpStatusCode.Forbidden)
                return@intercept finish()
            }
        }
        build()
    }
}
```

## 🚀 Deployment Specifications

### Docker Configuration
```dockerfile
# Dockerfile
FROM openjdk:17-jdk-slim

# Install Docker CLI and Nginx
RUN apt-get update && apt-get install -y \
    docker.io \
    nginx \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create application directory
WORKDIR /app

# Copy application JAR
COPY build/libs/kontainers-*.jar app.jar

# Copy Nginx configuration template
COPY docker/nginx.conf.template /etc/nginx/nginx.conf.template

# Create data directory
RUN mkdir -p /app/data

# Expose ports
EXPOSE 8080 80 443

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/api/system/health || exit 1

# Start script
COPY docker/start.sh /start.sh
RUN chmod +x /start.sh

CMD ["/start.sh"]
```

### Docker Compose Configuration
```yaml
# docker-compose.yml
version: '3.8'

services:
  kontainers:
    build: .
    container_name: kontainers
    ports:
      - "8080:8080"
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./data:/app/data
      - ./ssl:/app/ssl:ro
      - ./config:/app/config
    environment:
      - KONTAINERS_ENV=production
      - KONTAINERS_DB_PATH=/app/data/kontainers.db
      - KONTAINERS_SSL_PATH=/app/ssl
    restart: unless-stopped
    networks:
      - kontainers-network

  nginx:
    image: nginx:alpine
    container_name: kontainers-proxy
    ports:
      - "8081:80"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./ssl:/etc/ssl/certs:ro
    depends_on:
      - kontainers
    restart: unless-stopped
    networks:
      - kontainers-network

networks:
  kontainers-network:
    driver: bridge
```

## 📈 Performance Requirements

### Response Time Targets
| Operation | Target Response Time | Maximum Response Time |
|-----------|---------------------|----------------------|
| Container List | < 200ms | < 500ms |
| Container Start/Stop | < 1s | < 3s |
| Proxy Rule Creation | < 300ms | < 1s |
| Log Streaming | < 100ms initial | Real-time |
| Dashboard Load | < 500ms | < 1s |

### Scalability Targets
| Metric | Phase 1 | Phase 2 | Phase 3 |
|--------|---------|---------|---------|
| Concurrent Users | 5 | 20 | 100 |
| Containers Managed | 50 | 200 | 1000 |
| Proxy Rules | 20 | 100 | 500 |
| Memory Usage | < 512MB | < 1GB | < 2GB |
| CPU Usage | < 50% | < 70% | < 80% |

### Monitoring & Metrics
```kotlin
// MetricsService.kt
class MetricsService {
    private val containerCount = AtomicInteger(0)
    private val proxyRuleCount = AtomicInteger(0)
    private val requestCount = AtomicLong(0)
    private val responseTimeHistogram = mutableMapOf<String, MutableList<Long>>()
    
    fun recordRequest(endpoint: String, responseTime: Long) {
        requestCount.incrementAndGet()
        responseTimeHistogram.computeIfAbsent(endpoint) { mutableListOf() }
            .add(responseTime)
    }
    
    fun getMetrics(): SystemMetrics {
        return SystemMetrics(
            containerCount = containerCount.get(),
            proxyRuleCount = proxyRuleCount.get(),
            totalRequests = requestCount.get(),
            averageResponseTime = calculateAverageResponseTime(),
            memoryUsage = getMemoryUsage(),
            cpuUsage = getCpuUsage()
        )
    }
}

@Serializable
data class SystemMetrics(
    val containerCount: Int,
    val proxyRuleCount: Int,
    val totalRequests: Long,
    val averageResponseTime: Double,
    val memoryUsage: Long,
    val cpuUsage: Double,
    val timestamp: Long = System.currentTimeMillis()
)
```

## 🧪 Testing Specifications

### Unit Testing
```kotlin
// ContainerServiceTest.kt
class ContainerServiceTest {
    private val mockDockerClient = mockk<DockerClient>()
    private val containerService = ContainerService(mockDockerClient)
    
    @Test
    fun `should list containers successfully`() = runTest {
        // Given
        val mockContainers = listOf(
            mockk<com.github.dockerjava.api.model.Container> {
                every { id } returns "container1"
                every { names } returns arrayOf("/test-container")
                every { state } returns "running"
            }
        )
        
        every { mockDockerClient.listContainersCmd() } returns mockk {
            every { withShowAll(any()) } returns this
            every { exec() } returns mockContainers
        }
        
        // When
        val result = containerService.listContainers()
        
        // Then
        assertEquals(1, result.size)
        assertEquals("container1", result[0].id)
        assertEquals("test-container", result[0].name)
    }
}
```

### Integration Testing
```kotlin
// ApiIntegrationTest.kt
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ApiIntegrationTest {
    private lateinit var testApplication: TestApplication
    
    @BeforeAll
    fun setup() {
        testApplication = TestApplication {
            application {
                module()
            }
        }
    }
    
    @Test
    fun `should return container list`() = testApplication.test {
        // When
        val response = client.get("/api/containers")
        
        // Then
        assertEquals(HttpStatusCode.OK, response.status)
        val containers = response.body<List<Container>>()
        assertTrue(containers.isNotEmpty())
    }
}
```

## 📋 Development Guidelines

### Code Style & Standards
- **Kotlin Coding Conventions**: Follow official Kotlin style guide
- **API Design**: RESTful principles with consistent naming
- **Error Handling**: Structured error responses with proper HTTP codes
- **Logging**: Structured logging with appropriate levels
- **Documentation**: KDoc for all public APIs

### Git Workflow
- **Branch Strategy**: GitFlow with feature branches
- **Commit Messages**: Conventional commits format
- **Pull Requests**: Required for all changes with code review
- **CI/CD**: Automated testing and deployment pipelines

### Quality Gates
- **Code Coverage**: Minimum 80% for new code
- **Static Analysis**: Detekt for Kotlin code analysis
- **Security Scanning**: Regular dependency vulnerability scans
- **Performance Testing**: Load testing for each release

---

This technical specification provides the foundation for implementing the Kontainers MVP. Each section should be reviewed and updated as development progresses and requirements evolve.
