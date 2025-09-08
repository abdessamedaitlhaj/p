import type { FastifyRequest, FastifyReply } from 'fastify';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private requests = new Map<string, RateLimitEntry>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.requests.entries()) {
        if (now > entry.resetTime) {
          this.requests.delete(key);
        }
      }
    }, 60000);
  }

  check(ip: string, maxRequests: number, windowMs: number): boolean {
    const now = Date.now();
    const key = ip;
    const entry = this.requests.get(key);

    if (!entry || now > entry.resetTime) {
      this.requests.set(key, {
        count: 1,
        resetTime: now + windowMs
      });
      return true;
    }

    if (entry.count >= maxRequests) {
      return false;
    }

    entry.count++;
    return true;
  }

  getRemainingTime(ip: string): number {
    const entry = this.requests.get(ip);
    if (!entry) return 0;
    return Math.max(0, entry.resetTime - Date.now());
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Global rate limiter instance
const globalRateLimiter = new RateLimiter();
const authRateLimiter = new RateLimiter();

// Rate limiting middleware factory
export function createRateLimit(maxRequests: number, windowMs: number, limiter: RateLimiter = globalRateLimiter) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const ip = request.ip;
    
    if (!limiter.check(ip, maxRequests, windowMs)) {
      const remainingTime = Math.ceil(limiter.getRemainingTime(ip) / 1000);
      
      return reply.status(429).send({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${remainingTime} seconds.`,
        retryAfter: remainingTime
      });
    }
  };
}

// Pre-configured rate limiters
export const globalRateLimit = createRateLimit(100, 60000); // 100 requests per minute
export const authRateLimit = createRateLimit(5, 60000, authRateLimiter); // 5 requests per minute

// Cleanup on process exit
process.on('SIGTERM', () => {
  globalRateLimiter.destroy();
  authRateLimiter.destroy();
});

process.on('SIGINT', () => {
  globalRateLimiter.destroy();
  authRateLimiter.destroy();
});
