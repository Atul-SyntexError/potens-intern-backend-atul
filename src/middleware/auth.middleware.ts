import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Validates the x-api-key header using constant-time comparison
 * to prevent timing attacks.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string | undefined;

  if (!apiKey) {
    logger.warn({ ip: req.ip }, 'Missing API key');
    res.status(401).json({ error: 'Missing API key. Provide x-api-key header.' });
    return;
  }

  // Constant-time comparison to prevent timing attacks
  const expected = Buffer.from(config.apiKey);
  const provided = Buffer.from(apiKey);

  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    logger.warn({ ip: req.ip }, 'Invalid API key');
    res.status(401).json({ error: 'Invalid API key.' });
    return;
  }

  next();
}
