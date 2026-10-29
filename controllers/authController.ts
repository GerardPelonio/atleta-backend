import { Request, Response } from 'express';
import {
  loginUserService,
  socialLoginService,
  refreshAccessToken,
  ServiceError,
} from '../services/userService';
import { db } from '../utils/firebaseAdmin';

function extractRefreshToken(req: Request): string | undefined {
  if (req.body?.refreshToken && typeof req.body.refreshToken === 'string') {
    return req.body.refreshToken.trim();
  }
  if (req.body?.refresh_token && typeof req.body.refresh_token === 'string') {
    return req.body.refresh_token.trim();
  }
  if ((req as any).cookies?.refreshToken) {
    return (req as any).cookies.refreshToken;
  }
  if (req.headers['x-refresh-token'] && typeof req.headers['x-refresh-token'] === 'string') {
    return req.headers['x-refresh-token'].trim();
  }
  if (req.headers.cookie) {
    const match = req.headers.cookie
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('refreshToken='));
    if (match) {
      return decodeURIComponent(match.substring('refreshToken='.length));
    }
  }
  return undefined;
}

/**
 * Standard Login Handler
 * Returns accessToken and refreshToken, and sets an HTTP-only secure cookie for the refreshToken.
 */
export async function loginHandler(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  try {
    const result = await loginUserService(email, password);

    if (result?.refreshToken) {
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });
    }

    try {
      await db.collection('Login_Audit_Logs').add({
        email: String(email || ''),
        email_clean: String(email || '').trim().toLowerCase(),
        success: true,
        user_id: result?.user?.user_id,
        role: result?.user?.role,
        ip: (req.headers['x-forwarded-for'] as string) || req.ip || '',
        user_agent: (req.headers['user-agent'] as string) || '',
        timestamp: new Date().toISOString(),
      });
    } catch {}

    res.status(200).json({
      message: 'Login successful.',
      ...result,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      token: result.accessToken || result.token,
    });
  } catch (error: any) {
    try {
      await db.collection('Login_Audit_Logs').add({
        email: String(email || ''),
        email_clean: String(email || '').trim().toLowerCase(),
        success: false,
        error_code: error?.code || 'unknown',
        error_message: error?.message || 'unknown',
        ip: (req.headers['x-forwarded-for'] as string) || req.ip || '',
        user_agent: (req.headers['user-agent'] as string) || '',
        timestamp: new Date().toISOString(),
      });
    } catch {}

    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (
      error.code === 'auth/invalid-credential' ||
      error.code === 'auth/wrong-password' ||
      error.code === 'auth/user-not-found'
    ) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

/**
 * Social Login Handler
 * Returns accessToken and refreshToken, and sets an HTTP-only secure cookie for the refreshToken.
 */
export async function socialLoginHandler(req: Request, res: Response): Promise<void> {
  try {
    const body = (req.body || {}) as Record<string, any>;
    const idToken =
      body.id_token || body.token || body.idToken || body.access_token || body.accessToken || body.credential;
    const provider = body.provider;
    const role = body.role;

    if (!idToken) {
      res.status(400).json({ error: 'id_token is required.' });
      return;
    }

    const providerType = provider === 'facebook' ? 'facebook' : 'google';
    const result = await socialLoginService(idToken, providerType, role || 'Athlete', body);

    if (result && ((result as any).account_exists === false || (result as any).require_signup || (result as any).is_new_user)) {
      res.status(200).json({
        message: 'New user registration required.',
        ...result,
      });
      return;
    }

    if (result?.refreshToken) {
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
    }

    res.status(200).json({
      message: `${providerType.toUpperCase()} login successful.`,
      ...result,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      token: result.accessToken || result.token,
    });
  } catch (error: any) {
    console.error('socialLogin error:', error);
    res.status(401).json({
      error: error?.message || 'Social authentication failed.',
      code: error?.code,
    });
  }
}

/**
 * Refresh Token Handler
 * Verifies the long-lived refresh token and issues a new access token (and fresh refresh token).
 */
export async function refreshTokenHandler(req: Request, res: Response): Promise<void> {
  try {
    const refreshToken = extractRefreshToken(req);

    if (!refreshToken) {
      res.status(400).json({
        error: 'Refresh token is required. Provide it in body (refreshToken), cookie, or x-refresh-token header.',
      });
      return;
    }

    const tokens = await refreshAccessToken(refreshToken);

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.status(200).json({
      message: 'Token refreshed successfully.',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      token: tokens.accessToken,
    });
  } catch (error: any) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('refreshTokenHandler error:', error);
    res.status(401).json({ error: error?.message || 'Invalid or expired refresh token.' });
  }
}

// Export aliases
export const loginUser = loginHandler;
export const socialLogin = socialLoginHandler;
