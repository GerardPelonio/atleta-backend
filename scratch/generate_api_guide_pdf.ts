import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

const outputPath = path.resolve(__dirname, '..', 'Atleta_Backend_API_Guide.pdf');

const doc = new PDFDocument({
  margin: 40,
  size: 'A4',
  bufferPages: true,
});

const writeStream = fs.createWriteStream(outputPath);
doc.pipe(writeStream);

// Colors
const PRIMARY = '#1E293B';      // Dark Slate
const ACCENT = '#2563EB';       // Blue 600
const ACCENT_BG = '#EFF6FF';    // Blue 50
const SUCCESS = '#059669';      // Green 600
const WARNING = '#D97706';      // Amber 600
const DANGER = '#DC2626';       // Red 600
const TEXT_MAIN = '#0F172A';    // Slate 900
const TEXT_MUTED = '#64748B';   // Slate 500
const BG_LIGHT = '#F8FAFC';     // Slate 50
const BORDER_COLOR = '#E2E8F0'; // Slate 200
const METHOD_GET = '#0284C7';
const METHOD_POST = '#16A34A';
const METHOD_PUT = '#D97706';
const METHOD_PATCH = '#D97706';
const METHOD_DELETE = '#DC2626';

function drawHeader(title: string, category: string) {
  doc.rect(40, doc.y, 515, 3).fill(ACCENT);
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(16).fillColor(PRIMARY).text(title);
  doc.font('Helvetica-Oblique').fontSize(9).fillColor(TEXT_MUTED).text(category.toUpperCase());
  doc.moveDown(0.6);
}

function drawSectionDivider(title: string) {
  if (doc.y > 680) doc.addPage();
  doc.moveDown(0.8);
  doc.rect(40, doc.y, 515, 24).fill(PRIMARY);
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#FFFFFF').text(title, 48, doc.y - 18);
  doc.moveDown(0.8);
}

function drawEndpoint(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  route: string,
  desc: string,
  auth: string,
  bodyParams?: string[],
  notes?: string
) {
  if (doc.y > 650) doc.addPage();

  const startY = doc.y;
  let methodColor = METHOD_GET;
  if (method === 'POST') methodColor = METHOD_POST;
  if (method === 'PUT') methodColor = METHOD_PUT;
  if (method === 'PATCH') methodColor = METHOD_PATCH;
  if (method === 'DELETE') methodColor = METHOD_DELETE;

  // Background box
  doc.rect(40, startY, 515, 20).fill(BG_LIGHT);
  doc.rect(40, startY, 515, 20).stroke(BORDER_COLOR);

  // Method badge
  doc.rect(44, startY + 3, 44, 14).fill(methodColor);
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF').text(method, 44, startY + 6, { width: 44, align: 'center' });

  // Route text
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(TEXT_MAIN).text(route, 95, startY + 5);

  // Auth badge
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(auth === 'Public' ? SUCCESS : ACCENT)
     .text(`[${auth}]`, 460, startY + 6, { width: 90, align: 'right' });

  doc.y = startY + 24;

  // Description
  doc.font('Helvetica').fontSize(8.5).fillColor(TEXT_MAIN).text(`• Description: ${desc}`, 48, doc.y, { width: 495 });
  doc.moveDown(0.2);

  if (bodyParams && bodyParams.length > 0) {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(TEXT_MUTED).text('  Payload / Params: ', 48, doc.y, { continued: true });
    doc.font('Helvetica').fontSize(8).fillColor(TEXT_MAIN).text(bodyParams.join(', '));
    doc.moveDown(0.2);
  }

  if (notes) {
    doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(TEXT_MUTED).text(`  Note: ${notes}`, 48, doc.y, { width: 495 });
    doc.moveDown(0.2);
  }

  doc.moveDown(0.5);
}

// ==========================================
// PAGE 1: COVER & ARCHITECTURE
// ==========================================
doc.rect(40, 40, 515, 120).fill(PRIMARY);
doc.font('Helvetica-Bold').fontSize(24).fillColor('#FFFFFF').text('ATLETA BACKEND API', 60, 60);
doc.font('Helvetica').fontSize(12).fillColor('#94A3B8').text('Comprehensive Frontend Developer Integration Guide', 60, 90);
doc.font('Helvetica-Bold').fontSize(9).fillColor('#38BDF8').text('FERN STACK • REST API v1.0 • FIREBASE + EXPRESS + NODE.JS', 60, 115);

doc.y = 175;
doc.font('Helvetica-Bold').fontSize(11).fillColor(PRIMARY).text('Global API Configuration');
doc.moveDown(0.3);

const infoBoxY = doc.y;
doc.rect(40, infoBoxY, 515, 65).fill(ACCENT_BG);
doc.rect(40, infoBoxY, 515, 65).stroke('#BFDBFE');

doc.font('Helvetica-Bold').fontSize(8.5).fillColor(ACCENT).text('Production Base URL:', 50, infoBoxY + 8);
doc.font('Helvetica').fontSize(8.5).fillColor(TEXT_MAIN).text('https://atleta-backend.vercel.app/api/v1', 160, infoBoxY + 8);

doc.font('Helvetica-Bold').fontSize(8.5).fillColor(ACCENT).text('Local Base URL:', 50, infoBoxY + 22);
doc.font('Helvetica').fontSize(8.5).fillColor(TEXT_MAIN).text('http://localhost:5000/api/v1', 160, infoBoxY + 22);

doc.font('Helvetica-Bold').fontSize(8.5).fillColor(ACCENT).text('Authentication Header:', 50, infoBoxY + 36);
doc.font('Helvetica').fontSize(8.5).fillColor(TEXT_MAIN).text('Authorization: Bearer <JWT_TOKEN>', 160, infoBoxY + 36);

doc.font('Helvetica-Bold').fontSize(8.5).fillColor(ACCENT).text('Content Types:', 50, infoBoxY + 50);
doc.font('Helvetica').fontSize(8.5).fillColor(TEXT_MAIN).text('application/json (standard) | multipart/form-data (file uploads)', 160, infoBoxY + 50);

doc.y = infoBoxY + 75;

doc.font('Helvetica-Bold').fontSize(11).fillColor(PRIMARY).text('User Roles & Permissions');
doc.moveDown(0.3);
doc.font('Helvetica').fontSize(8.5).fillColor(TEXT_MAIN).text(
  'The API enforces role-based access control with 4 distinct roles:\n' +
  '• Athlete: Access personal performance stats, match history, team roster, sRPE workload logging, and recruitment inquiries.\n' +
  '• Coach: Manage team rosters, scout athletes, view detailed workload analytics, generate scouting proposals, and export match PDF boxscores.\n' +
  '• Official: Manage tournament schedules, review and certify match scoresheets, and submit official match logs.\n' +
  '• Admin: Oversee coach approval queues, audit logs, and manage the official sports directory catalog.',
  45, doc.y, { width: 505, lineGap: 2 }
);

doc.moveDown(0.8);
doc.font('Helvetica-Bold').fontSize(11).fillColor(PRIMARY).text('Standard Response Envelope');
doc.moveDown(0.3);
doc.font('Helvetica-Bold').fontSize(8).fillColor(TEXT_MUTED).text('Success format:');
doc.font('Courier').fontSize(8).fillColor(SUCCESS).text('{\n  "success": true,\n  "data": { ... },\n  "message": "Operation successful"\n}');
doc.font('Helvetica-Bold').fontSize(8).fillColor(TEXT_MUTED).text('Error format:');
doc.font('Courier').fontSize(8).fillColor(DANGER).text('{\n  "success": false,\n  "error": "Error description message",\n  "details": [ { "field": "email", "message": "Valid email required" } ]\n}');

// ==========================================
// SECTION 1: AUTHENTICATION & USERS
// ==========================================
drawSectionDivider('1. Authentication & Account Management (/api/v1/users)');

drawEndpoint('POST', '/users/register (or /users)', 'Register a new Athlete account', 'Public', [
  'email', 'password', 'first_name', 'last_name', 'phone_number', 'sport_type', 'primary_position', 'birth_date', 'eligible_documents (file)'
], 'Supports multipart/form-data with file attachment');

drawEndpoint('POST', '/users/coach (or /users/register-coach)', 'Register a new Coach account', 'Public', [
  'email', 'password', 'first_name', 'last_name', 'phone_number', 'sport_type', 'school_organization', 'professional_documents (file)'
], 'Requires Admin approval before full access');

drawEndpoint('POST', '/users/official', 'Register a new Tournament Official', 'Public', [
  'email', 'password', 'first_name', 'last_name', 'phone_number', 'assigned_sport', 'organization'
]);

drawEndpoint('POST', '/users/login', 'Authenticate user & receive JWT token', 'Public', [
  'email', 'password'
], 'Returns token, user profile, role, and permissions');

drawEndpoint('POST', '/users/official/login', 'Authenticate tournament official', 'Public', [
  'email', 'password'
]);

drawEndpoint('POST', '/users/google-login', 'Sign in with Google OAuth ID token', 'Public', [
  'idToken', 'role'
]);

drawEndpoint('POST', '/users/social-login', 'Social authentication endpoint', 'Public', [
  'provider', 'token', 'role'
]);

drawEndpoint('GET', '/users/me', 'Fetch current authenticated user profile', 'Auth: Any', []);

drawEndpoint('POST', '/users/password-reset', 'Request password reset email', 'Public', [
  'email'
], 'Sends reset link with secure token');

drawEndpoint('POST', '/users/password-reset/:token', 'Confirm password reset with token', 'Public', [
  'new_password', 'token'
]);

drawEndpoint('POST', '/users/change-password', 'Update password for logged in user', 'Auth: Any', [
  'current_password', 'new_password'
]);

// ==========================================
// SECTION 2: ATHLETE HUB
// ==========================================
drawSectionDivider('2. Athlete Performance & Workload Hub (/api/v1/athletes)');

drawEndpoint('GET', '/athletes/home', 'Athlete Dashboard home feed & summary', 'Auth: Athlete', [], 'Returns recent matches, alerts, workload summary, and team banner');

drawEndpoint('GET', '/athletes/profile', 'Get athlete profile details & vitals', 'Auth: Athlete', []);

drawEndpoint('PATCH', '/athletes/profile', 'Update athlete profile & bio', 'Auth: Athlete', [
  'height', 'weight', 'jersey_number', 'bio', 'emergency_contact'
]);

drawEndpoint('GET', '/athletes/stats/all', 'Aggregate performance stats across matches', 'Auth: Athlete', [], 'Includes points, rebounds, assists, shooting %, stamina, sprint times');

drawEndpoint('GET', '/athletes/matches', 'Historical match logs & individual boxscores', 'Auth: Athlete', [], 'Query: ?limit=20&sport=Basketball');

drawEndpoint('GET', '/athletes/team', 'Current team details and teammate roster', 'Auth: Athlete', []);

drawEndpoint('GET', '/athletes/workload', 'Get acute/chronic sRPE workload analytics', 'Auth: Athlete', [], 'Returns ACWR (Acute:Chronic Workload Ratio), monotony, strain, and injury risk flags');

drawEndpoint('POST', '/athletes/workload', 'Submit session RPE log (Workload tracking)', 'Auth: Athlete/Coach', [
  'athlete_id', 'session_duration_mins (int > 0)', 'srpe_score (1-10 scale)', 'entry_date (YYYY-MM-DD)', 'session_type'
], 'Validates sRPE score is an integer between 1 and 10');

drawEndpoint('POST', '/athletes/documents', 'Upload eligibility certificate or medical clearance', 'Auth: Athlete', [
  'document (file: PDF/PNG/JPG)', 'document_type'
]);

drawEndpoint('GET', '/athletes/search', 'Search athletes by name, sport, or team', 'Auth: Any', [
  'Query: ?query=John&sport=Basketball&team_id=...'
]);

// ==========================================
// SECTION 3: COACH OPERATIONS
// ==========================================
drawSectionDivider('3. Coach Management & Scouting Hub (/api/v1/coaches)');

drawEndpoint('GET', '/coaches/me', 'Get authenticated Coach profile and credentials', 'Auth: Coach', []);

drawEndpoint('PATCH', '/coaches/me/profile', 'Update coach profile and coaching bio', 'Auth: Coach', [
  'experience_years (number)',
  'specialization (string)',
  'bio (string)',
  'phone_number (string)',
]);

drawEndpoint('PATCH', '/coaches/me/settings', 'Update coach preferences & scouting alert filters', 'Auth: Coach', [
  'data_sync_preference: "Manual" | "Automatic"',
  'notification_preferences: { game_log_updates: boolean, recruitment_inquiries: boolean }',
]);

drawEndpoint('PATCH', '/coaches/me/password', 'Change coach password', 'Auth: Coach', [
  'current_password', 'new_password'
]);

drawEndpoint('GET', '/coaches/scouting/athletes/:athleteId', 'Deep scouting profile on a specific athlete', 'Auth: Coach', [], 'Returns verified stats, radar metrics, match logs, and injury history');

drawEndpoint('GET', '/coaches/athletes/:athleteId/workload', 'View specific athlete workload metrics & ACWR', 'Auth: Coach', []);

drawEndpoint('POST', '/coaches/athletes/:athleteId/workload', 'Log training session workload for athlete', 'Auth: Coach', [
  'session_duration_mins', 'srpe_score', 'entry_date', 'session_type'
]);

drawEndpoint('GET', '/coaches/:coachId', 'Public coach lookup for recruitment inquiries', 'Public', []);

// ==========================================
// SECTION 4: MATCHES, OCR & BOXSCORES
// ==========================================
drawSectionDivider('4. Matches, Scoresheets & AI OCR Engine (/api/v1/matches)');

drawEndpoint('POST', '/matches/scan-scoresheet', 'AI-Powered OCR Scoresheet Scanner (Gemini)', 'Auth: Any', [
  'file (scoresheet photo / PDF)', 'sport_type (Basketball | Swimming | Track & Field)'
], 'Extracts player names, jersey numbers, points, rebounds, assists, fouls, sets, and times with waterfall retry');

drawEndpoint('POST', '/matches', 'Submit manual match log & boxscore data', 'Auth: Coach/Official', [
  'match_date', 'sport_type', 'opponent_name', 'location', 'player_stats (array of athlete stats)', 'scoresheet_url'
]);

drawEndpoint('POST', '/matches/official', 'Create official sanctioned tournament match', 'Auth: Official/Coach', [
  'team_id', 'sport_type', 'match_date', 'location', 'opponent_team_name', 'Idempotency-Key (Header)'
]);

drawEndpoint('POST', '/matches/:matchId/scoresheet', 'Attach scoresheet file to existing match', 'Auth: Any', [
  'file (image/PDF)', 'matchId'
]);

drawEndpoint('GET', '/matches/:matchId/boxscore', 'Retrieve detailed player boxscore breakdown', 'Auth: Any', []);

drawEndpoint('GET', '/matches/:matchId/details', 'Get comprehensive match overview & status', 'Auth: Any', []);

drawEndpoint('POST', '/matches/:matchId/audit-request', 'Submit official contestation or stat audit', 'Auth: Coach', [
  'reason', 'disputed_stats (array)', 'notes'
]);

drawEndpoint('GET', '/matches/:matchId/pdf', 'Generate and download official PDF Match Boxscore', 'Auth: Coach', [], 'Returns application/pdf stream with full certified boxscore');

drawEndpoint('DELETE', '/matches/:matchId', 'Remove uncertified match log', 'Auth: Coach/Admin', []);

// ==========================================
// SECTION 5: TOURNAMENT OFFICIALS & VALIDATION
// ==========================================
drawSectionDivider('5. Tournament Officials & Validation Hub (/api/v1/officials & /validations)');

drawEndpoint('GET', '/officials/dashboard', 'Tournament Official master operations dashboard', 'Auth: Official', [], 'Returns scheduled games, pending certifications, recent audits, and alerts');

drawEndpoint('GET', '/officials/schedules', 'Official tournament assignments and fixtures', 'Auth: Official', []);

drawEndpoint('GET', '/officials/notifications', 'Official tournament alerts & audit inquiries', 'Auth: Official', []);

drawEndpoint('PATCH', '/officials/notifications/read-all', 'Mark all official notifications as read', 'Auth: Official', []);

drawEndpoint('GET', '/validations/pending', 'Fetch pending match scoresheets awaiting certification', 'Auth: Official', []);

drawEndpoint('POST', '/validations/:validationId/certify', 'Certify & seal official match results in Firestore', 'Auth: Official', [
  'context_notes', 'scoresheet_url'
], 'Locks match records into official verified standings');

// ==========================================
// SECTION 6: TEAMS & ROSTERS
// ==========================================
drawSectionDivider('6. Team & Roster Management (/api/v1/teams)');

drawEndpoint('GET', '/teams', 'Browse all registered sports teams & clubs', 'Auth: Any', [
  'Query: ?sport=Basketball&search=Tigers'
]);

drawEndpoint('POST', '/teams', 'Register a new team / squad', 'Auth: Coach/Admin', [
  'name', 'sport_type', 'organization_school', 'division', 'logo_url'
]);

drawEndpoint('GET', '/teams/:teamId', 'Get team details, coach info, and roster list', 'Auth: Any', []);

drawEndpoint('PATCH', '/teams/:teamId', 'Update team profile & organizational metadata', 'Auth: Coach/Admin', [
  'team_name?: string',
  'division?: string',
  'team_logo_url?: string',
]);

drawEndpoint('PATCH', '/teams/:teamId/roster', 'Add or remove athletes from team roster', 'Auth: Coach', [
  'athlete_ids (array)', 'action ("ADD" | "REMOVE")'
]);

// ==========================================
// SECTION 7: SCOUTING & TALENT DISCOVERY
// ==========================================
drawSectionDivider('7. Scouting & Talent Discovery Engine (/api/v1/scouting)');

drawEndpoint('GET', '/scouting/athletes', 'Search and filter scoutable athletes', 'Auth: Coach', [
  'Query: ?sport=Basketball&position=Guard&min_height=180&min_ppg=15&page=1&limit=20'
]);

drawEndpoint('GET', '/scouting/rankings', 'Leaderboards and metric percentiles across athletes', 'Auth: Coach', [
  'Query: ?sport=Basketball&metric=points (points | assists | rebounds | efficiency)'
]);

drawEndpoint('POST', '/scouting/proposals', 'Submit recruitment proposal to prospect athlete', 'Auth: Coach', [
  'athlete_id', 'scholarship_type', 'offer_details', 'contact_email', 'deadline'
]);

drawEndpoint('GET', '/scouting/proposals', 'List submitted recruitment proposals & status', 'Auth: Coach', [
  'Query: ?status=PENDING (PENDING | ACCEPTED | DECLINED)'
]);

// ==========================================
// SECTION 8: RECRUITMENT INQUIRIES
// ==========================================
drawSectionDivider('8. Recruitment Inquiries (/api/v1/inquiries)');

drawEndpoint('POST', '/inquiries', 'Send recruitment inquiry / scouting message', 'Auth: Coach/Athlete', [
  'receiver_id', 'athlete_id', 'subject', 'message', 'contact_phone'
]);

drawEndpoint('GET', '/inquiries', 'Fetch inquiry threads for authenticated user', 'Auth: Coach/Athlete', []);

drawEndpoint('PATCH', '/inquiries/:inquiryId/respond', 'Accept, decline, or reply to recruitment inquiry', 'Auth: Coach/Athlete', [
  'status ("ACCEPTED" | "DECLINED" | "IN_REVIEW")', 'response_message'
]);

// ==========================================
// SECTION 9: SPORTS CATALOG
// ==========================================
drawSectionDivider('9. Sports Catalog Directory (/api/v1/sports)');

drawEndpoint('GET', '/sports', 'Get list of supported sports, stat schemas & positions', 'Auth: Any', []);

drawEndpoint('GET', '/sports/:sportId', 'Get sport configuration, metric keys, and rules', 'Auth: Any', []);

drawEndpoint('POST', '/sports', 'Add new sport category to system directory', 'Auth: Admin', [
  'name', 'stat_schema (metrics list)', 'positions (list)', 'scoring_rules'
]);

drawEndpoint('PATCH', '/sports/:sportId', 'Update sport rules and metric configuration', 'Auth: Admin', [
  'stat_schema', 'positions', 'active'
]);

// ==========================================
// SECTION 10: OFFLINE QUEUE SYNC
// ==========================================
drawSectionDivider('10. Offline Sync & Local-First Resiliency (/api/v1/sync)');

drawEndpoint('POST', '/sync/offline-queue (or /batch)', 'Submit offline queue mutations batch for Coaches', 'Auth: Coach', [
  'mutations: [ { "id": "uuid", "type": "LOG_MATCH"|"SRPE", "payload": { ... }, "timestamp": 12345 } ]'
], 'Executes idempotently without duplicate writes');

drawEndpoint('POST', '/sync/athlete-offline-queue', 'Submit offline queue mutations batch for Athletes', 'Auth: Athlete', [
  'mutations: [ { "id": "uuid", "type": "SRPE_ENTRY", "payload": { ... } } ]'
]);

drawEndpoint('GET', '/sync/coach-snapshot', 'Download complete offline snapshot for Coach app', 'Auth: Coach', [], 'Includes team roster, recent matches, and scouting cache for zero-latency local operations');

drawEndpoint('GET', '/sync/athlete-snapshot', 'Download athlete offline snapshot', 'Auth: Athlete', []);

drawEndpoint('GET', '/sync/status', 'Check sync queue health & server timestamp', 'Auth: Any', []);

// ==========================================
// SECTION 11: NOTIFICATIONS & ADMIN
// ==========================================
drawSectionDivider('11. Notifications & System Governance (/api/v1/notifications & /admin)');

drawEndpoint('GET', '/notifications', 'Get in-app notification inbox', 'Auth: Any', [
  'Query: ?unread_only=true&limit=30'
]);

drawEndpoint('PATCH', '/notifications/read-all', 'Mark all user notifications as read', 'Auth: Any', []);

drawEndpoint('PATCH', '/notifications/:notificationId/read', 'Mark specific notification as read', 'Auth: Any', []);

drawEndpoint('POST', '/admin/login', 'Admin authentication', 'Public', [
  'email', 'password'
]);

drawEndpoint('GET', '/admin/coach-queue', 'View pending coach verification applications', 'Auth: Admin', []);

drawEndpoint('POST', '/admin/coaches/:coachId/approve', 'Approve coach credentials and activate account', 'Auth: Admin', []);

drawEndpoint('POST', '/admin/coaches/:coachId/reject', 'Reject coach application with reason', 'Auth: Admin', [
  'rejection_reason'
]);

// ==========================================
// SECTION 12: ERROR HANDLING CODES
// ==========================================
drawSectionDivider('12. Standard HTTP Status Codes & Error Handling');

doc.font('Helvetica-Bold').fontSize(8.5).fillColor(PRIMARY).text('HTTP Status Code Reference for Frontend Interceptors:', 48, doc.y);
doc.moveDown(0.4);

const codes = [
  { code: '200 OK', desc: 'Request succeeded. Returns JSON payload.' },
  { code: '201 Created', desc: 'Resource created successfully (e.g. registration, match log).' },
  { code: '400 Bad Request', desc: 'Validation failure (e.g. missing fields, sRPE not 1-10, bad email).' },
  { code: '401 Unauthorized', desc: 'Missing or expired Bearer JWT token in Authorization header.' },
  { code: '403 Forbidden', desc: 'Role mismatch (e.g. Athlete trying to access Coach scouting endpoint).' },
  { code: '404 Not Found', desc: 'Resource (athlete, match, team) does not exist.' },
  { code: '409 Conflict', desc: 'Duplicate resource (e.g. email already registered).' },
  { code: '429 Too Many Requests', desc: 'Auth rate limit exceeded (Max 5 attempts / min). Retry after 60s.' },
  { code: '500 Server Error', desc: 'Unhandled internal exception. Contact backend support.' }
];

codes.forEach(c => {
  doc.font('Helvetica-Bold').fontSize(8).fillColor(c.code.startsWith('2') ? SUCCESS : (c.code.startsWith('4') ? WARNING : DANGER))
     .text(c.code, 48, doc.y, { continued: true });
  doc.font('Helvetica').fontSize(8).fillColor(TEXT_MAIN).text(` — ${c.desc}`);
  doc.moveDown(0.2);
});

// Footer with page numbering
const range = doc.bufferedPageRange();
for (let i = range.start; i < range.start + range.count; i++) {
  doc.switchToPage(i);
  doc.font('Helvetica').fontSize(7.5).fillColor(TEXT_MUTED).text(
    `Atleta API Specification • Page ${i + 1} of ${range.count} • Generated for Frontend Integration`,
    40, 790, { width: 515, align: 'center' }
  );
}

doc.end();

writeStream.on('finish', () => {
  console.log(`✅ PDF successfully generated at: ${outputPath}`);
});
