import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middlewares/authMiddleware';
import { authRateLimiter } from '../middlewares/rateLimitMiddleware';
import {
  registerUser,
  registerCoach,
  loginUser,
  socialLogin,
  getMe,
  requestPasswordReset,
  resetPassword,
  changePassword,
} from '../controllers/userController';
import {
  registerOfficialHandler,
  loginOfficialHandler,
} from '../controllers/officialController';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// Registration Routes
router.post('/register-athlete', upload.single('eligible_documents'), registerUser);
router.post('/register', upload.single('eligible_documents'), registerUser);
router.post('/', upload.single('eligible_documents'), registerUser);
router.post('/coach', authRateLimiter, upload.single('professional_documents'), registerCoach);
router.post('/register-coach', authRateLimiter, upload.single('professional_documents'), registerCoach);
router.post('/official', authRateLimiter, registerOfficialHandler);
router.post('/register-official', authRateLimiter, registerOfficialHandler);

// Authentication & OAuth
router.post('/login', authRateLimiter, loginUser);
router.post('/official/login', authRateLimiter, loginOfficialHandler);
router.post('/google-login', socialLogin as any);
router.post('/facebook-login', socialLogin as any);
router.post('/social-login', socialLogin as any);

// User Profile
router.get('/profile', authenticate, getMe);
router.get('/me', authenticate, getMe);

// Password Reset Request
router.post('/password-reset', requestPasswordReset);
router.post('/forgot-password', requestPasswordReset);
router.post('/request-password-reset', requestPasswordReset);

// Password Reset Confirmation (Token-Based)
router.post('/password-reset/confirm', resetPassword);
router.post('/reset-password', resetPassword);
router.patch('/password-reset', resetPassword);
router.post('/password-reset/:token', resetPassword);
router.patch('/password-reset/:token', resetPassword);

// Password Change (Authenticated)
router.post('/change-password', authenticate, changePassword);
router.patch('/change-password', authenticate, changePassword);

export default router;

