import { ValidationError } from './userValidator';

const VALID_SPORTS = ['Basketball', 'Swimming', 'Track & Field'];
const VALID_RESULTS = ['WIN', 'LOSS'];

/**
 * Validates official match creation payload (POST /api/v1/matches/official).
 */
export function validateCreateOfficialMatch(
  data: Record<string, unknown>,
  idempotencyKey?: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Idempotency-Key header check
  if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
    errors.push({
      field: 'Idempotency-Key',
      message: 'Idempotency-Key header is required on official match creation.',
    });
  }

  // team_id / home_team_id (Required)
  const teamId = typeof data.team_id === 'string' ? data.team_id.trim() : (typeof data.home_team_id === 'string' ? data.home_team_id.trim() : '');
  if (!teamId) {
    errors.push({ field: 'team_id', message: 'Team ID (team_id or home_team_id) is required.' });
  }

  // sport_type (Required)
  const sportType = typeof data.sport_type === 'string' ? data.sport_type.trim() : '';
  if (!sportType) {
    errors.push({ field: 'sport_type', message: 'Sport type (sport_type) is required.' });
  } else if (!VALID_SPORTS.includes(sportType)) {
    errors.push({
      field: 'sport_type',
      message: `Invalid sport_type '${sportType}'. Must be one of: ${VALID_SPORTS.join(', ')}.`,
    });
  }

  // match_date (Required)
  if (!data.match_date) {
    errors.push({ field: 'match_date', message: 'Match date (match_date) is required.' });
  }

  // location (Required)
  const location = typeof data.location === 'string' ? data.location.trim() : '';
  if (!location) {
    errors.push({ field: 'location', message: 'Location is required.' });
  }

  // opponent_team_name / away_team_name (Required)
  const opponent = typeof data.opponent_team_name === 'string' ? data.opponent_team_name.trim() : (typeof data.away_team_id === 'string' ? data.away_team_id.trim() : '');
  if (!opponent) {
    errors.push({ field: 'opponent_team_name', message: 'Opponent team name or away team ID is required.' });
  }

  return errors;
}

/**
 * Validates validation certification payload (POST /api/v1/validations/:validationId/certify).
 */
export function validateCertifyValidation(data: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (data.context_notes !== undefined && typeof data.context_notes !== 'string') {
    errors.push({ field: 'context_notes', message: 'context_notes must be a string.' });
  }

  if (data.scoresheet_url !== undefined && typeof data.scoresheet_url !== 'string') {
    errors.push({ field: 'scoresheet_url', message: 'scoresheet_url must be a string URL.' });
  }

  return errors;
}
