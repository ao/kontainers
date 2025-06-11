#!/bin/bash

# Create necessary directories
mkdir -p /app/data /app/config /app/ssl

# Generate Nginx configuration from template
if [ -f /etc/nginx/nginx.conf.template ]; then
  envsubst < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf
fi

# Start Nginx in background
nginx -g "daemon off;" &

# Start the application
exec java -jar /app/app.jar