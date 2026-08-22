import { ValidationError } from './userValidator';

export class ServiceError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, ServiceError.prototype);
  }
}

const VALID_SPORTS = ['Basketball', 'Swimming', 'Track & Field'];
const VALID_RESULTS = ['WIN', 'LOSS'];

/**
 * Validates match submission payload (POST /api/v1/matches).
 * ACCEPTANCE CRITERIA: Require Idempotency-Key header on POST submissions.
 */
export function validateSubmitMatch(
  data: Record<string, unknown>,
  idempotencyKey?: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Idempotency-Key header check
  if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
    errors.push({
      field: 'Idempotency-Key',
      message: 'Idempotency-Key header is required on match submissions to prevent duplicate creation.',
    });
  }

  // team_id (Required)
  const teamId = typeof data.team_id === 'string' ? data.team_name || data.team_id : '';
  if (!data.team_id || typeof data.team_id !== 'string' || (data.team_id as string).trim().length === 0) {
    errors.push({ field: 'team_id', message: 'Team ID (team_id) is required.' });
  }

  // sport_type (Required)
  const sportType = typeof data.sport_type === 'string' ? data.sport_type.trim() : '';
  if (!sportType) {
    errors.push({ field: 'sport_type', message: 'Sport category (sport_type) is required.' });
  }

  // match_type (Required, e.g., "Tournament", "Friendly")
  const matchType = typeof data.match_type === 'string' ? data.match_type.trim() : '';
  if (!matchType) {
    errors.push({ field: 'match_type', message: 'Match type (match_type) is required.' });
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

  // opponent_team_name (Required)
  const opponent = typeof data.opponent_team_name === 'string' ? data.opponent_team_name.trim() : '';
  if (!opponent) {
    errors.push({ field: 'opponent_team_name', message: 'Opponent team name (opponent_team_name) is required.' });
  }

  // game_result (Required: Enum "WIN" | "LOSS")
  const gameResult = typeof data.game_result === 'string' ? data.game_result.trim().toUpperCase() : '';
  if (!gameResult) {
    errors.push({ field: 'game_result', message: 'Game result (game_result) is required.' });
  } else if (!VALID_RESULTS.includes(gameResult)) {
    errors.push({ field: 'game_result', message: 'Game result must be either "WIN" or "LOSS".' });
  }

  // player_stats (Required array)
  if (!data.player_stats || !Array.isArray(data.player_stats)) {
    errors.push({ field: 'player_stats', message: 'player_stats array is required.' });
  }

  return errors;
}

/**
 * Validates scoresheet file upload.
 * ACCEPTANCE CRITERIA: File uploads over 25MB return HTTP 413 Payload Too Large.
 */
export function validateScoresheetUpload(file?: Express.Multer.File) {
  if (!file) {
    throw new ServiceError('No scoresheet file uploaded. Please attach an image, PDF, or CSV file.', 400);
  }

  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
  if (file.size > MAX_FILE_SIZE) {
    throw new ServiceError('Payload Too Large. Upload file size exceeds 25MB limit.', 413);
  }
}
