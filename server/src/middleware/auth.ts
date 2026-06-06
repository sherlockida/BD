import type { Request, Response, NextFunction } from 'express';

// ── Simple API key / token auth middleware ──
// For W1, this is a stub. v1.2 will add proper JWT + user sessions.

export function authRequired(req: Request, res: Response, next: NextFunction) {
  // Skip auth in development
  if (process.env.NODE_ENV === 'development') {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header required' });
  }

  // Bearer token validation stub
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  if (!token) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // TODO v1.2: verify JWT / API key against DB
  next();
}

// ── Extract user ID from token (stub) ──
export function getUserIdFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;
  // TODO: decode JWT
  return token || null;
}
