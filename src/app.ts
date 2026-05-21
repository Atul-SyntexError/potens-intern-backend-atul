import express from 'express';
import { authMiddleware } from './middleware/auth.middleware';
import { errorHandler } from './middleware/errorHandler.middleware';
import routes from './routes';
import { logger } from './utils/logger';

const app = express();

// Parse JSON bodies
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  logger.info({ method: req.method, url: req.url }, 'Incoming request');
  next();
});

// Health check (no auth required)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API key auth for all API routes
app.use(authMiddleware);

// Mount API routes
app.use(routes);

// Centralized error handling (must be last)
app.use(errorHandler);

export default app;
