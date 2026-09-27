import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

const outputPath = path.resolve(__dirname, '..', 'Atleta_Backend_Comprehensive_Guide.pdf');

const doc = new PDFDocument({
  margin: 36,
  size: 'A4',
  bufferPages: true,
});

const writeStream = fs.createWriteStream(outputPath);
doc.pipe(writeStream);

// Professional Color Palette
const COLOR_PRIMARY = '#0F172A';   // Slate 900
const COLOR_SECONDARY = '#1E293B'; // Slate 800
const COLOR_ACCENT = '#2563EB';    // Blue 600
const COLOR_ACCENT_BG = '#EFF6FF'; // Blue 50
const COLOR_SUCCESS = '#059669';   // Emerald 600
const COLOR_WARNING = '#D97706';   // Amber 600
const COLOR_DANGER = '#DC2626';    // Red 600
const COLOR_PURPLE = '#7C3AED';    // Purple 600
const COLOR_TEXT = '#1E293B';      // Slate 800
const COLOR_MUTED = '#64748B';     // Slate 500
const COLOR_BG_CARD = '#F8FAFC';   // Slate 50
const COLOR_BORDER = '#E2E8F0';    // Slate 200

// Helper functions for layout
function checkPageSpace(neededHeight: number = 80) {
  if (doc.y + neededHeight > 780) {
    doc.addPage();
  }
}

function renderChapterHeader(number: string, title: string, subtitle: string) {
  checkPageSpace(100);
  doc.moveDown(1.2);
  const startY = doc.y;
  doc.rect(36, startY, 523, 40).fill(COLOR_PRIMARY);
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#38BDF8').text(`CHAPTER ${number}: `, 48, startY + 8, { continued: true });
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#FFFFFF').text(title.toUpperCase());
  doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#94A3B8').text(subtitle, 48, startY + 24);
  doc.y = startY + 48;
  doc.moveDown(0.5);
}

function renderSubSection(title: string, tag?: string) {
  checkPageSpace(50);
  doc.moveDown(0.6);
  const startY = doc.y;
  doc.rect(36, startY, 523, 20).fill(COLOR_SECONDARY);
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#FFFFFF').text(title, 44, startY + 5);
  if (tag) {
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#38BDF8').text(tag, 450, startY + 6, { width: 100, align: 'right' });
  }
  doc.y = startY + 24;
  doc.moveDown(0.4);
}

function renderItemCard(
  name: string,
  category: string,
  description: string,
  details: { label: string; value: string }[],
  notes?: string
) {
  checkPageSpace(85);
  const startY = doc.y;
  
  // Header bar
  doc.rect(36, startY, 523, 18).fill(COLOR_BG_CARD);
  doc.rect(36, startY, 523, 18).stroke(COLOR_BORDER);
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLOR_ACCENT).text(name, 44, startY + 4);
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLOR_MUTED).text(`[ ${category} ]`, 440, startY + 5, { width: 110, align: 'right' });

  doc.y = startY + 22;

  // Description
  doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_TEXT).text(`• Purpose: ${description}`, 44, doc.y, { width: 505 });
  doc.moveDown(0.25);

  // Key-Value rows
  for (const item of details) {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_SECONDARY).text(`  ${item.label}: `, 44, doc.y, { continued: true });
    doc.font('Helvetica').fontSize(8).fillColor(COLOR_TEXT).text(item.value, { width: 440 });
    doc.moveDown(0.2);
  }

  if (notes) {
    doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(COLOR_MUTED).text(`  Note: ${notes}`, 44, doc.y, { width: 505 });
    doc.moveDown(0.2);
  }

  doc.moveDown(0.5);
}

function renderRouteTable(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  endpoint: string,
  auth: string,
  purpose: string,
  payload?: string,
  responseNote?: string
) {
  checkPageSpace(60);
  const startY = doc.y;
  let methodBg = COLOR_ACCENT;
  if (method === 'POST') methodBg = COLOR_SUCCESS;
  if (method === 'PUT' || method === 'PATCH') methodBg = COLOR_WARNING;
  if (method === 'DELETE') methodBg = COLOR_DANGER;

  doc.rect(36, startY, 523, 18).fill('#F1F5F9');
  doc.rect(36, startY, 523, 18).stroke(COLOR_BORDER);

  // Method Pill
  doc.rect(40, startY + 2.5, 42, 13).fill(methodBg);
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF').text(method, 40, startY + 5, { width: 42, align: 'center' });

  // Route Path
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_PRIMARY).text(endpoint, 88, startY + 4.5);

  // Auth Tag
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(auth === 'Public' ? COLOR_SUCCESS : COLOR_PURPLE)
     .text(auth, 440, startY + 5, { width: 110, align: 'right' });

  doc.y = startY + 21;

  doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_TEXT).text(`• Handler / Action: ${purpose}`, 44, doc.y, { width: 505 });
  doc.moveDown(0.2);

  if (payload) {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLOR_MUTED).text('  Input Payload: ', 44, doc.y, { continued: true });
    doc.font('Courier').fontSize(8).fillColor(COLOR_TEXT).text(payload, { width: 440 });
    doc.moveDown(0.2);
  }

  if (responseNote) {
    doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(COLOR_MUTED).text(`  Response: ${responseNote}`, 44, doc.y, { width: 505 });
    doc.moveDown(0.2);
  }

  doc.moveDown(0.4);
}

// =========================================================================
// COVER PAGE & EXECUTIVE ARCHITECTURE
// =========================================================================
doc.rect(36, 36, 523, 140).fill(COLOR_PRIMARY);
doc.font('Helvetica-Bold').fontSize(26).fillColor('#FFFFFF').text('ATLETA BACKEND', 54, 55);
doc.font('Helvetica-Bold').fontSize(16).fillColor('#38BDF8').text('Full Function & Architectural Reference Guide', 54, 85);
doc.font('Helvetica').fontSize(9.5).fillColor('#94A3B8').text('A Complete Module-by-Module Technical Manual for Frontend Developers & Integrators', 54, 108);
doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#FCD34D').text('VERSION 1.0 • FERN STACK (Firebase Firestore, Express 5, React Native, Node.js)', 54, 138);

doc.y = 190;
doc.font('Helvetica-Bold').fontSize(12).fillColor(COLOR_PRIMARY).text('1. System Architecture & Base Environments');
doc.moveDown(0.4);

const envBoxY = doc.y;
doc.rect(36, envBoxY, 523, 75).fill(COLOR_ACCENT_BG);
doc.rect(36, envBoxY, 523, 75).stroke('#BFDBFE');

doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_ACCENT).text('Production Base Endpoint:', 46, envBoxY + 8);
doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_TEXT).text('https://atleta-backend.vercel.app/api/v1', 180, envBoxY + 8);

doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_ACCENT).text('Local Development Endpoint:', 46, envBoxY + 22);
doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_TEXT).text('http://localhost:5000/api/v1', 180, envBoxY + 22);

doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_ACCENT).text('Authorization Header:', 46, envBoxY + 36);
doc.font('Courier-Bold').fontSize(8.5).fillColor(COLOR_PRIMARY).text('Authorization: Bearer <JWT_TOKEN>', 180, envBoxY + 36);

doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_ACCENT).text('Rate Limiting Policy:', 46, envBoxY + 50);
doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_TEXT).text('Max 5 auth requests/minute per IP. Returns HTTP 429 with retry_after_seconds.', 180, envBoxY + 50);

doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLOR_ACCENT).text('OCR Processing Engine:', 46, envBoxY + 64);
doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_TEXT).text('Google Gemini 3.5/Flash AI Multimodal Vision Waterfall Pipeline with sharp image optimization.', 180, envBoxY + 64);

doc.y = envBoxY + 85;

doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_PRIMARY).text('2. Architectural Flow & Codebase Anatomy');
doc.moveDown(0.3);
doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_TEXT).text(
  'Every HTTP request follows a strict tiered lifecycle designed for maximum security, consistency, and zero-latency offline caching:\n' +
  '1. Router Layer (routes/): Maps HTTP verbs and URL paths, attaches multer file parsers, and binds authentication middlewares.\n' +
  '2. Middleware Layer (middlewares/): Validates JWT signatures, checks RBAC permissions (Athlete, Coach, Official, Admin), and applies IP rate-limiters.\n' +
  '3. Validator Layer (validators/): Performs strict schema validation, type checking, range validation (e.g. sRPE 1–10), and sanitization.\n' +
  '4. Controller Layer (controllers/): Unpacks express request parameters, handles multipart file uploads, invokes business services, and shapes response envelopes.\n' +
  '5. Service Layer (services/): Executes core business logic, statistical algorithms (ACWR, BMI, Ape Index), Firestore queries, and AI OCR processing.\n' +
  '6. Event Bus Layer (utils/eventBus.ts): Emits asynchronous events (e.g. MATCH_LOGGED, SRPE_LOGGED) to automatically invalidate in-memory caches and trigger automated notifications.',
  42, doc.y, { width: 510, lineGap: 2.5 }
);

// =========================================================================
// CHAPTER 1: MIDDLEWARES & APPLICATION CORE
// =========================================================================
renderChapterHeader('1', 'Application Core & Middlewares', 'Entry points, request lifecycles, and security gates');

renderSubSection('api/ & Root Configuration', 'ENTRY POINTS');
renderItemCard('api/index.ts & app.ts', 'Serverless Entry', 'Main Express application instance and Vercel serverless request listener bridge', [
  { label: 'CORS Configuration', value: 'Allows all origins (*), handles GET, POST, PUT, PATCH, DELETE, OPTIONS, with headers Idempotency-Key and Authorization' },
  { label: 'Body Parsing Limits', value: 'express.json({ limit: "25mb" }), express.urlencoded({ extended: true, limit: "25mb" }) for high-resolution scoresheet uploads' },
  { label: 'Trust Proxy', value: 'app.set("trust proxy", 1) enabled for accurate client IP identification on Vercel and load balancers' }
]);

renderSubSection('middlewares/ Directory', 'SECURITY & AUTH');
renderItemCard('authenticate(req, res, next)', 'Authentication Gate', 'Extracts and cryptographically verifies Bearer JWT token from Authorization header', [
  { label: 'Inputs', value: 'req.headers.authorization: "Bearer <token>"' },
  { label: 'Success Action', value: 'Decodes JWT payload and populates req.user with { uid: string, email: string, role: string }' },
  { label: 'Error Handling', value: 'Returns HTTP 401 { error: "Access denied. No token provided." } or { error: "Invalid or expired token." }' }
]);

renderItemCard('requireCoach(req, res, next)', 'Role Gate', 'Restricts endpoint access exclusively to users with Coach role', [
  { label: 'Verification', value: 'Requires req.user.role === "Coach"' },
  { label: 'Error Handling', value: 'Returns HTTP 403 { error: "Access denied. Coach role required." }' }
]);

renderItemCard('requireSystemAdmin(req, res, next)', 'Elevated Role Gate', 'Enforces strict system administrator role checks for governance endpoints', [
  { label: 'Verification', value: 'Checks user role is Admin and verifies active administrator status in Firestore' },
  { label: 'Error Handling', value: 'Returns HTTP 403 { error: "Access denied. System Administrator privileges required." }' }
]);

renderItemCard('authRateLimiter(req, res, next)', 'Rate Limiting Gate', 'Sliding window in-memory rate limiter to prevent brute-force attacks on auth routes', [
  { label: 'Limits', value: 'Max 5 requests per 60,000ms (1 minute) per client IP address' },
  { label: 'Error Handling', value: 'Returns HTTP 429 { error: "Rate limit exceeded...", retry_after_seconds: number }' },
  { label: 'Utility', value: 'resetAuthRateLimiter(ip?) allows resetting rate limits during automated testing or account recovery' }
]);

// =========================================================================
// CHAPTER 2: USER CONTROLLER, SERVICE & VALIDATORS
// =========================================================================
renderChapterHeader('2', 'Authentication & Account Management', 'Registration, JWT generation, Social Logins, Password Recovery');

renderSubSection('routes/userRoutes.ts', 'ENDPOINTS (/api/v1/users)');
renderRouteTable('POST', '/users/register (or /users)', 'Public', 'Register athlete account with optional eligibility document', 'FormData: email, password, first_name, last_name, phone_number, sport_type, primary_position, birth_date, eligible_documents (file)', 'Returns 201 with user profile and JWT token');
renderRouteTable('POST', '/users/coach (or /users/register-coach)', 'Public', 'Register coach account with professional credential document', 'FormData: email, password, first_name, last_name, phone_number, sport_type, school_organization, professional_documents (file)', 'Returns 201 with pending coach status (requires admin approval)');
renderRouteTable('POST', '/users/official', 'Public', 'Register tournament official account', 'JSON: email, password, first_name, last_name, phone_number, assigned_sport, organization', 'Returns 201 with official profile and JWT token');
renderRouteTable('POST', '/users/login', 'Public', 'Authenticate with email & password', 'JSON: { email, password }', 'Returns 200 with { token, user: { uid, email, role, full_name, profile } }');
renderRouteTable('POST', '/users/official/login', 'Public', 'Authenticate tournament official', 'JSON: { email, password }', 'Returns 200 with { token, user: { uid, role: "Official", ... } }');
renderRouteTable('POST', '/users/google-login', 'Public', 'Sign in via Google OAuth Firebase ID Token', 'JSON: { idToken, role: "Athlete" | "Coach" | "Official" }', 'Validates Firebase ID token and provisions account if new');
renderRouteTable('GET', '/users/me', 'Auth: Any', 'Fetch authenticated user profile details', 'None (Bearer Token in Header)', 'Returns 200 with complete authenticated user record');
renderRouteTable('POST', '/users/password-reset', 'Public', 'Request password reset email', 'JSON: { email }', 'Generates reset token and dispatches nodemailer reset email');
renderRouteTable('POST', '/users/password-reset/:token', 'Public', 'Confirm password reset with token', 'JSON: { token, new_password }', 'Updates user password securely in Firebase Auth & Firestore');
renderRouteTable('POST', '/users/change-password', 'Auth: Any', 'Change password for logged-in user', 'JSON: { password } (min 6 chars)', 'Updates password for current user ID');

renderSubSection('services/userService.ts', 'CORE SERVICE FUNCTIONS');
renderItemCard('registerUserService(data, file?)', 'User Provisioning', 'Coordinates account creation across Firebase Auth, Firestore users collection, and athleteProfiles', [
  { label: 'Business Logic', value: 'Validates unique email, creates Firebase Auth record, provisions role-specific Firestore document (AthleteProfile, CoachProfile, OfficialProfile), uploads documents, and generates JWT' }
]);

renderItemCard('loginUserService(email, password)', 'Authentication', 'Verifies user credentials, checks coach approval status, and issues session tokens', [
  { label: 'Approval Check', value: 'If user is a Coach with approval_status === "PENDING", blocks login with HTTP 403 "Coach application pending approval"' },
  { label: 'Token Payload', value: 'JWT contains { uid, email, role, iat, exp }' }
]);

renderItemCard('socialLoginService(provider, token, role)', 'OAuth Handler', 'Verifies Google/Firebase OAuth tokens and provisions or updates user accounts', [
  { label: 'Supported Providers', value: 'google.com, apple.com, facebook.com' }
]);

renderItemCard('requestPasswordResetService(email) & resetPasswordConfirmService(...)', 'Recovery', 'Generates time-limited password reset tokens and dispatches HTML emails via nodemailer', [
  { label: 'Token Expiry', value: 'Reset tokens expire in 1 hour; invalidates token immediately upon successful confirmation' }
]);

renderSubSection('validators/userValidator.ts', 'VALIDATION RULES');
renderItemCard('validateRegisterUser & validateRegisterCoach', 'Schema Validator', 'Validates RFC 5322 email syntax, password strength (>=6 chars), phone numbers, and required sports fields', [
  { label: 'Valid Sports', value: '["Basketball", "Swimming", "Track & Field", "Volleyball", "Football", "Badminton"]' }
]);

// =========================================================================
// CHAPTER 3: ATHLETE CONTROLLER, SERVICE & WORKLOAD ENGINE
// =========================================================================
renderChapterHeader('3', 'Athlete Hub, Analytics & sRPE Engine', 'Career stats, match history, acute/chronic workload ratio (ACWR)');

renderSubSection('routes/athleteRoutes.ts', 'ENDPOINTS (/api/v1/athletes)');
renderRouteTable('GET', '/athletes/home', 'Auth: Athlete', 'Fetch athlete dashboard home summary feed', 'None', 'Returns recent matches, alerts, workload summary, and team banner');
renderRouteTable('GET', '/athletes/profile', 'Auth: Athlete', 'Retrieve comprehensive profile and physical vitals', 'None', 'Returns height, weight, BMI, Ape index, jersey number, and sport attributes');
renderRouteTable('PATCH', '/athletes/profile', 'Auth: Athlete', 'Update athlete profile vitals and bio', 'JSON: { height, weight, jersey_number, bio, wingspan, primary_position }', 'Recalculates BMI and Ape Index automatically');
renderRouteTable('GET', '/athletes/stats/all', 'Auth: Athlete', 'Aggregate career performance statistics across matches', 'None', 'Calculates total games, points, averages, shooting %, sprint times, stamina scores');
renderRouteTable('GET', '/athletes/matches', 'Auth: Athlete', 'Retrieve date-grouped match history with boxscores', 'Query: ?limit=20&sport=Basketball', 'Returns chronological match logs with official validation badges');
renderRouteTable('GET', '/athletes/team', 'Auth: Athlete', 'Fetch athlete current team and teammate roster', 'None', 'Returns team details, coach contact, and active teammate list');
renderRouteTable('GET', '/athletes/workload', 'Auth: Athlete', 'Get sRPE workload metrics and injury risk indicators', 'None', 'Returns acute load, chronic load, ACWR ratio, monotony, and strain');
renderRouteTable('POST', '/athletes/workload', 'Auth: Athlete/Coach', 'Log session Rating of Perceived Exertion (sRPE)', 'JSON: { athlete_id, session_duration_mins, srpe_score (1-10), entry_date, session_type }', 'Validates score (1-10) and calculates daily training load (duration * score)');
renderRouteTable('POST', '/athletes/documents', 'Auth: Athlete', 'Upload eligibility or medical certificate', 'FormData: document (file), document_type ("ELIGIBILITY" | "MEDICAL")', 'Stores document metadata in athlete profile');

renderSubSection('services/athleteService.ts', 'METRIC CALCULATIONS');
renderItemCard('calculateBMI(weightKg, heightCm)', 'Biometric', 'Calculates Body Mass Index: weight / ((height/100)^2)', [
  { label: 'Return', value: 'Float rounded to 1 decimal place (e.g. 22.4)' }
]);

renderItemCard('calculateApeIndex(wingspanCm, heightCm)', 'Biometric', 'Calculates wingspan to height ratio (Ape Index)', [
  { label: 'Return', value: 'Float ratio (e.g. 1.05 indicates wingspan is 5% longer than height)' }
]);

renderItemCard('getAthleteExpandedCareerStats(athleteId)', 'Stat Aggregator', 'Aggregates all certified match logs for an athlete to compute statistical averages', [
  { label: 'Basketball Metrics', value: 'Points Per Game (PPG), Rebounds (RPG), Assists (APG), Steals (SPG), Blocks (BPG), FG%, 3PT%, FT%, Efficiency Rating' },
  { label: 'Individual Sports', value: 'Personal Bests, Average Lap/Sprint times, Event Placements (1st/2nd/3rd)' }
]);

renderSubSection('services/workloadService.ts', 'WORKLOAD ANALYTICS (ACWR)', 'INJURY PREVENTION');
renderItemCard('getWorkloadAnalytics(athleteId)', 'Workload Algorithm', 'Computes Acute:Chronic Workload Ratio (ACWR), Monotony, and Strain over 28-day rolling window', [
  { label: 'Daily Load Formula', value: 'Daily Load = Session Duration (minutes) * sRPE Score (1–10 Borg CR10 Scale)' },
  { label: 'Acute Load (7 days)', value: 'Average daily training load over the last 7 days (fatigue indicator)' },
  { label: 'Chronic Load (28 days)', value: 'Average daily training load over the last 28 days (fitness indicator)' },
  { label: 'ACWR Ratio', value: 'Acute Load / Chronic Load. Sweet spot: 0.8 – 1.3 (Low injury risk). Danger zone: > 1.5 (High injury spike risk)' },
  { label: 'Monotony & Strain', value: 'Monotony = Mean Daily Load / Standard Deviation. Strain = Total Weekly Load * Monotony' }
]);

renderSubSection('validators/workloadValidator.ts', 'sRPE VALIDATION');
renderItemCard('validateSrpeInput(body)', 'Input Validator', 'Ensures strict compliance with sports science sRPE data collection', [
  { label: 'session_duration_mins', value: 'Must be positive integer greater than 0' },
  { label: 'srpe_score', value: 'Must be an integer between 1 and 10 (inclusive). Rejects values outside 1-10 with HTTP 400 Bad Request' },
  { label: 'entry_date', value: 'Must be a valid ISO date string (YYYY-MM-DD)' }
]);

// =========================================================================
// CHAPTER 4: COACH OPERATIONS & SCOUTING DISCOVERY
// =========================================================================
renderChapterHeader('4', 'Coach Hub, Scouting & Talent Discovery', 'Multi-attribute athlete search, leaderboards, recruitment proposals');

renderSubSection('routes/coachRoutes.ts & scoutingRoutes.ts', 'ENDPOINTS');
renderRouteTable('GET', '/coaches/me', 'Auth: Coach', 'Get authenticated coach profile and verified credentials', 'None', 'Returns coach details, school/organization, and assigned sport');
renderRouteTable('PATCH', '/coaches/me/profile', 'Auth: Coach', 'Update coach profile and coaching philosophy bio', 'JSON: { experience_years, specialization, bio, phone_number }', 'Updates coach document in Firestore');
renderRouteTable('PATCH', '/coaches/me/settings', 'Auth: Coach', 'Update coach preferences', 'JSON: { email_alerts, scouting_notifications, preferred_sports }', 'Persists settings to coachSettings collection');
renderRouteTable('GET', '/scouting/athletes', 'Auth: Coach', 'Search and filter regional prospect athletes', 'Query: ?sport=Basketball&position=Guard&min_height=180&min_ppg=15&page=1&limit=20', 'Returns paginated athlete search results with stat summaries');
renderRouteTable('GET', '/scouting/athletes/:athleteId', 'Auth: Coach', 'Comprehensive scouting profile on specific athlete', 'None', 'Returns verified match logs, biometric radar stats, and injury risk');
renderRouteTable('GET', '/scouting/rankings', 'Auth: Coach', 'Leaderboard rankings across athletes by metric', 'Query: ?sport=Basketball&metric=points (points | assists | rebounds | efficiency)', 'Returns sorted top performers in selected category');
renderRouteTable('POST', '/scouting/proposals', 'Auth: Coach', 'Send formal recruitment proposal to athlete', 'JSON: { athlete_id, scholarship_type, offer_details, contact_email, deadline }', 'Creates proposal and triggers push notification to athlete');
renderRouteTable('GET', '/scouting/proposals', 'Auth: Coach', 'List coach submitted recruitment proposals', 'Query: ?status=PENDING', 'Returns list of dispatched proposals with acceptance status');

renderSubSection('services/scoutingService.ts', 'SCOUTING ENGINE');
renderItemCard('searchRegionalAthletes(coachId, filters, pagination)', 'Talent Query', 'Executes multi-field filtering across athlete profiles and computed career metrics', [
  { label: 'Supported Filters', value: 'sport_type, primary_position, min_height, max_height, min_weight, max_weight, min_age, max_age, min_ppg, school_organization' },
  { label: 'Pagination', value: 'Supports page, limit (default 20), and sortBy' }
]);

renderItemCard('getLeaderboardRankings(sportType, metric, limit)', 'Ranking Engine', 'Calculates real-time leaderboard percentiles across all certified athletes in a sport', [
  { label: 'Percentile Rankings', value: 'Calculates top 5%, top 10%, top 25% percentile distribution benchmarks' }
]);

renderItemCard('dispatchRecruitmentProposal(...)', 'Proposal Handler', 'Creates formal recruitment offer document and emits RECRUITMENT_PROPOSAL_DISPATCHED event', [
  { label: 'Status Lifecycle', value: 'PENDING -> ACCEPTED | DECLINED | IN_REVIEW' }
]);

// =========================================================================
// CHAPTER 5: MATCHES, AI OCR & SCORESHEETS
// =========================================================================
renderChapterHeader('5', 'Matches, AI OCR Scanner & PDF Export', 'Gemini Multimodal Scoresheet OCR, Boxscore Engine, PDF Generation');

renderSubSection('routes/matchRoutes.ts', 'ENDPOINTS (/api/v1/matches)');
renderRouteTable('POST', '/matches/scan-scoresheet', 'Auth: Any', 'AI-Powered OCR Scoresheet Scanner (Google Gemini)', 'FormData: file (scoresheet image/PDF), sport_type ("Basketball" | "Swimming" | "Track & Field")', 'Extracts structured player boxscore, jersey numbers, points, fouls, set scores, and times');
renderRouteTable('POST', '/matches', 'Auth: Coach/Official', 'Submit manual match data and player boxscore', 'JSON: { match_date, sport_type, opponent_name, location, player_stats: [...] }', 'Saves match session in Firestore and emits MATCH_LOGGED event');
renderRouteTable('POST', '/matches/official', 'Auth: Official/Coach', 'Create sanctioned tournament match fixture', 'JSON: { team_id, sport_type, match_date, location, opponent_team_name }, Header: Idempotency-Key', 'Creates official match and schedules official certification');
renderRouteTable('POST', '/matches/:matchId/scoresheet', 'Auth: Any', 'Attach scoresheet image/PDF to existing match', 'FormData: file (image/PDF)', 'Attaches file and triggers automated OCR extraction');
renderRouteTable('GET', '/matches/:matchId/boxscore', 'Auth: Any', 'Retrieve full player boxscore breakdown', 'None', 'Returns categorized points, rebounds, assists, fouls, shooting % for all players');
renderRouteTable('GET', '/matches/:matchId/details', 'Auth: Any', 'Get comprehensive match metadata and validation status', 'None', 'Returns match details, official seal, scoresheet URL, and team summaries');
renderRouteTable('POST', '/matches/:matchId/audit-request', 'Auth: Coach', 'Submit official stat contestation or match audit', 'JSON: { reason, disputed_stats: [...], notes }', 'Flags match for Tournament Official review');
renderRouteTable('GET', '/matches/:matchId/pdf', 'Auth: Coach', 'Generate & download official PDF Match Boxscore', 'None', 'Returns application/pdf stream with certified match report');
renderRouteTable('DELETE', '/matches/:matchId', 'Auth: Coach/Admin', 'Delete uncertified match log', 'None', 'Removes match and invalidates athlete stat caches');

renderSubSection('services/matchService.ts', 'GEMINI AI OCR ENGINE', 'WATERFALL PIPELINE');
renderItemCard('scanScoresheetStandalone(file) & processScoresheetOCR(...)', 'AI Vision Engine', 'Processes complex sports scoresheets using sharp pre-processing and Google Gemini API', [
  { label: 'Image Optimization', value: 'Sharp resizes image to max 2048px width, normalizes contrast, and converts to optimized JPEG buffer to minimize API latency' },
  { label: 'Gemini Waterfall Retry', value: 'Iterates sequentially through fallback models: gemini-3.5-flash-lite -> gemini-3.6-flash -> gemini-flash-latest -> gemini-pro-latest -> gemini-3.5-flash' },
  { label: 'Prompt Engineering', value: 'System prompt instructs Gemini to return strictly structured JSON with team names, final score, quarters/sets, and player table (jersey_number, player_name, points, fouls, rebounds, assists)' },
  { label: 'JSON Sanitization', value: 'Strips markdown code fences (```json ... ```) and parses extracted data with fallback error recovery' }
]);

renderSubSection('services/auditService.ts', 'PDF BOXSCORE GENERATOR', 'PDFKIT');
renderItemCard('generateMatchPdfBuffer(matchId)', 'PDF Report Engine', 'Generates professional vector PDF Match Boxscore document using pdfkit', [
  { label: 'Report Contents', value: 'Header banner with match date, sport, location, opposing teams, quarter-by-quarter score table, full player statistics table, official signature stamp, and certification QR code' }
]);

// =========================================================================
// CHAPTER 6: TOURNAMENT OFFICIALS & VALIDATION
// =========================================================================
renderChapterHeader('6', 'Tournament Officials & Validation Hub', 'Match validation queues, official certification, tournament dashboard');

renderSubSection('routes/officialRoutes.ts & validationRoutes.ts', 'ENDPOINTS');
renderRouteTable('GET', '/officials/dashboard', 'Auth: Official', 'Official operations dashboard summary', 'None', 'Returns scheduled matches, pending validations, recent audits, and notifications');
renderRouteTable('GET', '/officials/schedules', 'Auth: Official', 'Tournament match schedule and court/field assignments', 'Query: ?date=YYYY-MM-DD&sport=Basketball', 'Returns list of assigned matches');
renderRouteTable('GET', '/officials/notifications', 'Auth: Official', 'Tournament alerts and stat audit inquiries', 'None', 'Returns list of official notifications');
renderRouteTable('PATCH', '/officials/notifications/read-all', 'Auth: Official', 'Mark all official notifications as read', 'None', 'Updates unread notifications count to 0');
renderRouteTable('GET', '/validations/pending', 'Auth: Official', 'Fetch pending match scoresheets awaiting certification', 'None', 'Returns list of uncertified matches with uploaded scoresheets');
renderRouteTable('POST', '/validations/:validationId/certify', 'Auth: Official', 'Certify and seal official match results in Firestore', 'JSON: { context_notes, scoresheet_url }', 'Locks match data into official verified standings and invalidates leaderboard cache');

renderSubSection('services/validationService.ts', 'CERTIFICATION LIFECYCLE');
renderItemCard('certifyValidationService(validationId, officialId, payload)', 'Audit Seal', 'Certifies match scoresheet and permanently records official validation audit trail', [
  { label: 'Data Updates', value: 'Sets match validation_status = "CERTIFIED", records certified_by = officialId, certified_at = timestamp, context_notes = notes' },
  { label: 'Event Emitted', value: 'Emits MATCH_CERTIFIED event to trigger athlete stat recalculation and notification dispatch' }
]);

// =========================================================================
// CHAPTER 7: TEAMS, INQUIRIES, SPORTS & NOTIFICATIONS
// =========================================================================
renderChapterHeader('7', 'Teams, Inquiries, Sports & Notifications', 'Roster management, coach-athlete messaging, sports directory');

renderSubSection('routes/teamRoutes.ts', 'TEAMS & ROSTERS (/api/v1/teams)');
renderRouteTable('GET', '/teams', 'Auth: Any', 'Browse registered sports teams & clubs', 'Query: ?sport=Basketball&search=Tigers', 'Returns list of teams matching query');
renderRouteTable('POST', '/teams', 'Auth: Coach/Admin', 'Register a new team / squad', 'JSON: { name, sport_type, organization_school, division, logo_url }', 'Creates team document in Firestore and assigns creating coach');
renderRouteTable('GET', '/teams/:teamId', 'Auth: Any', 'Get team details, coach info, and roster', 'None', 'Returns team profile and list of active athlete members');
renderRouteTable('PATCH', '/teams/:teamId', 'Auth: Coach/Admin', 'Update team profile metadata', 'JSON: { name, division, logo_url }', 'Updates team record');
renderRouteTable('PATCH', '/teams/:teamId/roster', 'Auth: Coach', 'Add or remove athletes from team roster', 'JSON: { athlete_ids: string[], action: "ADD" | "REMOVE" }', 'Updates team roster array and updates each athlete current_team_id');

renderSubSection('routes/inquiryRoutes.ts', 'RECRUITMENT INQUIRIES (/api/v1/inquiries)');
renderRouteTable('POST', '/inquiries', 'Auth: Coach/Athlete', 'Send recruitment inquiry / scouting message thread', 'JSON: { receiver_id, athlete_id, subject, message, contact_phone }', 'Creates inquiry thread and notifies receiver');
renderRouteTable('GET', '/inquiries', 'Auth: Coach/Athlete', 'Fetch all inquiry threads for authenticated user', 'None', 'Returns list of active conversation threads with status');
renderRouteTable('PATCH', '/inquiries/:inquiryId/respond', 'Auth: Coach/Athlete', 'Respond to recruitment inquiry', 'JSON: { status: "ACCEPTED" | "DECLINED" | "IN_REVIEW", response_message }', 'Updates thread status and appends response message');

renderSubSection('routes/sportRoutes.ts', 'SPORTS DIRECTORY (/api/v1/sports)');
renderRouteTable('GET', '/sports', 'Auth: Any', 'List all supported sports, positions & metric schemas', 'Query: ?active_only=true', 'Returns sports catalog (Basketball, Swimming, Track & Field, etc.)');
renderRouteTable('GET', '/sports/:sportId', 'Auth: Any', 'Get specific sport configuration and metric keys', 'None', 'Returns metric keys, scoring rules, and positions list');
renderRouteTable('POST', '/sports', 'Auth: Admin', 'Add new sport category to system directory', 'JSON: { name, stat_schema, positions, scoring_rules }', 'Persists new sport configuration');
renderRouteTable('PATCH', '/sports/:sportId', 'Auth: Admin', 'Update sport rules and metric schema', 'JSON: { stat_schema, positions, active }', 'Updates existing sport schema');

renderSubSection('routes/notificationRoutes.ts', 'NOTIFICATIONS (/api/v1/notifications)');
renderRouteTable('GET', '/notifications', 'Auth: Any', 'Get user in-app notification inbox', 'Query: ?unread_only=true&limit=30', 'Returns array of notification objects with read status');
renderRouteTable('PATCH', '/notifications/read-all', 'Auth: Any', 'Mark all user notifications as read', 'None', 'Sets read = true on all unread notifications for current user');
renderRouteTable('PATCH', '/notifications/:notificationId/read', 'Auth: Any', 'Mark specific notification as read', 'None', 'Marks notification document as read');

// =========================================================================
// CHAPTER 8: OFFLINE SYNC ENGINE & EVENT BUS
// =========================================================================
renderChapterHeader('8', 'Offline Sync Engine & Event Architecture', 'Local-first mutation queue, idempotent batch sync, reactive event bus');

renderSubSection('routes/syncRoutes.ts & services/syncService.ts', 'OFFLINE SYNC');
renderRouteTable('POST', '/sync/offline-queue (or /batch)', 'Auth: Coach', 'Submit batch mutation queue from Coach offline app', 'JSON: { mutations: [ { id: "uuid", type: "LOG_MATCH"|"SRPE", payload: {...}, timestamp: 123 } ] }', 'Processes mutations idempotently, writes to Firestore, and returns sync result');
renderRouteTable('POST', '/sync/athlete-offline-queue', 'Auth: Athlete', 'Submit batch mutation queue from Athlete offline app', 'JSON: { mutations: [ { id: "uuid", type: "SRPE_ENTRY", payload: {...} } ] }', 'Processes offline sRPE logs idempotently');
renderRouteTable('GET', '/sync/coach-snapshot', 'Auth: Coach', 'Download full offline database snapshot for Coach app', 'None', 'Returns team roster, recent matches, athlete cards, and sports catalog for zero-latency local operations');
renderRouteTable('GET', '/sync/athlete-snapshot', 'Auth: Athlete', 'Download full offline snapshot for Athlete app', 'None', 'Returns personal stats, recent match logs, team details, and workload history');
renderRouteTable('GET', '/sync/status', 'Auth: Any', 'Check sync queue health and server timestamp', 'None', 'Returns server timestamp for clock drift calculation');

renderItemCard('processCoachOfflineBatchService & processAthleteOfflineBatchService', 'Idempotent Sync', 'Processes array of queued offline mutations without duplicate side-effects', [
  { label: 'Idempotency Guarantee', value: 'Checks mutation ID against processed_sync_mutations collection. If mutation ID already executed, returns cached result without re-executing' },
  { label: 'Conflict Resolution', value: 'Server timestamp wins on concurrent conflicting updates' }
]);

renderSubSection('utils/eventBus.ts', 'REACTIVE EVENT BUS');
renderItemCard('eventBus (EventEmitter Singleton)', 'Event Dispatcher', 'Decoupled event emitter for cross-service reactivity and automatic cache eviction', [
  { label: 'EVENTS.MATCH_LOGGED', value: 'Triggered when match is submitted -> Invalidates athlete career stats and home summaries' },
  { label: 'EVENTS.SRPE_LOGGED', value: 'Triggered when sRPE is logged -> Invalidates 28-day workload analytics cache' },
  { label: 'EVENTS.NOTIFICATION_CREATED', value: 'Triggered when notifications are created -> Updates badge counters' },
  { label: 'EVENTS.ATHLETE_UPDATED', value: 'Triggered on profile updates -> Evicts cached scouting index' }
]);

// =========================================================================
// CHAPTER 9: ERROR RESPONSES & FRONTEND BEST PRACTICES
// =========================================================================
renderChapterHeader('9', 'Error Codes & Frontend Integration Blueprints', 'HTTP status dictionary, Axios interceptors, state management tips');

renderSubSection('HTTP Status Code Dictionary', 'ERROR HANDLING');
const statusDict = [
  { code: '200 OK', meaning: 'Successful GET, PUT, or DELETE operation. Data returned in body.' },
  { code: '201 Created', meaning: 'Successful resource creation (e.g. registration, team creation, match submission).' },
  { code: '400 Bad Request', meaning: 'Validation error in request body or query params. Returns details array with field names.' },
  { code: '401 Unauthorized', meaning: 'Missing, malformed, or expired JWT Bearer token in Authorization header.' },
  { code: '403 Forbidden', meaning: 'Authenticated user lacks required role (e.g. Athlete trying to access Coach scouting).' },
  { code: '404 Not Found', meaning: 'Requested resource ID (athleteId, matchId, teamId) does not exist in Firestore.' },
  { code: '409 Conflict', meaning: 'Duplicate unique resource (e.g. email address already registered).' },
  { code: '429 Too Many Requests', meaning: 'Rate limit exceeded on authentication endpoints (> 5 requests/min). Retry after retry_after_seconds.' },
  { code: '500 Internal Error', meaning: 'Unhandled server exception. Server logs error and returns safe error message.' }
];

for (const s of statusDict) {
  checkPageSpace(25);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(s.code.startsWith('2') ? COLOR_SUCCESS : (s.code.startsWith('4') ? COLOR_WARNING : COLOR_DANGER))
     .text(s.code, 44, doc.y, { continued: true });
  doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_TEXT).text(` — ${s.meaning}`);
  doc.moveDown(0.25);
}

renderSubSection('Frontend Integration Best Practices', 'RECOMMENDATIONS');
doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_TEXT).text(
  '• Authentication Storage: Store the JWT token in secure storage (expo-secure-store for React Native or secure cookies/localStorage for web).\n' +
  '• Axios Interceptor: Attach an Authorization header interceptor to automatically inject Bearer <token> on every outbound request.\n' +
  '• Offline-First Strategy: When network is disconnected, queue mutations locally in SQLite / AsyncStorage with a unique UUID. Upon reconnecting, POST the queue to /api/v1/sync/offline-queue.\n' +
  '• Multipart Uploads: For document uploads and scoresheet scans, always use FormData with the correct field name (e.g. eligible_documents, professional_documents, file).\n' +
  '• sRPE Visual Graph: Use Acute:Chronic Workload Ratio (ACWR) returned by /api/v1/athletes/workload to render color-coded visual charts (Green = 0.8–1.3, Red = >1.5).',
  44, doc.y, { width: 505, lineGap: 3 }
);

// =========================================================================
// PAGE NUMBERING & FOOTER
// =========================================================================
const range = doc.bufferedPageRange();
for (let i = range.start; i < range.start + range.count; i++) {
  doc.switchToPage(i);
  doc.rect(36, 805, 523, 1).fill(COLOR_BORDER);
  doc.font('Helvetica').fontSize(7.5).fillColor(COLOR_MUTED).text(
    `Atleta Backend API & Function Specification • Page ${i + 1} of ${range.count} • Generated for Frontend Engineering Team`,
    36, 815, { width: 523, align: 'center' }
  );
}

doc.end();

writeStream.on('finish', () => {
  console.log(`✅ Ultra-comprehensive PDF successfully generated at: ${outputPath}`);
});
