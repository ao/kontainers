# Kontainers

Modern container management and reverse proxy platform built with Bun, React, and TypeScript.

## Features

- **Container Management**: Start, stop, restart containers with intuitive web interface
- **Reverse Proxy**: Domain-based routing with SSL/TLS support
- **SSL Certificates**: Automatic Let's Encrypt certificate management
- **Load Balancing**: Distribute traffic across multiple containers
- **Real-time Monitoring**: System health, resource usage, and traffic analytics
- **Web Interface**: Mobile-responsive dashboard for all operations

## Quick Start

```bash
# Run with Docker
docker run -d \
  --name kontainers \
  -p 3000:3000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v kontainers-data:/app/data \
  ataiva/kontainers:latest
```

Access the web interface at `http://localhost:3000`

## Docker Compose

```yaml
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

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Application port | `3000` |
| `DATA_DIR` | Data storage directory | `/app/data` |
| `LOG_LEVEL` | Logging level | `info` |

## Requirements

- Docker 20.10.0 or higher
- Access to Docker socket for container management

## Health Check

The container includes a built-in health check accessible at `/health`

## Support

- GitHub: [github.com/ataiva-software/kontainers](https://github.com/ataiva-software/kontainers)
- Issues: Report bugs and feature requests on GitHub
- License: MIT
