import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

/**
 * Checks if a string is already a valid bcrypt hash.
 */
export function isBcryptHash(value: string | undefined | null): boolean {
  if (!value || typeof value !== 'string') return false;
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value.trim());
}

/**
 * Hashes a plaintext password using bcrypt with salt rounds.
 * If the string is already a bcrypt hash, it returns it unchanged.
 */
export function hashPassword(password: string): string {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string.');
  }
  const trimmed = password.trim();
  if (isBcryptHash(trimmed)) {
    return trimmed;
  }
  return bcrypt.hashSync(trimmed, SALT_ROUNDS);
}

/**
 * Verifies a plaintext password against a stored bcrypt hash or legacy plaintext string.
 */
export function verifyPassword(plainText: string, hashedOrPlain: string): boolean {
  if (!plainText || !hashedOrPlain) return false;
  const cleanInput = plainText.trim();
  const stored = hashedOrPlain.trim();

  // If stored value is a bcrypt hash
  if (isBcryptHash(stored)) {
    try {
      if (bcrypt.compareSync(plainText, stored) || bcrypt.compareSync(cleanInput, stored)) {
        return true;
      }
    } catch {
      // In case bcrypt compare fails unexpectedly
    }
  }

  // Backward compatibility fallback for legacy unhashed passwords
  if (stored === plainText || stored === cleanInput) {
    return true;
  }

  // Normalized fallback for legacy accounts
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalize(stored).length >= 6 && normalize(stored) === normalize(cleanInput)) {
    return true;
  }

  return false;
}

/**
 * Deeply strips password, password_hash, and other credentials from user objects
 * before sending them across the wire in API responses.
 */
export function sanitizeUser<T extends Record<string, any>>(user: T | null | undefined): T | null | undefined {
  if (!user || typeof user !== 'object') return user;

  const clone: Record<string, any> = Array.isArray(user) ? [...user] : { ...user };

  delete clone.password;
  delete clone.password_hash;

  if (clone.user && typeof clone.user === 'object') {
    clone.user = sanitizeUser(clone.user);
  }

  if (clone.profile && typeof clone.profile === 'object') {
    clone.profile = sanitizeProfile(clone.profile);
  }

  if (clone.password_reset && typeof clone.password_reset === 'object') {
    const prClone = { ...clone.password_reset };
    delete prClone.token;
    delete prClone.reset_token;
    clone.password_reset = prClone;
  }

  return clone as T;
}

/**
 * Ensures profile documents (Athlete, Coach, Official, Admin) never contain password fields.
 */
export function sanitizeProfile<T extends Record<string, any>>(profile: T | null | undefined): T | null | undefined {
  if (!profile || typeof profile !== 'object') return profile;

  const clone: Record<string, any> = Array.isArray(profile) ? [...profile] : { ...profile };

  delete clone.password;
  delete clone.password_hash;

  return clone as T;
}
