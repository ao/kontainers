# Multi-Domain Reverse Proxy User Guide

## Table of Contents

- [Multi-Domain Reverse Proxy User Guide](#multi-domain-reverse-proxy-user-guide)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Setting Up Domain-Based Routing](#setting-up-domain-based-routing)
    - [Prerequisites](#prerequisites)
    - [Creating a Domain-Based Proxy Rule](#creating-a-domain-based-proxy-rule)
    - [Advanced Routing Options](#advanced-routing-options)
    - [Example: Setting Up Multiple Domains](#example-setting-up-multiple-domains)
  - [Configuring Security Features](#configuring-security-features)
    - [SSL/TLS Configuration](#ssltls-configuration)
      - [Using Self-Signed Certificates (Development Only)](#using-self-signed-certificates-development-only)
      - [Let's Encrypt Certificate Management](#lets-encrypt-certificate-management)
        - [Enabling Let's Encrypt for a Domain](#enabling-lets-encrypt-for-a-domain)
        - [How Certificate Renewal Works](#how-certificate-renewal-works)
        - [Viewing Certificate Status](#viewing-certificate-status)
        - [Manual Certificate Operations](#manual-certificate-operations)
    - [Rate Limiting](#rate-limiting)
    - [Web Application Firewall (WAF)](#web-application-firewall-waf)
    - [IP Access Control](#ip-access-control)
  - [Monitoring and Analytics](#monitoring-and-analytics)
    - [Domain Traffic Dashboard](#domain-traffic-dashboard)
    - [Real-Time Traffic Monitoring](#real-time-traffic-monitoring)
    - [Traffic Analytics](#traffic-analytics)
  - [Troubleshooting](#troubleshooting)
    - [Common Issues and Solutions](#common-issues-and-solutions)
      - [Domain Not Routing to Container](#domain-not-routing-to-container)
      - [SSL Certificate Issues](#ssl-certificate-issues)
      - [Let's Encrypt Certificate Issues](#lets-encrypt-certificate-issues)
      - [High Response Times](#high-response-times)
      - [High Error Rate](#high-error-rate)
    - [Viewing Logs](#viewing-logs)
    - [Testing Nginx Configuration](#testing-nginx-configuration)
  - [Best Practices](#best-practices)
    - [Domain Configuration](#domain-configuration)
    - [Security](#security)
    - [Performance](#performance)
    - [Monitoring](#monitoring)

## Overview

Kontainers' multi-domain reverse proxy functionality allows you to route traffic to different containers based on domain names. This powerful feature enables you to:

- Host multiple websites or applications on a single server
- Route traffic to different containers based on domain names
- Secure connections with SSL/TLS certificates
- Implement advanced security features like rate limiting and WAF
- Monitor domain-specific traffic in real-time
- Analyze traffic patterns and performance metrics

The multi-domain reverse proxy is built on Nginx, a high-performance web server and reverse proxy server. Kontainers dynamically generates and manages Nginx configurations based on your proxy rules, making it easy to set up and maintain complex routing scenarios.

## Setting Up Domain-Based Routing

### Prerequisites

Before setting up domain-based routing, ensure you have:

1. A registered domain name
2. DNS records pointing to your server's IP address
3. Containers running the services you want to expose

### Creating a Domain-Based Proxy Rule

1. Navigate to the **Proxy Rules** section in the Kontainers dashboard
2. Click the **Add Rule** button
3. Fill in the basic information:
   - **Rule Name**: A descriptive name for your rule
   - **Status**: Enable or disable the rule
4. In the **Routing Configuration** section:
   - **Domain Name**: Enter your domain name (e.g., `app.example.com`)
   - **Source Host**: Usually the same as your domain name
   - **Source Path**: The path to match (use `/` for the root path)
   - **Protocol**: Select HTTP or HTTPS
5. In the **Target Configuration** section:
   - **Target Container**: Select the container to route traffic to
   - **Target Port**: The port your application is listening on inside the container
6. Click **Save** to create the rule

### Advanced Routing Options

For more complex routing scenarios, you can configure:

- **Path-Based Routing**: Route different paths to different containers
- **Load Balancing**: Distribute traffic across multiple containers
- **Custom Headers**: Add or modify HTTP headers
- **Health Checks**: Monitor the health of your containers

To configure these options, click on the **Advanced** tab when creating or editing a proxy rule.

### Example: Setting Up Multiple Domains

Here's an example of setting up multiple domains:

1. Create a proxy rule for your main website:
   - Domain Name: `example.com`
   - Target Container: `website-container`
   - Target Port: `80`

2. Create a proxy rule for your API:
   - Domain Name: `api.example.com`
   - Target Container: `api-container`
   - Target Port: `3000`

3. Create a proxy rule for your admin panel:
   - Domain Name: `admin.example.com`
   - Target Container: `admin-container`
   - Target Port: `8080`

## Configuring Security Features

### SSL/TLS Configuration

Secure your domains with SSL/TLS certificates:

1. Navigate to the **Certificates** section in the Kontainers dashboard
2. Click **Add Certificate**
3. Fill in the certificate details:
   - **Name**: A descriptive name for your certificate
   - **Domain**: The domain name the certificate is for
   - **Certificate**: Paste your certificate content
   - **Private Key**: Paste your private key content
   - **Chain Certificate** (optional): Paste your chain certificate content
4. Click **Save** to store the certificate
5. Edit your proxy rule and enable SSL:
   - Check the **SSL Enabled** option
   - Select your certificate from the dropdown

#### Using Self-Signed Certificates (Development Only)

For development environments, you can generate a self-signed certificate:

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout private.key -out certificate.crt
```

**Note**: Self-signed certificates will trigger browser warnings and should not be used in production.

#### Let's Encrypt Certificate Management

Kontainers provides automated certificate management using Let's Encrypt, allowing you to obtain free, trusted SSL certificates for your domains with automatic renewal.

##### Enabling Let's Encrypt for a Domain

1. Navigate to the **Proxy Rules** section in the Kontainers dashboard
2. Create a new proxy rule or edit an existing one
3. In the **SSL Configuration** section:
   - Check the **SSL Enabled** option
   - Check the **Use Let's Encrypt** option
   - Enter your email address (required for Let's Encrypt registration and expiry notifications)
4. Click **Save** to apply the changes

The system will automatically:
1. Request a certificate from Let's Encrypt
2. Configure the necessary ACME challenge responses
3. Install the certificate when issued
4. Configure Nginx to use the new certificate

##### How Certificate Renewal Works

Let's Encrypt certificates are valid for 90 days. Kontainers automatically handles renewal:

1. The system checks certificate expiration dates daily
2. When a certificate has less than 30 days remaining, renewal is automatically triggered
3. The renewal process runs in the background without service interruption
4. Once renewed, the new certificate is automatically deployed

##### Viewing Certificate Status

To view the status of your Let's Encrypt certificates:

1. Navigate to the **Certificates** section in the Kontainers dashboard
2. Let's Encrypt certificates are marked with a special badge
3. You can see details including:
   - Domain name
   - Expiration date
   - Last renewal date
   - Current status (Pending, Valid, Expired, Error)

##### Manual Certificate Operations

You can also perform manual operations on Let's Encrypt certificates:

1. **Force Renewal**: You can manually trigger renewal for a certificate before its automatic renewal date
2. **Request New Certificate**: You can request a new certificate for an additional domain
3. **View Certificate Details**: You can view the full certificate chain and details

### Rate Limiting

Protect your services from abuse by implementing rate limiting:

1. Edit your proxy rule and go to the **Advanced** tab
2. In the **Rate Limiting** section:
   - Enable rate limiting
   - Set the **Requests Per Second** limit
   - Set the **Burst Size** (number of requests that can exceed the rate)
   - Configure whether rate limiting is per IP address
   - Set the response code for rate-limited requests (default: 429)
3. Click **Save** to apply the changes

### Web Application Firewall (WAF)

Protect your applications from common web vulnerabilities:

1. Edit your proxy rule and go to the **Advanced** tab
2. In the **WAF Configuration** section:
   - Enable WAF
   - Select the operation mode:
     - **Detection**: Log potential attacks without blocking
     - **Blocking**: Block detected attacks
   - Select the rulesets to enable:
     - **Core**: Basic protection rules
     - **SQL**: SQL injection protection
     - **XSS**: Cross-site scripting protection
     - **LFI**: Local file inclusion protection
     - **RFI**: Remote file inclusion protection
     - **Scanner**: Protection against vulnerability scanners
     - **Session**: Session-based protection
     - **Protocol**: Protocol violation protection
   - Add custom rules if needed
3. Click **Save** to apply the changes

### IP Access Control

Restrict access to your services based on IP addresses:

1. Edit your proxy rule and go to the **Advanced** tab
2. In the **IP Access Control** section:
   - Enable IP access control
   - Set the default action (allow or deny)
   - Add specific rules for IP addresses or ranges
3. Click **Save** to apply the changes

## Monitoring and Analytics

### Domain Traffic Dashboard

The Domain Traffic Dashboard provides an overview of traffic for a specific domain:

1. Navigate to the **Proxy Rules** section
2. Click on a rule to view its details
3. Click the **Traffic Dashboard** tab

The dashboard includes:

- Total requests and responses
- Average response time
- Data transferred
- Error rate
- Traffic over time chart
- Status code distribution
- Top requested paths
- Error distribution

### Real-Time Traffic Monitoring

Monitor traffic in real-time:

1. Navigate to the **Proxy Rules** section
2. Click on a rule to view its details
3. Click the **Real-Time Monitor** tab

The real-time monitor shows:

- Requests per second
- Response time
- Errors per second
- Alerts for high response time or error rate

You can:

- Pause/resume the monitor
- Clear the data
- Adjust alert thresholds

### Traffic Analytics

Analyze traffic patterns and performance:

1. Navigate to the **Analytics** section
2. Select a domain from the dropdown
3. Choose a time range (1h, 6h, 24h, 7d, 30d)

The analytics page includes:

- Traffic volume over time
- Response time trends
- Error rate trends
- Geographic distribution of traffic
- Device and browser statistics
- Top referrers

## Troubleshooting

### Common Issues and Solutions

#### Domain Not Routing to Container

1. **Check DNS Configuration**: Ensure your domain's DNS records point to your server's IP address
2. **Verify Proxy Rule**: Make sure the proxy rule is enabled and the domain name is correct
3. **Check Container Status**: Ensure the target container is running
4. **Check Nginx Logs**: Review the Nginx logs for errors:
   ```bash
   tail -f /var/log/nginx/{rule-id}_error.log
   ```

#### SSL Certificate Issues

1. **Certificate Format**: Ensure your certificate is in PEM format
2. **Certificate Chain**: Make sure you've included the full certificate chain
3. **Private Key Match**: Verify that the private key matches the certificate
4. **Certificate Expiry**: Check if the certificate has expired

#### Let's Encrypt Certificate Issues

1. **Domain Verification Failure**: Ensure your domain is correctly pointing to your server's IP address
   - Check your DNS settings and wait for propagation (can take up to 24-48 hours)
   - Verify that port 80 is accessible from the internet for the HTTP-01 challenge

2. **Rate Limiting Issues**: Let's Encrypt has rate limits that may affect certificate issuance
   - 5 duplicate certificates per week
   - 50 certificates per registered domain per week
   - 300 new orders per account per 3 hours
   
3. **Certificate Renewal Failures**:
   - Check that the ACME challenge path is accessible
   - Verify that Nginx is properly configured to serve the challenge files
   - Check the certificate manager logs for specific error messages:
     ```bash
     tail -f /var/log/kontainers/certmanager.log
     ```

4. **Manual Renewal**: If automatic renewal fails, you can trigger a manual renewal
   - Navigate to the **Certificates** section
   - Find the certificate and click the **Renew** button
   - Check the logs for any errors during the renewal process

#### High Response Times

1. **Container Resources**: Check if the container has sufficient resources
2. **Database Queries**: Look for slow database queries
3. **External Services**: Check if external services are responding slowly
4. **Network Issues**: Verify network connectivity between containers

#### High Error Rate

1. **Application Errors**: Check application logs for errors
2. **Rate Limiting**: Verify if requests are being rate-limited
3. **WAF Blocking**: Check if the WAF is blocking legitimate requests
4. **Container Health**: Ensure the container is healthy

### Viewing Logs

Access logs for a specific domain:

```bash
# Access logs
tail -f /var/log/nginx/{rule-id}_access.log

# Error logs
tail -f /var/log/nginx/{rule-id}_error.log
```

### Testing Nginx Configuration

Test the Nginx configuration before applying changes:

```bash
nginx -t
```

## Best Practices

### Domain Configuration

- Use descriptive names for your proxy rules
- Group related domains together
- Use subdomains for different services (api.example.com, admin.example.com)
- Configure proper health checks for each service

### Security

- Always use SSL/TLS in production
- Use Let's Encrypt for automatic certificate management when possible
- Implement rate limiting for public-facing APIs
- Enable WAF protection for sensitive applications
- Regularly monitor certificate expiration dates
- Use strong cipher suites for SSL/TLS
- Implement proper CORS settings for APIs

### Performance

- Enable caching for static content
- Configure appropriate buffer sizes
- Set reasonable timeouts
- Monitor response times and optimize slow endpoints
- Use load balancing for high-traffic services

### Monitoring

- Set up alerts for high error rates
- Monitor certificate expiration dates and renewal status
- Regularly review traffic patterns for anomalies
- Set up automated backups of your proxy configurations
- Configure email notifications for Let's Encrypt certificate events

By following these guidelines, you can effectively leverage Kontainers' multi-domain reverse proxy functionality to host and manage multiple applications securely and efficiently.