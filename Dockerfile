FROM oven/bun:1.2.16-alpine AS base

# Install dependencies for Docker and system tools
RUN apk add --no-cache \
    docker-cli \
    postgresql-client \
    curl \
    ca-certificates

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies (without lockfile for now)
RUN bun install --production

# Copy source code
COPY . .

# Build the application
RUN bun run build

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["bun", "run", "start"]
