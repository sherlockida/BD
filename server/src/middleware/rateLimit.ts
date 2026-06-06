import type { Request, Response, NextFunction } from 'express';

// ── Simple in-memory token bucket rate limiter ──
// In production, this would use Redis for distributed rate limiting.
// For MVP W1, an in-memory store is sufficient.

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

const DEFAULT_RATE = 60;   // requests per window
const WINDOW_MS = 60_000;  // 1 minute window

// Periodic cleanup of stale buckets
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastRefill > WINDOW_MS * 2) {
      buckets.delete(key);
    }
  }
}, WINDOW_MS * 5);

export function rateLimiter(req: Request, res: Response, next: NextFunction) {
  // Skip health check
  if (req.path === '/api/health') return next();

  const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  const now = Date.now();

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: DEFAULT_RATE, lastRefill: now };
    buckets.set(key, bucket);
  }

  // Refill tokens based on elapsed time
  const elapsed = now - bucket.lastRefill;
  const refillAmount = (elapsed / WINDOW_MS) * DEFAULT_RATE;
  bucket.tokens = Math.min(DEFAULT_RATE, bucket.tokens + refillAmount);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many requests' });
  }

  bucket.tokens -= 1;
  next();
}
