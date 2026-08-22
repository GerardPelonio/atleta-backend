// ─── sRPE Input Validator ────────────────────────────────────────────────────
// Validates POST /api/v1/analytics/srpe request body.

export interface SrpeValidationError {
  field: string;
  message: string;
}

export interface SrpeInputPayload {
  athlete_id: string;
  session_duration_mins: number;
  srpe_score: number;
  entry_date: string;
}

/**
 * Validate sRPE log input.
 * Returns an array of validation errors. Empty array = valid.
 */
export function validateSrpeInput(body: Record<string, unknown>): SrpeValidationError[] {
  const errors: SrpeValidationError[] = [];

  // athlete_id
  if (!body.athlete_id || typeof body.athlete_id !== 'string' || (body.athlete_id as string).trim().length === 0) {
    errors.push({ field: 'athlete_id', message: 'athlete_id is required and must be a non-empty string.' });
  }

  // session_duration_mins
  const duration = Number(body.session_duration_mins);
  if (!body.session_duration_mins || isNaN(duration) || !Number.isInteger(duration) || duration <= 0) {
    errors.push({ field: 'session_duration_mins', message: 'session_duration_mins is required and must be a positive integer greater than 0.' });
  }

  // srpe_score (ACCEPTANCE CRITERIA: values outside 1–10 return 400 Bad Request)
  const srpe = Number(body.srpe_score);
  if (body.srpe_score === undefined || body.srpe_score === null || isNaN(srpe)) {
    errors.push({ field: 'srpe_score', message: 'srpe_score is required and must be an integer between 1 and 10.' });
  } else if (!Number.isInteger(srpe) || srpe < 1 || srpe > 10) {
    errors.push({ field: 'srpe_score', message: 'srpe_score must be an integer between 1 and 10 (hardness rating scale). Values outside this range are not accepted.' });
  }

  // entry_date
  if (!body.entry_date || typeof body.entry_date !== 'string') {
    errors.push({ field: 'entry_date', message: 'entry_date is required and must be a valid date string (YYYY-MM-DD).' });
  } else {
    const parsed = Date.parse(body.entry_date as string);
    if (isNaN(parsed)) {
      errors.push({ field: 'entry_date', message: 'entry_date must be a valid ISO date string (e.g. "2026-08-04").' });
    }
  }

  return errors;
}
