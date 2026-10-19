// ─── Offline Synchronization & Local Caching Models ─────────────────────────
// Backed by SQLite / Client Persistence on mobile and Firebase Cloud Firestore on backend.

export type CoachOfflineTransactionType =
  | 'CREATE_MATCH'
  | 'LOG_METRIC'
  | 'LOG_SRPE'
  | 'UPDATE_ROSTER'
  | 'SEND_PROPOSAL'
  | 'REQUEST_AUDIT';

export type AthleteOfflineTransactionType =
  | 'UPDATE_PROFILE'
  | 'LOG_WORKOUT'
  | 'SUBMIT_DOCUMENT_METADATA'
  | 'SEND_INQUIRY'
  | 'RESPOND_OFFER';

export type OfflineTransactionType = CoachOfflineTransactionType | AthleteOfflineTransactionType;

export type SyncStatus = 'PENDING' | 'SYNCED' | 'CONFLICT' | 'REPLAYED' | 'FAILED';

export interface OfflineTransaction {
  transaction_id: string;          // Primary Key, UUID generated on client
  user_id: string;                 // Foreign Key -> Users.user_id (Coach or Athlete)
  user_role: 'Coach' | 'Athlete' | 'Official' | 'SystemAdmin';
  action_type: OfflineTransactionType;
  payload: Record<string, any>;    // Mutation payload (MatchLog, PerformanceMetric, sRPE, Profile update, etc.)
  client_timestamp: string;        // ISO DateTime string when action occurred offline
  status?: SyncStatus;             // Server-assigned sync state
  synced_at?: string;              // ISO DateTime string when processed by backend
  server_result?: any;             // Output produced by the backend execution
  error_message?: string | null;   // Error details if failed or rejected
}

export interface OfflineSyncBatchRequest {
  user_id: string;                 // Required
  user_role: 'Coach' | 'Athlete' | 'Official';
  client_sync_timestamp: string;   // ISO DateTime string when batch flush initiated
  device_id?: string;              // Optional mobile client identifier
  transactions: OfflineTransaction[]; // Ordered array of queued offline mutations
}

export interface SyncTransactionResult {
  transaction_id: string;
  action_type: OfflineTransactionType;
  status: SyncStatus;
  synced_at: string;
  result?: any;
  error?: string | null;
}

export interface OfflineSyncBatchResponse {
  batch_id: string;
  user_id: string;
  total_processed: number;
  successful_count: number;
  failed_count: number;
  replayed_count: number;
  results: SyncTransactionResult[];
  last_server_timestamp: string;
}

// ─── Offline Pre-fetch Snapshot Packages ─────────────────────────────────────

export interface CoachOfflineSnapshot {
  snapshot_timestamp: string;
  cache_version: string;
  etag: string;
  coach_profile: any;
  teams: any[];
  rosters: Record<string, any[]>; // Map of team_id -> AthleteFullProfile[]
  sports_configurations: any[];  // Multi-sport dynamic metric schemas
  scheduled_matches: any[];
  recent_workload_logs: any[];
}

export interface AthleteOfflineSnapshot {
  snapshot_timestamp: string;
  cache_version: string;
  etag: string;
  athlete_profile: any;
  career_stats: any;
  grouped_matches: any;
  workload_summary: any;
  team_summary: any;
  registered_sports: any[];
}
