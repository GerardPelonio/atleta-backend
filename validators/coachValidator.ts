import { ValidationError } from './userValidator';

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/**
 * Validates coach registration payload (POST /api/v1/users/coach).
 * ACCEPTANCE CRITERIA: Missing certification files block creation with 400 Bad Request.
 */
export function validateRegisterCoach(data: Record<string, unknown>, hasFile: boolean = false): ValidationError[] {
  const errors: ValidationError[] = [];

  // first_name (Required, Max 255)
  const firstName = typeof data.first_name === 'string' ? data.first_name.trim() : '';
  if (!firstName) {
    errors.push({ field: 'first_name', message: 'First name is required.' });
  } else if (firstName.length > 255) {
    errors.push({ field: 'first_name', message: 'First name must not exceed 255 characters.' });
  }

  // last_name (Required, Max 255)
  const lastName = typeof data.last_name === 'string' ? data.last_name.trim() : '';
  if (!lastName) {
    errors.push({ field: 'last_name', message: 'Last name is required.' });
  } else if (lastName.length > 255) {
    errors.push({ field: 'last_name', message: 'Last name must not exceed 255 characters.' });
  }

  // email (Required, RFC 5322 compliant)
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

  // contact_number (Optional, 11 characters)
  const contactNumber = typeof data.contact_number === 'string' ? data.contact_number.trim() : '';
  if (contactNumber && contactNumber.length !== 11) {
    errors.push({ field: 'contact_number', message: 'Contact number must be exactly 11 characters.' });
  }

  // professional_documents (ACCEPTANCE CRITERIA: Minimum 1 document link upon registration)
  const docs = data.professional_documents;
  const hasDocLinks = Array.isArray(docs) && docs.filter((d) => typeof d === 'string' && d.trim().length > 0).length > 0;

  if (!hasFile && !hasDocLinks) {
    errors.push({
      field: 'professional_documents',
      message: 'Minimum 1 certification document link or uploaded file is required upon registration. Missing certification files block account creation.',
    });
  }

  return errors;
}

/**
 * Validates coach settings update payload (PATCH /api/v1/coaches/me/settings).
 */
export function validateUpdateCoachSettings(data: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (data.data_sync_preference !== undefined) {
    if (data.data_sync_preference !== 'Manual' && data.data_sync_preference !== 'Automatic') {
      errors.push({
        field: 'data_sync_preference',
        message: 'data_sync_preference must be "Manual" or "Automatic".',
      });
    }
  }

  if (data.notification_preferences !== undefined) {
    if (typeof data.notification_preferences !== 'object' || data.notification_preferences === null) {
      errors.push({
        field: 'notification_preferences',
        message: 'notification_preferences must be an object with game_log_updates and recruitment_inquiries toggles.',
      });
    }
  }

  return errors;
}

/**
 * Validates change password payload (PATCH /api/v1/coaches/me/password).
 */
export function validateChangeCoachPassword(data: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  const currentPassword = typeof data.current_password === 'string' ? data.current_password : '';
  if (!currentPassword) {
    errors.push({ field: 'current_password', message: 'Current password is required.' });
  }

  const newPassword = typeof data.new_password === 'string' ? data.new_password : '';
  if (!newPassword) {
    errors.push({ field: 'new_password', message: 'New password is required.' });
  } else if (newPassword.length < 6) {
    errors.push({ field: 'new_password', message: 'New password must be at least 6 characters.' });
  }

  return errors;
}
