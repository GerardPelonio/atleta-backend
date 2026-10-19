import { ValidationError } from './userValidator';

/**
 * Validates team creation request payload (POST /api/v1/teams).
 */
export function validateCreateTeam(data: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  // team_name (Required, Max 255)
  const teamName = typeof data.team_name === 'string' ? data.team_name.trim() : '';
  if (!teamName) {
    errors.push({ field: 'team_name', message: 'Team name is required.' });
  } else if (teamName.length > 255) {
    errors.push({ field: 'team_name', message: 'Team name must not exceed 255 characters.' });
  }

  // sport_type (Required)
  const sportType = typeof data.sport_type === 'string' ? data.sport_type.trim() : '';
  if (!sportType) {
    errors.push({ field: 'sport_type', message: 'Sport category (sport_type) is required.' });
  }

  // division (Optional, defaults to "Varsity Division" if omitted)
  // No error if empty or omitted

  return errors;
}

/**
 * Validates squad roster update payload (PATCH /api/v1/teams/:teamId/roster).
 */
export function validateUpdateRoster(data: Record<string, unknown> | any[]): ValidationError[] {
  const errors: ValidationError[] = [];

  const roster = Array.isArray(data) ? data : (data.roster || data.roster_list || data.roster_updates);
  if (!roster || !Array.isArray(roster)) {
    errors.push({ field: 'roster', message: 'Roster must be an array of player objects (or provided as {"roster": [...]} or {"roster_list": [...]}).' });
  } else {
    const seenAthletes = new Set<string>();
    const seenJerseys = new Set<string | number>();

    for (let i = 0; i < roster.length; i++) {
      const item = roster[i];
      if (!item || typeof item !== 'object' || (!item.athlete_id && !item.user_id)) {
        errors.push({
          field: `roster[${i}].athlete_id`,
          message: 'Each roster item must contain a valid athlete_id or user_id string.',
        });
      } else {
        const athleteId = String(item.athlete_id || item.user_id).trim();
        if (seenAthletes.has(athleteId)) {
          errors.push({
            field: `roster[${i}].athlete_id`,
            message: `Duplicate athlete ID '${athleteId}' found in roster.`,
          });
        }
        seenAthletes.add(athleteId);

        if (item.jersey_number !== undefined && item.jersey_number !== null && item.jersey_number !== '') {
          const jersey = String(item.jersey_number).trim();
          if (seenJerseys.has(jersey)) {
            errors.push({
              field: `roster[${i}].jersey_number`,
              message: `Duplicate jersey number '${jersey}' found in roster.`,
            });
          }
          seenJerseys.add(jersey);
        }
      }
    }
  }

  return errors;
}
