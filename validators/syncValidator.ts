import { OfflineSyncBatchRequest, OfflineTransaction, OfflineTransactionType } from '../models/syncModel';

const VALID_COACH_ACTIONS: OfflineTransactionType[] = [
  'CREATE_MATCH',
  'LOG_METRIC',
  'LOG_SRPE',
  'UPDATE_ROSTER',
  'SEND_PROPOSAL',
  'REQUEST_AUDIT',
];

const VALID_ATHLETE_ACTIONS: OfflineTransactionType[] = [
  'UPDATE_PROFILE',
  'LOG_WORKOUT',
  'SUBMIT_DOCUMENT_METADATA',
  'SEND_INQUIRY',
  'RESPOND_OFFER',
];

/**
 * Validate incoming offline synchronization batch request.
 */
export function validateSyncBatchRequest(data: unknown): string[] {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    errors.push('Batch sync request body must be a JSON object.');
    return errors;
  }

  const req = data as Partial<OfflineSyncBatchRequest>;

  if (!req.user_id || typeof req.user_id !== 'string' || req.user_id.trim() === '') {
    errors.push('user_id is required and must be a non-empty string.');
  }

  if (!req.user_role || (req.user_role !== 'Coach' && req.user_role !== 'Athlete' && req.user_role !== 'Official')) {
    errors.push('user_role is required and must be "Coach", "Athlete", or "Official".');
  }

  if (!req.transactions || !Array.isArray(req.transactions)) {
    errors.push('transactions is required and must be an array.');
  } else if (req.transactions.length === 0) {
    errors.push('transactions array must contain at least one queued offline transaction.');
  } else {
    req.transactions.forEach((tx, idx) => {
      const txErrors = validateOfflineTransaction(tx, req.user_role);
      txErrors.forEach((err) => errors.push(`transactions[${idx}]: ${err}`));
    });
  }

  return errors;
}

/**
 * Validate a single queued offline transaction.
 */
export function validateOfflineTransaction(
  tx: unknown,
  expectedRole?: 'Coach' | 'Athlete' | 'Official',
): string[] {
  const errors: string[] = [];

  if (!tx || typeof tx !== 'object') {
    errors.push('Transaction must be an object.');
    return errors;
  }

  const t = tx as Partial<OfflineTransaction>;

  if (!t.transaction_id || typeof t.transaction_id !== 'string' || t.transaction_id.trim() === '') {
    errors.push('transaction_id is required and must be a non-empty UUID string.');
  }

  if (!t.client_timestamp || isNaN(new Date(t.client_timestamp).getTime())) {
    errors.push('client_timestamp is required and must be a valid ISO DateTime string.');
  }

  if (!t.payload || typeof t.payload !== 'object') {
    errors.push('payload is required and must be an object containing mutation parameters.');
  }

  const validActions = expectedRole === 'Athlete'
    ? VALID_ATHLETE_ACTIONS
    : expectedRole === 'Coach'
    ? VALID_COACH_ACTIONS
    : [...VALID_COACH_ACTIONS, ...VALID_ATHLETE_ACTIONS];

  if (!t.action_type || !validActions.includes(t.action_type as OfflineTransactionType)) {
    errors.push(`Invalid action_type '${t.action_type}'. Valid actions for ${expectedRole || 'user'}: ${validActions.join(', ')}.`);
  }

  return errors;
}
