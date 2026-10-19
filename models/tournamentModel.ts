// ─── Tournament Registry & Bracketing Entity ─────────────────────────────────────────────
// Stored in Firestore "Tournaments", "Tournament_Brackets", or "Tournament_Registry" collections.

export interface BracketTeamSlot {
  team_id?: string;
  team_name: string;
  seed?: number;
  score?: number;
  is_winner?: boolean;
}

export interface BracketMatch {
  match_id: string;
  round_number: number;
  stage_name: 'Quarterfinals' | 'Semifinals' | 'Finals' | 'Third Place' | string;
  home_team: BracketTeamSlot;
  away_team: BracketTeamSlot;
  winner_team_name?: string;
  winner_team_id?: string;
  status: 'PENDING' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED';
  next_match_id?: string;
  slot_for_next?: 'home' | 'away';
  match_date?: string;
  venue?: string;
}

export interface BracketStage {
  stage_name: string;
  round_number: number;
  matches: BracketMatch[];
}

export interface TournamentBracket {
  bracket_id: string;
  tournament_name: string;
  sport_type: string;
  division?: string;
  format: 'single_elimination' | 'round_robin';
  status: 'Draft' | 'Active' | 'Completed';
  stages: BracketStage[];
  champion_team?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

export interface TournamentRegistry {
  org_id: string;
  name: string;
  organization_name: string;
  registered_by: string;
  status: 'Active' | 'Inactive' | string;
  created_at: string;
  updated_at?: string;
  [key: string]: any;
}

export interface RegisterTournamentDto {
  name: string;
  organization_name?: string;
  registered_by: string;
  status?: 'Active' | 'Inactive';
}
