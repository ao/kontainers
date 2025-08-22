# Kontainers

![Build Status](https://github.com/ataiva-software/kontainers/workflows/Test%20Suite/badge.svg)
![Coverage](https://codecov.io/gh/kontainers/kontainers/branch/main/graph/badge.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Bun](https://img.shields.io/badge/Bun-1.2.16-black)

Kontainers is a modern, high-performance container management and reverse proxy platform built with Bun, React, and TypeScript. It provides an intuitive web interface for managing Docker containers, setting up reverse proxy rules, and monitoring system performance.

## Features

### Container Management
- View and manage Docker containers through an intuitive web interface
- Start, stop, restart, and remove containers with a single click
- View container logs in real-time
- Create new containers with a user-friendly wizard
- Configure volumes, networks, environment variables, and port mappings

### Proxy Management
- Create and manage reverse proxy rules for your containers
- Configure domain-based routing to direct traffic based on domain names
- Configure advanced routing options including path-based routing
- Set up load balancing between multiple containers
- Manage SSL certificates for secure connections
- Automatic Let's Encrypt certificate management with auto-renewal
- Monitor proxy traffic and performance metrics with real-time analytics
- Configure custom headers, health checks, rate limiting, and WAF protection

### Monitoring & Analytics
- Real-time system health monitoring
- Resource usage graphs for CPU, memory, disk, and network
- Container-specific performance metrics
- Proxy traffic analytics and error tracking
- Historical data visualization for trend analysis

### Configuration & Settings
- Comprehensive system configuration options
- Backup and restore functionality
- Import/export proxy rules
- Dark/light theme support
- Mobile-responsive design

## Technology Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Zustand
- **Backend**: Bun, Node.js
- **Container Management**: Docker API
- **Proxy Server**: Nginx
- **Real-time Updates**: WebSockets
- **Data Visualization**: Custom SVG charts

## Architecture

Kontainers follows a modern architecture with a clear separation of concerns:

1. **Frontend Layer**: React-based single-page application with TypeScript for type safety
2. **Backend API**: RESTful API built with Bun for high performance
3. **WebSocket Server**: Real-time updates for container status and metrics
4. **Docker Integration**: Direct communication with Docker API
5. **Proxy Management**: Dynamic Nginx configuration generation and management
   - Domain-based routing with automatic configuration generation
   - SSL/TLS certificate management and secure connections
   - Automated Let's Encrypt certificate provisioning and renewal
   - Advanced traffic management with load balancing, rate limiting, and WAF
6. **Metrics Collection**: System and container metrics collection and storage
   - Domain-specific traffic analytics and monitoring
   - Real-time traffic visualization and alerting

## Current Status & Vision

### Current Implementation Status
- The platform provides comprehensive container management with advanced proxy functionality
- Multi-domain reverse proxy capabilities allow routing traffic to different containers based on domain names
- The Kontainers management UI can be accessed via a dedicated subdomain (e.g., admin.yourdomain.com)
- Dynamic domain-to-container mapping with real-time configuration updates

### Vision for the Project
- Further enhance the multi-domain proxy platform with additional enterprise features
- Develop advanced traffic analytics and reporting capabilities

## Development Progress

### Completed Features
- **Project Foundation** - All tasks completed
  - React + TypeScript project structure set up
  - Bun runtime configured for optimal performance
  - Docker API integration implemented
  - Frontend with React and Tailwind CSS
  - WebSocket support for real-time updates
- **Frontend Components** - All tasks completed
  - Proxy Management Components (ProxyRuleDetail, ProxyRuleForm, ProxyTrafficMonitor)
  - Metrics and Monitoring Components (SystemHealthMonitor, ResourceUsageGraphs, MetricsDashboard)
  - Settings Components (ConfigurationForm, BackupRestorePanel)
- **Backend Infrastructure** - All tasks completed
  - Bun server with routing
  - Docker API integration
  - REST API endpoints for container operations
  - WebSocket server for real-time updates
  - CORS and middleware configuration
- **Security & Authentication** - 100% complete
  - User registration and login system
  - JWT-based authentication
  - Role-based access control (Admin, User, Viewer)
  - Session management and security
  - Password reset functionality

### In Progress
- **Multi-User & API** - Completing final features
  - Team/organization support
  - Resource quotas and limits
  - API client libraries
  - Webhook support
  - CLI tool for power users
- **Operations & Maintenance** - Implementing remaining features
  - Automated backup procedures
  - Update and migration system
- **Scalability & Performance** - Finalizing
  - Horizontal scaling support

### Progress Metrics
- Frontend Components: 100% complete
- Backend Integration: 100% complete
- Docker Integration: 100% complete
- Security & Authentication: 100% complete
- API Documentation: 100% complete
- Multi-User Support: 60% complete
- Operations & Maintenance: 60% complete
- Scalability & Performance: 80% complete
- **Overall Progress: 92% complete**

## Getting Started

### Prerequisites

- Docker 20.10.0 or higher
- Bun 1.2.16 or higher
- Node.js 18.0.0 or higher (optional, for development)

### Installation

#### Using Docker (Recommended)

```bash
# Pull the Kontainers image
docker pull ataiva/kontainers:latest

# Run the container
docker run -d \
  --name kontainers \
  -p 3000:3000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v kontainers-data:/app/data \
  ataiva/kontainers:latest
```

#### Using Docker Compose

```yaml
# docker-compose.yml
version: '3'
services:
  kontainers:
    image: ataiva/kontainers:latest
    ports:
      - "3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - kontainers-data:/app/data
    restart: unless-stopped

volumes:
  kontainers-data:
```

Run with:

```bash
docker-compose up -d
```

#### Manual Installation

```bash
# Clone the repository
git clone https://github.com/ataiva-software/kontainers.git
cd kontainers

# Install dependencies
bun install

# Build the frontend
bun run build

# Start the application
bun run start
```

### Accessing the Application

Once running, access the web interface at:

```
http://localhost:3000
```

## Components

Kontainers includes the following key components:

### Proxy Management Components
- **ProxyRuleDetail**: View detailed information about proxy rules
- **ProxyRuleForm**: Create and edit proxy rules
- **ProxyTrafficMonitor**: Monitor proxy traffic metrics

### Metrics and Monitoring Components
- **SystemHealthMonitor**: Monitor overall system health
- **ResourceUsageGraphs**: View resource usage over time
- **MetricsDashboard**: Comprehensive metrics dashboard

### Settings Components
- **ConfigurationForm**: Configure system settings
- **BackupRestorePanel**: Backup and restore system configuration

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Port to run the application on | `3000` |
| `DATA_DIR` | Directory to store application data | `/app/data` |
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | `info` |
| `DOCKER_HOST` | Docker host to connect to | `unix:///var/run/docker.sock` |
| `NGINX_CONFIG_PATH` | Path to Nginx configuration | `/etc/nginx` |
| `METRICS_RETENTION_DAYS` | Days to retain metrics data | `30` |

### Configuration File

Advanced configuration can be done through the `config.json` file:

```json
{
  "system": {
    "name": "Kontainers",
    "adminEmail": "admin@example.com",
    "logLevel": "info",
    "dataRetentionDays": 30,
    "enableTelemetry": true
  },
  "proxy": {
    "defaultTimeout": 30000,
    "maxConnections": 1000,
    "enableCompression": true,
    "tlsVersion": "TLS 1.3",
    "cipherSuites": ["TLS_AES_128_GCM_SHA256", "TLS_AES_256_GCM_SHA384"]
  },
  "security": {
    "enableFirewall": true,
    "allowedIPs": [],
    "blockedIPs": [],
    "rateLimiting": {
      "enabled": true,
      "requestsPerMinute": 60,
      "burstSize": 10
    }
  }
}
```

## API Reference

Kontainers provides a comprehensive REST API for integration with other tools:

### Container Endpoints

- `GET /api/containers` - List all containers
- `GET /api/containers/:id` - Get container details
- `POST /api/containers` - Create a new container
- `PUT /api/containers/:id/start` - Start a container
- `PUT /api/containers/:id/stop` - Stop a container
- `PUT /api/containers/:id/restart` - Restart a container
- `DELETE /api/containers/:id` - Remove a container
- `GET /api/containers/:id/logs` - Get container logs

### Proxy Endpoints

- `GET /api/proxy/rules` - List all proxy rules
- `GET /api/proxy/rules/:id` - Get proxy rule details
- `POST /api/proxy/rules` - Create a new proxy rule
- `PUT /api/proxy/rules/:id` - Update a proxy rule
- `DELETE /api/proxy/rules/:id` - Delete a proxy rule
- `GET /api/proxy/traffic` - Get proxy traffic metrics
- `GET /api/proxy/domains` - List all domain-based proxy rules
- `GET /api/proxy/domains/:domain` - Get domain-specific proxy rule details
- `GET /api/proxy/traffic/:ruleId/summary` - Get traffic summary for a specific rule
- `GET /api/proxy/traffic/:ruleId/timeseries` - Get time series traffic data for a specific rule
- `GET /api/proxy/certificates` - List all SSL/TLS certificates
- `POST /api/proxy/certificates` - Upload a new SSL/TLS certificate
- `DELETE /api/proxy/certificates/:id` - Delete an SSL/TLS certificate
- `POST /api/proxy/certificates/letsencrypt` - Request a new Let's Encrypt certificate
- `GET /api/proxy/certificates/letsencrypt/status/:domain` - Check Let's Encrypt certificate status
- `POST /api/proxy/certificates/letsencrypt/renew/:id` - Manually renew a Let's Encrypt certificate

### System Endpoints

- `GET /api/system/health` - Get system health information
- `GET /api/system/metrics` - Get system metrics
- `GET /api/system/resources` - Get resource usage
- `POST /api/system/backup` - Create a system backup
- `POST /api/system/restore` - Restore from a backup

## Development

### Setting Up Development Environment

```bash
# Clone the repository
git clone https://github.com/ataiva-software/kontainers.git
cd kontainers

# Install dependencies
bun install

# Install git hooks for development
bun hooks:install

# Start development server
bun run dev
```

### Project Structure

```
kontainers/
├── src/
│   ├── backend/         # Backend API code
│   ├── frontend/        # Frontend React application
│   │   ├── components/  # React components
│   │   │   ├── proxy/   # Proxy management components
│   │   │   ├── metrics/ # Metrics and monitoring components
│   │   │   └── settings/# Settings components
│   │   ├── stores/      # Zustand state stores
│   │   ├── models/      # TypeScript interfaces
│   │   └── utils/       # Utility functions
│   └── shared/          # Shared code between frontend and backend
├── public/              # Static assets
├── config/              # Configuration files
├── scripts/             # Build and deployment scripts
│   └── git-hooks/       # Git hooks for development workflow
└── tests/               # Test files
    ├── frontend/        # Frontend component tests
    ├── backend/         # Backend API tests
    ├── integration/     # Integration tests
    └── performance/     # Performance tests
```

### Running Tests

```bash
# Run all tests
bun test

# Run tests with coverage report
bun test:coverage

# Run frontend tests
bun test:frontend

# Run backend tests
bun test:backend

# Run integration tests
bun test:integration

# Run performance tests
bun test:performance
```

### Git Hooks

The project includes Git hooks to ensure code quality:

- **Pre-commit hook**: Runs tests on changed files
- **Pre-push hook**: Runs the full test suite and checks coverage

You can temporarily disable hooks using:

```bash
# For a single commit/push
SKIP_HOOKS=true git commit
SKIP_HOOKS=true git push

# For the current terminal session
bun hooks:skip
```

## CI/CD Pipeline

![Build Status](https://github.com/ataiva-software/kontainers/workflows/Test%20Suite/badge.svg)
![Coverage](https://codecov.io/gh/ao/kontainers/branch/main/graph/badge.svg)

Kontainers uses GitHub Actions for continuous integration and deployment.

### Test Workflow

The test workflow runs on every push to the main branch and on pull requests:

- Sets up the Bun environment
- Installs dependencies
- Runs the test suite with coverage reporting
- Fails the build if test coverage falls below 80%
- Uploads coverage reports as artifacts
- Integrates with Codecov for coverage visualization

### Performance Testing

A separate workflow runs performance tests on a nightly schedule:

- Measures API response times and throughput
- Generates performance trend reports
- Tracks performance metrics over time

### Pull Request Integration

The CI pipeline integrates with pull requests to provide:

- Automated test results as PR comments
- Status checks that prevent merging if tests fail
- Coverage reports to ensure code quality

### Local Development Integration

The CI/CD pipeline is integrated with local development through Git hooks:

- Pre-commit hook runs tests on changed files
- Pre-push hook runs the full test suite
- Coverage checks ensure code quality

To view the CI/CD configuration, see the workflow files in `.github/workflows/`.

## License

Kontainers is licensed under the MIT License. See the MIT file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Documentation

For full documentation, visit [github.com/ataiva-software/kontainers](https://github.com/ataiva-software/kontainers).

## Acknowledgements

- [Docker](https://www.docker.com/) for container technology
- [Bun](https://bun.sh/) for the high-performance JavaScript runtime
- [React](https://reactjs.org/) for the frontend framework
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [Zustand](https://github.com/pmndrs/zustand) for state management
- [Nginx](https://nginx.org/) for the proxy server

## Contact

- GitHub: [github.com/ao](https://github.com/ao)