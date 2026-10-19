// User roles enum
export type UserRole = 'Athlete' | 'Coach' | 'Official' | 'System Admin' | 'SystemAdmin';

// Account status enum for coach accreditation and user approval
export type UserAccountStatus = 'Pending' | 'Active' | 'Rejected';

// Base user stored in the "Users" collection
export interface User {
  user_id: string;
  first_name?: string;
  last_name?: string;
  full_name?: string | null;
  full_legal_name?: string | null;
  email: string;
  contact_number?: string | null;
  role: UserRole;
  provider?: 'google' | 'password' | string;
  avatar_url?: string | null;
  account_status?: UserAccountStatus;
  password?: string;
  password_hash?: string;
  created_at: Date | string;
  updated_at: Date | string;
  [key: string]: any;
}

// Eligibility documents sub-structure
export interface AthleteEligibilityDocuments {
  psa_verified: boolean;
  academic_check: boolean;
  proof_of_residency: boolean;
  document_urls?: string[];
  [key: string]: any;
}

// Athlete achievement sub-structure
export interface AthleteAchievementItem {
  title: string;
  year: number | string;
  content: string;
  [key: string]: any;
}

// Athlete_Profiles Subtype
export interface AthleteProfile {
  athlete_id: string;
  user_id: string;
  first_name?: string;
  last_name?: string;
  gender: string;
  birthdate: string; // Date (YYYY-MM-DD)
  province: string;
  sports_type: string;
  sport_type?: string; // Operational alias
  position: string;
  jersey_number?: number | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  avatar_url?: string | null;
  recruitment_status?: 'Available' | 'Recruited' | string | null;
  leaderboard_rank?: number;
  rank?: string | number | null;
  physical_profile?: {
    height_cm: number;
    weight_kg: number;
    wingspan_cm: number;
  } | null;
  eligibility_documents?: AthleteEligibilityDocuments | null;
  achievements?: AthleteAchievementItem[] | null;
  computed_metrics?: {
    bmi: number;
    ape_index: number;
  } | null;
  workload_analytics?: any;
  workload?: any;
  workload_target?: any;
  created_at: Date | string;
  updated_at: Date | string;
  [key: string]: any;
}

// Coach managed athlete reference
export interface CoachAthleteManagedRef {
  athlete_id: string;
  full_name: string;
}

// Coach system statistics
export interface CoachSystemStatistics {
  metric_logs: number;
  total_records: number;
  total_athletes?: number;
}

// Coach_Profiles Subtype
export interface CoachProfile {
  coach_id: string;
  user_id: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email?: string;
  account_status?: 'Active' | 'Inactive' | UserAccountStatus | string;
  sport_type?: string;
  years_of_experience: number;
  current_institution: string;
  regional_affiliation?: string | null;
  national_sports_league?: string | null;
  team_id?: string | null;
  teams_managed?: string[];
  athletes_managed?: CoachAthleteManagedRef[];
  athlete_managed?: string[]; // Operational alias for array of athlete UUIDs
  matches_logged?: number;
  total_matches_logged?: number;
  professional_documents?: string[];
  profile_image?: string | null;
  avatar_url?: string | null; // Operational alias
  quote?: string | null;
  system_statistics?: CoachSystemStatistics;
  certification_license_num?: string | null;
  specialties?: string[];
  created_at: Date | string;
  updated_at: Date | string;
  [key: string]: any;
}

// Admin Audit Log entity for coach accreditation decision
export interface CoachAccreditationAuditLog {
  audit_log_id: string;
  admin_id: string;
  coach_id: string;
  action: 'APPROVED' | 'REJECTED';
  rejection_reason?: string;
  timestamp: Date | string;
}

export interface RejectCoachDto {
  rejection_reason: string;
}

// Official_Profiles Subtype
export interface OfficialProfile {
  official_id: string;
  user_id: string;
  organization_name: string;
  official_license_number?: string;
  certification_status: 'Pending' | 'Certified' | 'Verified' | string;
  assigned_tournaments?: string[];
  is_active?: boolean;
  avatar_url?: string | null;
  profile_image?: string | null;
  settings?: any[];
  created_at: Date | string;
  updated_at: Date | string;
  [key: string]: any;
}

// Official_Settings Entity
export interface OfficialSettings {
  setting_id: string;
  official_id: string;
  split_screen_defaults: boolean;
  discrepancy_presets: boolean;
  match_reminders: boolean;
  audit_notifications?: boolean;
  auto_refresh?: boolean;
  autoRefreshMatchQueue?: boolean;
  autoRefresh?: boolean;
  updated_at: Date | string;
}

// Official Registration request body
export interface RegisterOfficialDto {
  full_legal_name: string;
  email: string;
  password: string;
  organization_name: string;
}

// Update Official settings preferences
export interface UpdateOfficialSettingsDto {
  split_screen_defaults?: boolean;
  discrepancy_presets?: boolean;
  match_reminders?: boolean;
  audit_notifications?: boolean;
  auto_refresh?: boolean;
  autoRefreshMatchQueue?: boolean;
  autoRefresh?: boolean;
}

// Admin_Profiles Subtype Entity
export interface AdminProfile {
  admin_id: string;
  user_id: string;
  full_name?: string;
  email?: string;
  department_code: string;
  institution?: string;
  clearance_level: number;
  is_active: boolean;
  is_elevated?: boolean;
  permissions?: string[];
  admin_security_key?: string;
  created_at: Date | string;
  updated_at?: Date | string;
  [key: string]: any;
}

// System Admin DTOs
export interface RegisterAdminDto {
  full_name: string;
  email: string;
  password: string;
  department_code: string;
  clearance_level?: number;
  rbac_compliance_accepted: boolean;
}

export interface LoginAdminDto {
  email: string;
  password: string;
}

// Maps role to its Firestore collection name
export const ROLE_COLLECTION_MAP: Record<UserRole, string> = {
  'Athlete': 'Athlete_Profiles',
  'Coach': 'Coach_Profiles',
  'Official': 'Official_Profiles',
  'System Admin': 'Admin_Profiles',
  'SystemAdmin': 'Admin_Profiles',
};

// Maps role to its granular permission scopes
export const ROLE_PERMISSIONS_MAP: Record<UserRole, string[]> = {
  'Athlete': ['read:profile', 'update:profile', 'read:stats', 'view:notifications'],
  'Coach': ['read:profile', 'update:profile', 'manage:athletes', 'certify:matches'],
  'Official': ['read:profile', 'certify:matches', 'manage:tournaments'],
  'System Admin': ['*'],
  'SystemAdmin': ['*'],
};

// Registration request body
export interface RegisterUserDto {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  contact_number?: string;
  role: UserRole;

  // Athlete Subtype fields
  birthdate?: string;
  gender?: string;
  province?: string;
  sport_type?: string;
  recruitment_status?: string;
  rank?: string | number;
  physical_profile?: {
    height_cm: number;
    weight_kg: number;
    wingspan_cm: number;
  };
  eligibility_documents?: {
    psa_verified: boolean;
    academic_check: boolean;
    proof_of_residency: boolean;
    document_urls: string[];
  };
  achievements?: {
    title: string;
    year: string;
    content: string;
  }[];

  // Coach Subtype fields
  professional_documents?: string[];
  years_of_experience?: number;
  current_institution?: string;
  athlete_managed?: string[];

  // Official Subtype fields
  tournament_affiliation?: string;

  // System Admin Subtype fields
  admin_security_key?: string;
}

// Login request body
export interface LoginUserDto {
  email: string;
  password: string;
}

// Password reset request body
export interface PasswordResetRequestDto {
  email: string;
}

// Password reset confirmation body
export interface PasswordResetConfirmDto {
  token: string;
  new_password: string;
}

// ─── Coach Settings Entity ──────────────────────────────────────────────────

export interface CoachSettings {
  setting_id: string;             // Primary Key, Required
  coach_id: string;               // Foreign Key -> Coach_Profiles.coach_id, Required
  data_sync_preference: 'Manual' | 'Automatic'; // Default: "Manual"
  notification_preferences: {
    game_log_updates: boolean;     // Default: true
    recruitment_inquiries: boolean; // Default: true
  };
  updated_at: Date | string;      // DateTime Required
}

// Coach registration DTO requiring professional certification documents
export interface RegisterCoachDto {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  contact_number?: string;
  years_of_experience?: number;
  current_institution?: string;
  professional_documents: string[]; // Minimum 1 document URL required
  sport_type?: string;
}

// Update coach profile DTO
export interface UpdateCoachProfileDto {
  first_name?: string;
  last_name?: string;
  sport_type?: string;
  professional_documents?: string[];
}

// Update coach settings DTO
export interface UpdateCoachSettingsDto {
  data_sync_preference?: 'Manual' | 'Automatic';
  notification_preferences?: {
    game_log_updates?: boolean;
    recruitment_inquiries?: boolean;
  };
}

// Change password DTO requiring current password verification
export interface ChangeCoachPasswordDto {
  current_password: string;
  new_password: string;
}

// ─── Official Notification & Schedule Entities ────────────────────────────────

export interface OfficialNotification {
  notification_id: string;
  official_id: string;
  type: 'AUDIT_REQUEST' | 'SCHEDULE_UPDATE';
  title: string;
  message: string;
  reference_id?: string | null;
  is_read: boolean;
  created_at: string | Date;
}

export interface OfficialSchedule {
  schedule_id: string;
  match_id: string;
  official_id: string;
  venue: string;
  court_number: string | number;
  scheduled_time: string;
  month: number;
  year: number;
  assigned_officials: string[];
  venue_logistics?: string | null;
}

