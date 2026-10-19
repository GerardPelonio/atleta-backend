import React, { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react';
import {
  AthleteDiscoveryItem,
  ScoutingProposalItem,
  DiscoveryTeamItem,
  DiscoveryEventItem,
  DiscoveryMatchItem,
  DiscoveryTab,
  SportCategoryFilter,
  AdvancedAthleteFilters,
  DEFAULT_ADVANCED_FILTERS,
  matchesAthleteFilters,
  getDefaultMetricForSport,
} from './discoveryTypes';
import { requestAuthenticatedJson, clearAuthMicroCache } from '../../Authentication/authShared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMatchesOfflineFirst } from '../../../../services/firebaseClient';

const DISCOVERY_CACHE_KEY = 'atleta_discovery_snapshot_cache_v2';
const DISCOVERY_CACHE_TTL_MS = 5000; // 5s snappy TTL to prevent stale discovery views

let discoveryMemoryCache: {
  athletes: AthleteDiscoveryItem[];
  rankingAthletes: AthleteDiscoveryItem[];
  proposals: ScoutingProposalItem[];
  teams: DiscoveryTeamItem[];
  events: DiscoveryEventItem[];
  lastFetched: number;
} | null = null;

export function clearDiscoveryMemoryCache() {
  discoveryMemoryCache = null;
}

interface DiscoveryContextType {
  athletes: AthleteDiscoveryItem[];
  rankingAthletes: AthleteDiscoveryItem[];
  scoutingProposals: ScoutingProposalItem[];
  teams: DiscoveryTeamItem[];
  events: DiscoveryEventItem[];
  activeTab: DiscoveryTab;
  setActiveTab: (tab: DiscoveryTab) => void;
  activeSportFilter: SportCategoryFilter;
  setActiveSportFilter: (sport: SportCategoryFilter) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedAthlete: AthleteDiscoveryItem | null;
  setSelectedAthlete: (athlete: AthleteDiscoveryItem | null) => void;
  selectedTeam: DiscoveryTeamItem | null;
  setSelectedTeam: (team: DiscoveryTeamItem | null) => void;
  selectedMatch: DiscoveryMatchItem | null;
  setSelectedMatch: (match: DiscoveryMatchItem | null) => void;
  scoutAthlete: (athlete: AthleteDiscoveryItem) => void;
  filteredAthletes: AthleteDiscoveryItem[];
  filteredTeams: DiscoveryTeamItem[];
  filteredEvents: DiscoveryEventItem[];
  sortRecruits: 'date' | 'status';
  setSortRecruits: (sort: 'date' | 'status') => void;
  isLoading: boolean;
  refreshDiscovery: () => Promise<void>;
  advancedFilters: AdvancedAthleteFilters;
  setAdvancedFilters: React.Dispatch<React.SetStateAction<AdvancedAthleteFilters>>;
  resetAdvancedFilters: () => void;
  activeFilterCount: number;
}

const DiscoveryContext = createContext<DiscoveryContextType | undefined>(undefined);

export const DiscoveryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [athletes, setAthletes] = useState<AthleteDiscoveryItem[]>(discoveryMemoryCache?.athletes || []);
  const [rankingAthletes, setRankingAthletes] = useState<AthleteDiscoveryItem[]>(discoveryMemoryCache?.rankingAthletes || []);
  const [scoutingProposals, setScoutingProposals] = useState<ScoutingProposalItem[]>(discoveryMemoryCache?.proposals || []);
  const [teams, setTeams] = useState<DiscoveryTeamItem[]>(discoveryMemoryCache?.teams || []);
  const [events, setEvents] = useState<DiscoveryEventItem[]>(discoveryMemoryCache?.events || []);

  const [activeTab, setActiveTab] = useState<DiscoveryTab>('PLAYERS');
  const [activeSportFilter, setActiveSportFilter] = useState<SportCategoryFilter>('BASKETBALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedAthlete, setSelectedAthlete] = useState<AthleteDiscoveryItem | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<DiscoveryTeamItem | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<DiscoveryMatchItem | null>(null);
  const [sortRecruits, setSortRecruits] = useState<'date' | 'status'>('date');
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedAthleteFilters>(DEFAULT_ADVANCED_FILTERS);

  const [isLoading, setIsLoading] = useState<boolean>(false);

  const resetAdvancedFilters = useCallback(() => {
    setAdvancedFilters(DEFAULT_ADVANCED_FILTERS);
  }, []);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (advancedFilters.position !== 'ALL') count++;
    if (advancedFilters.minPpg > 0) count++;
    if (advancedFilters.minPer > 0) count++;
    if (advancedFilters.minEff > 0) count++;
    if (advancedFilters.heightRange !== 'ALL') count++;
    if (advancedFilters.weightRange !== 'ALL') count++;
    const defaultSort = getDefaultMetricForSport(activeSportFilter);
    if (advancedFilters.sortBy && advancedFilters.sortBy !== defaultSort) count++;
    return count;
  }, [advancedFilters, activeSportFilter]);

  const loadDiscoveryData = useCallback(async (forceRefresh: boolean = false) => {
    try {
      setIsLoading(true);
      if (forceRefresh) {
        clearDiscoveryMemoryCache();
        clearAuthMicroCache();
      }
      const [athletesRes, proposalsRes, teamsRes, coachMatchesRes, allMatchesRes, offlineMatches]: [any, any, any, any, any, any] = await Promise.all([
        requestAuthenticatedJson('/athletes', 'GET', undefined, forceRefresh).catch(() => null),
        requestAuthenticatedJson('/scouting/proposals/list', 'GET', undefined, forceRefresh).catch(() => null),
        requestAuthenticatedJson('/teams?all=true', 'GET', undefined, forceRefresh).catch(() => null),
        requestAuthenticatedJson('/matches', 'GET', undefined, forceRefresh).catch(() => null),
        requestAuthenticatedJson('/matches?all=true', 'GET', undefined, forceRefresh).catch(() => null),
        getMatchesOfflineFirst(forceRefresh).catch(() => []),
      ]);

      let finalAthletes: AthleteDiscoveryItem[] = [];
      let finalProposals: ScoutingProposalItem[] = [];
      let finalTeams: DiscoveryTeamItem[] = [];
      let finalEvents: DiscoveryEventItem[] = [];

      // 1. Map Teams first so we have team and coach affiliations for all athletes
      const rawTeamsList = Array.isArray(teamsRes)
        ? teamsRes
        : Array.isArray(teamsRes?.teams)
          ? teamsRes.teams
          : [];

      const athleteTeamCoachMap = new Map<string, { team_id: string; team_name: string; head_coach: string }>();

      if (rawTeamsList.length > 0) {
        finalTeams = rawTeamsList.map((t: any) => {
          const rawSport = (t.sport_type || t.sport_category || 'BASKETBALL').toUpperCase().trim();
          const sportCategory: SportCategoryFilter =
            rawSport.includes('SWIM') ? 'SWIMMING' : (rawSport.includes('TRACK') || rawSport.includes('FIELD')) ? 'TRACK AND FIELD' : rawSport;

          const tId = t.team_id || t.id || '';
          const tName = t.team_name || 'Team';
          const hCoach = t.coach_name || t.head_coach || 'Head Coach';

          const rosterMapped = Array.isArray(t.roster_list)
            ? t.roster_list.map((r: any) => {
              const rRawId = r.athlete_id || r.user_id || 'ath_0';
              const rNormId = String(rRawId).replace(/^ath_/, '');
              if (rNormId) {
                athleteTeamCoachMap.set(rNormId, { team_id: tId, team_name: tName, head_coach: hCoach });
              }

              return {
                athlete_id: rRawId,
                full_name: r.full_name || `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Athlete',
                province: r.province || r.location || 'Camarines Sur',
                recruitment_status: r.recruitment_status || 'Rostered',
                position_tag: r.position || 'PG',
                sport_category: sportCategory,
                biometrics: {
                  height_ft: r.height_ft || "-",
                  weight_lbs: r.weight_lbs || "-",
                  wingspan_ft: r.wingspan_ft || "-",
                },
                stats: r.stats || { ppg: 0, rpg: 0, ast: 0, fg_pct: 0 },
                calculated_per: r.per || 25,
                efficiency_pct: r.efficiency_pct || 75,
                contact_info: {
                  email: r.email || 'athlete@atleta.ph',
                  facebook: r.facebook || '',
                  phone: r.contact_number || '+63 900 000 0000',
                },
                jersey_number: String(r.jersey_number || '0'),
                team_id: tId,
                team_name: tName,
                coach_name: hCoach,
                has_coach: true,
              };
            })
            : [];

          return {
            team_id: tId,
            team_name: tName,
            sport_category: sportCategory,
            division_tag: t.division || 'Elite Division',
            description: t.description || `${tName} competitive roster.`,
            head_coach: hCoach,
            season_record: typeof t.season_record === 'object' && t.season_record !== null
              ? `${t.season_record.wins ?? 0} - ${t.season_record.losses ?? 0}`
              : typeof t.season_record === 'string'
                ? t.season_record
                : '0 - 0',
            logo_url: t.logo_url,
            banner_url: t.banner_url,
            roster: rosterMapped,
          };
        });
        setTeams(finalTeams);
      } else {
        setTeams([]);
      }

      // 2. Map All Athletes (including players with coaches for player rankings)
      const rawAthletesList = Array.isArray(athletesRes)
        ? athletesRes
        : Array.isArray(athletesRes?.athletes)
          ? athletesRes.athletes
          : [];

      // Pre-map scouting proposals to athlete IDs
      const scoutedAthleteMap = new Map<string, { scout_id: string; offer_status: 'ACCEPTED' | 'PENDING' | 'DECLINED'; relativeDate: string; rawDate: string; avatar_url?: string }>();
      if (Array.isArray(proposalsRes)) {
        proposalsRes.forEach((p: any) => {
          const rawAthId = String(p.athlete_id || p.id || '').trim();
          const normAthId = rawAthId.replace(/^ath_/, '');
          const rawStatus = String(p.offer_status || 'PENDING').toUpperCase();
          const normalizedStatus: 'ACCEPTED' | 'PENDING' | 'DECLINED' = ['ACCEPTED', 'ACTIVE', 'SIGNED', 'COMMITTED', 'ROSTERED'].includes(rawStatus)
            ? 'ACCEPTED'
            : ['DECLINED', 'REJECTED'].includes(rawStatus)
              ? 'DECLINED'
              : 'PENDING';

          const rawDate = p.date_initiated || p.updated_at || p.created_at;
          let relativeDate = 'Recent';
          if (rawDate) {
            try {
              const diffMs = Date.now() - new Date(rawDate).getTime();
              const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
              if (diffDays <= 0) relativeDate = 'Today';
              else if (diffDays === 1) relativeDate = 'Yesterday';
              else if (diffDays < 7) relativeDate = `${diffDays}d ago`;
              else if (diffDays < 30) relativeDate = `${Math.floor(diffDays / 7)}w ago`;
              else relativeDate = `${Math.floor(diffDays / 30)}mo ago`;
            } catch (e) {
              relativeDate = 'Recent';
            }
          }

          const propInfo = {
            scout_id: p.scout_id || p.id,
            offer_status: normalizedStatus,
            relativeDate,
            rawDate: rawDate || new Date().toISOString().split('T')[0],
            avatar_url: p.avatar_url,
          };
          scoutedAthleteMap.set(normAthId, propInfo);
          scoutedAthleteMap.set(rawAthId, propInfo);
        });
      }

      const normalizeAthleteName = (name?: string) =>
        (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      const seenIds = new Set<string>();
      const athleteByName = new Map<string, AthleteDiscoveryItem>();
      const athleteById = new Map<string, AthleteDiscoveryItem>();
      const mappedAthletes: AthleteDiscoveryItem[] = [];

      if (rawAthletesList.length > 0) {
        rawAthletesList.forEach((a: any) => {
          const rawId = a.athlete_id || a.user_id || a.id || '';
          const normalizedId = rawId.replace(/^ath_/, '');
          if (!rawId) return;

          const fullName = a.full_name || `${a.first_name || ''} ${a.last_name || ''}`.trim() || 'Athlete';
          const nameKey = normalizeAthleteName(fullName);

          // Check if athlete has coach / team affiliation
          const teamCoachInfo = athleteTeamCoachMap.get(normalizedId);
          const assignedTeamId = teamCoachInfo?.team_id || a.team_id || a.current_affiliation?.team_id;
          let assignedTeamName = teamCoachInfo?.team_name || a.team_name || a.current_affiliation?.team_name || a.team_summary?.team_name;
          const assignedCoachName = teamCoachInfo?.head_coach || a.coach_name || a.coach || a.current_affiliation?.coach_name;

          const scoutInfo = scoutedAthleteMap.get(normalizedId) || scoutedAthleteMap.get(rawId);
          const isScouted = Boolean(scoutInfo || a.is_scouted);
          const scoutStatus = scoutInfo ? scoutInfo.offer_status : a.scout_status;

          // If athlete is accepted by coach and coach has a team, associate coach's team name if none exists
          if (!assignedTeamName && scoutStatus === 'ACCEPTED' && finalTeams.length > 0) {
            assignedTeamName = finalTeams[0].team_name;
          }

          const status = String(a.recruitment_status || '').toLowerCase().trim();
          const isRecruitedOrRostered = ['recruited', 'signed', 'committed', 'rostered', 'joined'].includes(status);
          const hasCoach = Boolean(
            isRecruitedOrRostered ||
            (assignedCoachName && String(assignedCoachName).trim() !== '' && assignedCoachName !== 'None') ||
            (assignedTeamId && String(assignedTeamId).trim() !== '' && String(assignedTeamId) !== 'none') ||
            (assignedTeamName && String(assignedTeamName).trim() !== '') ||
            a.has_coach
          );

          const mergedStats = a.stats || a.averages || {};

          const ppg = Number(
            mergedStats.ppg ??
            a.averages?.ppg ??
            a.stats?.ppg ??
            mergedStats.points ??
            a.stats?.points ??
            mergedStats.pts ??
            a.stats?.pts ??
            mergedStats.points_per_game ??
            a.pts ??
            a.points ??
            a.ppg ??
            0
          );
          const rpg = Number(
            mergedStats.rpg ??
            a.averages?.rpg ??
            a.stats?.rpg ??
            mergedStats.rebounds ??
            a.stats?.rebounds ??
            mergedStats.reb ??
            a.stats?.reb ??
            a.reb ??
            a.rpg ??
            0
          );
          const ast = Number(
            mergedStats.ast ??
            mergedStats.apg ??
            a.averages?.apg ??
            a.stats?.ast ??
            a.stats?.apg ??
            mergedStats.assists ??
            a.ast ??
            a.apg ??
            0
          );
          const fgPct = Number(
            mergedStats.fg_pct ??
            mergedStats.fg_percentage ??
            a.averages?.fg_percentage ??
            a.stats?.fg_pct ??
            a.fg_pct ??
            0
          );
          const per = Number(
            a.averages?.per_score ??
            a.stats?.per ??
            a.stats?.calculated_per ??
            a.calculated_per ??
            a.career_per ??
            (ppg > 0 ? Math.round(ppg * 1.3 + 12) : 25)
          );
          const eff = Number(
            a.efficiency_pct ??
            a.stats?.efficiency_pct ??
            (ppg > 0 ? Math.min(99, Math.round(ppg * 3.5 + 20)) : 75)
          );

          // Check if this player is already registered or used again
          const existing = (nameKey && athleteByName.get(nameKey)) || (normalizedId && athleteById.get(normalizedId));

          if (existing) {
            // Player is used again: update stats, efficiency, and affiliation
            if (ppg > 0 || rpg > 0 || ast > 0 || fgPct > 0) {
              existing.stats = {
                ...existing.stats,
                ppg: Math.max(existing.stats.ppg || 0, ppg),
                rpg: Math.max(existing.stats.rpg || 0, rpg),
                ast: Math.max(existing.stats.ast || 0, ast),
                fg_pct: Math.max(existing.stats.fg_pct || 0, fgPct),
                times_50m_free: a.stats?.times_50m_free || existing.stats.times_50m_free,
                times_100m: a.stats?.times_100m || existing.stats.times_100m,
                times_200m: a.stats?.times_200m || existing.stats.times_200m,
                times_400m: a.stats?.times_400m || existing.stats.times_400m,
                spike_kills: a.stats?.spike_kills ?? existing.stats.spike_kills,
                block_points: a.stats?.block_points ?? existing.stats.block_points,
                service_aces: a.stats?.service_aces ?? existing.stats.service_aces,
                points_scored: a.stats?.points_scored ?? existing.stats.points_scored,
              };
            }
            if (per > 0) existing.calculated_per = Math.max(existing.calculated_per, per);
            if (eff > 0) existing.efficiency_pct = Math.max(existing.efficiency_pct, eff);

            if (assignedTeamName && (!existing.team_name || existing.team_name === 'Team')) {
              existing.team_id = assignedTeamId;
              existing.team_name = assignedTeamName;
              existing.coach_name = assignedCoachName;
              existing.has_coach = true;
            }
            if (isScouted) {
              existing.is_scouted = true;
              if (scoutStatus) existing.scout_status = scoutStatus;
            }
            return;
          }

          seenIds.add(normalizedId);

          const rawSport = (a.sport_type || a.sport_category || a.category || 'BASKETBALL').toUpperCase().trim();
          const sportCategory: SportCategoryFilter =
            rawSport.includes('SWIM') ? 'SWIMMING' : (rawSport.includes('TRACK') || rawSport.includes('FIELD')) ? 'TRACK AND FIELD' : rawSport;

          const heightCm = a.physical_attributes?.height_cm || a.physical_profile?.height_cm || a.height_cm;
          const weightKg = a.physical_attributes?.weight_kg || a.physical_profile?.weight_kg || a.weight_kg;
          const wingspanCm = a.physical_attributes?.wingspan_cm || a.physical_profile?.wingspan_cm || a.wingspan_cm;

          const positionTag = a.position || (a.sport_type ? a.sport_type : 'Player');

          const newAthleteItem: AthleteDiscoveryItem = {
            athlete_id: rawId,
            full_name: fullName,
            province: a.location || a.province || 'Camarines Sur',
            recruitment_status: hasCoach ? (a.recruitment_status || 'Rostered') : (a.recruitment_status || 'Available'),
            position_tag: positionTag,
            sport_category: sportCategory,
            biometrics: {
              height_ft: a.biometrics?.height_ft || (heightCm ? `${Math.floor(heightCm / 30.48)}'${Math.round((heightCm % 30.48) / 2.54)}"` : '-'),
              weight_lbs: a.biometrics?.weight_lbs || (weightKg ? `${Math.round(weightKg * 2.20462)} lbs` : '-'),
              wingspan_ft: a.biometrics?.wingspan_ft || (wingspanCm ? `${Math.floor(wingspanCm / 30.48)}'${Math.round((wingspanCm % 30.48) / 2.54)}"` : '-'),
            },
            stats: {
              ppg,
              rpg,
              ast,
              fg_pct: fgPct,
              times_50m_free: a.stats?.times_50m_free,
              times_100m: a.stats?.times_100m,
              times_200m: a.stats?.times_200m,
              times_400m: a.stats?.times_400m,
              spike_kills: a.stats?.spike_kills ?? a.averages?.spike_kills,
              block_points: a.stats?.block_points ?? a.averages?.block_points,
              service_aces: a.stats?.service_aces ?? a.averages?.service_aces,
              aces: a.stats?.aces ?? a.averages?.aces,
              dinks: a.stats?.dinks ?? a.averages?.dinks,
              points_scored: a.stats?.points_scored ?? a.averages?.points_scored,
            },
            calculated_per: per,
            efficiency_pct: eff,
            avatar_url: a.avatar_url,
            contact_info: {
              email: a.email || a.contact_email || 'N/A',
              phone: a.contact_number || a.phone || 'N/A',
              facebook: a.facebook || a.social_link || 'N/A',
            },
            jersey_number: String(a.jersey_number || '2'),
            team_id: assignedTeamId,
            team_name: assignedTeamName,
            coach_name: assignedCoachName,
            has_coach: hasCoach,
            is_scouted: isScouted,
            scout_status: scoutStatus,
          };

          mappedAthletes.push(newAthleteItem);
          if (nameKey) athleteByName.set(nameKey, newAthleteItem);
          if (normalizedId) athleteById.set(normalizedId, newAthleteItem);
        });
      }

      // Also merge any rostered athletes from teams: if player is used again, update their stats
      if (finalTeams.length > 0) {
        finalTeams.forEach((t) => {
          if (Array.isArray(t.roster)) {
            t.roster.forEach((r) => {
              const rNormId = r.athlete_id ? r.athlete_id.replace(/^ath_/, '') : '';
              const rNameKey = normalizeAthleteName(r.full_name);
              const existing = (rNameKey && athleteByName.get(rNameKey)) || (rNormId && athleteById.get(rNormId));

              if (existing) {
                // Player is used again in another team or roster: update stats and affiliation
                const rPpg = Number(r.stats?.ppg ?? 0);
                const rRpg = Number(r.stats?.rpg ?? 0);
                const rAst = Number(r.stats?.ast ?? 0);
                const rFgPct = Number(r.stats?.fg_pct ?? 0);
                const rPer = Number(r.calculated_per ?? 0);
                const rEff = Number(r.efficiency_pct ?? 0);

                if (rPpg > 0 || rRpg > 0 || rAst > 0 || rFgPct > 0) {
                  existing.stats = {
                    ...existing.stats,
                    ppg: Math.max(existing.stats.ppg || 0, rPpg),
                    rpg: Math.max(existing.stats.rpg || 0, rRpg),
                    ast: Math.max(existing.stats.ast || 0, rAst),
                    fg_pct: Math.max(existing.stats.fg_pct || 0, rFgPct),
                  };
                }
                if (rPer > 0) existing.calculated_per = Math.max(existing.calculated_per, rPer);
                if (rEff > 0) existing.efficiency_pct = Math.max(existing.efficiency_pct, rEff);

                if ((!existing.team_name || existing.team_name === 'Team') && t.team_name) {
                  existing.team_id = t.team_id;
                  existing.team_name = t.team_name;
                  existing.coach_name = t.head_coach;
                  existing.has_coach = true;
                }
                if ((!existing.position_tag || existing.position_tag === 'Player' || existing.position_tag === 'Unassigned') && r.position_tag) {
                  existing.position_tag = r.position_tag;
                }
                if ((!existing.jersey_number || existing.jersey_number === '0') && r.jersey_number) {
                  existing.jersey_number = r.jersey_number;
                }
              } else {
                if (rNormId) seenIds.add(rNormId);
                const scoutInfo = scoutedAthleteMap.get(rNormId) || scoutedAthleteMap.get(r.athlete_id);
                const newRosterAth: AthleteDiscoveryItem = {
                  ...r,
                  team_id: t.team_id,
                  team_name: t.team_name,
                  coach_name: t.head_coach,
                  has_coach: true,
                  is_scouted: Boolean(scoutInfo || r.is_scouted),
                  scout_status: scoutInfo ? scoutInfo.offer_status : r.scout_status,
                };
                mappedAthletes.push(newRosterAth);
                if (rNameKey) athleteByName.set(rNameKey, newRosterAth);
                if (rNormId) athleteById.set(rNormId, newRosterAth);
              }
            });
          }
        });
      }

      finalAthletes = mappedAthletes;
      setAthletes(mappedAthletes);
      setRankingAthletes(mappedAthletes);

      // 3. Map Scouting Proposals
      if (Array.isArray(proposalsRes)) {
        const mappedProposals: ScoutingProposalItem[] = proposalsRes.map((p: any) => {
          const rawDate = p.date_initiated || p.updated_at || p.created_at;
          let relativeDate = 'Recent';
          if (rawDate) {
            try {
              const diffMs = Date.now() - new Date(rawDate).getTime();
              const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
              if (diffDays <= 0) relativeDate = 'Today';
              else if (diffDays === 1) relativeDate = 'Yesterday';
              else if (diffDays < 7) relativeDate = `${diffDays}d ago`;
              else if (diffDays < 30) relativeDate = `${Math.floor(diffDays / 7)}w ago`;
              else relativeDate = `${Math.floor(diffDays / 30)}mo ago`;
            } catch (e) {
              relativeDate = 'Recent';
            }
          }
          const rawStatus = String(p.offer_status || 'PENDING').toUpperCase();
          const normalizedStatus = ['ACCEPTED', 'ACTIVE', 'SIGNED', 'COMMITTED', 'ROSTERED'].includes(rawStatus)
            ? 'ACCEPTED'
            : ['DECLINED', 'REJECTED'].includes(rawStatus)
              ? 'DECLINED'
              : 'PENDING';

          return {
            scout_id: p.scout_id || p.id,
            athlete_id: p.athlete_id,
            athlete_name: p.athlete_details?.first_name
              ? `${p.athlete_details.first_name} ${p.athlete_details.last_name || ''}`.trim()
              : p.athlete_name || 'Athlete',
            sport_category: p.athlete_details?.sport_type || p.sport_category || 'Basketball',
            offer_status: normalizedStatus,
            date_added_relative: relativeDate,
            created_at: rawDate || new Date().toISOString().split('T')[0],
            avatar_url: p.avatar_url,
          };
        });
        finalProposals = mappedProposals;
        setScoutingProposals(mappedProposals);
      } else {
        setScoutingProposals([]);
      }

      // 4. Map Events & Matches (merging coach matches, official tournament matches, and offline records)
      const coachMatches = Array.isArray(coachMatchesRes?.matches)
        ? coachMatchesRes.matches
        : Array.isArray(coachMatchesRes)
          ? coachMatchesRes
          : [];
      const allMatches = Array.isArray(allMatchesRes?.matches)
        ? allMatchesRes.matches
        : Array.isArray(allMatchesRes)
          ? allMatchesRes
          : [];
      const offlineList = Array.isArray(offlineMatches) ? offlineMatches : [];

      const seenMatchIds = new Set<string>();
      const combinedMatches: any[] = [];
      const isDeletedMatch = (m: any) => {
        if (!m) return true;
        if (m.deleted === true || m.is_deleted === true) return true;
        const s = String(m.status || m.audit_status || m.verification_status || '').toUpperCase();
        return s === 'DELETED' || s === 'REVOKED' || s === 'CANCELLED';
      };

      for (const m of [...coachMatches, ...allMatches, ...offlineList]) {
        const id = m.match_id || m.id;
        if (id && !seenMatchIds.has(id) && !isDeletedMatch(m)) {
          seenMatchIds.add(id);
          combinedMatches.push(m);
        }
      }

      if (combinedMatches.length > 0) {
        const mappedEvents: DiscoveryEventItem[] = combinedMatches.map((m: any) => {
          const homeScoreMatch = (m.notes || '').match(/\((\d+)\s*-\s*(\d+)\)/);
          const hScore = m.home_score !== undefined ? Number(m.home_score) : (homeScoreMatch ? parseInt(homeScoreMatch[1], 10) : 0);
          const aScore = m.away_score !== undefined ? Number(m.away_score) : (homeScoreMatch ? parseInt(homeScoreMatch[2], 10) : 0);
          const team1 = m.home_team_name || m.home_team || 'Team A';
          const team2 = m.away_team_name || m.away_team || m.opponent_team_name || 'Team B';
          const rawD = m.match_date || m.date_time || m.created_at;
          const d = rawD ? new Date(rawD) : null;
          const dateStr = d && !isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : String(rawD || 'Recent');

          const matchItem: DiscoveryMatchItem = {
            match_id: m.match_id || m.id || `match_${Date.now()}`,
            sport_category: (m.sport_type || 'BASKETBALL').toUpperCase() as SportCategoryFilter,
            headline: `${team1} vs ${team2}`,
            time_venue: `${dateStr} • ${m.location || 'Sports Arena'}`,
            team1_name: team1,
            team2_name: team2,
            team1_score: hScore,
            team2_score: aScore,
            status: m.game_result ? `FINAL (${m.game_result})` : 'FINAL',
            player_stats: Array.isArray(m.player_stats)
              ? m.player_stats.map((ps: any) => ({
                player: ps.name || ps.player_name || ps.full_name || 'Player',
                role_team: `${ps.position || 'Player'} • ${team1}`,
                pts: Number(ps.pts || 0),
                reb: Number(ps.reb || 0),
                ast: Number(ps.ast || 0),
                fg_pct: Number(ps.fg_pct ? parseInt(String(ps.fg_pct), 10) : 0),
              }))
              : [],
            dynamics_data: [hScore, aScore],
          };

          return {
            event_id: m.match_id || m.id || `event_${Date.now()}`,
            event_name: m.game_name || m.league_name || `${team1} vs ${team2}`,
            date_range: dateStr,
            matches: [matchItem],
          };
        });
        finalEvents = mappedEvents;
        setEvents(mappedEvents);
      } else {
        setEvents([]);
      }

      // Update in-memory discovery cache so subsequent navigations don't refetch
      discoveryMemoryCache = {
        athletes: finalAthletes,
        rankingAthletes: finalAthletes,
        proposals: finalProposals,
        teams: finalTeams,
        events: finalEvents,
        lastFetched: Date.now(),
      };

      // Persist snapshot to AsyncStorage for instant cold boot (<10ms)
      AsyncStorage.setItem(
        DISCOVERY_CACHE_KEY,
        JSON.stringify({
          athletes: finalAthletes,
          proposals: finalProposals,
          teams: finalTeams,
          events: finalEvents,
        })
      ).catch(() => null);
    } catch (err) {
      console.warn('Discovery live data error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Instant cache hydration on mount (<10ms)
  useEffect(() => {
    if (discoveryMemoryCache) return;
    AsyncStorage.getItem(DISCOVERY_CACHE_KEY)
      .then((raw) => {
        if (raw) {
          const cached = JSON.parse(raw);
          if (Array.isArray(cached.athletes) && cached.athletes.length > 0) {
            setAthletes(cached.athletes);
            setRankingAthletes(cached.athletes);
          }
          if (Array.isArray(cached.proposals)) {
            setScoutingProposals(cached.proposals);
          }
          if (Array.isArray(cached.teams)) {
            setTeams(cached.teams);
          }
          if (Array.isArray(cached.events)) {
            setEvents(cached.events);
          }
        }
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    // If memory cache is fresh, render immediately from cache and skip redundant network refetches
    if (discoveryMemoryCache && Date.now() - discoveryMemoryCache.lastFetched < DISCOVERY_CACHE_TTL_MS) {
      return;
    }
    loadDiscoveryData();
  }, [loadDiscoveryData]);

  const scoutAthlete = (athlete: AthleteDiscoveryItem) => {
    const existingIndex = scoutingProposals.findIndex((p) => p.athlete_id === athlete.athlete_id);

    if (existingIndex >= 0) {
      // Update status to pending if re-scouted
      setScoutingProposals((prev) =>
        prev.map((p, idx) =>
          idx === existingIndex
            ? { ...p, offer_status: 'PENDING', date_added_relative: 'Added Just Now' }
            : p
        )
      );
    } else {
      const newProposal: ScoutingProposalItem = {
        scout_id: `scout_${Date.now()}`,
        athlete_id: athlete.athlete_id,
        athlete_name: athlete.full_name,
        sport_category: athlete.sport_category
          ? (athlete.sport_category === 'TRACK AND FIELD' ? 'Track & Field' : athlete.sport_category.charAt(0).toUpperCase() + athlete.sport_category.slice(1).toLowerCase())
          : 'Basketball',
        offer_status: 'PENDING',
        date_added_relative: 'Added Just Now',
        created_at: new Date().toISOString().split('T')[0],
      };
      setScoutingProposals((prev) => [newProposal, ...prev]);
    }

    setAthletes((prev) =>
      prev.map((a) =>
        a.athlete_id === athlete.athlete_id || a.athlete_id.replace(/^ath_/, '') === athlete.athlete_id.replace(/^ath_/, '')
          ? { ...a, is_scouted: true, scout_status: 'PENDING' }
          : a
      )
    );
    setRankingAthletes((prev) =>
      prev.map((a) =>
        a.athlete_id === athlete.athlete_id || a.athlete_id.replace(/^ath_/, '') === athlete.athlete_id.replace(/^ath_/, '')
          ? { ...a, is_scouted: true, scout_status: 'PENDING' }
          : a
      )
    );
  };

  // Advanced & Search filtering for discovery prospect feed
  const filteredAthletes = useMemo(() => {
    return athletes.filter((athlete) => {
      if (athlete.sport_category !== activeSportFilter) {
        return false;
      }
      return matchesAthleteFilters(athlete, advancedFilters, searchQuery);
    });
  }, [athletes, activeSportFilter, searchQuery, advancedFilters]);

  const filteredTeams = useMemo(() => {
    return teams.filter((t) => {
      if (t.sport_category !== activeSportFilter) return false;
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;

      const partialStatMatch = q.match(/^(ppg|ast|fg|per|eff|p|pp|a|as|f|e|ef)(\s*(>|>=|<|<=|=)?)?\s*$/i);
      if (partialStatMatch) return true;

      return (
        t.team_name.toLowerCase().includes(q) ||
        t.division_tag.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
      );
    });
  }, [teams, activeSportFilter, searchQuery]);

  const filteredEvents = useMemo(() => {
    return events
      .map((evt) => ({
        ...evt,
        matches: evt.matches.filter((m) => {
          if (m.sport_category !== activeSportFilter) return false;
          const q = searchQuery.trim().toLowerCase();
          if (!q) return true;

          const partialStatMatch = q.match(/^(ppg|ast|fg|per|eff|p|pp|a|as|f|e|ef)(\s*(>|>=|<|<=|=)?)?\s*$/i);
          if (partialStatMatch) return true;

          return (
            m.headline.toLowerCase().includes(q) ||
            m.time_venue.toLowerCase().includes(q)
          );
        }),
      }))
      .filter((evt) => evt.matches.length > 0);
  }, [events, activeSportFilter, searchQuery]);

  return (
    <DiscoveryContext.Provider
      value={{
        athletes,
        rankingAthletes,
        scoutingProposals,
        teams,
        events,
        activeTab,
        setActiveTab,
        activeSportFilter,
        setActiveSportFilter,
        searchQuery,
        setSearchQuery,
        selectedAthlete,
        setSelectedAthlete,
        selectedTeam,
        setSelectedTeam,
        selectedMatch,
        setSelectedMatch,
        scoutAthlete,
        filteredAthletes,
        filteredTeams,
        filteredEvents,
        sortRecruits,
        setSortRecruits,
        isLoading,
        refreshDiscovery: () => loadDiscoveryData(true),
        advancedFilters,
        setAdvancedFilters,
        resetAdvancedFilters,
        activeFilterCount,
      }}
    >
      {children}
    </DiscoveryContext.Provider>
  );
};

export const useDiscovery = () => {
  const context = useContext(DiscoveryContext);
  if (!context) {
    throw new Error('useDiscovery must be used within a DiscoveryProvider');
  }
  return context;
};
