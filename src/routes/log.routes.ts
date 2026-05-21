import { Router } from 'express';
import * as logController from '../controllers/log.controller';
import { rateLimiter } from '../middleware/rateLimiter.middleware';

const router = Router();

// Rate limit only applies to write operations
router.post('/log', rateLimiter, logController.createLog);
router.get('/log/:id', logController.getLog);
router.get('/verify', logController.verifyChain);
router.get('/export', logController.exportLogs);

export default router;
