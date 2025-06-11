FROM openjdk:17-jdk-slim AS build

# Set working directory
WORKDIR /app

# Copy Gradle files
COPY gradle gradle
COPY gradlew .
COPY gradlew.bat .
COPY settings.gradle.kts .
COPY build.gradle.kts .

# Make gradlew executable
RUN chmod +x ./gradlew

# Download dependencies
RUN ./gradlew dependencies

# Copy source code
COPY src src

# Build the application
RUN ./gradlew build

# Runtime image
FROM openjdk:17-jre-slim

# Install Docker CLI and Nginx
RUN apt-get update && apt-get install -y \
    docker.io \
    nginx \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create application directory
WORKDIR /app

# Copy application JAR
COPY --from=build /app/build/libs/kontainers-*.jar app.jar

# Copy Nginx configuration template
COPY nginx/nginx.conf.template /etc/nginx/nginx.conf.template

# Create data directory
RUN mkdir -p /app/data /app/config /app/ssl

# Expose ports
EXPOSE 9090 80 443

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:9090/health || exit 1

# Start script
COPY docker/start.sh /start.sh
RUN chmod +x /start.sh

# Create necessary directories
RUN mkdir -p /app/nginx/conf.d

# Default environment variables
ENV PORT=9090

CMD ["java", "-jar", "/app/app.jar"]