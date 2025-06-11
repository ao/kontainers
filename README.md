# Kontainers

A modern, web-based container management platform that combines the power of container orchestration with intelligent reverse proxy management. Built with Kotlin Multiplatform and Kotlin Compose UI for a seamless, responsive experience.

## 🚀 Project Overview

Kontainers is designed to simplify container management by providing an intuitive web interface that combines the essential features of container orchestration (similar to Portainer) with reverse proxy management (similar to Nginx Proxy Manager) in a single, unified platform.

### Value Proposition

- **Unified Management**: Single interface for both container management and reverse proxy configuration
- **Modern Technology**: Built with Kotlin Multiplatform for performance and maintainability
- **Flexible Deployment**: Can be self-hosted or deployed as a SaaS solution
- **Developer-Friendly**: Clean, responsive UI built with Kotlin Compose
- **Docker Native**: Direct integration with Docker Engine for seamless container operations

## ✨ Key MVP Features

### Container Management
- **Container Visibility**: View all running and stopped containers with real-time status
- **Lifecycle Control**: Start, stop, and restart containers with one click
- **Log Viewing**: Access container logs directly from the web interface
- **Resource Monitoring**: Basic CPU and memory usage display
- **Container Details**: Inspect container configuration, ports, and volumes

### Reverse Proxy Management
- **Simple Proxy Rules**: Create basic HTTP/HTTPS proxy configurations
- **Domain Mapping**: Map custom domains to container services
- **Port Management**: Automatic port discovery and mapping
- **SSL Support**: Basic SSL certificate management for HTTPS endpoints
- **Health Checks**: Monitor proxy endpoint availability

## 🛠 Technology Stack

### Frontend
- **Kotlin/JS**: Modern JavaScript alternative with type safety
- **Kotlin Compose for Web**: Declarative UI framework for responsive web interfaces
- **Ktor Client**: HTTP client for API communication

### Backend
- **Ktor Server**: Lightweight, asynchronous web framework
- **Docker Java API**: Direct integration with Docker Engine
- **Kotlinx Serialization**: JSON serialization for API communication
- **Kotlinx Coroutines**: Asynchronous programming for better performance

### Infrastructure
- **Docker**: Container runtime and orchestration
- **Nginx/Traefik**: Reverse proxy backend (configurable)
- **Docker Compose**: Multi-container deployment orchestration

## 🚀 Quick Start

### Prerequisites
- Docker Engine 20.10+
- Docker Compose 2.0+
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Installation

#### Option 1: Docker Compose (Recommended)
```bash
# Clone the repository
git clone https://github.com/ao/kontainers.git
cd kontainers

# Start the application
docker-compose up -d

# Access the web interface
open http://localhost:9090
```

#### Option 2: Docker Run
```bash
# Run Kontainers container
docker run -d \
  --name kontainers \
  -p 9090:9090 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  kontainers/kontainers:latest

# Access the web interface
open http://localhost:9090
```

#### Option 3: Development Setup
```bash
# Clone and setup development environment
git clone https://github.com/ao/kontainers.git
cd kontainers

# Install dependencies and run
./gradlew run

# Access development server
open http://localhost:9090
```

### First Steps
1. **Connect to Docker**: Kontainers will automatically detect your local Docker installation
2. **View Containers**: Browse your existing containers in the dashboard
3. **Create Proxy Rule**: Set up your first reverse proxy mapping
4. **Monitor Services**: Use the dashboard to monitor container health and proxy status

## 🏗 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Web Browser                              │
│                 (Kotlin Compose UI)                         │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP/WebSocket
┌─────────────────────▼───────────────────────────────────────┐
│                 Ktor Web Server                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │   API Routes    │  │  WebSocket Hub  │  │ Static Files │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                Service Layer                                │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │ Container Mgmt  │  │  Proxy Manager  │  │ Config Store │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│              Infrastructure Layer                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │  Docker Engine  │  │ Reverse Proxy   │  │ File System  │ │
│  │     (API)       │  │ (Nginx/Traefik) │  │   Storage    │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

- **Frontend**: Single-page application built with Kotlin Compose for Web
- **API Server**: RESTful API with WebSocket support for real-time updates
- **Container Service**: Docker API integration for container lifecycle management
- **Proxy Service**: Dynamic reverse proxy configuration management
- **Configuration**: File-based configuration with hot-reload support

## 🔧 Development Setup

### Requirements
- JDK 17+
- Gradle 8.0+
- Docker Desktop or Docker Engine
- Node.js 18+ (for frontend development)

### Building from Source
```bash
# Clone the repository
git clone https://github.com/ao/kontainers.git
cd kontainers

# Build the application
./gradlew build

# Run tests
./gradlew test

# Start development server
./gradlew run
```

### Project Structure
```
kontainers/
├── src/
│   ├── commonMain/          # Shared Kotlin code
│   ├── jsMain/              # Frontend (Kotlin/JS + Compose)
│   ├── jvmMain/             # Backend (Ktor server)
│   └── commonTest/          # Shared tests
├── docker/                  # Docker configuration
├── docs/                    # Documentation
├── gradle/                  # Gradle wrapper
└── build.gradle.kts         # Build configuration
```

### Development Workflow
1. **Backend Development**: Use `./gradlew runJvm` for server-only development
2. **Frontend Development**: Use `./gradlew runJs` for frontend-only development
3. **Full Stack**: Use `./gradlew run` for complete application
4. **Testing**: Use `./gradlew test` for all tests
5. **Docker Build**: Use `./gradlew dockerBuild` for container image

### Configuration

#### Port Configuration
By default, Kontainers runs on port 9090. You can customize this in several ways:

1. **Environment Variable**:
   ```bash
   # Set custom port before running
   export PORT=8090
   ./gradlew run
   ```

2. **Docker Run**:
   ```bash
   docker run -d \
     --name kontainers \
     -p 8090:9090 \
     -e PORT=9090 \
     -v /var/run/docker.sock:/var/run/docker.sock \
     kontainers/kontainers:latest
   ```

3. **Docker Compose**:
   ```yaml
   services:
     kontainers:
       image: kontainers/kontainers:latest
       ports:
         - "8090:9090"
       environment:
         - PORT=9090
       volumes:
         - /var/run/docker.sock:/var/run/docker.sock
   ```

## 📚 Usage Guide

### Container Management

#### Viewing Containers
- Navigate to the **Containers** tab to see all containers
- Use filters to show running, stopped, or all containers
- Click on any container to view detailed information

#### Managing Container Lifecycle
- **Start**: Click the play button to start a stopped container
- **Stop**: Click the stop button to gracefully stop a running container
- **Restart**: Use the restart button to restart a container
- **Remove**: Delete stopped containers (with confirmation)

#### Viewing Logs
- Click on a container name to open the detail view
- Navigate to the **Logs** tab to view real-time container logs
- Use the search and filter options to find specific log entries

### Reverse Proxy Management

#### Creating Proxy Rules
1. Navigate to the **Proxy** tab
2. Click **Add New Rule**
3. Configure:
   - **Source Domain**: The domain that will receive requests
   - **Target Container**: Select the container to proxy to
   - **Target Port**: Specify the container port
   - **SSL**: Enable HTTPS if needed

#### Managing SSL Certificates
- Upload custom SSL certificates in the **SSL** section
- Enable automatic Let's Encrypt integration (coming in Phase 2)
- View certificate expiration dates and renewal status

## 🤝 Contributing

We welcome contributions from the community! Here's how you can help:

### Getting Started
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Commit your changes: `git commit -m 'Add amazing feature'`
5. Push to the branch: `git push origin feature/amazing-feature`
6. Open a Pull Request

### Development Guidelines
- **Code Style**: Follow Kotlin coding conventions
- **Testing**: Write tests for new features and bug fixes
- **Documentation**: Update documentation for user-facing changes
- **Commits**: Use conventional commit messages

### Areas for Contribution
- **UI/UX Improvements**: Enhance the user interface and experience
- **Docker Integration**: Improve container management features
- **Proxy Features**: Add advanced reverse proxy capabilities
- **Testing**: Increase test coverage and add integration tests
- **Documentation**: Improve guides, tutorials, and API documentation

### Reporting Issues
- Use GitHub Issues to report bugs or request features
- Provide detailed reproduction steps for bugs
- Include system information and logs when relevant

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- **Documentation**: [docs.kontainers.io](https://docs.kontainers.io)
- **Docker Hub**: [hub.docker.com/r/kontainers/kontainers](https://hub.docker.com/r/kontainers/kontainers)
- **Issue Tracker**: [github.com/ao/kontainers/issues](https://github.com/ao/kontainers/issues)
- **Discussions**: [github.com/ao/kontainers/discussions](https://github.com/ao/kontainers/discussions)

## 🙏 Acknowledgments

- Inspired by [Portainer](https://www.portainer.io/) for container management
- Inspired by [Nginx Proxy Manager](https://nginxproxymanager.com/) for reverse proxy management
- Built with [Kotlin Multiplatform](https://kotlinlang.org/docs/multiplatform.html)
- UI powered by [Kotlin Compose for Web](https://github.com/JetBrains/compose-multiplatform)

---

**Ready to simplify your container management?** Get started with Kontainers today!