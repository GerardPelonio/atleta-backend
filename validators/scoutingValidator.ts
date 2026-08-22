import { ValidationError } from './userValidator';
import { ServiceError } from './matchValidator';

/**
 * Validates recruitment proposal dispatch request payload.
 */
export function validateProposalSubmission(data: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  const athleteId = typeof data.athlete_id === 'string' ? data.athlete_id.trim() : '';
  if (!athleteId) {
    errors.push({ field: 'athlete_id', message: 'Athlete ID (athlete_id) is required.' });
  }

  if (data.offer_details !== undefined && data.offer_details !== null) {
    if (typeof data.offer_details !== 'string') {
      errors.push({ field: 'offer_details', message: 'Offer details must be a string.' });
    }
  }

  return errors;
}

/**
 * Validates athlete search query parameters.
 */
export function validateScoutingParams(query: Record<string, unknown>): void {
  if (query.minPER !== undefined && query.minPER !== null && query.minPER !== '') {
    const parsed = parseFloat(query.minPER as string);
    if (isNaN(parsed)) {
      throw new ServiceError('minPER must be a valid number.', 400);
    }
  }
}
