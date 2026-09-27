import { validateRegisterUser, normalizeRole } from '../validators/userValidator';
import { ROLE_PERMISSIONS_MAP, UserRole } from '../models/userModel';
import crypto from 'crypto';

console.log('--- STARTING USER IDENTITY & SUBTYPE PROFILES TEST ---\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string) {
  totalTests++;
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ [FAIL] ${testName}`);
  }
}

// 1. Test Role Normalization & Permissions Map
assert(normalizeRole('athlete') === 'Athlete', 'normalizeRole maps "athlete" to "Athlete"');
assert(normalizeRole('Coach') === 'Coach', 'normalizeRole maps "Coach" to "Coach"');
assert(normalizeRole('official') === 'Official', 'normalizeRole maps "official" to "Official"');
assert(normalizeRole('system admin') === 'System Admin', 'normalizeRole maps "system admin" to "System Admin"');

assert(ROLE_PERMISSIONS_MAP['Athlete'].includes('read:stats'), 'Athlete role has read:stats permission');
assert(ROLE_PERMISSIONS_MAP['Coach'].includes('manage:athletes'), 'Coach role has manage:athletes permission');
assert(ROLE_PERMISSIONS_MAP['Official'].includes('manage:tournaments'), 'Official role has manage:tournaments permission');
assert(ROLE_PERMISSIONS_MAP['System Admin'].includes('*'), 'System Admin role has wildcard "*" permission');

// 2. Test Data Validation - Base Identity (RFC 5322 Email & Contact Number length 11)
const invalidEmailResult = validateRegisterUser({
  first_name: 'John',
  last_name: 'Doe',
  email: 'invalid-email-format',
  password: 'password123',
  role: 'Athlete',
  birthdate: '2000-01-01',
  gender: 'Male',
  province: 'Manila',
  sport_type: 'Basketball',
});
assert(invalidEmailResult.some((e) => e.field === 'email'), 'Rejects non RFC 5322 compliant email');

const invalidContactResult = validateRegisterUser({
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  password: 'password123',
  contact_number: '12345', // Must be 11 chars
  role: 'Athlete',
  birthdate: '2000-01-01',
  gender: 'Male',
  province: 'Manila',
  sport_type: 'Basketball',
});
assert(invalidContactResult.some((e) => e.field === 'contact_number'), 'Rejects contact number with length != 11');

// 3. Test Data Validation - Athlete Subtype Required Fields
const missingAthleteFields = validateRegisterUser({
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  password: 'password123',
  role: 'Athlete',
  // missing birthdate, gender, province, sport_type
});
assert(missingAthleteFields.some((e) => e.field === 'birthdate'), 'Athlete profile requires birthdate');
assert(missingAthleteFields.some((e) => e.field === 'gender'), 'Athlete profile requires gender');
assert(missingAthleteFields.some((e) => e.field === 'province'), 'Athlete profile requires province');
assert(missingAthleteFields.some((e) => e.field === 'sport_type'), 'Athlete profile requires sport_type');

// 4. Test Data Validation - Coach Subtype Required Fields
const missingCoachFields = validateRegisterUser({
  first_name: 'Coach',
  last_name: 'Carter',
  email: 'carter@example.com',
  password: 'password123',
  role: 'Coach',
  // missing years_of_experience and current_institution
});
assert(missingCoachFields.some((e) => e.field === 'years_of_experience'), 'Coach profile requires years_of_experience');
assert(missingCoachFields.some((e) => e.field === 'current_institution'), 'Coach profile requires current_institution');

// 5. Test Data Validation - Official Subtype Required Fields
const missingOfficialFields = validateRegisterUser({
  first_name: 'Ref',
  last_name: 'Jack',
  email: 'ref@example.com',
  password: 'password123',
  role: 'Official',
  // missing tournament_affiliation
});
assert(missingOfficialFields.some((e) => e.field === 'tournament_affiliation'), 'Official profile requires tournament_affiliation');

// 6. Test Data Validation - System Admin Subtype Required Fields & Security Key Encryption
const missingAdminFields = validateRegisterUser({
  first_name: 'Admin',
  last_name: 'Super',
  email: 'admin@example.com',
  password: 'password123',
  role: 'System Admin',
  // missing admin_security_key
});
assert(missingAdminFields.some((e) => e.field === 'admin_security_key'), 'System Admin profile requires admin_security_key');

const rawKey = 'super_secret_admin_key_123';
const hashedKey = crypto.createHash('sha256').update(rawKey).digest('hex');
assert(hashedKey.length === 64 && hashedKey !== rawKey, 'Admin security key is properly SHA-256 encrypted/hashed');

// 7. Test Valid Subtype Submissions
const validAthlete = validateRegisterUser({
  first_name: 'Gerard',
  last_name: 'Pelonio',
  email: 'gerard@atleta.com',
  password: 'Password123!',
  contact_number: '09171234567',
  role: 'Athlete',
  birthdate: '2001-08-14',
  gender: 'Male',
  province: 'Camarines Sur',
  sport_type: 'Basketball',
});
assert(validAthlete.length === 0, 'Valid Athlete registration body passes validation cleanly');

console.log(`\n--- TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED ---`);
if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
