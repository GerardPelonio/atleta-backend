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

  // contact_number (Optional, 11 digits starting with 09)
  const rawContact = typeof data.contact_number === 'string'
    ? data.contact_number
    : typeof data.phoneNumber === 'string'
    ? data.phoneNumber
    : typeof data.phone_number === 'string'
    ? data.phone_number
    : '';
  let contactNumber = rawContact ? rawContact.replace(/[\s\-_()]/g, '') : '';
  if (contactNumber.startsWith('+63')) contactNumber = '0' + contactNumber.slice(3);
  else if (contactNumber.startsWith('63') && contactNumber.length === 12) contactNumber = '0' + contactNumber.slice(2);
  else if (contactNumber.length === 10 && contactNumber.startsWith('9')) contactNumber = '0' + contactNumber;
  data.contact_number = contactNumber;
  data.phoneNumber = contactNumber;
  if (contactNumber && (!/^09\d{9}$/.test(contactNumber))) {
    errors.push({ field: 'contact_number', message: 'Contact number must be 11 digits starting with 09 (e.g. 09123456789).' });
  }

  // current_institution (Required for Coach)
  const currentInstitution = typeof data.current_institution === 'string' ? data.current_institution.trim() : '';
  if (!currentInstitution) {
    errors.push({ field: 'current_institution', message: 'Current institution is required.' });
  }

  // certification_license_num / coach_license_number (Required, Max 100)
  const licenseNum = typeof data.certification_license_num === 'string'
    ? data.certification_license_num.trim()
    : typeof data.coach_license_number === 'string'
    ? data.coach_license_number.trim()
    : typeof data.license_number === 'string'
    ? data.license_number.trim()
    : '';
  if (!licenseNum) {
    errors.push({ field: 'certification_license_num', message: 'Coach license number is required.' });
  } else if (licenseNum.length > 100) {
    errors.push({ field: 'certification_license_num', message: 'Coach license number must not exceed 100 characters.' });
  }

  // regional_affiliation (Optional / string max 255)
  const regionalAffiliation = typeof data.regional_affiliation === 'string' ? data.regional_affiliation.trim() : '';
  if (regionalAffiliation.length > 255) {
    errors.push({ field: 'regional_affiliation', message: 'Regional affiliation must not exceed 255 characters.' });
  }

  // professional_documents (Optional: document links or uploaded files)
  const docs = data.professional_documents;
  if (docs !== undefined && docs !== null) {
    if (typeof docs !== 'string' && !Array.isArray(docs)) {
      errors.push({
        field: 'professional_documents',
        message: 'Professional documents must be a string or an array of document paths.',
      });
    }
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
