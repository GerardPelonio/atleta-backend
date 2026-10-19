import { db } from './firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';

export type EntityIdPrefix =
  | 'MATCH'
  | 'TEAM'
  | 'ATHLETE'
  | 'OFFICIAL'
  | 'COACH'
  | 'VAL'
  | 'SPORT'
  | 'METRIC'
  | 'AUDIT'
  | 'INQUIRY'
  | 'NOTIF';

/**
 * Standardizes ID naming conventions across the Atleta system.
 * Format: [PREFIX]-[001, 002, 003...]
 *
 * Example:
 * - MATCH-001, MATCH-002
 * - TEAM-001, TEAM-002
 * - ATHLETE-001, ATHLETE-002
 * - VAL-001 (Official Audits / Validations)
 * - SPORT-001
 */
export async function generateStandardId(prefix: EntityIdPrefix | string): Promise<string> {
  const normalizedPrefix = String(prefix).trim().toUpperCase();

  try {
    if (db && typeof db.collection === 'function') {
      const counterRef = db.collection('System_Counters').doc(normalizedPrefix);
      
      // Atomically increment counter
      await counterRef.set(
        {
          count: FieldValue.increment(1),
          updated_at: new Date().toISOString(),
        },
        { merge: true }
      );

      const counterDoc = await counterRef.get();
      const currentCount = counterDoc.data()?.count || 1;
      const paddedIndex = String(currentCount).padStart(3, '0');

      return `${normalizedPrefix}-${paddedIndex}`;
    }
  } catch (err: any) {
    console.warn(`⚠️ [idGenerator] Firestore counter fallback for ${normalizedPrefix}:`, err?.message || err);
  }

  // Fallback if database counter is unreachable
  const randomSuffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${normalizedPrefix}-${randomSuffix}`;
}

/**
 * Normalizes an arbitrary ID into the clean standard format.
 * Examples:
 * - '#match_001' -> 'MATCH-001'
 * - 'match_123' -> 'MATCH-123'
 * - 'team_knights' -> 'TEAM-KNIGHTS'
 * - 'VAL_001' -> 'VAL-001'
 */
export function normalizeStandardId(rawId: string, fallbackPrefix: EntityIdPrefix = 'MATCH'): string {
  if (!rawId) return '';
  const clean = String(rawId).replace(/^#/, '').trim();

  // If already matches Standard ID format: PREFIX-001
  if (/^[A-Z0-9]+-[A-Z0-9]+$/i.test(clean)) {
    const [p, ...rest] = clean.split('-');
    return `${p.toUpperCase()}-${rest.join('-')}`;
  }

  // If underscore delimited: match_001 -> MATCH-001
  if (clean.includes('_')) {
    const parts = clean.split('_');
    const p = parts[0].toUpperCase();
    const rest = parts.slice(1).join('_');
    return `${p}-${rest}`;
  }

  return `${fallbackPrefix}-${clean}`;
}

/**
 * Validates if an ID matches standard Atleta format.
 */
export function isStandardId(id: string): boolean {
  if (!id) return false;
  return /^[A-Z]+-[A-Z0-9]{3,}$/.test(id.trim());
}
