import { ValidationError } from './userValidator';

// RFC 5322 compliant email regex
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/**
 * Verified institutional domain check (.edu, .edu.ph, .gov, .gov.ph, or institutional subdomains)
 */
export function isInstitutionalEmail(email: string): boolean {
  if (!email) return false;
  const lower = email.trim().toLowerCase();
  const domainPart = lower.split('@')[1];
  if (!domainPart) return false;

  return (
    domainPart.endsWith('.edu') ||
    domainPart.endsWith('.edu.ph') ||
    domainPart.endsWith('.gov') ||
    domainPart.endsWith('.gov.ph') ||
    domainPart === 'atleta.edu' ||
    domainPart.endsWith('.atleta.edu') ||
    domainPart === 'institution.edu' ||
    domainPart.endsWith('.institution.edu') ||
    domainPart === 'admin.atleta.com'
  );
}

/**
 * Validate System Admin Registration payload.
 */
export function validateRegisterAdmin(data: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  // full_name (Required, Max 255)
  const fullName = typeof data.full_name === 'string' ? data.full_name.trim() : '';
  if (!fullName) {
    errors.push({ field: 'full_name', message: 'Full name is required.' });
  } else if (fullName.length > 255) {
    errors.push({ field: 'full_name', message: 'Full name must not exceed 255 characters.' });
  }

  // email (Required, RFC 5322 compliant, verified institutional domain)
  const email = typeof data.email === 'string' ? data.email.trim() : '';
  if (!email) {
    errors.push({ field: 'email', message: 'Institutional email is required.' });
  } else if (!EMAIL_REGEX.test(email)) {
    errors.push({ field: 'email', message: 'Email must be a valid RFC 5322 compliant address.' });
  } else if (!isInstitutionalEmail(email)) {
    errors.push({ field: 'email', message: 'Email must belong to a verified institutional domain (e.g., .edu, .edu.ph, .gov, .gov.ph).' });
  }

  // password (Required, Min 6)
  const password = typeof data.password === 'string' ? data.password : '';
  if (!password) {
    errors.push({ field: 'password', message: 'Password is required.' });
  } else if (password.length < 6) {
    errors.push({ field: 'password', message: 'Password must be at least 6 characters.' });
  }

  // department_code (Required, e.g., "SYS_ADMIN", "GOVERNANCE")
  const departmentCode = typeof data.department_code === 'string' ? data.department_code.trim() : '';
  if (!departmentCode) {
    errors.push({ field: 'department_code', message: 'Department code is required.' });
  }

  // clearance_level (Optional, Integer, Default 4)
  if (data.clearance_level !== undefined && data.clearance_level !== null) {
    const level = Number(data.clearance_level);
    if (isNaN(level) || !Number.isInteger(level) || level < 1) {
      errors.push({ field: 'clearance_level', message: 'Clearance level must be a positive integer.' });
    }
  }

  // rbac_compliance_accepted (Required ACCEPTANCE CRITERIA: Registration attempts without accepting mandatory RBAC compliance return HTTP 400)
  const rbacCompliance = data.rbac_compliance_accepted ?? data.rbac_compliance;
  if (rbacCompliance !== true && rbacCompliance !== 'true') {
    errors.push({
      field: 'rbac_compliance_accepted',
      message: 'Mandatory RBAC compliance acceptance is required for administrative registration.',
    });
  }

  return errors;
}

/**
 * Validate System Admin Login payload.
 */
export function validateLoginAdmin(data: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  const email = typeof data.email === 'string' ? data.email.trim() : '';
  if (!email) {
    errors.push({ field: 'email', message: 'Email is required.' });
  } else if (!EMAIL_REGEX.test(email)) {
    errors.push({ field: 'email', message: 'Invalid RFC 5322 email format.' });
  }

  const password = typeof data.password === 'string' ? data.password : '';
  if (!password) {
    errors.push({ field: 'password', message: 'Password is required.' });
  }

  return errors;
}
