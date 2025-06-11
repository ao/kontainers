# Build stage
FROM gradle:8.0.0-jdk17 AS build

WORKDIR /app
COPY . .
RUN gradle build --no-daemon

# Run stage
FROM openjdk:17-slim

WORKDIR /app
COPY --from=build /app/build/libs/*.jar app.jar

# Create directory for static files
COPY --from=build /app/build/processedResources/jvm/main/static /app/static

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]