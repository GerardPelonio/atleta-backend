import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Info,
  Users,
  CloudUpload,
  Camera,
  PlusCircle,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Plus,
  Sparkles,
  Upload,
  X,
  FileText,
  Trophy,
  Layers,
} from 'lucide-react';
import {
  getStoredToken,
  getMe,
  createOfficialMatch,
  fetchBrowseTeams,
  scanScoresheetStandalone,
  scanMultipleScoresheets,
  uploadScoresheetFile,
  uploadMultipleScoresheetFiles,
  setCachedData,
  getCachedData,
  getSports,
} from '../../api/client';
import { saveScoresheetFilesToIndexedDB } from '../../api/scoresheetStorage';
import type { AuthUser, MatchAuditDetail, BoxScoreRow, RaceResultRow, SportConfiguration, MatchSummaryItem } from '../../api/types';
import {
  resolveSportColumns,
  getMetricValue,
  setMetricValue,
  parseRobustStatNum,
  sortRaceResultsByTime,
  sortAthletesByPrimaryMetric,
  type SportColumnDef,
} from '../../api/sportSchema';
import { Navbar } from '../Components/Navbar';
import { Sidebar } from '../Components/Sidebar';
import { styles } from './styles/createMatch';

export interface SportOptionItem {
  id: string;
  sportName: string;
  name: string;
}

export const toTitleCaseSport = (name: string): string => {
  if (!name) return '';
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  if (lower === 'badminton') return 'Badminton';
  if (lower === 'basketball') return 'Basketball';
  if (lower === 'volleyball') return 'Volleyball';
  if (lower === 'swimming') return 'Swimming';
  if (lower === 'track & field' || lower === 'track and field') return 'Track & Field';
  if (lower === 'pickleball') return 'Pickleball';
  if (lower === 'soccer') return 'Soccer';

  return trimmed
    .split(/\s+/)
    .map((word) => {
      if (word === '&' || word.toLowerCase() === 'and') return '&';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
};

const buildCreateSportsList = (rawSports?: any[]): SportOptionItem[] => {
  const cached = rawSports || getCachedData<any>('sports_catalog_true')?.sports || getCachedData<any>('sports_catalog_false')?.sports || [];
  const list = Array.isArray(cached) ? cached : [];

  const sportsMap = new Map<string, SportOptionItem>();

  // Ingest ONLY active, system-admin-approved sport documents from database
  list.forEach((s: any) => {
    if (s && s.is_active !== false && s.active !== false) {
      const raw = String(s.sport_name || s.name || s.sportName || '').trim();
      if (!raw) return;
      const formatted = toTitleCaseSport(raw);
      const normKey = formatted.toLowerCase().trim();
      const sportId = String(s.sport_id || s.id || `sport_${normKey.replace(/[^a-z0-9]/g, '_')}`);

      if (!sportsMap.has(normKey)) {
        sportsMap.set(normKey, {
          id: sportId,
          sportName: formatted,
          name: formatted,
        });
      }
    }
  });

  return Array.from(sportsMap.values());
};

export interface ParsedMatchItem {
  index: number;
  fileName: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  gameName: string;
  homeRoster: BoxScoreRow[];
  awayRoster: BoxScoreRow[];
  raceResults: RaceResultRow[];
  scoresheetUrl?: string;
  ocrDetectedTeamScores: Array<{ team: string; score: number }>;
  ocrFinalScoreStr: string;
  isSaved?: boolean;
}

export const isContinuationScoresheets = (matches: any[]): boolean => {
  if (!matches || matches.length <= 1) return true;

  const getSport = (m: any) =>
    String(m.match_info?.sport_type || m.match_info?.sport || m.sport_type || '').trim().toLowerCase();
  const getHome = (m: any) =>
    String(m.match_info?.home_team_name || m.match_info?.home_team || m.team_name || m.team_scores?.[0]?.team || '').trim().toLowerCase();
  const getAway = (m: any) =>
    String(m.match_info?.opponent_team_name || m.match_info?.away_team || m.opponent_team_name || m.team_scores?.[1]?.team || '').trim().toLowerCase();

  const firstSport = getSport(matches[0]);
  const firstHome = getHome(matches[0]);
  const firstAway = getAway(matches[0]);

  return matches.slice(1).every((m) => {
    const fileName = String(m.file_name || m.name || '').toLowerCase();
    const isExplicit = fileName.includes('part2') || fileName.includes('half2') || fileName.includes('2nd_half') || fileName.includes('continuation') || fileName.includes('page2') || fileName.includes('set2') || fileName.includes('set3');
    if (isExplicit) return true;

    const mSport = getSport(m);
    if (firstSport && mSport && firstSport !== mSport) return false;

    const mHome = getHome(m);
    const mAway = getAway(m);

    const isGeneric = (name: string) => !name || name.startsWith('team') || name.startsWith('delegation');
    if (!isGeneric(firstHome) && !isGeneric(mHome)) {
      const matchHome = firstHome === mHome || firstHome.includes(mHome) || mHome.includes(firstHome);
      const matchAway = !firstAway || !mAway || firstAway === mAway || firstAway.includes(mAway) || mAway.includes(firstAway);
      return matchHome || matchAway;
    }

    if ((fileName.includes('match') || fileName.includes('game')) && !fileName.includes('part') && !fileName.includes('half')) {
      return false;
    }

    return false;
  });
};

export const extractMatchDetails = (
  matchData: any,
  fallbackIndex: number,
  fallbackFileName: string,
  sportsCatalog: Array<SportOptionItem | string>,
  initialHomeName?: string,
  initialAwayName?: string
): ParsedMatchItem => {
  const matchInfo = matchData?.match_info || matchData || {};
  let rawSport = String(
    matchInfo.sport_type ||
    matchInfo.sport ||
    matchData?.sport_type ||
    matchData?.sport ||
    ''
  ).toUpperCase();

  const fn = fallbackFileName.toLowerCase();
  if (fn.includes('volley')) rawSport = 'VOLLEYBALL';
  else if (fn.includes('swim')) rawSport = 'SWIMMING';
  else if (fn.includes('track') || fn.includes('field') || fn.includes('run')) rawSport = 'TRACK AND FIELD';
  else if (fn.includes('pickle')) rawSport = 'PICKLEBALL';
  else if (fn.includes('bball') || fn.includes('basket')) rawSport = 'BASKETBALL';

  let resolvedSport = rawSport || 'BASKETBALL';
  if (rawSport) {
    const norm = (str: string) => str.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const detectedNorm = norm(rawSport);
    const matched = sportsCatalog.find((s) => {
      const sName = typeof s === 'string' ? s : (s.sportName || s.name || '');
      const sNorm = norm(sName);
      return sNorm === detectedNorm || detectedNorm.includes(sNorm) || sNorm.includes(detectedNorm);
    });
    if (matched) resolvedSport = typeof matched === 'string' ? matched : (matched.sportName || matched.name || '');
  }

  const isInd =
    resolvedSport.toLowerCase().includes('track') ||
    resolvedSport.toLowerCase().includes('swim') ||
    resolvedSport.toLowerCase().includes('field');

  const rawPlayers: any[] = Array.isArray(matchData?.player_summary)
    ? matchData.player_summary
    : Array.isArray(matchData?.parsed_tables?.player_summary)
    ? matchData.parsed_tables.player_summary
    : [];

  const teamScoresArr: any[] = Array.isArray(matchData?.team_scores)
    ? matchData.team_scores
    : Array.isArray(matchData?.parsed_tables?.team_scores)
    ? matchData.parsed_tables.team_scores
    : [];

  const ocrDetectedTeamScores = teamScoresArr.map((t: any) => ({
    team: String(t.team || t.team_name || '').trim().toUpperCase(),
    score: Number(t.score || 0),
  }));

  const ocrFinalScoreStr = String(matchInfo.final_score || matchData.final_score || '').trim();

  const homeScoreItem = teamScoresArr.find((t: any) => t.is_home === true);
  const awayScoreItem = teamScoresArr.find((t: any) => t.is_home === false);

  const firstPlayerTeam = rawPlayers.find((p: any) => p.team_name || p.team)?.team_name || rawPlayers[0]?.team;
  const secondPlayerTeam = rawPlayers.find((p: any) => {
    const t = p.team_name || p.team;
    return t && String(t).toUpperCase() !== String(firstPlayerTeam).toUpperCase();
  })?.team_name;

  const detectedHome = String(
    matchInfo.home_team_name ||
    matchInfo.home_team ||
    homeScoreItem?.team ||
    teamScoresArr[0]?.team ||
    firstPlayerTeam ||
    ''
  ).trim().toUpperCase();

  const detectedAway = String(
    matchInfo.opponent_team_name ||
    matchInfo.away_team ||
    awayScoreItem?.team ||
    teamScoresArr[1]?.team ||
    secondPlayerTeam ||
    ''
  ).trim().toUpperCase();

  const finalHomeTeam = detectedHome && detectedHome !== 'HOME TEAM' ? detectedHome : (initialHomeName && initialHomeName !== 'ASD' ? initialHomeName : `TEAM ${(fallbackIndex * 2) + 1}`);
  const finalAwayTeam = detectedAway && detectedAway !== 'AWAY TEAM' && detectedAway !== finalHomeTeam
    ? detectedAway
    : (initialAwayName && initialAwayName !== 'ASD' && initialAwayName !== finalHomeTeam ? initialAwayName : `TEAM ${(fallbackIndex * 2) + 2}`);

  let raceResults: RaceResultRow[] = [];
  let hRows: BoxScoreRow[] = [];
  let aRows: BoxScoreRow[] = [];

  const isVolleyball = resolvedSport.toLowerCase().includes('volley');
  const isSoccer = resolvedSport.toLowerCase().includes('soccer') || resolvedSport.toLowerCase().includes('football');

  if (isInd) {
    const rawRaces: any[] = Array.isArray(matchData?.race_results)
      ? matchData.race_results
      : Array.isArray(matchData?.parsed_tables?.race_results)
      ? matchData.parsed_tables.race_results
      : [];

    if (rawRaces.length > 0) {
      raceResults = sortRaceResultsByTime(rawRaces.map((r: any, idx: number) => ({
        placement_rank: String(r.rank || r.placement_rank || r.place || idx + 1),
        athlete_name: String(r.athlete_name || r.name || r.player_name || `Athlete ${idx + 1}`).toUpperCase(),
        team_name: r.team_name || r.team || r.institutional_affiliation || r.current_institution || r.institution || r.affiliation || r.school || r.delegation || `Delegation ${(idx % 2) + 1}`,
        distance: r.distance || r.event || r.event_name || '100m',
        finish_time: r.finish_time || r.time || r.formatted_time || '00:58.21',
        split_times: Array.isArray(r.split_times) ? r.split_times : [String(r.split_times || r.split_time || '—')],
        efficiency: typeof r.efficiency === 'number' ? r.efficiency : parseFloat(String(r.efficiency || 98.5)) || 98.5,
        is_disqualified: Boolean(r.is_disqualified),
      })));
    } else if (rawPlayers.length > 0) {
      raceResults = sortRaceResultsByTime(rawPlayers.map((p: any, idx: number) => ({
        placement_rank: String(p.rank || p.place || p.placement_rank || idx + 1),
        athlete_name: String(p.player_name || p.name || `Athlete ${idx + 1}`).toUpperCase(),
        team_name: p.team_name || p.team || p.institutional_affiliation || p.current_institution || p.institution || p.affiliation || p.school || p.delegation || `Delegation ${(idx % 2) + 1}`,
        distance: p.event || p.event_name || p.distance || '100m',
        finish_time: p.finish_time || p.time || p.formatted_time || p.stats?.finish_time || p.sport_stats?.finish_time || p.sport_stats?.formatted_time || '00:59.00',
        split_times: Array.isArray(p.splits || p.split_times) ? (p.splits || p.split_times) : [String(p.split_time || p.splits || '—')],
        efficiency: typeof p.efficiency === 'number' ? p.efficiency : parseFloat(String(p.efficiency || p.calculated_efficiency || 100)) || 100,
        is_disqualified: Boolean(p.is_disqualified),
      })));
    }
  } else {
    const totalPlayers = rawPlayers.length;
    const halfCount = Math.ceil(totalPlayers / 2);

    rawPlayers.forEach((p: any, idx: number) => {
      const rawTeam = (p.team_name || p.team) ? String(p.team_name || p.team).toUpperCase() : '';
      let isHome = false;
      if (rawTeam) {
        if (rawTeam === finalHomeTeam || rawTeam.includes(finalHomeTeam) || finalHomeTeam.includes(rawTeam)) {
          isHome = true;
        } else if (rawTeam === finalAwayTeam || rawTeam.includes(finalAwayTeam) || finalAwayTeam.includes(rawTeam)) {
          isHome = false;
        } else {
          isHome = idx < halfCount;
        }
      } else {
        isHome = idx < halfCount;
      }

      const jersey = p.jersey_number !== undefined && p.jersey_number !== null
        ? String(p.jersey_number).padStart(2, '0')
        : String(idx + 1).padStart(2, '0');

      const fullName = String(p.player_name || (p.first_name || p.last_name ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : `PLAYER ${jersey}`)).toUpperCase();

      const kills = Number(p.kills ?? p.k ?? 0);
      const attack_errors = Number(p.attack_errors ?? p.attack_error ?? p.e ?? 0);
      const attack_attempts = Number(p.attack_attempts ?? p.total_attacks ?? p.ta ?? p.attempts ?? 0);
      const hitting_pct = p.hitting_pct || p.attack_pct || p.pct || (attack_attempts > 0 ? ((kills - attack_errors) / attack_attempts).toFixed(3) : '.000');
      const service_aces = Number(p.service_aces ?? p.aces ?? p.sa ?? p.steals ?? p.stl ?? 0);
      const digs = Number(p.digs ?? p.dig ?? p.rebounds ?? p.reb ?? 0);
      const blk = Number(p.blocks ?? p.blk ?? p.total_blocks ?? p.tb ?? p.block_points ?? 0);
      const ast = Number(p.assists ?? p.ast ?? p.sets ?? 0);

      const goals = Number(p.goals ?? p.g ?? 0);
      const shots = Number(p.shots ?? p.sh ?? 0);
      const shots_on_target = Number(p.shots_on_target ?? p.sot ?? 0);
      const saves = Number(p.saves ?? p.sv ?? 0);
      const tackles = Number(p.tackles ?? p.tck ?? 0);

      const fga = Number(p.fg_attempted || p.fga || 0);
      const fgm = Number(p.fg_made || p.fgm || 0);
      let fgPct = '0.0%';
      if (p.fg_pct || p.fg_percentage) {
        const raw = String(p.fg_pct || p.fg_percentage).trim();
        fgPct = raw.endsWith('%') ? raw : `${raw}%`;
      } else if (p.true_shooting_pct) {
        const val = parseFloat(String(p.true_shooting_pct).replace('%', ''));
        fgPct = !isNaN(val) ? `${Math.round(val)}%` : '0.0%';
      } else if (fga > 0) {
        fgPct = `${Math.round((fgm / fga) * 100)}%`;
      }

      let threePct = '0.0%';
      const tpa = Number(p.three_attempted || p.three_p_attempted || p.three_p_attempts || p.tpa || p['3pa'] || 0);
      const tpm = Number(p.three_made || p.three_p_made || p.tpm || p['3pm'] || 0);
      if (p.three_p_pct || p.three_pct || p['3p_pct']) {
        const raw = String(p.three_p_pct || p.three_pct || p['3p_pct']).trim();
        threePct = raw.endsWith('%') ? raw : `${raw}%`;
      } else if (tpa > 0) {
        threePct = `${Math.round((tpm / tpa) * 100)}%`;
      }

      let ftPct = '0.0%';
      const fta = Number(p.ft_attempted || p.ft_attempts || p.fta || 0);
      const ftm = Number(p.ft_made || p.ftm || 0);
      if (p.ft_pct || p.ft_percentage) {
        const raw = String(p.ft_pct || p.ft_percentage).trim();
        ftPct = raw.endsWith('%') ? raw : `${raw}%`;
      } else if (fta > 0) {
        ftPct = `${Math.round((ftm / fta) * 100)}%`;
      }

      let pts = Number(p.points ?? p.pts ?? 0);
      if (pts === 0) {
        if (kills > 0 || service_aces > 0 || blk > 0) {
          pts = kills + service_aces + blk;
        } else if (goals > 0) {
          pts = goals;
        } else if (fgm > 0 || ftm > 0) {
          pts = (fgm * 2) + ftm + tpm;
        }
      }

      const defaultPos = isVolleyball ? 'OH' : isSoccer ? 'FWD' : 'G';

      const row: BoxScoreRow = {
        jersey_no: jersey,
        player_name: fullName,
        position: p.position || defaultPos,
        minutes: String(p.minutes || p.min || '0'),
        pts,
        reb: Number(p.rebounds ?? p.reb ?? 0),
        ast,
        stl: Number(p.steals ?? p.stl ?? 0),
        blk,
        fg_pct: fgPct,
        three_p_pct: threePct,
        ft_pct: ftPct,
        kills,
        attack_errors,
        attack_attempts,
        hitting_pct,
        service_aces,
        digs,
        goals,
        shots,
        shots_on_target,
        saves,
        tackles,
      };

      if (isHome) {
        hRows.push(row);
      } else {
        aRows.push(row);
      }
    });

    if (hRows.length === 0 && aRows.length >= 2) {
      const half = Math.ceil(aRows.length / 2);
      hRows.push(...aRows.splice(0, half));
    } else if (aRows.length === 0 && hRows.length >= 2) {
      const half = Math.ceil(hRows.length / 2);
      aRows.push(...hRows.splice(half));
    }
  }

  const sortedRaceResults = sortRaceResultsByTime(raceResults);
  const sortedHomeRoster = sortAthletesByPrimaryMetric(hRows, resolvedSport);
  const sortedAwayRoster = sortAthletesByPrimaryMetric(aRows, resolvedSport);

  return {
    index: fallbackIndex,
    fileName: fallbackFileName,
    sport: resolvedSport,
    homeTeam: finalHomeTeam,
    awayTeam: finalAwayTeam,
    gameName: `${finalHomeTeam} vs ${finalAwayTeam}`,
    homeRoster: sortedHomeRoster,
    awayRoster: sortedAwayRoster,
    raceResults: sortedRaceResults,
    scoresheetUrl: matchData?.scoresheet_url,
    ocrDetectedTeamScores,
    ocrFinalScoreStr,
    isSaved: false,
  };
};

export const CreateMatch: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const appendFileInputRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<AuthUser | null>(null);
  const [gameName, setGameName] = useState('');
  const gameNameRef = useRef('');
  useEffect(() => {
    gameNameRef.current = gameName;
  }, [gameName]);
  const [sportCategory, setSportCategory] = useState('Basketball');
  const [sportsList, setSportsList] = useState<SportOptionItem[]>(() => buildCreateSportsList());
  const [configuredSports, setConfiguredSports] = useState<SportConfiguration[]>([]);

  // Strict array deduplication keyed by normalized sport name, sorted alphabetically
  const uniqueSports = useMemo(() => {
    const deduped = Array.from(
      new Map(
        sportsList.map((sport) => [
          (sport.sportName || sport.name || '').toLowerCase().trim(),
          sport,
        ])
      ).values()
    );
    return deduped.sort((a, b) => a.sportName.localeCompare(b.sportName));
  }, [sportsList]);

  // Keep sportCategory aligned with normalized title-cased names from system admin catalog
  useEffect(() => {
    if (uniqueSports.length === 0) return;
    const match = uniqueSports.find(
      (s) => s.sportName.toLowerCase().trim() === (sportCategory || '').toLowerCase().trim()
    );
    if (match) {
      if (match.sportName !== sportCategory) {
        setSportCategory(match.sportName);
      }
    } else {
      setSportCategory(uniqueSports[0].sportName);
    }
  }, [uniqueSports, sportCategory]);
  const [venue, setVenue] = useState('');
  const [matchDate, setMatchDate] = useState('');
  const [matchTime, setMatchTime] = useState('');

  // Teams state: Basketball uses home/away; Track & Field / Swimming uses dynamic teams array
  const [availableTeams, setAvailableTeams] = useState<any[]>([]);
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [teams, setTeams] = useState<string[]>(['', '']);
  const [coaches, setCoaches] = useState<string[]>(['', '']);
  const [notes, setNotes] = useState('');

  // Scoresheet file & OCR background state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrCompleted, setOcrCompleted] = useState(false);
  const [scoresheetUrl, setScoresheetUrl] = useState<string | undefined>(undefined);
  const [unavailableSportName, setUnavailableSportName] = useState<string | null>(null);
  const [ocrDetectedSport, setOcrDetectedSport] = useState<string | null>(null);
  const [sportMismatchInfo, setSportMismatchInfo] = useState<{
    detectedSport: string;
    currentSport: string;
  } | null>(null);

  // Live editable stats state
  const [homeRoster, setHomeRoster] = useState<BoxScoreRow[]>([]);
  const [awayRoster, setAwayRoster] = useState<BoxScoreRow[]>([]);
  const [raceResults, setRaceResults] = useState<RaceResultRow[]>([]);

  // Batch Matches State (When multiple scoresheets uploaded are separate matches, aligned with mobile)
  const [parsedMatches, setParsedMatches] = useState<ParsedMatchItem[]>([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState<number>(0);

  // Status & Modal Interruption State
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdMatchInfo, setCreatedMatchInfo] = useState<{
    matchId: string;
    sport: string;
    matchDate: string;
    teams: string[];
    gameName: string;
    venue?: string;
  } | null>(null);

  const activeSportCategory = (ocrDetectedSport || sportCategory || 'Basketball').trim();
  const normalizedSportUpper = activeSportCategory.toUpperCase();
  const isVolleyball = normalizedSportUpper.includes('VOLLEY');
  const isSoccer = normalizedSportUpper.includes('SOCCER') || normalizedSportUpper.includes('FOOTBALL');
  const isBadminton = normalizedSportUpper.includes('BADM');
  const isIndividualSport =
    normalizedSportUpper.includes('TRACK') ||
    normalizedSportUpper.includes('SWIM') ||
    normalizedSportUpper.includes('FIELD') ||
    normalizedSportUpper.includes('ATHLETIC') ||
    normalizedSportUpper.includes('TIME');

  const activeSportConfig = useMemo<SportConfiguration | null>(() => {
    const norm = activeSportCategory.trim().toUpperCase();
    return configuredSports.find(
      (s) =>
        s.sport_name.trim().toUpperCase() === norm ||
        s.short_identifier.trim().toUpperCase() === norm ||
        norm.includes(s.sport_name.trim().toUpperCase()) ||
        s.sport_name.trim().toUpperCase().includes(norm)
    ) || null;
  }, [configuredSports, activeSportCategory]);

  const dynamicSportColumns = useMemo<SportColumnDef[]>(() => {
    return resolveSportColumns(activeSportCategory, activeSportConfig, [...homeRoster, ...awayRoster]);
  }, [activeSportCategory, activeSportConfig, homeRoster, awayRoster]);

  // Dynamic Scoreboard State (from OCR extraction and live edits)
  const [ocrDetectedTeamScores, setOcrDetectedTeamScores] = useState<{ team: string; score: number }[]>([]);
  const [ocrFinalScoreStr, setOcrFinalScoreStr] = useState<string | null>(null);

  // Dynamic Score Calculation (Aligned with Mobile getDynamicTeamScore)
  const getDynamicTeamScore = useCallback(
    (teamName: string) => {
      if (!teamName) return { primary: '0 PTS', secondary: undefined, num: 0 };
      const norm = teamName.trim().toUpperCase();
      const isHome = norm === (homeTeam || 'TEAM 1').trim().toUpperCase();
      const roster = isHome ? homeRoster : awayRoster;
      const found = ocrDetectedTeamScores.find((t) => (t.team || '').trim().toUpperCase() === norm);

      if (isVolleyball) {
        let setsWon = 0;
        let totalMatchPoints = roster.reduce(
          (s, p) =>
            s +
            Number(
              p.pts ||
                Number(p.kills || 0) +
                  Number(p.service_aces || 0) +
                  Number(p.block_points || p.blk || 0)
            ),
          0
        );

        if (found && found.score !== undefined && !isNaN(Number(found.score))) {
          const rawNum = Number(found.score);
          if (rawNum <= 5) {
            setsWon = rawNum;
          } else {
            totalMatchPoints = rawNum;
          }
        }

        if (setsWon === 0 && ocrFinalScoreStr) {
          const setMatch = ocrFinalScoreStr.match(/(\d+)\s*[-:]\s*(\d+)/);
          if (setMatch) {
            const homeSets = parseInt(setMatch[1], 10);
            const awaySets = parseInt(setMatch[2], 10);
            if (homeSets <= 5 && awaySets <= 5) {
              setsWon = isHome ? homeSets : awaySets;
            }
          }
        }

        if (
          setsWon > 0 ||
          (ocrFinalScoreStr && ocrFinalScoreStr.match(/\b[0-3]\s*[-:]\s*[0-3]\b/))
        ) {
          return {
            primary: `${setsWon} SETS`,
            secondary: totalMatchPoints > 0 ? `${totalMatchPoints} TOTAL PTS` : undefined,
            num: setsWon,
          };
        }

        return {
          primary: `${totalMatchPoints} PTS`,
          secondary: undefined,
          num: totalMatchPoints,
        };
      }

      if (isBadminton) {
        let setsWon = roster.reduce((s, p) => s + Number(p.games_won || p.sets || p.sets_played || 0), 0);
        let totalRallyPoints = roster.reduce((s, p) => s + Number(p.pts || p.points || 0), 0);

        if (found && found.score !== undefined && !isNaN(Number(found.score))) {
          const rawNum = Number(found.score);
          if (rawNum <= 7) {
            setsWon = rawNum;
          } else {
            totalRallyPoints = rawNum;
          }
        }

        if (setsWon === 0 && ocrFinalScoreStr) {
          const setMatch = ocrFinalScoreStr.match(/(\d+)\s*[-:]\s*(\d+)/);
          if (setMatch) {
            const homeSets = parseInt(setMatch[1], 10);
            const awaySets = parseInt(setMatch[2], 10);
            if (homeSets <= 7 && awaySets <= 7) {
              setsWon = isHome ? homeSets : awaySets;
            }
          }
        }

        return {
          primary: `${setsWon} SETS`,
          secondary: totalRallyPoints > 0 ? `${totalRallyPoints} TOTAL PTS` : undefined,
          num: setsWon,
        };
      }

      if (isSoccer) {
        let goals = roster.reduce((s, p) => s + Number(p.goals || 0), 0);
        if (found && found.score !== undefined && !isNaN(Number(found.score))) {
          goals = Math.max(Number(found.score), goals);
        }
        return {
          primary: `${goals} GOALS`,
          secondary: undefined,
          num: goals,
        };
      }

      // Basketball & other count sports
      const athleteSum = roster.reduce((s, p) => s + Number(p.pts || 0), 0);
      let pts = athleteSum;
      if (found && found.score !== undefined && !isNaN(Number(found.score))) {
        pts = Math.max(Number(found.score), athleteSum);
      }
      return {
        primary: `${pts} PTS`,
        secondary: undefined,
        num: pts,
      };
    },
    [homeTeam, homeRoster, awayRoster, ocrDetectedTeamScores, ocrFinalScoreStr, isVolleyball, isSoccer]
  );

  const homeDynamicScore = useMemo(
    () => getDynamicTeamScore(homeTeam || 'TEAM 1'),
    [getDynamicTeamScore, homeTeam]
  );
  const awayDynamicScore = useMemo(
    () => getDynamicTeamScore(awayTeam || 'TEAM 2'),
    [getDynamicTeamScore, awayTeam]
  );

  const dynamicMatchResult = useMemo(() => {
    const h = homeDynamicScore.num;
    const a = awayDynamicScore.num;
    if (h === 0 && a === 0 && homeRoster.length === 0 && awayRoster.length === 0) {
      return {
        homeResult: 'PENDING',
        awayResult: 'PENDING',
        finalScore: '0 - 0',
        summary: 'Awaiting match data',
      };
    }
    if (h > a) {
      return {
        homeResult: 'WIN',
        awayResult: 'LOSS',
        finalScore: `${h} - ${a}`,
        summary: `${homeTeam || 'TEAM 1'} WINS`,
      };
    }
    if (a > h) {
      return {
        homeResult: 'LOSS',
        awayResult: 'WIN',
        finalScore: `${h} - ${a}`,
        summary: `${awayTeam || 'TEAM 2'} WINS`,
      };
    }
    return {
      homeResult: 'DRAW',
      awayResult: 'DRAW',
      finalScore: `${h} - ${a}`,
      summary: 'TIED MATCH',
    };
  }, [homeDynamicScore.num, awayDynamicScore.num, homeTeam, awayTeam, homeRoster.length, awayRoster.length]);

  const todayStr = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (!getStoredToken()) {
      navigate('/login');
      return;
    }
    getMe().then((res) => setUser(res)).catch(() => {});
    fetchBrowseTeams().then((res) => setAvailableTeams(res)).catch(() => {});
    getSports(true, false).then((res) => {
      if (res) {
        const list = Array.isArray(res.sports) ? res.sports : (Array.isArray(res) ? res : []);
        setConfiguredSports(list);
        setSportsList(buildCreateSportsList(list));
      }
    }).catch(() => {});
  }, [navigate]);

  const loadMatchIntoState = useCallback((target: ParsedMatchItem) => {
    setSportCategory(target.sport);
    setHomeTeam(target.homeTeam);
    setAwayTeam(target.awayTeam);
    setTeams([target.homeTeam, target.awayTeam]);
    // Strictly preserve user-inputted gameName / reference ID
    if (!gameNameRef.current.trim()) {
      setGameName(target.gameName);
    }
    setHomeRoster(target.homeRoster);
    setAwayRoster(target.awayRoster);
    setRaceResults(target.raceResults);
    setOcrDetectedTeamScores(target.ocrDetectedTeamScores);
    setOcrFinalScoreStr(target.ocrFinalScoreStr || null);
    if (target.scoresheetUrl) {
      setScoresheetUrl(target.scoresheetUrl);
    }
  }, []);

  const handleSwitchMatch = useCallback((newIdx: number) => {
    if (newIdx === activeMatchIndex || newIdx < 0 || newIdx >= parsedMatches.length) return;
    setParsedMatches((prev) => {
      const next = [...prev];
      if (next[activeMatchIndex]) {
        next[activeMatchIndex] = {
          ...next[activeMatchIndex],
          sport: sportCategory,
          homeTeam,
          awayTeam,
          gameName,
          homeRoster,
          awayRoster,
          raceResults,
          ocrDetectedTeamScores,
          ocrFinalScoreStr: ocrFinalScoreStr || '',
          scoresheetUrl,
        };
      }
      return next;
    });

    const target = parsedMatches[newIdx];
    if (target) {
      loadMatchIntoState(target);
      setActiveMatchIndex(newIdx);
      if (selectedFiles[target.index]) {
        setSelectedFile(selectedFiles[target.index]);
        try {
          setLocalPreviewUrl(URL.createObjectURL(selectedFiles[target.index]));
        } catch {}
      }
    }
  }, [
    activeMatchIndex,
    parsedMatches,
    sportCategory,
    homeTeam,
    awayTeam,
    gameName,
    homeRoster,
    awayRoster,
    raceResults,
    ocrDetectedTeamScores,
    ocrFinalScoreStr,
    scoresheetUrl,
    selectedFiles,
    loadMatchIntoState,
  ]);

  // Scan for 1 or more file OCR
  const processFiles = async (inputFiles: File[]) => {
    if (inputFiles.length === 0) {
      setParsedMatches([]);
      setActiveMatchIndex(0);
      setSelectedFile(null);
      setSelectedFiles([]);
      setLocalPreviewUrl(null);
      setScoresheetUrl(undefined);
      setOcrCompleted(false);
      setHomeRoster([]);
      setAwayRoster([]);
      setRaceResults([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (appendFileInputRef.current) appendFileInputRef.current.value = '';
      return;
    }

    if (inputFiles.some((f) => f.size > 25 * 1024 * 1024)) {
      setErrorMessage('One or more files exceed the maximum limit of 25MB.');
      return;
    }

    const primaryFile = inputFiles[0];
    setHomeRoster([]);
    setAwayRoster([]);
    setRaceResults([]);
    setParsedMatches([]);
    setOcrDetectedTeamScores([]);
    setOcrFinalScoreStr(null);

    setSelectedFile(primaryFile);
    setSelectedFiles(inputFiles);
    try {
      setLocalPreviewUrl(URL.createObjectURL(primaryFile));
    } catch {}
    setErrorMessage(null);
    setOcrLoading(true);
    setOcrCompleted(false);
    setUnavailableSportName(null);

    try {
      const ocrRes = inputFiles.length > 1
        ? await scanMultipleScoresheets(inputFiles)
        : await scanScoresheetStandalone(primaryFile);

      const subMatches = Array.isArray(ocrRes?.matches)
        ? ocrRes.matches
        : (Array.isArray(ocrRes?.pages) ? ocrRes.pages : []);

      const subUrls = subMatches.map((m: any) => m?.scoresheet_url).filter((u: any) => typeof u === 'string' && u.trim());
      if (subUrls.length > 1) {
        setScoresheetUrl(JSON.stringify(subUrls));
      } else if (ocrRes?.scoresheet_url) {
        setScoresheetUrl(ocrRes.scoresheet_url);
      }

      setParsedMatches([]);
      setActiveMatchIndex(0);
      const isContinuation = true;

      // Check detected sport against available database sports catalog
      let rawSport = String(
        ocrRes?.sport_type ||
        ocrRes?.match_info?.sport ||
        ocrRes?.match_info?.sport_type ||
        ocrRes?.sport ||
        ''
      ).toUpperCase();

      const allFilenames = inputFiles.map((f) => f.name.toLowerCase()).join(' ');
      if (allFilenames.includes('pickle')) rawSport = 'PICKLEBALL';
      else if (allFilenames.includes('badm')) rawSport = 'BADMINTON';
      else if (allFilenames.includes('soccer') || allFilenames.includes('football')) rawSport = 'SOCCER';
      else if (allFilenames.includes('volley')) rawSport = 'VOLLEYBALL';
      else if (allFilenames.includes('swim')) rawSport = 'SWIMMING';
      else if (allFilenames.includes('track') || allFilenames.includes('field') || allFilenames.includes('run')) rawSport = 'TRACK AND FIELD';
      else if (allFilenames.includes('bball') || allFilenames.includes('basket') || allFilenames.includes('camarines') || allFilenames.includes('celtics')) rawSport = 'BASKETBALL';

      if (rawSport) {
        const norm = (str: string) => str.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const detectedNorm = norm(rawSport);
        const matched = sportsList.find((s) => {
          const sName = typeof s === 'string' ? s : (s.sportName || s.name || '');
          const sNorm = norm(sName);
          return sNorm === detectedNorm || detectedNorm.includes(sNorm) || sNorm.includes(detectedNorm);
        });
        const matchedName = matched ? (typeof matched === 'string' ? matched : (matched.sportName || matched.name)) : '';

        const resolvedSport = matchedName || toTitleCaseSport(rawSport);
        if (resolvedSport) {
          setOcrDetectedSport(resolvedSport);
          if (resolvedSport !== sportCategory) {
            setSportMismatchInfo({
              detectedSport: resolvedSport,
              currentSport: sportCategory,
            });
            setSportCategory(resolvedSport);
          }
        }
      }

      const activeSport = rawSport || sportCategory;
      const isInd =
        activeSport.toLowerCase().includes('track') ||
        activeSport.toLowerCase().includes('swim') ||
        activeSport.toLowerCase().includes('field');

      // 1. Gather all players across sub-matches or root player_summary
      let rawPlayers: any[] = [];
      if (subMatches.length > 1) {
        // Multi-scoresheet scan: iterate through pages with intelligent cumulative deduplication
        subMatches.forEach((m: any) => {
          const mPlayers = Array.isArray(m?.player_summary)
            ? m.player_summary
            : (Array.isArray(m?.parsed_tables?.player_summary) ? m.parsed_tables.player_summary : []);

          mPlayers.forEach((incoming: any) => {
            const incJersey = incoming.jersey_number ?? incoming.number;
            const incName = String(incoming.player_name || incoming.name || '').trim().toUpperCase();
            const incTeam = String(incoming.team_name || incoming.team || '').trim().toUpperCase();

            const existingIdx = rawPlayers.findIndex((p: any) => {
              const pJersey = p.jersey_number ?? p.number;
              const pName = String(p.player_name || p.name || '').trim().toUpperCase();
              const pTeam = String(p.team_name || p.team || '').trim().toUpperCase();
              if (incJersey !== undefined && pJersey !== undefined && Number(incJersey) === Number(pJersey)) {
                if (!incTeam || !pTeam || incTeam === pTeam) return true;
              }
              if (incName && pName && incName === pName) return true;
              return false;
            });

            if (existingIdx !== -1) {
              const cur = rawPlayers[existingIdx];
              // Intelligent cumulative check: If incoming sheet's points and attempts are already >= existing,
              // take incoming cumulative final numbers rather than erroneously re-adding
              const curPts = Number(cur.points ?? cur.pts ?? 0);
              const incPts = Number(incoming.points ?? incoming.pts ?? 0);
              const curFga = Number(cur.fg_attempted ?? cur.fga ?? 0);
              const incFga = Number(incoming.fg_attempted ?? incoming.fga ?? 0);
              const isCumulative = (incPts >= curPts && incFga >= curFga && incPts > 0) || (incPts > 0 && curPts === 0);

              rawPlayers[existingIdx] = {
                ...cur,
                ...incoming,
                points: isCumulative ? incPts : (curPts + incPts),
                pts: isCumulative ? incPts : (curPts + incPts),
                rebounds: isCumulative ? Number(incoming.rebounds ?? incoming.reb ?? 0) : (Number(cur.rebounds ?? cur.reb ?? 0) + Number(incoming.rebounds ?? incoming.reb ?? 0)),
                reb: isCumulative ? Number(incoming.reb ?? incoming.rebounds ?? 0) : (Number(cur.reb ?? cur.rebounds ?? 0) + Number(incoming.reb ?? incoming.rebounds ?? 0)),
                assists: isCumulative ? Number(incoming.assists ?? incoming.ast ?? 0) : (Number(cur.assists ?? cur.ast ?? 0) + Number(incoming.assists ?? incoming.ast ?? 0)),
                ast: isCumulative ? Number(incoming.ast ?? incoming.assists ?? 0) : (Number(cur.ast ?? cur.assists ?? 0) + Number(incoming.ast ?? incoming.assists ?? 0)),
                steals: isCumulative ? Number(incoming.steals ?? incoming.stl ?? 0) : (Number(cur.steals ?? cur.stl ?? 0) + Number(incoming.steals ?? incoming.stl ?? 0)),
                stl: isCumulative ? Number(incoming.stl ?? incoming.steals ?? 0) : (Number(cur.stl ?? cur.steals ?? 0) + Number(incoming.stl ?? incoming.steals ?? 0)),
                blocks: isCumulative ? Number(incoming.blocks ?? incoming.blk ?? 0) : (Number(cur.blocks ?? cur.blk ?? 0) + Number(incoming.blocks ?? incoming.blk ?? 0)),
                blk: isCumulative ? Number(incoming.blk ?? incoming.blocks ?? 0) : (Number(cur.blk ?? cur.blocks ?? 0) + Number(incoming.blk ?? incoming.blocks ?? 0)),
                turnovers: isCumulative ? Number(incoming.turnovers ?? incoming.to ?? 0) : (Number(cur.turnovers ?? cur.to ?? 0) + Number(incoming.turnovers ?? incoming.to ?? 0)),
                to: isCumulative ? Number(incoming.to ?? incoming.turnovers ?? 0) : (Number(cur.to ?? cur.turnovers ?? 0) + Number(incoming.to ?? incoming.turnovers ?? 0)),
                minutes: isCumulative ? Number(incoming.minutes ?? incoming.min ?? 0) : (Number(cur.minutes ?? cur.min ?? 0) + Number(incoming.minutes ?? incoming.min ?? 0)),
                min: isCumulative ? Number(incoming.min ?? incoming.minutes ?? 0) : (Number(cur.min ?? cur.minutes ?? 0) + Number(incoming.min ?? incoming.minutes ?? 0)),
                fg_made: isCumulative ? Number(incoming.fg_made ?? incoming.fgm ?? 0) : (Number(cur.fg_made ?? 0) + Number(incoming.fg_made ?? 0)),
                fgm: isCumulative ? Number(incoming.fgm ?? incoming.fg_made ?? 0) : (Number(cur.fgm ?? cur.fg_made ?? 0) + Number(incoming.fgm ?? incoming.fg_made ?? 0)),
                fg_attempted: isCumulative ? incFga : (curFga + incFga),
                fga: isCumulative ? incFga : (curFga + incFga),
                three_made: isCumulative ? Number(incoming.three_made ?? 0) : (Number(cur.three_made ?? 0) + Number(incoming.three_made ?? 0)),
                three_attempted: isCumulative ? Number(incoming.three_attempted ?? 0) : (Number(cur.three_attempted ?? 0) + Number(incoming.three_attempted ?? 0)),
                ft_made: isCumulative ? Number(incoming.ft_made ?? incoming.ftm ?? 0) : (Number(cur.ft_made ?? 0) + Number(incoming.ft_made ?? 0)),
                ftm: isCumulative ? Number(incoming.ftm ?? incoming.ft_made ?? 0) : (Number(cur.ftm ?? cur.ft_made ?? 0) + Number(incoming.ftm ?? incoming.ft_made ?? 0)),
                ft_attempted: isCumulative ? Number(incoming.ft_attempted ?? incoming.fta ?? 0) : (Number(cur.ft_attempted ?? 0) + Number(incoming.ft_attempted ?? 0)),
                fta: isCumulative ? Number(incoming.fta ?? incoming.ft_attempted ?? 0) : (Number(cur.fta ?? cur.ft_attempted ?? 0) + Number(incoming.fta ?? incoming.ft_attempted ?? 0)),
                kills: isCumulative ? Number(incoming.kills ?? 0) : (Number(cur.kills ?? 0) + Number(incoming.kills ?? 0)),
                attack_errors: isCumulative ? Number(incoming.attack_errors ?? 0) : (Number(cur.attack_errors ?? 0) + Number(incoming.attack_errors ?? 0)),
                attack_attempts: isCumulative ? Number(incoming.attack_attempts ?? 0) : (Number(cur.attack_attempts ?? 0) + Number(incoming.attack_attempts ?? 0)),
                digs: isCumulative ? Number(incoming.digs ?? 0) : (Number(cur.digs ?? 0) + Number(incoming.digs ?? 0)),
                service_aces: isCumulative ? Number(incoming.service_aces ?? 0) : (Number(cur.service_aces ?? 0) + Number(incoming.service_aces ?? 0)),
                goals: isCumulative ? Number(incoming.goals ?? 0) : (Number(cur.goals ?? 0) + Number(incoming.goals ?? 0)),
                shots: isCumulative ? Number(incoming.shots ?? 0) : (Number(cur.shots ?? 0) + Number(incoming.shots ?? 0)),
                saves: isCumulative ? Number(incoming.saves ?? 0) : (Number(cur.saves ?? 0) + Number(incoming.saves ?? 0)),
                tackles: isCumulative ? Number(incoming.tackles ?? 0) : (Number(cur.tackles ?? 0) + Number(incoming.tackles ?? 0)),
              };
            } else {
              rawPlayers.push({ ...incoming });
            }
          });
        });
      } else if (Array.isArray(ocrRes?.player_summary) && ocrRes.player_summary.length > 0) {
        rawPlayers = [...ocrRes.player_summary];
      } else if (Array.isArray(ocrRes?.parsed_tables?.player_summary) && ocrRes.parsed_tables.player_summary.length > 0) {
        rawPlayers = [...ocrRes.parsed_tables.player_summary];
      }

      // Check attribute signatures to refine sport detection
      const hasVballStats = rawPlayers.some((p: any) => Number(p.kills || 0) > 0 || Number(p.digs || 0) > 0 || Number(p.block_points || 0) > 0);
      const hasSwimSignatures = rawPlayers.some((p: any) => {
        const ev = String(p.event || p.event_name || '').toLowerCase();
        return Boolean(p.stroke_count) || ev.includes('free') || ev.includes('stroke') || ev.includes('medley') || ev.includes('fly') || ev.includes('swim');
      });
      const hasTrackSignatures = rawPlayers.some((p: any) => {
        const ev = String(p.event || p.event_name || '').toLowerCase();
        return Boolean(p.distance_m) || Boolean(p.wind) || ev.includes('jump') || ev.includes('dash') || ev.includes('hurdle') || ev.includes('relay') || ev.includes('track');
      });
      const hasPickleSignatures = rawSport.includes('PICKLE') || allFilenames.includes('pickle');
      const hasBadmintonSignatures = rawSport.includes('BADM') || allFilenames.includes('badm') || rawPlayers.some((p: any) => Number(p.smash_winners || 0) > 0 || Number(p.net_kills || 0) > 0);
      const hasSoccerSignatures = rawSport.includes('SOCCER') || rawSport.includes('FOOTBALL') || allFilenames.includes('soccer') || allFilenames.includes('football') || rawPlayers.some((p: any) => Number(p.goals || 0) > 0 || Number(p.saves || 0) > 0);

      const findSportName = (term: string) => {
        const found = sportsList.find((s) => {
          const sName = (typeof s === 'string' ? s : (s.sportName || s.name || '')).toUpperCase();
          return sName.includes(term);
        });
        return found ? (typeof found === 'string' ? found : (found.sportName || found.name)) : null;
      };

      if (hasPickleSignatures && findSportName('PICKLE')) {
        setSportCategory(findSportName('PICKLE')!);
      } else if (hasBadmintonSignatures && findSportName('BADM')) {
        setSportCategory(findSportName('BADM')!);
      } else if (hasSoccerSignatures && (findSportName('SOCCER') || findSportName('FOOTBALL'))) {
        setSportCategory((findSportName('SOCCER') || findSportName('FOOTBALL'))!);
      } else if ((hasVballStats || rawSport.includes('VOLLEY')) && findSportName('VOLLEY')) {
        setSportCategory(findSportName('VOLLEY')!);
      } else if ((hasSwimSignatures || rawSport.includes('SWIM')) && findSportName('SWIM')) {
        setSportCategory(findSportName('SWIM')!);
      } else if ((hasTrackSignatures || rawSport.includes('TRACK') || rawSport.includes('FIELD')) && (findSportName('TRACK') || findSportName('FIELD'))) {
        setSportCategory((findSportName('TRACK') || findSportName('FIELD'))!);
      }

      // 2. Dynamic Team Names Extraction
      let teamScoresArr: any[] = [];
      if (subMatches.length > 1 && isContinuation) {
        const teamScoreMap = new Map<string, { team: string; score: number; is_home?: boolean }>();
        subMatches.forEach((m: any) => {
          const mScores = Array.isArray(m?.team_scores) ? m.team_scores : (Array.isArray(m?.parsed_tables?.team_scores) ? m.parsed_tables.team_scores : []);
          mScores.forEach((ts: any) => {
            const tName = String(ts.team || ts.team_name || '').trim().toUpperCase();
            if (!tName) return;
            const incScore = Number(ts.score || 0);
            if (!teamScoreMap.has(tName)) {
              teamScoreMap.set(tName, { team: tName, score: incScore, is_home: ts.is_home });
            } else {
              const cur = teamScoreMap.get(tName)!;
              const isCum = incScore >= cur.score && incScore > 0;
              cur.score = isCum ? incScore : (cur.score + incScore);
              if (ts.is_home !== undefined) cur.is_home = ts.is_home;
            }
          });
        });
        teamScoresArr = Array.from(teamScoreMap.values());
      } else {
        teamScoresArr = Array.isArray(ocrRes?.team_scores)
          ? ocrRes.team_scores
          : Array.isArray(ocrRes?.parsed_tables?.team_scores)
          ? ocrRes.parsed_tables.team_scores
          : [];
      }

      if (teamScoresArr.length > 0) {
        setOcrDetectedTeamScores(
          teamScoresArr.map((t: any) => ({
            team: String(t.team || '').trim().toUpperCase(),
            score: Number(t.score || 0),
          }))
        );
      }

      if (subMatches.length > 1 && isContinuation) {
        const lastFinalScore = subMatches[subMatches.length - 1]?.match_info?.final_score || subMatches[subMatches.length - 1]?.final_score;
        if (lastFinalScore) {
          setOcrFinalScoreStr(String(lastFinalScore).trim());
        } else if (teamScoresArr.length >= 2) {
          setOcrFinalScoreStr(`${teamScoresArr[0].score} - ${teamScoresArr[1].score}`);
        }
      } else if (ocrRes?.match_info?.final_score) {
        setOcrFinalScoreStr(String(ocrRes.match_info.final_score).trim());
      }

      const homeScoreItem = teamScoresArr.find((t: any) => t.is_home === true);
      const awayScoreItem = teamScoresArr.find((t: any) => t.is_home === false);

      const firstPlayerTeam = rawPlayers.find((p: any) => p.team_name || p.team)?.team_name || rawPlayers[0]?.team;
      const secondPlayerTeam = rawPlayers.find((p: any) => {
        const t = p.team_name || p.team;
        return t && String(t).toUpperCase() !== String(firstPlayerTeam).toUpperCase();
      })?.team_name;

      let candidateHome = '';
      let candidateAway = '';
      if (subMatches.length > 0) {
        for (const m of subMatches) {
          const h = String(m?.match_info?.home_team_name || m?.match_info?.home_team || m?.home_team || '').trim().toUpperCase();
          const a = String(m?.match_info?.opponent_team_name || m?.match_info?.away_team || m?.away_team || '').trim().toUpperCase();
          if (h && h !== 'HOME TEAM' && h !== 'N/A' && !h.startsWith('TEAM') && !candidateHome) candidateHome = h;
          if (a && a !== 'AWAY TEAM' && a !== 'N/A' && !a.startsWith('TEAM') && a !== candidateHome && !candidateAway) candidateAway = a;
        }
      }

      const rawDetectedHome = String(
        ocrRes?.match_info?.home_team_name ||
        ocrRes?.match_info?.home_team ||
        homeScoreItem?.team ||
        teamScoresArr[0]?.team ||
        firstPlayerTeam ||
        ''
      ).trim().toUpperCase();

      const rawDetectedAway = String(
        ocrRes?.match_info?.opponent_team_name ||
        ocrRes?.match_info?.away_team ||
        awayScoreItem?.team ||
        teamScoresArr[1]?.team ||
        secondPlayerTeam ||
        ''
      ).trim().toUpperCase();

      const detectedHome = (candidateHome && (!rawDetectedHome || rawDetectedHome === 'N/A' || rawDetectedHome.startsWith('TEAM'))) ? candidateHome : rawDetectedHome;
      const detectedAway = (candidateAway && (!rawDetectedAway || rawDetectedAway === 'N/A' || rawDetectedAway.startsWith('TEAM'))) ? candidateAway : rawDetectedAway;

      const finalHomeTeam = detectedHome && detectedHome !== 'HOME TEAM' && detectedHome !== 'N/A' ? detectedHome : (homeTeam && homeTeam !== 'ASD' ? homeTeam : 'TEAM 1');
      const finalAwayTeam = detectedAway && detectedAway !== 'AWAY TEAM' && detectedAway !== 'N/A' && detectedAway !== finalHomeTeam
        ? detectedAway
        : (awayTeam && awayTeam !== 'ASD' && awayTeam !== finalHomeTeam ? awayTeam : 'TEAM 2');

      setHomeTeam(finalHomeTeam);
      setAwayTeam(finalAwayTeam);
      setTeams([finalHomeTeam, finalAwayTeam]);

      if (isInd) {
        const rawRaces: any[] = [];
        if (subMatches.length > 0) {
          subMatches.forEach((m: any) => {
            const mRaces = Array.isArray(m?.race_results)
              ? m.race_results
              : (Array.isArray(m?.parsed_tables?.race_results) ? m.parsed_tables.race_results : []);
            mRaces.forEach((r: any) => {
              rawRaces.push(r);
            });
          });
        }
        if (rawRaces.length === 0) {
          if (Array.isArray(ocrRes?.race_results) && ocrRes.race_results.length > 0) {
            rawRaces.push(...ocrRes.race_results);
          } else if (Array.isArray(ocrRes?.parsed_tables?.race_results) && ocrRes.parsed_tables.race_results.length > 0) {
            rawRaces.push(...ocrRes.parsed_tables.race_results);
          }
        }

        if (rawRaces.length > 0) {
          const formatted: RaceResultRow[] = rawRaces.map((r: any, idx: number) => ({
            placement_rank: String(r.rank || r.placement_rank || r.place || idx + 1),
            athlete_name: String(r.athlete_name || r.name || r.player_name || `Athlete ${idx + 1}`).toUpperCase(),
            team_name: r.team_name || r.team || r.institutional_affiliation || r.current_institution || r.institution || r.affiliation || r.school || r.delegation || finalHomeTeam,
            distance: r.distance || r.event || r.event_name || '100m',
            finish_time: r.finish_time || r.time || r.formatted_time || '00:58.42',
            split_times: Array.isArray(r.split_times) ? r.split_times : [String(r.split_times || r.split_time || '—')],
            efficiency: typeof r.efficiency === 'number' ? r.efficiency : parseFloat(String(r.efficiency || 98.5)) || 98.5,
            is_disqualified: Boolean(r.is_disqualified),
          }));
          setRaceResults(sortRaceResultsByTime(formatted));
        } else if (rawPlayers.length > 0) {
          const formatted: RaceResultRow[] = rawPlayers.map((p: any, idx: number) => ({
            placement_rank: String(p.rank || p.place || p.placement_rank || idx + 1),
            athlete_name: String(p.player_name || p.name || `Athlete ${idx + 1}`).toUpperCase(),
            team_name: p.team_name || p.team || p.delegation || `Delegation ${(idx % 2) + 1}`,
            distance: p.event || p.event_name || p.distance || '100m',
            finish_time: p.finish_time || p.time || p.formatted_time || p.stats?.finish_time || p.sport_stats?.finish_time || p.sport_stats?.formatted_time || '00:59.00',
            split_times: Array.isArray(p.splits || p.split_times) ? (p.splits || p.split_times) : [String(p.split_time || p.splits || '—')],
            efficiency: typeof p.efficiency === 'number' ? p.efficiency : parseFloat(String(p.efficiency || p.calculated_efficiency || 100)) || 100,
            is_disqualified: Boolean(p.is_disqualified),
          }));
          setRaceResults(sortRaceResultsByTime(formatted));
        }
      } else {
        const hRows: BoxScoreRow[] = [];
        const aRows: BoxScoreRow[] = [];
        const totalPlayers = rawPlayers.length;
        const halfCount = Math.ceil(totalPlayers / 2);

        rawPlayers.forEach((p: any, idx: number) => {
          const rawTeam = (p.team_name || p.team) ? String(p.team_name || p.team).toUpperCase() : '';
          let isHome = false;
          if (rawTeam) {
            if (rawTeam === finalHomeTeam || rawTeam.includes(finalHomeTeam) || finalHomeTeam.includes(rawTeam)) {
              isHome = true;
            } else if (rawTeam === finalAwayTeam || rawTeam.includes(finalAwayTeam) || finalAwayTeam.includes(rawTeam)) {
              isHome = false;
            } else {
              isHome = idx < halfCount;
            }
          } else {
            isHome = idx < halfCount;
          }

          const jersey = p.jersey_number !== undefined && p.jersey_number !== null
            ? String(p.jersey_number).padStart(2, '0')
            : String(idx + 1).padStart(2, '0');

          const fullName = String(p.player_name || (p.first_name || p.last_name ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : `PLAYER ${jersey}`)).toUpperCase();

          const kills = Number(p.kills ?? p.k ?? 0);
          const attack_errors = Number(p.attack_errors ?? p.attack_error ?? p.e ?? 0);
          const attack_attempts = Number(p.attack_attempts ?? p.total_attacks ?? p.ta ?? p.attempts ?? 0);
          const hitting_pct = p.hitting_pct || p.attack_pct || p.pct || (attack_attempts > 0 ? ((kills - attack_errors) / attack_attempts).toFixed(3) : '.000');
          const service_aces = Number(p.service_aces ?? p.aces ?? p.sa ?? p.steals ?? p.stl ?? 0);
          const digs = Number(p.digs ?? p.dig ?? p.rebounds ?? p.reb ?? 0);
          const blk = Number(p.blocks ?? p.blk ?? p.total_blocks ?? p.tb ?? p.block_points ?? 0);
          const ast = Number(p.assists ?? p.ast ?? p.sets ?? 0);

          const goals = Number(p.goals ?? p.g ?? 0);
          const shots = Number(p.shots ?? p.sh ?? 0);
          const shots_on_target = Number(p.shots_on_target ?? p.sot ?? 0);
          const saves = Number(p.saves ?? p.sv ?? 0);
          const tackles = Number(p.tackles ?? p.tck ?? 0);

          const fga = Number(p.fg_attempted || p.fga || 0);
          const fgm = Number(p.fg_made || p.fgm || 0);
          let fgPct = '0.0%';
          if (p.fg_pct || p.fg_percentage) {
            const raw = String(p.fg_pct || p.fg_percentage).trim();
            fgPct = raw.endsWith('%') ? raw : `${raw}%`;
          } else if (p.true_shooting_pct) {
            const val = parseFloat(String(p.true_shooting_pct).replace('%', ''));
            fgPct = !isNaN(val) ? `${Math.round(val)}%` : '0.0%';
          } else if (fga > 0) {
            fgPct = `${Math.round((fgm / fga) * 100)}%`;
          }

          let threePct = '0.0%';
          const tpa = Number(p.three_attempted || p.three_p_attempted || p.three_p_attempts || p.tpa || p['3pa'] || 0);
          const tpm = Number(p.three_made || p.three_p_made || p.tpm || p['3pm'] || 0);
          if (p.three_p_pct || p.three_pct || p['3p_pct']) {
            const raw = String(p.three_p_pct || p.three_pct || p['3p_pct']).trim();
            threePct = raw.endsWith('%') ? raw : `${raw}%`;
          } else if (tpa > 0) {
            threePct = `${Math.round((tpm / tpa) * 100)}%`;
          }

          let ftPct = '0.0%';
          const fta = Number(p.ft_attempted || p.ft_attempts || p.fta || 0);
          const ftm = Number(p.ft_made || p.ftm || 0);
          if (p.ft_pct || p.ft_percentage) {
            const raw = String(p.ft_pct || p.ft_percentage).trim();
            ftPct = raw.endsWith('%') ? raw : `${raw}%`;
          } else if (fta > 0) {
            ftPct = `${Math.round((ftm / fta) * 100)}%`;
          }

          let pts = Number(p.points ?? p.pts ?? 0);
          if (pts === 0) {
            if (kills > 0 || service_aces > 0 || blk > 0) {
              pts = kills + service_aces + blk;
            } else if (goals > 0) {
              pts = goals;
            } else if (fgm > 0 || ftm > 0) {
              pts = (fgm * 2) + ftm + tpm;
            }
          }

          const defaultPos = isVolleyball ? 'OH' : isSoccer ? 'FWD' : 'G';

          const smashWinners = Number(p.smash_winners ?? p.smashes ?? 0);
          const netKills = Number(p.net_kills ?? 0);
          const unforcedErrors = Number(p.unforced_errors ?? p.errors ?? 0);
          const serviceFaults = Number(p.service_faults ?? p.faults ?? 0);
          const gamesWon = Number(p.games_won ?? p.sets ?? 0);
          const gameScores = String(p.game_scores || '');
          const smashWinPct = p.smash_win_pct || (smashWinners > 0 ? `${Math.min(100, Math.round((smashWinners / (smashWinners + unforcedErrors || 1)) * 100))}%` : '0.0%');

          const row: BoxScoreRow = {
            ...p,
            ...(p.stats || {}),
            jersey_no: jersey,
            player_name: fullName,
            position: p.position || p.pos || defaultPos,
            minutes: p.minutes ? String(p.minutes) : p.sp ? String(p.sp) : p.min ? String(p.min) : '0',
            pts: pts,
            reb: digs || Number((p.offensive_rebounds || 0) + (p.defensive_rebounds || 0) || p.rebounds || p.reb || 0),
            ast: ast,
            stl: service_aces || Number(p.steals ?? p.stl ?? 0),
            blk: blk,
            fg_pct: fgPct,
            three_p_pct: threePct,
            ft_pct: ftPct,
            kills,
            attack_errors,
            attack_attempts,
            hitting_pct,
            service_aces,
            digs,
            block_points: blk,
            goals,
            shots,
            shots_on_target,
            saves,
            tackles,
            // Badminton & Racquet sports
            smash_winners: smashWinners,
            net_kills: netKills,
            unforced_errors: unforcedErrors,
            service_faults: serviceFaults,
            smash_win_pct: smashWinPct,
            games_won: gamesWon,
            game_scores: gameScores,
            sets: gamesWon,
          };

          if (isHome) {
            hRows.push(row);
          } else {
            aRows.push(row);
          }
        });

        // Safety balancing: If all players went into one team while the other has none, split evenly
        if (hRows.length === 0 && aRows.length >= 2) {
          const half = Math.ceil(aRows.length / 2);
          hRows.push(...aRows.splice(0, half));
        } else if (aRows.length === 0 && hRows.length >= 2) {
          const half = Math.ceil(hRows.length / 2);
          aRows.push(...hRows.splice(half));
        }

        if (hRows.length > 0) setHomeRoster(sortAthletesByPrimaryMetric(hRows, sportCategory, activeSportConfig));
        if (aRows.length > 0) setAwayRoster(sortAthletesByPrimaryMetric(aRows, sportCategory, activeSportConfig));
      }

      setOcrCompleted(true);
    } catch (scanErr: any) {
      console.warn('Standalone OCR error:', scanErr);
      setErrorMessage(scanErr?.message || 'Failed to analyze scoresheet with OCR. You may still fill in details manually.');
    } finally {
      setOcrLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputFiles = Array.from(e.target.files || []);
    if (inputFiles.length > 0) processFiles(inputFiles);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAddMoreFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    if (newFiles.length > 0) processFiles([...selectedFiles, ...newFiles]);
    if (appendFileInputRef.current) appendFileInputRef.current.value = '';
  };

  const handleRemoveFile = (idxToRemove: number) => {
    const remaining = selectedFiles.filter((_, idx) => idx !== idxToRemove);
    processFiles(remaining);
  };

  const handleRemoveAllFiles = () => {
    setParsedMatches([]);
    setActiveMatchIndex(0);
    setOcrDetectedTeamScores([]);
    setOcrFinalScoreStr(null);
    processFiles([]);
  };

  // Live editable table helpers
  const updateBasketballStat = (team: 'home' | 'away', idx: number, field: any, value: any) => {
    if (team === 'home') {
      const updated = [...homeRoster];
      const row = { ...updated[idx] };
      setMetricValue(row, field, value);
      updated[idx] = row;
      setHomeRoster(updated);
    } else {
      const updated = [...awayRoster];
      const row = { ...updated[idx] };
      setMetricValue(row, field, value);
      updated[idx] = row;
      setAwayRoster(updated);
    }
  };

  const addBasketballPlayer = (team: 'home' | 'away') => {
    const newRow: BoxScoreRow = {
      jersey_no: String(team === 'home' ? homeRoster.length + 1 : awayRoster.length + 1).padStart(2, '0'),
      player_name: 'NEW PLAYER',
      position: isVolleyball ? 'OH' : isSoccer ? 'FWD' : 'G',
      minutes: '0',
      pts: 0,
      reb: 0,
      ast: 0,
      stl: 0,
      blk: 0,
      fg_pct: '0.0%',
      three_p_pct: '0.0%',
      ft_pct: '0.0%',
      kills: 0,
      attack_errors: 0,
      attack_attempts: 0,
      hitting_pct: '.000',
      service_aces: 0,
      digs: 0,
      block_points: 0,
      goals: 0,
      shots: 0,
      shots_on_target: 0,
      saves: 0,
      tackles: 0,
    };
    if (team === 'home') setHomeRoster([...homeRoster, newRow]);
    else setAwayRoster([...awayRoster, newRow]);
  };

  const removeBasketballPlayer = (team: 'home' | 'away', idx: number) => {
    if (team === 'home') setHomeRoster(homeRoster.filter((_, i) => i !== idx));
    else setAwayRoster(awayRoster.filter((_, i) => i !== idx));
  };

  const updateRaceStat = (idx: number, field: keyof RaceResultRow, value: any) => {
    const updated = [...raceResults];
    updated[idx] = { ...updated[idx], [field]: value };
    setRaceResults(updated);
  };

  const addRaceAthlete = () => {
    const newRace: RaceResultRow = {
      placement_rank: String(raceResults.length + 1),
      athlete_name: 'NEW ATHLETE',
      team_name: teams[0] || homeTeam || 'Delegation 1',
      distance: '100m',
      finish_time: '00:00.00',
      split_times: ['00:00.00'],
      efficiency: 100,
      is_disqualified: false,
    };
    setRaceResults([...raceResults, newRace]);
  };

  const removeRaceAthlete = (idx: number) => {
    setRaceResults(raceResults.filter((_, i) => i !== idx));
  };

  const handleTeamChange = (idx: number, val: string) => {
    const updated = [...teams];
    updated[idx] = val;
    setTeams(updated);
  };

  const handleCoachChange = (idx: number, val: string) => {
    const updated = [...coaches];
    updated[idx] = val;
    setCoaches(updated);
  };

  // Instant Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!sportCategory) {
      setErrorMessage('Please select a sport category.');
      return;
    }

    if (!matchDate) {
      setErrorMessage('Please select a match date.');
      return;
    }

    // Prevent submission if user manually changed sport category away from the uploaded scoresheet's sport
    if (selectedFile && ocrDetectedSport) {
      const norm = (str: string) => str.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const formNorm = norm(sportCategory);
      const ocrNorm = norm(ocrDetectedSport);
      if (formNorm !== ocrNorm && !formNorm.includes(ocrNorm) && !ocrNorm.includes(formNorm)) {
        setSportMismatchInfo({
          detectedSport: ocrDetectedSport,
          currentSport: sportCategory,
        });
        return;
      }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const chosen = new Date(matchDate);
    if (chosen < today) {
      setErrorMessage('Cannot schedule a match for a past date. Please choose today or a future date.');
      return;
    }

    const requiredCoachesCount = isIndividualSport
      ? teams.map((t) => t.trim()).filter(Boolean).length
      : 2;
    const filledCoaches = coaches.map((c) => c.trim()).filter(Boolean);
    if (filledCoaches.length < requiredCoachesCount) {
      setErrorMessage(
        `Please fill in all ${requiredCoachesCount} assigned coaches (1 coach required for each ${isIndividualSport ? 'participating delegation' : 'team'}).`
      );
      return;
    }

    // Intercept with confirmation modal before final creation
    setShowConfirmModal(true);
  };

  const executeFinalizeCreateMatch = async () => {
    setShowConfirmModal(false);
    let finalHome = '';
    let finalAway = '';
    let participating: string[] = [];

    if (isIndividualSport) {
      const validTeams = teams.map((t) => t.trim()).filter(Boolean);
      finalHome = validTeams[0] || 'Delegation 1';
      finalAway = validTeams.slice(1).join(', ') || 'Delegation 2';
      participating = validTeams.length > 0 ? validTeams : ['Delegation 1', 'Delegation 2'];
    } else {
      finalHome = homeTeam.trim() || 'Home Team';
      finalAway = awayTeam.trim() || 'Away Team';
      participating = [finalHome, finalAway];
    }

    try {
      setSubmitting(true);

      let normalizedSport = sportCategory.trim() || 'Basketball';
      if (sportCategory.toLowerCase().includes('swim')) {
        normalizedSport = 'Swimming';
      } else if (sportCategory.toLowerCase().includes('track') || sportCategory.toLowerCase().includes('field')) {
        normalizedSport = 'Track & Field';
      } else if (sportCategory.toLowerCase().includes('basket')) {
        normalizedSport = 'Basketball';
      }

      let isoDate = new Date(matchDate).toISOString();
      if (matchTime) {
        try {
          const combined = new Date(`${matchDate}T${matchTime}`);
          if (!isNaN(combined.getTime())) {
            isoDate = combined.toISOString();
          }
        } catch {}
      } else {
        try {
          const combined = new Date(`${matchDate}T09:00:00`);
          if (!isNaN(combined.getTime())) {
            isoDate = combined.toISOString();
          }
        } catch {}
      }

      const venueLocation = venue.trim() || 'Tournament Sports Complex';
      const playerStatsPayload: any[] = [];

      // Map live edited stats into payload
      homeRoster.forEach((p, idx) => {
        const completeStats: Record<string, any> = {
          ...(p.stats || {}),
        };
        dynamicSportColumns.forEach((col) => {
          const val = getMetricValue(p, col.key);
          if (val !== undefined && val !== null && val !== '') {
            completeStats[col.key] = val;
          }
        });

        playerStatsPayload.push({
          athlete_id: p.athlete_id || `ath_home_${idx + 1}`,
          player_name: p.player_name,
          team_name: finalHome,
          jersey_number: Number(p.jersey_no) || idx + 1,
          position: p.position || (isVolleyball ? 'OH' : isSoccer ? 'FWD' : 'G'),
          pts: parseRobustStatNum(completeStats.pts ?? completeStats.points ?? p.pts ?? 0, 'pts'),
          ast: parseRobustStatNum(completeStats.ast ?? completeStats.assists ?? p.ast ?? 0, 'ast'),
          reb: parseRobustStatNum(completeStats.reb ?? completeStats.rebounds ?? p.reb ?? 0, 'reb'),
          stl: parseRobustStatNum(completeStats.stl ?? completeStats.steals ?? p.stl ?? 0, 'stl'),
          blk: parseRobustStatNum(completeStats.blk ?? completeStats.blocks ?? p.blk ?? 0, 'blk'),
          to: parseRobustStatNum(completeStats.to ?? completeStats.turnovers ?? p.to ?? 0, 'to'),
          fouls: parseRobustStatNum(completeStats.fouls ?? completeStats.pf ?? p.fouls ?? p.pf ?? 0, 'fouls'),
          pf: parseRobustStatNum(completeStats.fouls ?? completeStats.pf ?? p.fouls ?? p.pf ?? 0, 'fouls'),
          oreb: parseRobustStatNum(completeStats.oreb ?? completeStats.offensive_rebounds ?? p.oreb ?? 0, 'oreb'),
          dreb: parseRobustStatNum(completeStats.dreb ?? completeStats.defensive_rebounds ?? p.dreb ?? 0, 'dreb'),
          min: parseRobustStatNum(completeStats.min ?? completeStats.minutes ?? p.minutes ?? 0, 'min'),
          fg_made: parseRobustStatNum(completeStats.fg_made ?? p.fg_made ?? 0, 'fg_made'),
          fg_attempted: parseRobustStatNum(completeStats.fg_attempted ?? p.fg_attempted ?? 0, 'fg_attempted'),
          three_made: parseRobustStatNum(completeStats.three_made ?? p.three_made ?? 0, 'three_made'),
          three_attempted: parseRobustStatNum(completeStats.three_attempted ?? p.three_attempted ?? 0, 'three_attempted'),
          ft_made: parseRobustStatNum(completeStats.ft_made ?? p.ft_made ?? 0, 'ft_made'),
          ft_attempted: parseRobustStatNum(completeStats.ft_attempted ?? p.ft_attempted ?? 0, 'ft_attempted'),
          fg_pct: p.fg_pct,
          three_p_pct: p.three_p_pct,
          ft_pct: p.ft_pct,
          kills: parseRobustStatNum(completeStats.kills ?? p.kills ?? 0, 'kills'),
          attack_errors: parseRobustStatNum(completeStats.attack_errors ?? p.attack_errors ?? 0, 'attack_errors'),
          attack_attempts: parseRobustStatNum(completeStats.attack_attempts ?? p.attack_attempts ?? 0, 'attack_attempts'),
          hitting_pct: p.hitting_pct,
          service_aces: parseRobustStatNum(completeStats.service_aces ?? p.service_aces ?? 0, 'service_aces'),
          service_errors: parseRobustStatNum(completeStats.service_errors ?? p.service_errors ?? 0, 'service_errors'),
          reception_errors: parseRobustStatNum(completeStats.reception_errors ?? p.reception_errors ?? 0, 'reception_errors'),
          digs: parseRobustStatNum(completeStats.digs ?? p.digs ?? 0, 'digs'),
          block_points: parseRobustStatNum(completeStats.block_points ?? p.block_points ?? 0, 'block_points'),
          sets_played: parseRobustStatNum(completeStats.sets_played ?? p.sets_played ?? 0, 'sets_played'),
          goals: parseRobustStatNum(completeStats.goals ?? p.goals ?? 0, 'goals'),
          shots: parseRobustStatNum(completeStats.shots ?? p.shots ?? 0, 'shots'),
          shots_on_target: parseRobustStatNum(completeStats.shots_on_target ?? p.shots_on_target ?? 0, 'shots_on_target'),
          saves: parseRobustStatNum(completeStats.saves ?? p.saves ?? 0, 'saves'),
          tackles: parseRobustStatNum(completeStats.tackles ?? p.tackles ?? 0, 'tackles'),
          stats: completeStats,
        });
      });

      awayRoster.forEach((p, idx) => {
        const completeStats: Record<string, any> = {
          ...(p.stats || {}),
        };
        dynamicSportColumns.forEach((col) => {
          const val = getMetricValue(p, col.key);
          if (val !== undefined && val !== null && val !== '') {
            completeStats[col.key] = val;
          }
        });

        playerStatsPayload.push({
          athlete_id: p.athlete_id || `ath_away_${idx + 1}`,
          player_name: p.player_name,
          team_name: finalAway,
          jersey_number: Number(p.jersey_no) || idx + 1,
          position: p.position || (isVolleyball ? 'OH' : isSoccer ? 'FWD' : 'G'),
          pts: parseRobustStatNum(completeStats.pts ?? completeStats.points ?? p.pts ?? 0, 'pts'),
          ast: parseRobustStatNum(completeStats.ast ?? completeStats.assists ?? p.ast ?? 0, 'ast'),
          reb: parseRobustStatNum(completeStats.reb ?? completeStats.rebounds ?? p.reb ?? 0, 'reb'),
          stl: parseRobustStatNum(completeStats.stl ?? completeStats.steals ?? p.stl ?? 0, 'stl'),
          blk: parseRobustStatNum(completeStats.blk ?? completeStats.blocks ?? p.blk ?? 0, 'blk'),
          to: parseRobustStatNum(completeStats.to ?? completeStats.turnovers ?? p.to ?? 0, 'to'),
          fouls: parseRobustStatNum(completeStats.fouls ?? completeStats.pf ?? p.fouls ?? p.pf ?? 0, 'fouls'),
          pf: parseRobustStatNum(completeStats.fouls ?? completeStats.pf ?? p.fouls ?? p.pf ?? 0, 'fouls'),
          oreb: parseRobustStatNum(completeStats.oreb ?? completeStats.offensive_rebounds ?? p.oreb ?? 0, 'oreb'),
          dreb: parseRobustStatNum(completeStats.dreb ?? completeStats.defensive_rebounds ?? p.dreb ?? 0, 'dreb'),
          min: parseRobustStatNum(completeStats.min ?? completeStats.minutes ?? p.minutes ?? 0, 'min'),
          fg_made: parseRobustStatNum(completeStats.fg_made ?? p.fg_made ?? 0, 'fg_made'),
          fg_attempted: parseRobustStatNum(completeStats.fg_attempted ?? p.fg_attempted ?? 0, 'fg_attempted'),
          three_made: parseRobustStatNum(completeStats.three_made ?? p.three_made ?? 0, 'three_made'),
          three_attempted: parseRobustStatNum(completeStats.three_attempted ?? p.three_attempted ?? 0, 'three_attempted'),
          ft_made: parseRobustStatNum(completeStats.ft_made ?? p.ft_made ?? 0, 'ft_made'),
          ft_attempted: parseRobustStatNum(completeStats.ft_attempted ?? p.ft_attempted ?? 0, 'ft_attempted'),
          fg_pct: p.fg_pct,
          three_p_pct: p.three_p_pct,
          ft_pct: p.ft_pct,
          kills: parseRobustStatNum(completeStats.kills ?? p.kills ?? 0, 'kills'),
          attack_errors: parseRobustStatNum(completeStats.attack_errors ?? p.attack_errors ?? 0, 'attack_errors'),
          attack_attempts: parseRobustStatNum(completeStats.attack_attempts ?? p.attack_attempts ?? 0, 'attack_attempts'),
          hitting_pct: p.hitting_pct,
          service_aces: parseRobustStatNum(completeStats.service_aces ?? p.service_aces ?? 0, 'service_aces'),
          service_errors: parseRobustStatNum(completeStats.service_errors ?? p.service_errors ?? 0, 'service_errors'),
          reception_errors: parseRobustStatNum(completeStats.reception_errors ?? p.reception_errors ?? 0, 'reception_errors'),
          digs: parseRobustStatNum(completeStats.digs ?? p.digs ?? 0, 'digs'),
          block_points: parseRobustStatNum(completeStats.block_points ?? p.block_points ?? 0, 'block_points'),
          sets_played: parseRobustStatNum(completeStats.sets_played ?? p.sets_played ?? 0, 'sets_played'),
          goals: parseRobustStatNum(completeStats.goals ?? p.goals ?? 0, 'goals'),
          shots: parseRobustStatNum(completeStats.shots ?? p.shots ?? 0, 'shots'),
          shots_on_target: parseRobustStatNum(completeStats.shots_on_target ?? p.shots_on_target ?? 0, 'shots_on_target'),
          saves: parseRobustStatNum(completeStats.saves ?? p.saves ?? 0, 'saves'),
          tackles: parseRobustStatNum(completeStats.tackles ?? p.tackles ?? 0, 'tackles'),
          stats: completeStats,
        });
      });

      const homeRosterIds = homeRoster.map((r, i) => r.athlete_id || `ath_home_${i + 1}`);
      const awayRosterIds = awayRoster.map((r, i) => r.athlete_id || `ath_away_${i + 1}`);

      let resolvedMultiUrls: string[] | undefined;
      if (typeof scoresheetUrl === 'string' && scoresheetUrl.trim().startsWith('[')) {
        try {
          const parsed = JSON.parse(scoresheetUrl);
          if (Array.isArray(parsed) && parsed.length > 0) resolvedMultiUrls = parsed;
        } catch {}
      }
      if (!resolvedMultiUrls && selectedFiles.length > 1) {
        resolvedMultiUrls = selectedFiles.map((f) => URL.createObjectURL(f));
      }

      // Local preview URLs (using fast blob URLs from selectedFiles when available)
      const localDisplayUrls = selectedFiles.length > 0
        ? selectedFiles.map((f) => URL.createObjectURL(f))
        : (resolvedMultiUrls || (scoresheetUrl ? [scoresheetUrl] : []));

      const finalScoresheetUrlPayload = (resolvedMultiUrls && resolvedMultiUrls.length > 1)
        ? JSON.stringify(resolvedMultiUrls)
        : (scoresheetUrl || '');

      // Sanitize URL for network request to Firestore: strip raw data: base64 strings and blob: URLs
      // to keep the Firestore document well below the 1 MB hard limit
      const sanitizeUrlForNetwork = (url: string | undefined): string => {
        if (!url) return '';
        if (url.startsWith('data:') || url.startsWith('blob:')) return '';
        if (url.startsWith('[')) {
          try {
            const arr = JSON.parse(url);
            if (Array.isArray(arr)) {
              const clean = arr.filter((u: any) => typeof u === 'string' && !u.startsWith('data:') && !u.startsWith('blob:'));
              return clean.length > 0 ? JSON.stringify(clean) : '';
            }
          } catch {}
          return '';
        }
        return url;
      };

      const networkScoresheetUrl = sanitizeUrlForNetwork(finalScoresheetUrlPayload);
      const networkScoresheetUrls = resolvedMultiUrls?.filter((u) => !u.startsWith('data:') && !u.startsWith('blob:'));

      // Dispatch fast match creation with pre-uploaded scoresheet and verified stats
      const createdMatch = await createOfficialMatch({
        team_id: finalHome,
        home_team_name: finalHome,
        opponent_team_name: finalAway,
        sport_type: normalizedSport,
        match_date: isoDate,
        location: venueLocation,
        venue: venueLocation,
        court_number: 1,
        participating_teams: participating,
        matchName: gameName.trim() || `${finalHome} vs ${finalAway}`,
        match_name: gameName.trim() || `${finalHome} vs ${finalAway}`,
        gameName: gameName.trim() || `${finalHome} vs ${finalAway}`,
        game_name: gameName.trim() || `${finalHome} vs ${finalAway}`,
        gameReferenceId: gameName.trim() || undefined,
        coaches: coaches.map((c) => c.trim()).filter(Boolean),
        assigned_coaches: coaches.map((c) => c.trim()).filter(Boolean),
        scoresheet_url: networkScoresheetUrl,
        scoresheetUrl: networkScoresheetUrl,
        scoresheet_urls: (networkScoresheetUrls && networkScoresheetUrls.length > 0) ? networkScoresheetUrls : undefined,
        scoresheetUrls: (networkScoresheetUrls && networkScoresheetUrls.length > 0) ? networkScoresheetUrls : undefined,
        roster_athletes: homeRosterIds,
        rosterAthletes: homeRosterIds,
        away_roster_athletes: awayRosterIds,
        awayRosterAthletes: awayRosterIds,
        player_stats: isIndividualSport ? raceResults : playerStatsPayload,
        playerStats: isIndividualSport ? raceResults : playerStatsPayload,
        race_results: isIndividualSport ? raceResults : undefined,
        raceResults: isIndividualSport ? raceResults : undefined,
        sport_specific_details: isIndividualSport ? { race_results: raceResults } : undefined,
        notes: notes.trim(),
        home_score: homeDynamicScore.num,
        away_score: awayDynamicScore.num,
        game_result: dynamicMatchResult.homeResult,
        final_score: dynamicMatchResult.finalScore,
      } as any);

      const rawMatchId = createdMatch?.match?.match_id || createdMatch?.match_id;
      const cleanMatchId = rawMatchId ? String(rawMatchId).replace(/^#/, '') : '';
      const actualValidationId = createdMatch?.validation?.validation_id || createdMatch?.validation_id || createdMatch?.match?.validation_id || cleanMatchId;

      const displayDate = new Date(isoDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
      const displayTime = matchTime
        ? new Date(isoDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false })
        : '';

      const homeValidFg = homeRoster.map((r) => parseFloat(String(r.fg_pct || '').replace('%', ''))).filter((n) => !isNaN(n) && n > 0);
      const homeFgPct = homeValidFg.length > 0 ? `${(homeValidFg.reduce((a, b) => a + b, 0) / homeValidFg.length).toFixed(1)}%` : '0.0%';
      const homeValid3p = homeRoster.map((r) => parseFloat(String(r.three_p_pct || '').replace('%', ''))).filter((n) => !isNaN(n) && n > 0);
      const home3pPct = homeValid3p.length > 0 ? `${(homeValid3p.reduce((a, b) => a + b, 0) / homeValid3p.length).toFixed(1)}%` : '0.0%';
      const homeValidFt = homeRoster.map((r) => parseFloat(String(r.ft_pct || '').replace('%', ''))).filter((n) => !isNaN(n) && n > 0);
      const homeFtPct = homeValidFt.length > 0 ? `${(homeValidFt.reduce((a, b) => a + b, 0) / homeValidFt.length).toFixed(1)}%` : '0.0%';

      const awayValidFg = awayRoster.map((r) => parseFloat(String(r.fg_pct || '').replace('%', ''))).filter((n) => !isNaN(n) && n > 0);
      const awayFgPct = awayValidFg.length > 0 ? `${(awayValidFg.reduce((a, b) => a + b, 0) / awayValidFg.length).toFixed(1)}%` : '0.0%';
      const awayValid3p = awayRoster.map((r) => parseFloat(String(r.three_p_pct || '').replace('%', ''))).filter((n) => !isNaN(n) && n > 0);
      const away3pPct = awayValid3p.length > 0 ? `${(awayValid3p.reduce((a, b) => a + b, 0) / awayValid3p.length).toFixed(1)}%` : '0.0%';
      const awayValidFt = awayRoster.map((r) => parseFloat(String(r.ft_pct || '').replace('%', ''))).filter((n) => !isNaN(n) && n > 0);
      const awayFtPct = awayValidFt.length > 0 ? `${(awayValidFt.reduce((a, b) => a + b, 0) / awayValidFt.length).toFixed(1)}%` : '0.0%';

      if (cleanMatchId) {
        if (selectedFiles.length > 0) {
          saveScoresheetFilesToIndexedDB(cleanMatchId, selectedFiles).catch(() => {});
          if (selectedFiles.length > 1) {
            uploadMultipleScoresheetFiles(cleanMatchId, selectedFiles).catch(() => {});
          } else {
            uploadScoresheetFile(cleanMatchId, selectedFiles[0]).catch(() => {});
          }
        }
        const cachedDetail: MatchAuditDetail = {
          match_id: cleanMatchId,
          validation_id: actualValidationId,
          matchName: gameName.trim() || `${finalHome} vs ${finalAway}`,
          match_name: gameName.trim() || `${finalHome} vs ${finalAway}`,
          game_name: gameName.trim() || `${finalHome} vs ${finalAway}`,
          sport_type: normalizedSport,
          league_class: `${normalizedSport.toUpperCase()} • OFFICIAL MATCH`,
          match_date_formatted: displayTime ? `${displayDate} / ${displayTime}` : displayDate,
          home_team: {
            name: finalHome.toUpperCase(),
            score: homeDynamicScore.num,
            result: dynamicMatchResult.homeResult === 'WIN' ? 'WIN' : dynamicMatchResult.homeResult === 'DRAW' ? 'DRAW' : 'LOSE',
            roster_stats: homeRoster,
            team_totals: {
              jersey_no: '',
              player_name: 'TEAM TOTALS',
              minutes: '0',
              pts: homeDynamicScore.num,
              reb: homeRoster.reduce((a, b) => a + (Number(b.reb) || 0), 0),
              ast: homeRoster.reduce((a, b) => a + (Number(b.ast) || 0), 0),
              stl: homeRoster.reduce((a, b) => a + (Number(b.stl) || 0), 0),
              blk: homeRoster.reduce((a, b) => a + (Number(b.blk) || 0), 0),
              kills: homeRoster.reduce((a, b) => a + (Number(b.kills) || 0), 0),
              attack_errors: homeRoster.reduce((a, b) => a + (Number(b.attack_errors) || 0), 0),
              attack_attempts: homeRoster.reduce((a, b) => a + (Number(b.attack_attempts) || 0), 0),
              service_aces: homeRoster.reduce((a, b) => a + (Number(b.service_aces) || 0), 0),
              digs: homeRoster.reduce((a, b) => a + (Number(b.digs) || 0), 0),
              block_points: homeRoster.reduce((a, b) => a + (Number(b.blk || b.block_points) || 0), 0),
              goals: homeRoster.reduce((a, b) => a + (Number(b.goals) || 0), 0),
              shots: homeRoster.reduce((a, b) => a + (Number(b.shots) || 0), 0),
              shots_on_target: homeRoster.reduce((a, b) => a + (Number(b.shots_on_target) || 0), 0),
              saves: homeRoster.reduce((a, b) => a + (Number(b.saves) || 0), 0),
              tackles: homeRoster.reduce((a, b) => a + (Number(b.tackles) || 0), 0),
              fg_pct: homeFgPct,
              three_p_pct: home3pPct,
              ft_pct: homeFtPct,
            },
          },
          away_team: {
            name: finalAway.toUpperCase(),
            score: awayDynamicScore.num,
            result: dynamicMatchResult.awayResult === 'WIN' ? 'WIN' : dynamicMatchResult.awayResult === 'DRAW' ? 'DRAW' : 'LOSE',
            roster_stats: awayRoster,
            team_totals: {
              jersey_no: '',
              player_name: 'TEAM TOTALS',
              minutes: '0',
              pts: awayDynamicScore.num,
              reb: awayRoster.reduce((a, b) => a + (Number(b.reb) || 0), 0),
              ast: awayRoster.reduce((a, b) => a + (Number(b.ast) || 0), 0),
              stl: awayRoster.reduce((a, b) => a + (Number(b.stl) || 0), 0),
              blk: awayRoster.reduce((a, b) => a + (Number(b.blk) || 0), 0),
              kills: awayRoster.reduce((a, b) => a + (Number(b.kills) || 0), 0),
              attack_errors: awayRoster.reduce((a, b) => a + (Number(b.attack_errors) || 0), 0),
              attack_attempts: awayRoster.reduce((a, b) => a + (Number(b.attack_attempts) || 0), 0),
              service_aces: awayRoster.reduce((a, b) => a + (Number(b.service_aces) || 0), 0),
              digs: awayRoster.reduce((a, b) => a + (Number(b.digs) || 0), 0),
              block_points: awayRoster.reduce((a, b) => a + (Number(b.blk || b.block_points) || 0), 0),
              goals: awayRoster.reduce((a, b) => a + (Number(b.goals) || 0), 0),
              shots: awayRoster.reduce((a, b) => a + (Number(b.shots) || 0), 0),
              shots_on_target: awayRoster.reduce((a, b) => a + (Number(b.shots_on_target) || 0), 0),
              saves: awayRoster.reduce((a, b) => a + (Number(b.saves) || 0), 0),
              tackles: awayRoster.reduce((a, b) => a + (Number(b.tackles) || 0), 0),
              fg_pct: awayFgPct,
              three_p_pct: away3pPct,
              ft_pct: awayFtPct,
            },
          },
          race_results: raceResults,
          scoresheet_url: localDisplayUrls.length > 1 ? JSON.stringify(localDisplayUrls) : (localDisplayUrls[0] || finalScoresheetUrlPayload),
          scoresheet_urls: localDisplayUrls.length > 0 ? localDisplayUrls : resolvedMultiUrls,
          audit_context_notes: notes.trim(),
          is_certified: false,
          assigned_coaches: coaches.map((c) => c.trim()).filter(Boolean),
          coach_name: coaches[0]?.trim() || undefined,
        };

        setCachedData(`match_audit_detail_${cleanMatchId}`, cachedDetail);
        try {
          localStorage.setItem(`atleta_match_detail_${cleanMatchId}`, JSON.stringify(cachedDetail));
        } catch {}

        // Optimistically update all_official_matches_master cache so Home page updates instantly
        const displayTitle = gameName.trim() || (isIndividualSport ? teams.filter(Boolean).join(', ') : `${finalHome} vs ${finalAway}`);
        const newSummaryItem: MatchSummaryItem = {
          match_id: cleanMatchId ? `#${cleanMatchId}` : `#match_${Date.now()}`,
          validation_id: cleanMatchId || '',
          matchName: displayTitle,
          match_name: displayTitle,
          match_class: displayTitle,
          sport: normalizedSport,
          coaches: coaches.map((c) => c.trim()).filter(Boolean).join(', '),
          date_time: displayTime ? `${displayDate} • ${displayTime}` : displayDate,
          status: 'PENDING',
          raw_match: {
            ...cachedDetail,
            match_id: cleanMatchId,
            match_date: isoDate,
            scheduled_time: isoDate,
            official_id: user?.uid || '',
            created_at: new Date().toISOString(),
          },
        };

        try {
          let prevMaster = getCachedData<MatchSummaryItem[]>('all_official_matches_master');
          if (!prevMaster || !Array.isArray(prevMaster)) {
            const raw = localStorage.getItem('atleta_cached_official_matches_master');
            prevMaster = raw ? JSON.parse(raw) : [];
          }
          const nextMaster = [newSummaryItem, ...(prevMaster || []).filter((m) => m.match_id !== newSummaryItem.match_id)];
          setCachedData('all_official_matches_master', nextMaster);
          localStorage.setItem('atleta_cached_official_matches_master', JSON.stringify(nextMaster));
        } catch {}

        try {
          let prevDash = getCachedData<any>('official_dashboard');
          if (!prevDash) {
            const raw = localStorage.getItem('atleta_cached_official_dashboard');
            prevDash = raw ? JSON.parse(raw) : null;
          }
          if (prevDash) {
            const nextDash = {
              ...prevDash,
              total_matches: (prevDash.total_matches || 0) + 1,
              pending_audits: (prevDash.pending_audits || 0) + 1,
            };
            setCachedData('official_dashboard', nextDash);
            localStorage.setItem('atleta_cached_official_dashboard', JSON.stringify(nextDash));
          }
        } catch {}
      }

      if (parsedMatches.length > 1) {
        setParsedMatches((prev) => {
          const next = [...prev];
          if (next[activeMatchIndex]) {
            next[activeMatchIndex] = { ...next[activeMatchIndex], isSaved: true };
          }
          return next;
        });
      }

      setCreatedMatchInfo({
        matchId: cleanMatchId ? `#${cleanMatchId}` : `#match_${Date.now()}`,
        sport: normalizedSport,
        matchDate: displayTime ? `${displayDate} • ${displayTime}` : displayDate,
        teams: participating,
        gameName: gameName.trim() || `${finalHome} vs ${finalAway}`,
        venue: venueLocation,
      });
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to create match instance.');
    } finally {
      setSubmitting(false);
    }
  };

  // Render Box Score Table for Team Ball Sports
  const renderTeamBoxScoreTable = (teamType: 'home' | 'away', teamName: string, roster: BoxScoreRow[]) => {
    const totalPts = roster.reduce((a, b) => a + (Number(b.pts) || 0), 0);
    const totalVolleyPts = roster.reduce((a, b) => a + (Number(b.pts || (b.kills || 0) + (b.service_aces || 0) + (b.blk || 0)) || 0), 0);
    const totalGoals = roster.reduce((a, b) => a + (Number(b.goals ?? b.pts) || 0), 0);

    return (
      <div style={styles.tableSection}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={styles.tableSectionTitle}>
            {teamName ? teamName.toUpperCase() : teamType === 'home' ? 'TEAM 1 (HOME)' : 'TEAM 2 (AWAY)'} ROSTER STATS ({roster.length} PLAYERS)
          </div>
          <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748B' }}>
            SCORE: <strong style={{ color: '#0B132B', fontSize: '13px' }}>
              {isSoccer ? `${totalGoals} GOALS` : isVolleyball ? `${totalVolleyPts} PTS` : `${totalPts} PTS`}
            </strong>
          </span>
        </div>

        <div style={styles.statsTableFrame}>
          <table style={styles.statsTable}>
            <thead>
              <tr>
                <th style={{ ...styles.statTh, width: '45px' }}>[ # ]</th>
                <th style={{ ...styles.statTh, textAlign: 'left', paddingLeft: '12px' }}>[ PLAYER NAME ]</th>
                <th style={{ ...styles.statTh, width: '50px' }}>[ POS ]</th>
                {dynamicSportColumns.map((col) => (
                  <th key={col.key} style={{ ...styles.statTh, width: col.isNumeric ? '55px' : '65px' }}>
                    [ {col.label} ]
                  </th>
                ))}
                <th style={{ ...styles.statTh, width: '40px', borderRight: 'none' }}></th>
              </tr>
            </thead>
            <tbody>
              {roster.length > 0 ? (
                roster.map((row, idx) => (
                  <tr key={`${teamType}-${idx}`} style={styles.statTr}>
                    <td style={styles.statTd}>
                      <input
                        type="text"
                        value={row.jersey_no}
                        onChange={(e) => updateBasketballStat(teamType, idx, 'jersey_no', e.target.value)}
                        style={styles.statInput}
                      />
                    </td>
                    <td style={{ ...styles.statTd, ...styles.statTdName }}>
                      <input
                        type="text"
                        value={row.player_name}
                        onChange={(e) => updateBasketballStat(teamType, idx, 'player_name', e.target.value)}
                        style={styles.statInputName}
                      />
                    </td>
                    <td style={styles.statTd}>
                      <input
                        type="text"
                        value={row.position || (isVolleyball ? 'OH' : isSoccer ? 'FWD' : 'G')}
                        onChange={(e) => updateBasketballStat(teamType, idx, 'position', e.target.value)}
                        style={styles.statInput}
                      />
                    </td>

                    {dynamicSportColumns.map((col) => {
                      const val = getMetricValue(row, col.key);
                      return (
                        <td key={col.key} style={styles.statTd}>
                          <input
                            type={col.isNumeric ? 'number' : 'text'}
                            value={val !== undefined && val !== null ? val : (col.isNumeric ? 0 : '')}
                            onChange={(e) => {
                              const v = col.isNumeric ? parseRobustStatNum(e.target.value, col.key) : e.target.value;
                              updateBasketballStat(teamType, idx, col.key, v);
                            }}
                            style={styles.statInput}
                          />
                        </td>
                      );
                    })}

                    <td style={{ ...styles.statTd, borderRight: 'none', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => removeBasketballPlayer(teamType, idx)}
                        style={styles.removeRowBtn}
                        title="Remove Player"
                      >
                        <Trash2 style={{ width: 14, height: 14 }} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={dynamicSportColumns.length + 4} style={{ padding: '20px', color: '#64748B', textAlign: 'center' }}>
                    No player roster rows extracted. Click below to add players manually.
                  </td>
                </tr>
              )}

              {/* Totals Row */}
              <tr style={styles.statTotalsTr}>
                <td style={styles.statTotalsTd}></td>
                <td style={{ ...styles.statTotalsTd, textAlign: 'left', paddingLeft: '12px' }}>TEAM TOTALS</td>
                <td style={styles.statTotalsTd}>-</td>
                {dynamicSportColumns.map((col) => {
                  if (col.isNumeric) {
                    const total = roster.reduce((sum, r) => {
                      const val = getMetricValue(r, col.key);
                      const num = typeof val === 'number' ? val : parseFloat(val);
                      return sum + (isNaN(num) ? 0 : num);
                    }, 0);
                    return (
                      <td key={col.key} style={styles.statTotalsTd}>
                        {Number.isInteger(total) ? total : total.toFixed(1)}
                      </td>
                    );
                  }
                  return (
                    <td key={col.key} style={styles.statTotalsTd}>
                      -
                    </td>
                  );
                })}
                <td style={{ ...styles.statTotalsTd, borderRight: 'none' }}></td>
              </tr>
            </tbody>
          </table>
        </div>

        <button
          type="button"
          onClick={() => addBasketballPlayer(teamType)}
          className="hover-btn-outline"
          style={styles.addRowBtn}
        >
          <Plus style={{ width: 13, height: 13 }} />
          <span>ADD PLAYER TO {teamName || teamType.toUpperCase()}</span>
        </button>
      </div>
    );
  };

  // Render Table for Individual Sports (Swimming / Track & Field)
  const renderIndividualRaceTable = () => {
    const sortedRaces = sortRaceResultsByTime(raceResults);
    const top3 = sortedRaces.filter((r) => !r.is_disqualified).slice(0, 3);

    return (
      <div style={styles.tableSection}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={styles.tableSectionTitle}>
            {sportCategory.toUpperCase()} EVENT RESULTS ({sortedRaces.length} PARTICIPANTS)
          </div>
        </div>

        {/* TOP 3 PODIUM FINISHERS HIGHLIGHT */}
        {top3.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            {top3.map((podium, pIdx) => {
              const medal = pIdx === 0 ? '🥇 1ST PLACE (GOLD)' : pIdx === 1 ? '🥈 2ND PLACE (SILVER)' : '🥉 3RD PLACE (BRONZE)';
              const borderCol = pIdx === 0 ? '#EAB308' : pIdx === 1 ? '#94A3B8' : '#F97316';
              const bgCol = pIdx === 0 ? '#FEFCE8' : pIdx === 1 ? '#F8FAFC' : '#FFF7ED';
              const textCol = pIdx === 0 ? '#854D0E' : pIdx === 1 ? '#334155' : '#9A3412';
              return (
                <div
                  key={`podium-${pIdx}`}
                  style={{
                    border: `2px solid ${borderCol}`,
                    backgroundColor: bgCol,
                    borderRadius: '10px',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 900, color: textCol, letterSpacing: '0.05em' }}>
                    {medal}
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 900, color: '#0B132B' }}>
                    {podium.athlete_name}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                    <span>{podium.team_name || 'Individual'}</span>
                    <strong style={{ color: '#0B132B', fontFamily: 'monospace', fontSize: '13px' }}>
                      {podium.finish_time}
                    </strong>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={styles.statsTableFrame}>
          <table style={styles.statsTable}>
            <thead>
              <tr>
                <th style={{ ...styles.statTh, width: '90px' }}>[ RANK ]</th>
                <th style={{ ...styles.statTh, textAlign: 'left', paddingLeft: '12px' }}>[ ATHLETE NAME ]</th>
                <th style={styles.statTh}>[ TEAM / AFFILIATION ]</th>
                <th style={styles.statTh}>[ EVENT / DISTANCE ]</th>
                <th style={styles.statTh}>[ FINISH TIME ]</th>
                <th style={styles.statTh}>[ SPLIT TIMES ]</th>
                <th style={styles.statTh}>[ EFFICIENCY ]</th>
                <th style={{ ...styles.statTh, width: '40px', borderRight: 'none' }}></th>
              </tr>
            </thead>
            <tbody>
              {sortedRaces.length > 0 ? (
                sortedRaces.map((row, idx) => {
                  const isGold = idx === 0 && !row.is_disqualified;
                  const isSilver = idx === 1 && !row.is_disqualified;
                  const isBronze = idx === 2 && !row.is_disqualified;
                  const rowBg = isGold ? '#FEFCE840' : isSilver ? '#F8FAFC40' : isBronze ? '#FFF7ED40' : undefined;

                  return (
                    <tr key={`race-${idx}`} style={{ ...styles.statTr, backgroundColor: rowBg }}>
                      <td style={styles.statTd}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 800,
                            backgroundColor: isGold ? '#FEF08A' : isSilver ? '#E2E8F0' : isBronze ? '#FFEDD5' : '#F1F5F9',
                            color: isGold ? '#854D0E' : isSilver ? '#334155' : isBronze ? '#9A3412' : '#475569',
                          }}>
                            {isGold ? '🥇 #1' : isSilver ? '🥈 #2' : isBronze ? '🥉 #3' : `#${row.placement_rank || idx + 1}`}
                          </span>
                        </div>
                      </td>
                      <td style={{ ...styles.statTd, ...styles.statTdName }}>
                        <input
                          type="text"
                          value={row.athlete_name}
                          onChange={(e) => updateRaceStat(idx, 'athlete_name', e.target.value)}
                          style={{ ...styles.statInputName, fontWeight: (isGold || isSilver || isBronze) ? 800 : 600 }}
                        />
                      </td>
                      <td style={styles.statTd}>
                        <input
                          type="text"
                          value={row.team_name || ''}
                          onChange={(e) => updateRaceStat(idx, 'team_name', e.target.value)}
                          style={styles.statInput}
                        />
                      </td>
                      <td style={styles.statTd}>
                        <input
                          type="text"
                          value={row.distance}
                          onChange={(e) => updateRaceStat(idx, 'distance', e.target.value)}
                          style={styles.statInput}
                        />
                      </td>
                      <td style={styles.statTd}>
                        <input
                          type="text"
                          value={row.finish_time}
                          onChange={(e) => updateRaceStat(idx, 'finish_time', e.target.value)}
                          style={{
                            ...styles.statInput,
                            fontWeight: (isGold || isSilver || isBronze) ? 800 : 600,
                            color: isGold ? '#854D0E' : '#0B132B',
                          }}
                        />
                      </td>
                      <td style={styles.statTd}>
                        <input
                          type="text"
                          value={Array.isArray(row.split_times) ? row.split_times.join(' / ') : String(row.split_times || '')}
                          onChange={(e) => updateRaceStat(idx, 'split_times', e.target.value.split('/').map((s) => s.trim()))}
                          style={styles.statInput}
                        />
                      </td>
                      <td style={styles.statTd}>
                        <input
                          type="number"
                          value={row.efficiency ?? 100}
                          onChange={(e) => updateRaceStat(idx, 'efficiency', Number(e.target.value) || 0)}
                          style={styles.statInput}
                        />
                      </td>
                      <td style={{ ...styles.statTd, borderRight: 'none', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => removeRaceAthlete(idx)}
                          style={styles.removeRowBtn}
                          title="Remove Athlete"
                        >
                          <Trash2 style={{ width: 14, height: 14 }} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} style={{ padding: '20px', color: '#64748B', textAlign: 'center' }}>
                    No race results extracted yet. Click below to add an athlete row.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          onClick={addRaceAthlete}
          className="hover-btn-outline"
          style={styles.addRowBtn}
        >
          <Plus style={{ width: 13, height: 13 }} />
          <span>ADD ATHLETE RESULT</span>
        </button>
      </div>
    );
  };

  return (
    <div style={styles.shell}>
      <Navbar user={user} />

      <div style={styles.layoutBody}>
        <Sidebar activeTab="DASHBOARD" />

        <main style={styles.contentArea}>
          <h1 style={styles.pageTitle}>CREATE NEW GAME</h1>
          <p style={styles.pageSubtitle}>
            Create your game, customize the game, upload official scoresheets, and share to involved coaches !
          </p>

          {errorMessage && <div style={styles.errorNotice}>{errorMessage}</div>}

          <form onSubmit={handleSubmit} noValidate>
            {/* Section 01: GENERAL MATCH DETAILS */}
            <div style={styles.sectionCard}>
              <div style={styles.sectionHeaderRow}>
                <h3 style={styles.sectionHeading}>01. GENERAL MATCH DETAILS</h3>
                <Info style={styles.headerIcon} />
              </div>

              <div style={styles.formGrid2}>
                <div style={styles.fieldGroup}>
                  <label style={styles.fieldLabel}>GAME NAME / REFERENCE ID</label>
                  <input
                    type="text"
                    placeholder="E.G. CHAMPIONSHIP-2026-001"
                    value={gameName}
                    onChange={(e) => setGameName(e.target.value)}
                    className="hover-input"
                    style={styles.input}
                  />
                </div>

                <div style={styles.fieldGroup}>
                  <label style={styles.fieldLabel}>SPORT CATEGORY</label>
                  <select
                    required
                    value={sportCategory}
                    onChange={(e) => setSportCategory(e.target.value)}
                    className="hover-input"
                    style={styles.select}
                  >
                    {uniqueSports.length === 0 ? (
                      <option value="" disabled>Loading sports...</option>
                    ) : (
                      uniqueSports.map((sport) => (
                        <option key={sport.id} value={sport.sportName}>
                          {sport.sportName}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.fieldLabel}>VENUE / LOCATION</label>
                <input
                  type="text"
                  placeholder="E.G. MAIN GYMNASIUM / COURT 1 OR AQUATICS CENTER"
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  className="hover-input"
                  style={styles.input}
                />
              </div>

              <div style={styles.formGrid2}>
                <div style={styles.fieldGroup}>
                  <label style={styles.fieldLabel}>MATCH DATE</label>
                  <input
                    type="date"
                    required
                    min={todayStr}
                    value={matchDate}
                    onChange={(e) => setMatchDate(e.target.value)}
                    className="hover-input"
                    style={styles.input}
                  />
                </div>

                <div style={styles.fieldGroup}>
                  <label style={styles.fieldLabel}>MATCH TIME</label>
                  <input
                    type="time"
                    value={matchTime}
                    onChange={(e) => setMatchTime(e.target.value)}
                    className="hover-input"
                    style={styles.input}
                  />
                </div>
              </div>
            </div>

            {/* Section 02: AFFILIATION & PERSONNEL */}
            <div style={styles.sectionCard}>
              <div style={styles.sectionHeaderRow}>
                <h3 style={styles.sectionHeading}>02. AFFILIATION & PERSONNEL</h3>
                <Users style={styles.headerIcon} />
              </div>

              <datalist id="teams-list">
                {availableTeams.map((t, idx) => (
                  <option key={idx} value={t.team_name || t.name || t.id} />
                ))}
              </datalist>

              {/* For standard 2-team sports like Basketball */}
              {!isIndividualSport ? (
                <div style={styles.formGrid2}>
                  <div style={styles.fieldGroup}>
                    <label style={styles.fieldLabel}>TEAM 1 (HOME)</label>
                    <input
                      type="text"
                      required
                      list="teams-list"
                      placeholder="E.G. ADNU Knights"
                      value={homeTeam}
                      onChange={(e) => setHomeTeam(e.target.value)}
                      className="hover-input"
                      style={styles.input}
                    />
                  </div>

                  <div style={styles.fieldGroup}>
                    <label style={styles.fieldLabel}>TEAM 2 (AWAY)</label>
                    <input
                      type="text"
                      required
                      list="teams-list"
                      placeholder="E.G. ADMU Eagles"
                      value={awayTeam}
                      onChange={(e) => setAwayTeam(e.target.value)}
                      className="hover-input"
                      style={styles.input}
                    />
                  </div>
                </div>
              ) : (
                /* Dynamic Participating Teams for Swimming & Track and Field */
                <div>
                  {teams.map((team, idx) => (
                    <div key={idx} style={{ ...styles.fieldGroup, marginBottom: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={styles.fieldLabel}>PARTICIPATING DELEGATION {idx + 1}</label>
                        {teams.length > 2 && (
                          <button
                            type="button"
                            onClick={() => {
                              setTeams(teams.filter((_, i) => i !== idx));
                              if (coaches.length > 2) {
                                setCoaches(coaches.filter((_, i) => i !== idx));
                              }
                            }}
                            style={{ border: 'none', background: 'transparent', color: '#EF4444', fontSize: '11px', cursor: 'pointer', fontWeight: 700 }}
                          >
                            REMOVE
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        required
                        list="teams-list"
                        placeholder={`Delegation ${idx + 1} Name`}
                        value={team}
                        onChange={(e) => handleTeamChange(idx, e.target.value)}
                        className="hover-input"
                        style={styles.input}
                      />
                    </div>
                  ))}
                  <div
                    style={styles.addCoachBox}
                    className="hover-btn-outline"
                    onClick={() => {
                      setTeams([...teams, '']);
                      setCoaches([...coaches, '']);
                    }}
                  >
                    <span style={styles.addCoachLabel}>ADD TEAM</span>
                    <PlusCircle style={{ width: 16, height: 16, color: '#0B132B' }} />
                  </div>
                </div>
              )}

              {/* Assigned Coaches */}
              {coaches.map((coach, idx) => (
                <div key={idx} style={{ ...styles.fieldGroup, marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={styles.fieldLabel}>
                      {isIndividualSport
                        ? `ASSIGNED COACH (DELEGATION ${idx + 1}) *`
                        : idx === 0
                          ? 'ASSIGNED COACH (TEAM 1 - HOME) *'
                          : idx === 1
                            ? 'ASSIGNED COACH (TEAM 2 - AWAY) *'
                            : `ASSIGNED COACH ${idx + 1} *`}
                    </label>
                    {coaches.length > (isIndividualSport ? Math.max(2, teams.length) : 2) && (
                      <button
                        type="button"
                        onClick={() => setCoaches(coaches.filter((_, i) => i !== idx))}
                        style={{ border: 'none', background: 'transparent', color: '#EF4444', fontSize: '11px', cursor: 'pointer', fontWeight: 700 }}
                      >
                        REMOVE
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    required
                    placeholder={
                      isIndividualSport
                        ? `Coach Full Name / ID for Delegation ${idx + 1}`
                        : idx === 0
                          ? 'Coach Full Name / ID for Team 1 (Home)'
                          : 'Coach Full Name / ID for Team 2 (Away)'
                    }
                    value={coach}
                    onChange={(e) => handleCoachChange(idx, e.target.value)}
                    className="hover-input"
                    style={styles.input}
                  />
                </div>
              ))}

              <div style={styles.addCoachBox} className="hover-btn-outline" onClick={() => setCoaches([...coaches, ''])}>
                <span style={styles.addCoachLabel}>ADD COACH</span>
                <PlusCircle style={{ width: 16, height: 16, color: '#0B132B' }} />
              </div>
            </div>

            {/* Section 03: DATA SCORESHEET */}
            <div style={styles.sectionCard}>
              <div style={styles.sectionHeaderRow}>
                <h3 style={styles.sectionHeading}>03. DATA SCORESHEET</h3>
                <CloudUpload style={styles.headerIcon} />
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".png,.jpg,.jpeg,.pdf,.csv"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <input
                ref={appendFileInputRef}
                type="file"
                multiple
                accept=".png,.jpg,.jpeg,.pdf,.csv"
                style={{ display: 'none' }}
                onChange={handleAddMoreFiles}
              />

              <div
                style={{
                  ...styles.dropzoneContainer,
                  ...(ocrLoading ? { backgroundColor: '#F8FAFC', borderColor: '#0B132B' } : {}),
                  ...(selectedFile ? { cursor: 'default' } : {}),
                }}
                className={selectedFile ? '' : 'hover-dropzone'}
                onClick={() => {
                  if (!selectedFile && !ocrLoading) fileInputRef.current?.click();
                }}
              >
                {ocrLoading ? (
                  <>
                    <Loader2 style={{ width: 34, height: 34, color: '#0B132B', animation: 'spin 1s linear infinite' }} />
                    <span style={styles.dropzoneTitle}>
                      {selectedFiles.length > 1 ? `SCANNING ${selectedFiles.length} SCORESHEET PAGES WITH OCR...` : 'SCANNING SCORESHEET WITH OCR...'}
                    </span>
                    <span style={styles.dropzoneHelper}>EXTRACTING ROSTER & STATISTICS AUTOMATICALLY</span>
                  </>
                ) : selectedFile ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                    {/* Bento Grid for Multi-File Uploads */}
                    {selectedFiles.length > 1 ? (
                      <div style={styles.bentoGrid}>
                        {selectedFiles.map((file, idx) => {
                          const fileUrl = URL.createObjectURL(file);
                          const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
                          return (
                            <div
                              key={idx}
                              style={{ ...styles.bentoCard, cursor: 'pointer' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewModalUrl(fileUrl);
                              }}
                              title="Click to enlarge preview"
                            >
                              <div style={styles.bentoHeader}>
                                <span style={styles.bentoBadge}>PAGE {idx + 1}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveFile(idx);
                                  }}
                                  style={styles.bentoDeleteBtn}
                                  title="Remove page"
                                >
                                  <Trash2 style={{ width: 11, height: 11 }} />
                                  <span>DELETE</span>
                                </button>
                              </div>
                              {isPdf ? (
                                <iframe src={fileUrl} title={`Page ${idx + 1}`} style={styles.bentoThumb} />
                              ) : (
                                <img src={fileUrl} alt={`Page ${idx + 1}`} style={styles.bentoThumb} />
                              )}
                              <span style={styles.bentoFileName}>{file.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* Single File Compact Preview */
                      <div
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewModalUrl(scoresheetUrl || localPreviewUrl || '');
                        }}
                        title="Click to enlarge preview"
                      >
                        {selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf') ? (
                          <iframe src={scoresheetUrl || localPreviewUrl || ''} title="Scoresheet Preview" style={styles.singlePreviewIframe} />
                        ) : (
                          <img src={scoresheetUrl || localPreviewUrl || ''} alt={selectedFile.name} style={styles.singlePreviewImage} />
                        )}
                        <span style={styles.activeFileLabel}>{selectedFile.name}</span>
                      </div>
                    )}

                    {/* User Action Buttons Toolbar */}
                    <div style={styles.actionToolbar}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          appendFileInputRef.current?.click();
                        }}
                        className="hover-btn-outline"
                        style={styles.actionBtnPrimary}
                      >
                        <Plus style={{ width: 14, height: 14 }} />
                        <span>ADD ANOTHER PAGE</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                        className="hover-btn-outline"
                        style={styles.actionBtnOutline}
                      >
                        <Upload style={{ width: 14, height: 14 }} />
                        <span>REPLACE ALL</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveAllFiles();
                        }}
                        className="hover-btn-outline"
                        style={styles.actionBtnDanger}
                      >
                        <Trash2 style={{ width: 14, height: 14 }} />
                        <span>REMOVE {selectedFiles.length > 1 ? 'ALL' : 'FILE'}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <Camera style={{ width: 32, height: 32, color: '#0B132B' }} />
                    <span style={styles.dropzoneTitle}>DRAG FILES HERE OR CLICK TO BROWSE</span>
                    <span style={styles.dropzoneHelper}>ACCEPTED FORMATS: PNG, JPG, PDF (SELECT SINGLE OR MULTIPLE PAGES, MAX 25MB)</span>
                  </>
                )}
              </div>
            </div>

            {/* Extracted Scoresheet Preview & Live Editing */}
            {(ocrCompleted || homeRoster.length > 0 || raceResults.length > 0 || ocrLoading) && (
              <div style={styles.sectionCard}>
                <div style={styles.sectionHeaderRow}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sparkles style={{ width: 18, height: 18, color: '#0B132B' }} />
                    <h3 style={styles.sectionHeading}>EXTRACTED SCORESHEET PREVIEW & STATS</h3>
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 800, padding: '4px 8px', backgroundColor: '#0B132B', color: '#FFFFFF', letterSpacing: '0.04em' }}>
                    LIVE EDITABLE
                  </span>
                </div>

                {ocrLoading ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
                    <Loader2 style={{ width: 26, height: 26, animation: 'spin 1s linear infinite', margin: '0 auto 12px', color: '#0B132B' }} />
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#0B132B' }}>
                      Extracting statistics from uploaded scoresheet...
                    </p>
                  </div>
                ) : (
                  <>
                    {/* BATCH MATCHES SWITCHER TAB BAR (If multiple matches were uploaded) */}
                    {parsedMatches.length > 1 && (
                      <div
                        style={{
                          marginBottom: '18px',
                          backgroundColor: '#0E1626',
                          borderRadius: '8px',
                          padding: '12px 16px',
                          border: '1.5px solid #1E293B',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '10px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Layers style={{ width: 15, height: 15, color: '#00C8FF' }} />
                            <span
                              style={{
                                color: '#00C8FF',
                                fontSize: '11px',
                                fontWeight: 900,
                                letterSpacing: '1.2px',
                                textTransform: 'uppercase',
                              }}
                            >
                              UPLOADED MATCHES ({parsedMatches.length} SEPARATED)
                            </span>
                          </div>
                          <span style={{ color: '#94A3B8', fontSize: '11px', fontWeight: 700 }}>
                            Match {activeMatchIndex + 1} of {parsedMatches.length}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {parsedMatches.map((m, idx) => {
                            const isSelected = idx === activeMatchIndex;
                            const mSport = (m.sport || 'MATCH').toUpperCase();
                            const mHome = (m.homeTeam || 'TEAM 1').trim();
                            const mAway = (m.awayTeam || 'TEAM 2').trim();
                            const homeLabel = mHome.length > 12 ? `${mHome.slice(0, 10)}..` : mHome;
                            const awayLabel = mAway.length > 12 ? `${mAway.slice(0, 10)}..` : mAway;
                            const label = `M${idx + 1}: ${mSport.slice(0, 3)} • ${homeLabel} vs ${awayLabel}`;

                            return (
                              <button
                                key={`match_tab_${idx}`}
                                type="button"
                                onClick={() => handleSwitchMatch(idx)}
                                style={{
                                  flex: '1 1 200px',
                                  maxWidth: '360px',
                                  padding: '10px 14px',
                                  borderRadius: '6px',
                                  backgroundColor: isSelected ? '#00C8FF' : '#131E32',
                                  border: `1.5px solid ${isSelected ? '#00C8FF' : '#1E293B'}`,
                                  color: isSelected ? '#070D19' : '#FFFFFF',
                                  fontWeight: isSelected ? 800 : 700,
                                  fontSize: '12px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '6px',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                {m.isSaved ? (
                                  <CheckCircle2 style={{ width: 14, height: 14, color: isSelected ? '#070D19' : '#10B981' }} />
                                ) : isSelected ? (
                                  <CheckCircle2 style={{ width: 14, height: 14, color: '#070D19' }} />
                                ) : (
                                  <FileText style={{ width: 14, height: 14, color: '#94A3B8' }} />
                                )}
                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {isIndividualSport ? (
                  <>
                    {/* Dynamic Timed Event Header */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        border: '2px solid #0B132B',
                        boxShadow: '3px 3px 0px #0B132B',
                        backgroundColor: '#0B132B',
                        color: '#FFFFFF',
                        padding: '14px 20px',
                        marginBottom: '16px',
                      }}
                    >
                      <div>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.05em' }}>
                          TIMED EVENT CLASSIFICATION
                        </span>
                        <h4 style={{ margin: '4px 0 0 0', fontSize: '17px', fontWeight: 900, color: '#FFFFFF' }}>
                          {activeSportCategory.toUpperCase()} • RACE RESULTS
                        </h4>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.05em' }}>
                          RECORDED ATHLETES
                        </span>
                        <div style={{ fontSize: '22px', fontWeight: 900, color: '#00C8FF' }}>
                          {raceResults.length} ATHLETES
                        </div>
                      </div>
                    </div>
                    {renderIndividualRaceTable()}
                  </>
                ) : (
                  <>
                    {/* Dynamic Match Scoreboard Card (Aligned with Mobile) */}
                    <div
                      style={{
                        border: '2px solid #0B132B',
                        boxShadow: '3px 3px 0px #0B132B',
                        backgroundColor: '#0B132B',
                        color: '#FFFFFF',
                        padding: '16px 20px',
                        marginBottom: '18px',
                      }}
                    >
                      {/* Scoreboard Header */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingBottom: '10px',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.15)',
                          marginBottom: '14px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Trophy style={{ width: 16, height: 16, color: '#00C8FF' }} />
                          <span
                            style={{
                              fontSize: '12px',
                              fontWeight: 900,
                              letterSpacing: '0.06em',
                              textTransform: 'uppercase',
                              color: '#FFFFFF',
                            }}
                          >
                            MATCH SCOREBOARD • {activeSportCategory.toUpperCase()}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              backgroundColor: '#00C8FF',
                              color: '#0B132B',
                              fontSize: '11px',
                              fontWeight: 900,
                              padding: '3px 10px',
                              letterSpacing: '0.05em',
                              borderRadius: '2px',
                            }}
                          >
                            FINAL: {dynamicMatchResult.finalScore}
                          </span>
                          <span
                            style={{
                              backgroundColor:
                                dynamicMatchResult.homeResult === 'DRAW'
                                  ? '#F59E0B'
                                  : dynamicMatchResult.homeResult === 'PENDING'
                                  ? '#475569'
                                  : '#10B981',
                              color: '#FFFFFF',
                              fontSize: '11px',
                              fontWeight: 900,
                              padding: '3px 10px',
                              letterSpacing: '0.05em',
                              borderRadius: '2px',
                            }}
                          >
                            {dynamicMatchResult.summary}
                          </span>
                        </div>
                      </div>

                      {/* Scoreboard Body */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr auto 1fr',
                          alignItems: 'center',
                          gap: '20px',
                          padding: '4px 8px',
                        }}
                      >
                        {/* Home Team */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '3px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.05em' }}>
                              TEAM 1 (HOME)
                            </span>
                            <span
                              style={{
                                fontSize: '9.5px',
                                fontWeight: 900,
                                padding: '1px 6px',
                                backgroundColor:
                                  dynamicMatchResult.homeResult === 'WIN'
                                    ? '#10B981'
                                    : dynamicMatchResult.homeResult === 'DRAW'
                                    ? '#F59E0B'
                                    : dynamicMatchResult.homeResult === 'PENDING'
                                    ? '#334155'
                                    : '#EF4444',
                                color: '#FFFFFF',
                                borderRadius: '2px',
                              }}
                            >
                              {dynamicMatchResult.homeResult}
                            </span>
                          </div>
                          <span
                            style={{
                              fontSize: '18px',
                              fontWeight: 900,
                              color: '#FFFFFF',
                              letterSpacing: '-0.01em',
                            }}
                          >
                            {homeTeam || 'TEAM 1'}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                            <span style={{ fontSize: '32px', fontWeight: 900, color: '#00C8FF', lineHeight: 1 }}>
                              {homeDynamicScore.primary}
                            </span>
                            {homeDynamicScore.secondary && (
                              <span style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8' }}>
                                ({homeDynamicScore.secondary})
                              </span>
                            )}
                          </div>
                        </div>

                        {/* VS Center */}
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0 12px',
                          }}
                        >
                          <span style={{ fontSize: '16px', fontWeight: 900, color: '#64748B', letterSpacing: '0.1em' }}>
                            VS
                          </span>
                        </div>

                        {/* Away Team */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span
                              style={{
                                fontSize: '9.5px',
                                fontWeight: 900,
                                padding: '1px 6px',
                                backgroundColor:
                                  dynamicMatchResult.awayResult === 'WIN'
                                    ? '#10B981'
                                    : dynamicMatchResult.awayResult === 'DRAW'
                                    ? '#F59E0B'
                                    : dynamicMatchResult.awayResult === 'PENDING'
                                    ? '#334155'
                                    : '#EF4444',
                                color: '#FFFFFF',
                                borderRadius: '2px',
                              }}
                            >
                              {dynamicMatchResult.awayResult}
                            </span>
                            <span style={{ fontSize: '10px', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.05em' }}>
                              TEAM 2 (AWAY)
                            </span>
                          </div>
                          <span
                            style={{
                              fontSize: '18px',
                              fontWeight: 900,
                              color: '#FFFFFF',
                              letterSpacing: '-0.01em',
                            }}
                          >
                            {awayTeam || 'TEAM 2'}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                            {awayDynamicScore.secondary && (
                              <span style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8' }}>
                                ({awayDynamicScore.secondary})
                              </span>
                            )}
                            <span style={{ fontSize: '32px', fontWeight: 900, color: '#00C8FF', lineHeight: 1 }}>
                              {awayDynamicScore.primary}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {renderTeamBoxScoreTable('home', homeTeam, homeRoster)}
                    {renderTeamBoxScoreTable('away', awayTeam, awayRoster)}
                  </>
                )}
                  </>
                )}
              </div>
            )}

            {/* Section 04: NOTES */}
            <div style={styles.sectionCard}>
              <div style={styles.sectionHeaderRow}>
                <h3 style={styles.sectionHeading}>04. NOTES</h3>
                <FileText style={styles.headerIcon} />
              </div>

              <div style={styles.fieldGroup}>
                <label style={styles.fieldLabel}>ADDITIONAL MATCH NOTES & OBSERVATIONS (OPTIONAL)</label>
                <textarea
                  rows={4}
                  placeholder="Enter any official observations, referee notes, weather/facility conditions, or match incident logs..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="hover-input"
                  style={{
                    ...styles.input,
                    minHeight: '85px',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    lineHeight: 1.5,
                  }}
                />
              </div>
            </div>

            {/* Footer Actions */}
            <div style={styles.footerActionsRow}>
              <button type="button" onClick={() => navigate('/dashboard')} className="hover-btn-outline" style={styles.cancelBtn}>
                CANCEL
              </button>
              <button type="submit" disabled={submitting || ocrLoading} className="hover-btn-solid" style={styles.createMatchBtn}>
                {submitting ? (
                  <>
                    <Loader2 style={{ width: 15, height: 15, animation: 'spin 1s linear infinite' }} />
                    <span>CREATING MATCH...</span>
                  </>
                ) : (
                  <>
                    <span>CREATE MATCH</span>
                    <span>→</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </main>
      </div>

      {/* SPORT MISMATCH INTERRUPTION MODAL */}
      {sportMismatchInfo && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <AlertTriangle style={{ width: 44, height: 44, color: '#D97706', margin: '0 auto 12px' }} />
            <h2 style={styles.modalTitle}>SPORT MISMATCH DETECTED</h2>
            <p style={styles.modalSubtitle}>
              The uploaded scoresheet was detected as <strong>{sportMismatchInfo.detectedSport}</strong>, which is not aligned with your current selection (<strong>{sportMismatchInfo.currentSport}</strong>). The match category has been automatically updated to <strong>{sportMismatchInfo.detectedSport}</strong>.
            </p>
            <div style={styles.modalActions}>
              <button
                type="button"
                onClick={() => {
                  setSportCategory(sportMismatchInfo.detectedSport);
                  setSportMismatchInfo(null);
                }}
                className="hover-btn-solid"
                style={styles.modalPrimaryBtn}
              >
                CHANGE TO {sportMismatchInfo.detectedSport.toUpperCase()}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSportCategory(sportMismatchInfo.currentSport);
                  setSportMismatchInfo(null);
                  setOcrDetectedSport(null);
                  setSelectedFile(null);
                  setOcrCompleted(false);
                  setHomeRoster([]);
                  setAwayRoster([]);
                  setRaceResults([]);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="hover-btn-outline"
                style={styles.modalSecondaryBtn}
              >
                DISMISS & CHOOSE ANOTHER FILE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL BEFORE GAME CREATION ("Are you sure...") */}
      {showConfirmModal && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalCard, maxWidth: '460px' }}>
            <div style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              backgroundColor: 'rgba(225, 29, 72, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#E11D48'
            }}>
              <AlertTriangle style={{ width: 28, height: 28 }} />
            </div>
            <h2 style={styles.modalTitle}>FINALIZE MATCH CREATION</h2>
            <p style={{
              fontSize: '15px',
              fontWeight: 700,
              color: '#0B132B',
              margin: '10px 0 16px',
              lineHeight: 1.5,
              textAlign: 'center'
            }}>
              Are you sure you want to finalize creating a match?
            </p>
            <div style={{
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: 8,
              padding: '12px 16px',
              fontSize: 12,
              color: '#475569',
              lineHeight: 1.6,
              marginBottom: 20,
              textAlign: 'left'
            }}>
              <div><strong>Sport:</strong> {sportCategory}</div>
              <div><strong>Matchup:</strong> {isIndividualSport ? teams.filter(Boolean).join(', ') : `${homeTeam} vs ${awayTeam}`}</div>
              <div><strong>Date & Time:</strong> {matchDate} {matchTime ? `at ${matchTime}` : ''}</div>
              {selectedFile && (
                <div><strong>Scoresheet:</strong> {selectedFiles.length > 1 ? `${selectedFiles.length} pages attached` : selectedFile.name}</div>
              )}
            </div>
            <div style={styles.modalActions}>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="hover-btn-outline"
                style={styles.modalSecondaryBtn}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeFinalizeCreateMatch}
                disabled={submitting}
                className="hover-btn-solid"
                style={{ ...styles.modalPrimaryBtn, backgroundColor: '#10B981', borderColor: '#10B981' }}
              >
                {submitting ? 'Finalizing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UNSUPPORTED SPORT INTERRUPTION MODAL */}
      {unavailableSportName && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <AlertTriangle style={{ width: 44, height: 44, color: '#EF4444', margin: '0 auto 12px' }} />
            <h2 style={styles.modalTitle}>UNSUPPORTED SPORT DETECTED</h2>
            <p style={styles.modalSubtitle}>
              The uploaded scoresheet is for <strong>{unavailableSportName}</strong>, which is not currently available or active in the tournament system. Please upload a valid scoresheet for one of the available sports.
            </p>
            <button
              type="button"
              onClick={() => {
                setUnavailableSportName(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="hover-btn-solid"
              style={styles.modalPrimaryBtn}
            >
              DISMISS & CHOOSE ANOTHER FILE
            </button>
          </div>
        </div>
      )}

      {/* SUCCESS INTERRUPTION MODAL */}
      {createdMatchInfo && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <CheckCircle2 style={{ width: 44, height: 44, color: '#10B981', margin: '0 auto 12px' }} />
            <h2 style={styles.modalTitle}>MATCH CREATED SUCCESSFULLY</h2>
            <p style={styles.modalSubtitle}>
              The match has been officially registered and scheduled in the tournament system.
            </p>

            <div style={styles.modalSummaryBox}>
              <div style={styles.modalSummaryRow}>
                <span style={{ fontWeight: 600, color: '#64748B' }}>MATCH ID:</span>
                <span style={{ fontWeight: 800 }}>{createdMatchInfo.matchId}</span>
              </div>
              <div style={styles.modalSummaryRow}>
                <span style={{ fontWeight: 600, color: '#64748B' }}>SPORT:</span>
                <span style={{ fontWeight: 800 }}>{createdMatchInfo.sport}</span>
              </div>
              <div style={styles.modalSummaryRow}>
                <span style={{ fontWeight: 600, color: '#64748B' }}>SCHEDULE:</span>
                <span style={{ fontWeight: 800 }}>{createdMatchInfo.matchDate}</span>
              </div>
              {createdMatchInfo.venue && (
                <div style={styles.modalSummaryRow}>
                  <span style={{ fontWeight: 600, color: '#64748B' }}>VENUE:</span>
                  <span style={{ fontWeight: 800 }}>{createdMatchInfo.venue}</span>
                </div>
              )}
              <div style={styles.modalSummaryRow}>
                <span style={{ fontWeight: 600, color: '#64748B' }}>TEAMS / PARTICIPANTS:</span>
                <span style={{ fontWeight: 800, textAlign: 'right' }}>
                  {createdMatchInfo.teams.join(' vs ')}
                </span>
              </div>
            </div>

            {parsedMatches.length > 1 && parsedMatches.some((m) => !m.isSaved) && (
              <div style={{ marginBottom: '16px', width: '100%' }}>
                {(() => {
                  const nextUnsavedIdx = parsedMatches.findIndex((m, i) => !m.isSaved && i !== activeMatchIndex);
                  const targetIdx = nextUnsavedIdx !== -1 ? nextUnsavedIdx : parsedMatches.findIndex((m) => !m.isSaved);
                  if (targetIdx === -1) return null;
                  const targetMatch = parsedMatches[targetIdx];
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        setCreatedMatchInfo(null);
                        handleSwitchMatch(targetIdx);
                      }}
                      className="hover-btn-solid"
                      style={{
                        width: '100%',
                        backgroundColor: '#00C8FF',
                        color: '#070D19',
                        padding: '12px 16px',
                        border: 'none',
                        fontWeight: 900,
                        fontSize: '12px',
                        letterSpacing: '0.04em',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                      }}
                    >
                      <Layers style={{ width: 15, height: 15 }} />
                      <span>CONTINUE TO MATCH {targetIdx + 1}: {(targetMatch.sport || 'SPORT').toUpperCase()} • {targetMatch.homeTeam} VS {targetMatch.awayTeam}</span>
                      <span>→</span>
                    </button>
                  );
                })()}
              </div>
            )}

            <div style={styles.modalActions}>
              <button
                type="button"
                onClick={() => navigate(`/matches/${createdMatchInfo.matchId.replace(/^#/, '')}`)}
                className="hover-btn-solid"
                style={styles.modalPrimaryBtn}
              >
                <span>VIEW MATCH SCORESHEET</span>
                <span>→</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/matches')}
                className="hover-btn-outline"
                style={styles.modalSecondaryBtn}
              >
                VIEW IN ALL MATCHES
              </button>
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="hover-btn-outline"
                style={styles.modalSecondaryBtn}
              >
                RETURN TO DASHBOARD
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SCORESHEET PREVIEW MODAL */}
      {previewModalUrl && (
        <div style={styles.modalOverlay} onClick={() => setPreviewModalUrl(null)}>
          <div style={styles.previewModalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.previewModalHeader}>
              <h3 style={styles.modalTitle}>SCORESHEET PREVIEW</h3>
              <button type="button" onClick={() => setPreviewModalUrl(null)} className="hover-close-x" style={styles.closeXBtn}>
                <X style={{ width: 20, height: 20 }} />
              </button>
            </div>
            {previewModalUrl.toLowerCase().includes('.pdf') || previewModalUrl.startsWith('data:application/pdf') ? (
              <iframe src={previewModalUrl} title="Scoresheet Preview" style={styles.previewPdfIframe} />
            ) : (
              <img src={previewModalUrl} alt="Scoresheet" style={styles.previewImg} />
            )}
            <div style={styles.previewModalFooter}>
              <button type="button" onClick={() => setPreviewModalUrl(null)} className="hover-btn-outline" style={styles.modalSecondaryBtn}>
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default CreateMatch;
