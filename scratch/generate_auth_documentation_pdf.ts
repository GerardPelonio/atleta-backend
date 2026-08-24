import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

const outputPath = path.resolve(__dirname, '..', '..', 'Atleta_Auth_API_Documentation.pdf');

// Remove test_portal.html if present
const testPortalPath = path.resolve(__dirname, 'test_portal.html');
if (fs.existsSync(testPortalPath)) {
  try {
    fs.unlinkSync(testPortalPath);
    console.log('Removed test_portal.html successfully.');
  } catch (e) {
    console.error('Failed to unlink test_portal.html:', e);
  }
}

const doc = new PDFDocument({
  margin: 40,
  size: 'A4',
  bufferPages: true,
});

const writeStream = fs.createWriteStream(outputPath);
doc.pipe(writeStream);

// Theme Colors
const PRIMARY = '#0F172A';        // Slate 900
const SECONDARY = '#1E293B';      // Slate 800
const ACCENT = '#2563EB';         // Blue 600
const ACCENT_LIGHT = '#EFF6FF';   // Blue 50
const SUCCESS = '#059669';        // Green 600
const SUCCESS_BG = '#ECFDF5';     // Green 50
const TEXT_DARK = '#0F172A';
const TEXT_MUTED = '#64748B';
const CARD_BG = '#F8FAFC';
const CARD_BORDER = '#E2E8F0';

const METHOD_POST = '#16A34A';
const METHOD_GET = '#0284C7';
const METHOD_PATCH = '#D97706';

function drawHeader() {
  doc.rect(40, 40, 515, 60).fill(PRIMARY);
  
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#FFFFFF').text('ATLETA REST API SPECIFICATION', 55, 52);
  doc.font('Helvetica').fontSize(10).fillColor('#94A3B8').text('Module: Authentication, Identity, Profiles & Social OAuth', 55, 74);

  doc.rect(40, 100, 515, 4).fill(ACCENT);
  doc.y = 120;
}

function drawSectionHeader(title: string, subtitle?: string) {
  if (doc.y > 680) doc.addPage();
  doc.moveDown(0.6);
  doc.rect(40, doc.y, 515, 26).fill(SECONDARY);
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#FFFFFF').text(title, 52, doc.y - 20);
  if (subtitle) {
    doc.moveDown(0.4);
    doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(TEXT_MUTED).text(subtitle, 42);
  }
  doc.moveDown(0.6);
}

function drawEndpointCard(options: {
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  title: string;
  description: string;
  authRequired: boolean;
  contentType?: string;
  requestBody?: string[];
  responseExample?: string[];
  notes?: string;
}) {
  if (doc.y > 600) doc.addPage();

  const cardStartY = doc.y;
  let methodColor = METHOD_POST;
  if (options.method === 'GET') methodColor = METHOD_GET;
  if (options.method === 'PATCH') methodColor = METHOD_PATCH;

  // Background Card
  doc.rect(40, cardStartY, 515, 26).fill(CARD_BG);
  doc.rect(40, cardStartY, 515, 26).stroke(CARD_BORDER);

  // Method Badge
  doc.rect(46, cardStartY + 5, 42, 16).fill(methodColor);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#FFFFFF').text(options.method, 46, cardStartY + 9, { width: 42, align: 'center' });

  // Endpoint Path
  doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT_DARK).text(options.path, 95, cardStartY + 8);

  // Auth Badge
  const authText = options.authRequired ? '🔒 Bearer JWT' : '🌐 Public';
  const authColor = options.authRequired ? '#D97706' : SUCCESS;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(authColor).text(authText, 450, cardStartY + 9, { width: 100, align: 'right' });

  doc.y = cardStartY + 32;

  // Description
  doc.font('Helvetica').fontSize(9).fillColor(TEXT_DARK).text(options.description, 45, doc.y, { width: 505 });
  doc.moveDown(0.4);

  if (options.contentType) {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(TEXT_MUTED).text('Content-Type: ', 45, doc.y, { continued: true });
    doc.font('Helvetica').fillColor(ACCENT).text(options.contentType);
    doc.moveDown(0.3);
  }

  // Request Body
  if (options.requestBody && options.requestBody.length > 0) {
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(TEXT_DARK).text('Request Parameters / Body:');
    doc.moveDown(0.2);
    options.requestBody.forEach((param) => {
      doc.font('Helvetica').fontSize(8).fillColor('#334155').text(`  • ${param}`, { width: 495 });
    });
    doc.moveDown(0.3);
  }

  // Response Example
  if (options.responseExample && options.responseExample.length > 0) {
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(TEXT_DARK).text('Sample Response:');
    doc.moveDown(0.2);
    const codeBoxY = doc.y;
    const boxHeight = options.responseExample.length * 11 + 8;
    doc.rect(45, codeBoxY, 505, boxHeight).fill('#0F172A');
    
    doc.font('Courier').fontSize(7.5).fillColor('#38BDF8');
    options.responseExample.forEach((line, idx) => {
      doc.text(line, 52, codeBoxY + 5 + idx * 11);
    });
    doc.y = codeBoxY + boxHeight + 6;
  }

  if (options.notes) {
    doc.font('Helvetica-Oblique').fontSize(8).fillColor(TEXT_MUTED).text(`Note: ${options.notes}`, 45, doc.y, { width: 505 });
    doc.moveDown(0.4);
  }

  doc.moveDown(0.8);
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT CONTENT
// ─────────────────────────────────────────────────────────────────────────────

drawHeader();

// Overview Box
doc.rect(40, doc.y, 515, 80).fill(ACCENT_LIGHT);
doc.rect(40, doc.y, 515, 80).stroke(ACCENT);
doc.font('Helvetica-Bold').fontSize(10).fillColor(ACCENT).text('API BASE URLS & PRODUCTION ACCESS', 50, doc.y - 72);
doc.font('Helvetica').fontSize(8.5).fillColor(TEXT_DARK).text('• Production Server: https://atleta-backend.vercel.app/api/v1 (or /api)', 50, doc.y + 4);
doc.font('Helvetica').text('• Local Development: http://localhost:5000/api/v1 (Android Emulator: http://10.0.2.2:5000)', 50, doc.y + 2);
doc.font('Helvetica').text('• Frontend Client Env: EXPO_PUBLIC_ATLETA_API=https://atleta-backend.vercel.app', 50, doc.y + 2);
doc.font('Helvetica').text('• Authentication Standard: RFC 6750 Bearer Tokens (JWT). Authorization: Bearer <JWT_TOKEN>', 50, doc.y + 2);
doc.y = 220;

// SECTION 1: REGISTRATION
drawSectionHeader('1. USER REGISTRATION ENDPOINTS', 'Supports Athlete, Coach, and Official account creation');

drawEndpointCard({
  method: 'POST',
  path: '/users/register-athlete  (Aliases: /users/register, /auth/register)',
  title: 'Athlete Registration',
  description: 'Registers a new Athlete account in Firebase Auth and provisions both a User base entity and an Athlete_Profiles child document in Firestore.',
  authRequired: false,
  contentType: 'application/json',
  requestBody: [
    'first_name (string, required) - Athlete given name (max 255 chars)',
    'last_name (string, required) - Athlete family name (max 255 chars)',
    'email (string, required) - Valid unique email address (RFC 5322 compliant)',
    'password (string, required) - Account password (min 6 characters, recommend uppercase + symbol)',
    'role (string, required) - "Athlete" or "athlete"',
    'birthdate (string, required) - Birthdate formatted as YYYY-MM-DD',
    'gender (string, required) - "Male" or "Female"',
    'province (string, required) - Athlete province (e.g. "Camarines Sur")',
    'sport_type (string, required) - "Basketball", "Swimming", "Track and Field"',
    'contact_number (string, optional) - 11-digit mobile number (e.g. "09123456789")',
    'terms_accepted (boolean, required) - Must be true'
  ],
  responseExample: [
    '{',
    '  "message": "User registered successfully.",',
    '  "user": { "user_id": "s7PYR0RcgOc8C...", "full_name": "Juan Dela Cruz", "role": "Athlete" },',
    '  "profile": { "athlete_id": "ath_s7PYR0R...", "sport_type": "Basketball", "recruitment_status": "Available" },',
    '  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."',
    '}'
  ],
  notes: 'HTTP 201 on success. Returns full User object, Athlete profile, permissions array, and signed JWT token.'
});

drawEndpointCard({
  method: 'POST',
  path: '/users/register-coach  (Aliases: /users/coach, /coaches/register)',
  title: 'Coach Registration',
  description: 'Registers a new Coach account with credential verification documents. Supports multipart/form-data for document upload.',
  authRequired: false,
  contentType: 'multipart/form-data or application/json',
  requestBody: [
    'first_name, last_name, email, password, contact_number (same as Athlete)',
    'role (string, required) - "Coach" or "coach"',
    'current_institution (string, required) - School or club name',
    'years_of_experience (number, required) - Integer from 0 to 60',
    'certification_license_num (string, optional) - Coach license ID',
    'eligible_documents / professional_documents (file, optional) - PDF or image up to 25MB'
  ],
  responseExample: [
    '{',
    '  "message": "User registered successfully.",',
    '  "user": { "user_id": "coach_abc123", "role": "Coach", "account_status": "Pending" },',
    '  "token": "eyJhbGciOiJIUzI1Ni..."',
    '}'
  ],
  notes: 'Account status is set to Pending until certified by System Admin.'
});

// SECTION 2: AUTHENTICATION & LOGIN
drawSectionHeader('2. USER LOGIN & SESSION MANAGEMENT', 'Email & password authentication, role detection, and JWT issuance');

drawEndpointCard({
  method: 'POST',
  path: '/users/login  (Aliases: /auth/login, /api/auth/login)',
  title: 'User Login',
  description: 'Authenticates any user role (Athlete, Coach, Official, Admin). Verifies credentials with Firebase Auth and retrieves role permissions from Firestore.',
  authRequired: false,
  contentType: 'application/json',
  requestBody: [
    'email (string, required) - Registered email address',
    'password (string, required) - User password'
  ],
  responseExample: [
    '{',
    '  "message": "Login successful.",',
    '  "user": {',
    '    "user_id": "s7PYR0RcgOc8C0WdkfnsqKMU3eK2",',
    '    "first_name": "Juan",',
    '    "last_name": "Dela Cruz",',
    '    "email": "juan@example.com",',
    '    "role": "Athlete"',
    '  },',
    '  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",',
    '  "firebase_id_token": "eyJhbGciOiJSUzI1NiIs..."',
    '}'
  ],
  notes: 'HTTP 200 on success. HTTP 401 on invalid email/password. Returns both Atleta JWT token and Firebase ID token.'
});

drawEndpointCard({
  method: 'POST',
  path: '/users/social-login  (Aliases: /users/google, /auth/google, /auth/facebook)',
  title: 'Google & Facebook Social Login / Auto-Signup',
  description: 'Authenticates users using Google or Facebook OAuth ID tokens. If the user is logging in for the first time, automatically provisions their User and Athlete profiles.',
  authRequired: false,
  contentType: 'application/json',
  requestBody: [
    'id_token / token (string, required) - Firebase ID token or Google Access token from OAuth popup',
    'provider (string, optional) - "google" (default) or "facebook"',
    'role (string, optional) - "Athlete" (default) or "Coach"'
  ],
  responseExample: [
    '{',
    '  "message": "GOOGLE login successful.",',
    '  "user": { "user_id": "google_10283...", "full_name": "Dave Ildefonso", "role": "Athlete" },',
    '  "token": "eyJhbGciOiJIUzI1Ni..."',
    '}'
  ],
  notes: 'Handles both Login and Auto-Registration seamlessly. Cryptographically verifies token signature with Google/Firebase.'
});

// SECTION 3: PROTECTED PROFILE & PASSWORD RESET
drawSectionHeader('3. PROFILE & PASSWORD MANAGEMENT', 'Token-authenticated profile retrieval and email password recovery');

drawEndpointCard({
  method: 'GET',
  path: '/users/me  (Aliases: /users/profile, /athlete/profile, /coach/profile)',
  title: 'Get Current Authenticated User Profile',
  description: 'Fetches the full profile, subtype profile metrics, and permissions of the user associated with the provided JWT bearer token.',
  authRequired: true,
  contentType: 'application/json',
  requestBody: [
    'Header: Authorization: Bearer <JWT_TOKEN>'
  ],
  responseExample: [
    '{',
    '  "user": { "user_id": "s7PYR0...", "first_name": "Juan", "role": "Athlete" },',
    '  "permissions": ["read:profile", "update:profile", "read:stats", "view:notifications"]',
    '}'
  ],
  notes: 'HTTP 200 on success. HTTP 401 Unauthorized if token is missing, expired, or tampered.'
});

drawEndpointCard({
  method: 'POST',
  path: '/users/password-reset  (Aliases: /users/forgot-password, /auth/reset-password)',
  title: 'Request Password Reset Link',
  description: 'Generates a secure password reset token and dispatches an automated HTML email via Nodemailer containing the frontend reset URL.',
  authRequired: false,
  contentType: 'application/json',
  requestBody: [
    'email (string, required) - Registered email address'
  ],
  responseExample: [
    '{',
    '  "message": "If an account with that email exists, a password reset link has been sent."',
    '}'
  ],
  notes: 'Always returns HTTP 200 to prevent email enumeration attacks.'
});

drawEndpointCard({
  method: 'POST',
  path: '/users/password-reset/confirm  (Aliases: /users/reset-password, /auth/change-password)',
  title: 'Confirm Password Reset (Token or Authenticated)',
  description: 'Resets the user password using a verified token or authenticated session.',
  authRequired: false,
  contentType: 'application/json',
  requestBody: [
    'token (string, required if unauthenticated) - Password reset token from email link',
    'password (string, required) - New password'
  ],
  responseExample: [
    '{',
    '  "message": "Password reset successfully. You may now log in with your new password."',
    '}'
  ]
});

// Footer & Page Numbers
const totalPages = doc.bufferedPageRange().count;
for (let i = 0; i < totalPages; i++) {
  doc.switchToPage(i);
  doc.font('Helvetica').fontSize(8).fillColor(TEXT_MUTED).text(
    `Atleta API Documentation • Page ${i + 1} of ${totalPages}`,
    40,
    doc.page.height - 30,
    { width: 515, align: 'center' }
  );
}

doc.end();

writeStream.on('finish', () => {
  console.log(`PDF generated successfully at: ${outputPath}`);
});
