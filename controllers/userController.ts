import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import {
  validateRegisterUser,
  validateLoginUser,
  validatePasswordResetRequest,
  validatePasswordResetConfirm,
  validateChangePassword,
} from '../validators/userValidator';
import { validateRegisterCoach } from '../validators/coachValidator';
import {
  registerUserService,
  registerCoachService,
  loginUserService,
  getUserProfileService,
  requestPasswordResetService,
  resetPasswordConfirmService,
  changePasswordService,
  socialLoginService,
} from '../services/userService';

export async function registerUser(req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = req.body as Record<string, unknown>;
    const file = (req as any).file as Express.Multer.File | undefined;

    const errors = validateRegisterUser(data, !!file);
    if (errors.length > 0) {
      res.status(400).json({ errors });
      return;
    }

    const result = await registerUserService(data, file);
    res.status(201).json({
      message: 'User registered successfully.',
      ...result,
    });
  } catch (error: any) {
    if (error.code === 'auth/email-already-exists') {
      res.status(409).json({ error: 'A user with this email already exists.' });
      return;
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function registerCoach(req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = req.body as Record<string, unknown>;
    const file = (req as any).file as Express.Multer.File | undefined;

    const errors = validateRegisterCoach(data, !!file);
    if (errors.length > 0) {
      res.status(400).json({ errors });
      return;
    }

    const result = await registerCoachService(data, file);
    res.status(201).json({
      message: 'Coach registered successfully with certification documents.',
      ...result,
    });
  } catch (error: any) {
    if (error.code === 'auth/email-already-exists') {
      res.status(409).json({ error: 'A coach with this email already exists.' });
      return;
    }
    if (error.message && error.message.includes('certification document')) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('Register coach error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function loginUser(req: AuthRequest, res: Response): Promise<void> {
  try {
    const errors = validateLoginUser(req.body);
    if (errors.length > 0) {
      res.status(400).json({ errors });
      return;
    }

    const { email, password } = req.body;
    const result = await loginUserService(email, password);

    res.status(200).json({
      message: 'Login successful.',
      ...result,
    });
  } catch (error: any) {
    if (
      error.code === 'auth/invalid-credential' ||
      error.code === 'auth/wrong-password' ||
      error.code === 'auth/user-not-found'
    ) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }
    if (error.code === 'USER_NOT_FOUND') {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function socialLogin(req: Request, res: Response): Promise<void> {
  try {
    const body = (req.body || {}) as Record<string, any>;
    const idToken = body.id_token || body.token;
    const provider = body.provider;
    const role = body.role;

    if (!idToken) {
      res.status(400).json({ error: 'id_token (Firebase ID token from Google/Facebook) is required.' });
      return;
    }

    const providerType = provider === 'facebook' ? 'facebook' : 'google';
    const result = await socialLoginService(idToken, providerType, role || 'Athlete');

    res.status(200).json({
      message: `${providerType.toUpperCase()} login successful.`,
      ...result,
    });
  } catch (error: any) {
    console.error('socialLogin error:', error);
    res.status(401).json({
      error: error?.message || 'Social authentication failed.',
      code: error?.code,
    });
  }
}

export async function getMe(req: AuthRequest, res: Response): Promise<void> {
  try {
    const uid = req.user!.uid;
    const result = await getUserProfileService(uid);
    res.status(200).json(result);
  } catch (error: any) {
    if (error.code === 'USER_NOT_FOUND') {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error('GetMe error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function requestPasswordReset(req: AuthRequest, res: Response): Promise<void> {
  try {
    const errors = validatePasswordResetRequest(req.body);
    if (errors.length > 0) {
      res.status(400).json({ errors });
      return;
    }

    const { email } = req.body;
    const result = await requestPasswordResetService(email);
    res.status(200).json(result);
  } catch (error: any) {
    if (error.code === 'USER_NOT_FOUND') {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error.code === 'auth/user-not-found') {
      res.status(404).json({ error: 'No registered account found with this email.' });
      return;
    }
    console.error('RequestPasswordReset error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function resetPassword(req: AuthRequest, res: Response): Promise<void> {
  try {
    const token = (req.body.token || req.params.token || req.query.token) as string;
    const new_password = (req.body.new_password || req.body.password) as string;

    const errors = validatePasswordResetConfirm({ token, new_password });
    if (errors.length > 0) {
      res.status(400).json({ errors });
      return;
    }

    const result = await resetPasswordConfirmService(token, new_password);
    res.status(200).json(result);
  } catch (error: any) {
    if (error.code === 'INVALID_TOKEN') {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('ResetPassword error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function changePassword(req: AuthRequest, res: Response): Promise<void> {
  try {
    const errors = validateChangePassword(req.body);
    if (errors.length > 0) {
      res.status(400).json({ errors });
      return;
    }

    const uid = req.user?.uid;
    if (!uid) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const { password } = req.body;
    await changePasswordService(uid, password);

    res.status(200).json({
      message: 'Password updated successfully.',
    });
  } catch (error: any) {
    console.error('ChangePassword error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}
