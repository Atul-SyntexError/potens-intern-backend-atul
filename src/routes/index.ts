import { Router } from 'express';
import logRoutes from './log.routes';

const router = Router();
router.use(logRoutes);

export default router;
