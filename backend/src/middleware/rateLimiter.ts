import { Elysia } from 'elysia';
import { db } from '../db';
import { rateLimits } from '../db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Rate limiting middleware
 * Limits the number of requests from a single IP address to a specific endpoint
 */

// Default rate limit settings
const DEFAULT_LIMIT = 100; // Maximum number of requests
const DEFAULT_WINDOW = 60 * 60 * 1000; // Time window in milliseconds (1 hour)

// Custom rate limits for specific endpoints
const ENDPOINT_LIMITS: Record<string, { limit: number; window: number }> = {
  '/api/auth/login': { limit: 10, window: 15 * 60 * 1000 }, // 10 requests per 15 minutes
  '/api/auth/register': { limit: 5, window: 60 * 60 * 1000 }, // 5 requests per hour
  '/api/auth/password-reset/request': { limit: 3, window: 60 * 60 * 1000 }, // 3 requests per hour
};

// Rate limiter error
export class RateLimitExceededError extends Error {
  constructor(message = 'Rate limit exceeded. Please try again later.', public retryAfter: number) {
    super(message);
    this.name = 'RateLimitExceededError';
  }
}

/**
 * Rate limiter middleware
 */
export const rateLimiter = new Elysia()
  .derive(async ({ request, set }) => {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const path = new URL(request.url).pathname;
    
    // Skip rate limiting for certain paths
    if (path.startsWith('/api/health') || path === '/') {
      return {};
    }
    
    // Get rate limit settings for this endpoint
    const settings = ENDPOINT_LIMITS[path] || { limit: DEFAULT_LIMIT, window: DEFAULT_WINDOW };
    
    // Check if rate limit exists for this IP and endpoint
    const now = Date.now();
    const rateLimit = await db.select().from(rateLimits).where(
      and(
        eq(rateLimits.ipAddress, ip),
        eq(rateLimits.endpoint, path)
      )
    ).get();
    
    if (rateLimit) {
      // If rate limit exists, check if it's expired
      const resetAt = new Date(rateLimit.resetAt).getTime();
      
      if (now > resetAt) {
        // If expired, reset the count
        await db.update(rateLimits)
          .set({
            count: 1,
            resetAt: new Date(now + settings.window).toISOString()
          })
          .where(eq(rateLimits.id, rateLimit.id));
      } else {
        // If not expired, increment the count
        if (rateLimit.count >= settings.limit) {
          // If count exceeds limit, reject the request
          const retryAfter = Math.ceil((resetAt - now) / 1000);
          
          set.headers['Retry-After'] = retryAfter.toString();
          set.status = 429;
          
          throw new RateLimitExceededError(
            `Rate limit exceeded. Please try again after ${retryAfter} seconds.`,
            retryAfter
          );
        }
        
        // Increment the count
        await db.update(rateLimits)
          .set({ count: rateLimit.count + 1 })
          .where(eq(rateLimits.id, rateLimit.id));
      }
    } else {
      // If rate limit doesn't exist, create it
      await db.insert(rateLimits).values({
        id: crypto.randomUUID(),
        ipAddress: ip,
        endpoint: path,
        count: 1,
        resetAt: new Date(now + settings.window).toISOString()
      });
    }
    
    return {};
  });

export default rateLimiter;