import { ValidationError } from './userValidator';

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/**
 * Validates official registration payload.
 */
export function validateRegisterOfficial(data: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  // full_legal_name (Required, Max 255)
  const fullLegalName = typeof data.full_legal_name === 'string' ? data.full_legal_name.trim() : '';
  if (!fullLegalName) {
    errors.push({ field: 'full_legal_name', message: 'Full legal name is required.' });
  } else if (fullLegalName.length > 255) {
    errors.push({ field: 'full_legal_name', message: 'Full legal name must not exceed 255 characters.' });
  }

  // email (Required, Unique, RFC 5322 compliant)
  const email = typeof data.email === 'string' ? data.email.trim() : '';
  if (!email) {
    errors.push({ field: 'email', message: 'Email is required.' });
  } else if (!EMAIL_REGEX.test(email)) {
    errors.push({ field: 'email', message: 'Email must be a valid RFC 5322 compliant address.' });
  }

  // password (Required, Min 6)
  const password = typeof data.password === 'string' ? data.password : '';
  if (!password) {
    errors.push({ field: 'password', message: 'Password is required.' });
  } else if (password.length < 6) {
    errors.push({ field: 'password', message: 'Password must be at least 6 characters.' });
  }

  // organization_name (Required)
  const orgName = typeof data.organization_name === 'string' ? data.organization_name.trim() : '';
  if (!orgName) {
    errors.push({ field: 'organization_name', message: 'Organization name is required.' });
  }

  return errors;
}

/**
 * Validates official settings update payload.
 */
export function validateUpdateOfficialSettings(data: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (data.split_screen_defaults !== undefined) {
    if (typeof data.split_screen_defaults !== 'boolean') {
      errors.push({ field: 'split_screen_defaults', message: 'split_screen_defaults must be a boolean.' });
    }
  }

  if (data.discrepancy_presets !== undefined) {
    if (typeof data.discrepancy_presets !== 'boolean') {
      errors.push({ field: 'discrepancy_presets', message: 'discrepancy_presets must be a boolean.' });
    }
  }

  if (data.match_reminders !== undefined) {
    if (typeof data.match_reminders !== 'boolean') {
      errors.push({ field: 'match_reminders', message: 'match_reminders must be a boolean.' });
    }
  }

  return errors;
}
