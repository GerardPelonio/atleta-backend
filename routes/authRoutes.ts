import { Router } from 'express';
import { refreshTokenHandler, loginHandler } from '../controllers/authController';
import { authRateLimiter } from '../middlewares/rateLimitMiddleware';

const router = Router();

router.post('/login', authRateLimiter, loginHandler);
router.post('/refresh', refreshTokenHandler);

export default router;
