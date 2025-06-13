import { Elysia } from 'elysia';

/**
 * Security headers middleware
 * Adds security-related HTTP headers to responses
 */
export const securityHeaders = new Elysia()
  .onResponse(({ set }) => {
    // Content Security Policy
    // Restricts the sources from which resources can be loaded
    set.headers['Content-Security-Policy'] = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'", // Allow inline scripts for now
      "style-src 'self' 'unsafe-inline'", // Allow inline styles for now
      "img-src 'self' data: blob:", // Allow data: URLs for images
      "font-src 'self'",
      "connect-src 'self' ws: wss:", // Allow WebSocket connections
      "frame-ancestors 'none'", // Prevent site from being embedded in iframes
      "form-action 'self'", // Restrict form submissions to same origin
      "base-uri 'self'" // Restrict base URI to same origin
    ].join('; ');
    
    // X-Content-Type-Options
    // Prevents browsers from MIME-sniffing a response away from the declared content-type
    set.headers['X-Content-Type-Options'] = 'nosniff';
    
    // X-Frame-Options
    // Prevents site from being embedded in iframes (legacy browsers)
    set.headers['X-Frame-Options'] = 'DENY';
    
    // X-XSS-Protection
    // Enables XSS filtering in browsers that support it (legacy)
    set.headers['X-XSS-Protection'] = '1; mode=block';
    
    // Referrer-Policy
    // Controls how much referrer information is included with requests
    set.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';
    
    // Permissions-Policy (formerly Feature-Policy)
    // Controls which browser features can be used
    set.headers['Permissions-Policy'] = [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'interest-cohort=()'
    ].join(', ');
    
    // Strict-Transport-Security
    // Forces browsers to use HTTPS for the specified domain
    // Only set in production and when using HTTPS
    if (process.env.NODE_ENV === 'production' && !process.env.DISABLE_HSTS) {
      set.headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains; preload';
    }
    
    // Cache-Control
    // Prevents caching of sensitive information
    // This is a default policy, specific routes may override this
    set.headers['Cache-Control'] = 'no-store, max-age=0';
  });

export default securityHeaders;