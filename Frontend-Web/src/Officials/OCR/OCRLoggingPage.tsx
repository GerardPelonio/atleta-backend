import React, { useState, useCallback, useRef } from 'react';
import {
  UploadCloud,
  FileText,
  Image as ImageIcon,
  Trash2,
  Eye,
  Loader2,
  Sparkles,
  AlertCircle,
  CheckCircle,
  X,
} from 'lucide-react';
import { Navbar } from '../Components/Navbar';
import { OCROutputView } from './OCROutputView';
import { scanScoresheetOCR } from '../../api/client';
import { scanMultipleScoresheets } from '../../api/ocr';
import type { UploadedFileItem, RawOCRDetectedData, DetectedAthleteStat } from '../../api/types';
import { parseRobustStatNum } from '../../api/sportSchema';
import { styles } from './styles/OCRLoggingPage';

const formatFileSize = (bytes: number): string => {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
};

// Standardized mapping for a single scoresheet/match
const mapSingleMatch = (dataObj: any, startingIdx = 0): RawOCRDetectedData => {
  const matchInfo = dataObj.match_info || dataObj;
  const rawSport = String(matchInfo.sport_type || dataObj.sport_type || 'BASKETBALL').toUpperCase();
  const rawPlayers: any[] = Array.isArray(dataObj.player_summary)
    ? dataObj.player_summary
    : Array.isArray(dataObj.parsed_tables?.player_summary)
      ? dataObj.parsed_tables.player_summary
      : [];

  const teamScoresArr: any[] = Array.isArray(dataObj.team_scores)
    ? dataObj.team_scores
    : Array.isArray(dataObj.parsed_tables?.team_scores)
      ? dataObj.parsed_tables.team_scores
      : [];

  const homeScoreItem = teamScoresArr.find((t: any) => t.is_home === true) || teamScoresArr[0];
  const awayScoreItem = teamScoresArr.find((t: any) => t.is_home === false) || (teamScoresArr.length > 1 ? teamScoresArr[1] : undefined);

  const homeTeamName = String(
    matchInfo.home_team_name || matchInfo.home_team || homeScoreItem?.team || 'TEAM 1'
  ).toUpperCase();

  const oppTeamName = String(
    matchInfo.opponent_team_name || matchInfo.away_team || awayScoreItem?.team || 'TEAM 2'
  ).toUpperCase();

  const detectedTeamNames = Array.from(
    new Set([
      ...rawPlayers.map((p: any) => ((p.team_name || p.team) ? String(p.team_name || p.team).toUpperCase() : null)).filter(Boolean),
      ...teamScoresArr.map((t: any) => (t.team ? String(t.team).toUpperCase() : null)).filter(Boolean),
      homeTeamName,
      oppTeamName,
    ])
  ).filter((t): t is string => typeof t === 'string' && t.trim().length > 0);

  const totalPlayers = rawPlayers.length;
  const halfCount = Math.ceil(totalPlayers / 2);

  const scoresheetUrl = String(dataObj.scoresheet_url || dataObj.scoresheetUrl || '').trim();

  const athleteOverview: DetectedAthleteStat[] = rawPlayers.map((p: any, idx: number) => {
    let resolvedTeam = (p.team_name || p.team) ? String(p.team_name || p.team).toUpperCase() : '';
    if (!resolvedTeam) {
      resolvedTeam = idx < halfCount ? oppTeamName : homeTeamName;
    }

    const athleteName = String(
      p.player_name ||
      (p.first_name || p.last_name ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : `PLAYER #${p.jersey_number || startingIdx + idx + 1}`)
    ).toUpperCase();
    const athleteEvent = p.event || p.discipline || p.event_name || '';
    const athleteEventId = p.event_id || (athleteEvent ? `evt_${athleteEvent.toLowerCase().replace(/[^a-z0-9]/g, '_')}` : undefined);
    const cleanEventSlug = athleteEvent ? athleteEvent.toLowerCase().replace(/[^a-z0-9]/g, '_') : 'main';
    const baseAthleteId = p.athlete_id || `ath_${startingIdx + idx + 1}`;
    const rowUid = `${baseAthleteId}_${cleanEventSlug}_${idx + 1}`;

    // Robust numerical validation against expected ranges per sport metric
    const jerseyNumber = parseRobustStatNum(
      p.jersey_number ?? p.jersey ?? p.number ?? p.no ?? p['#'] ?? p.j_no,
      'jersey_number',
      startingIdx + idx + 1
    );

    // Basketball box score metrics
    const pts = parseRobustStatNum(p.points ?? p.pts ?? p.score, 'points', 0);
    const ast = parseRobustStatNum(p.assists ?? p.ast ?? p.a, 'assists', 0);
    const oreb = parseRobustStatNum(p.offensive_rebounds ?? p.oreb ?? p.orb ?? p.off_reb, 'offensive_rebounds', 0);
    const dreb = parseRobustStatNum(p.defensive_rebounds ?? p.dreb ?? p.drb ?? p.def_reb, 'defensive_rebounds', 0);
    const rawReb = parseRobustStatNum(p.rebounds ?? p.reb ?? p.total_rebounds ?? p.trb, 'rebounds', 0);
    const reb = rawReb > 0 ? rawReb : (oreb + dreb);
    const stl = parseRobustStatNum(p.steals ?? p.stl ?? p.s, 'steals', 0);
    const blk = parseRobustStatNum(p.blocks ?? p.blk ?? p.block_points, 'blocks', 0);
    const fouls = parseRobustStatNum(p.fouls ?? p.pf ?? p.personal_fouls ?? p.f ?? p.foul ?? p.fouls_committed, 'fouls', 0);
    const to = parseRobustStatNum(p.turnovers ?? p.to ?? p.tov, 'turnovers', 0);
    const min = parseRobustStatNum(p.min ?? p.minutes ?? p.mp, 'minutes', 0);

    const fgMade = parseRobustStatNum(p.fg_made ?? p.fgm ?? p.two_made, 'fg_made', 0);
    const fgAttempted = parseRobustStatNum(p.fg_attempted ?? p.fga ?? p.two_attempted, 'fg_attempted', fgMade);
    const threeMade = parseRobustStatNum(p.three_made ?? p.three_pt_made ?? p['3pm'], 'three_made', 0);
    const threeAttempted = parseRobustStatNum(p.three_attempted ?? p.three_pt_attempted ?? p['3pa'], 'three_attempted', threeMade);
    const ftMade = parseRobustStatNum(p.ft_made ?? p.ftm, 'ft_made', 0);
    const ftAttempted = parseRobustStatNum(p.ft_attempted ?? p.fta, 'ft_attempted', ftMade);

    const fgPct = p.true_shooting_pct
      ? `${Math.round(p.true_shooting_pct)}%`
      : fgAttempted > 0
        ? `${Math.round((fgMade / fgAttempted) * 100)}%`
        : p.fg_pct || '0%';

    // Volleyball box score metrics
    const kills = parseRobustStatNum(p.kills ?? p.kill_points ?? p.k, 'kills', 0);
    const attackErrors = parseRobustStatNum(p.attack_errors ?? p.att_err ?? p.ae, 'attack_errors', 0);
    const attackAttempts = parseRobustStatNum(p.attack_attempts ?? p.total_attacks ?? p.ta, 'attack_attempts', kills + attackErrors);
    const serviceAces = parseRobustStatNum(p.service_aces ?? p.aces ?? p.sa ?? p.ace, 'service_aces', 0);
    const serviceErrors = parseRobustStatNum(p.service_errors ?? p.serv_err ?? p.se, 'service_errors', 0);
    const receptionErrors = parseRobustStatNum(p.reception_errors ?? p.rec_err ?? p.re, 'reception_errors', 0);
    const digs = parseRobustStatNum(p.digs ?? p.dig ?? p.d, 'digs', 0);
    const blockSolos = parseRobustStatNum(p.block_solos ?? p.bs, 'block_solos', 0);
    const blockAssists = parseRobustStatNum(p.block_assists ?? p.ba, 'block_assists', 0);
    const blockPoints = parseRobustStatNum(p.block_points ?? p.blocks ?? p.blk, 'block_points', blockSolos + blockAssists);
    const setsPlayed = parseRobustStatNum(p.sets_played ?? p.sp ?? p.sets, 'sets_played', 0);
    const hittingPct = attackAttempts > 0
      ? `${(((kills - attackErrors) / attackAttempts) * 100).toFixed(1)}%`
      : (p.hitting_pct || p.hit_pct || '0.0%');

    // Soccer box score metrics
    const goals = parseRobustStatNum(p.goals ?? p.g, 'goals', 0);
    const shots = parseRobustStatNum(p.shots ?? p.sh, 'shots', 0);
    const shotsOnTarget = parseRobustStatNum(p.shots_on_target ?? p.sog ?? p.sot, 'shots_on_target', 0);
    const saves = parseRobustStatNum(p.saves ?? p.sv ?? p.save, 'saves', 0);
    const tackles = parseRobustStatNum(p.tackles ?? p.tkl, 'tackles', 0);
    const yellowCards = parseRobustStatNum(p.yellow_cards ?? p.yc, 'yellow_cards', 0);
    const redCards = parseRobustStatNum(p.red_cards ?? p.rc, 'red_cards', 0);

    // Timed / Individual box score metrics
    const finishTime = String(p.finish_time || p.time || p.result_time || p.mark || '').trim();
    const splitTime = String(p.split || p.split_time || p.split_1 || p.lap_splits || '').trim();
    const split2 = String(p.split_2 || p.split_second || '').trim();
    const distanceM = parseRobustStatNum(p.distance_m ?? p.distance ?? p.dist, 'distance_m', 0);
    const strokeCount = parseRobustStatNum(p.stroke_count ?? p.strokes, 'stroke_count', 0);
    const strokeRate = parseRobustStatNum(p.stroke_rate ?? p.strokerate, 'stroke_rate', 0);
    const lapCount = parseRobustStatNum(p.lap_count ?? p.laps, 'lap_count', 0);
    const lapSplits = p.lap_splits || p.split_times || (splitTime ? [splitTime] : []);
    const wind = String(p.wind || p.wind_gauge || '').trim();
    const heat = p.heat !== undefined ? parseRobustStatNum(p.heat, 'heat', 1) : undefined;
    const lane = p.lane !== undefined ? parseRobustStatNum(p.lane, 'lane', 1) : undefined;
    const rank = String(p.placement_rank || p.rank || p.place || (startingIdx + idx + 1)).trim();

    // Preserve all parsed columns into state object
    const rawStatsObj: Record<string, any> = {
      ...(typeof p.stats === 'object' && p.stats !== null ? p.stats : {}),
      ...(typeof p.sport_stats === 'object' && p.sport_stats !== null ? p.sport_stats : {}),
      ...p,
      event: athleteEvent,
      event_id: athleteEventId,
      pts,
      points: pts,
      ast,
      assists: ast,
      reb,
      rebounds: reb,
      offensive_rebounds: oreb,
      defensive_rebounds: dreb,
      stl,
      steals: stl,
      blk,
      blocks: blk,
      fouls,
      pf: fouls,
      personal_fouls: fouls,
      to,
      turnovers: to,
      min,
      minutes: min,
      fg_pct: fgPct,
      fg_made: fgMade,
      fg_attempted: fgAttempted,
      three_made: threeMade,
      three_attempted: threeAttempted,
      ft_made: ftMade,
      ft_attempted: ftAttempted,
      kills,
      attack_errors: attackErrors,
      attack_attempts: attackAttempts,
      hitting_pct: hittingPct,
      service_aces: serviceAces,
      service_errors: serviceErrors,
      reception_errors: receptionErrors,
      digs,
      block_points: blockPoints,
      block_solos: blockSolos,
      block_assists: blockAssists,
      sets_played: setsPlayed,
      set_scores: p.set_scores || p.set_score || '',
      goals,
      shots,
      shots_on_target: shotsOnTarget,
      saves,
      tackles,
      yellow_cards: yellowCards,
      red_cards: redCards,
      finish_time: finishTime,
      time: finishTime,
      split: splitTime,
      split_2: split2,
      lap_splits: lapSplits,
      distance_m: distanceM,
      stroke_count: strokeCount,
      stroke_rate: strokeRate,
      lap_count: lapCount,
      wind,
      heat,
      lane,
      placement_rank: rank,
    };

    return {
      athlete_id: baseAthleteId,
      row_uid: rowUid,
      player_name: athleteName,
      team_name: resolvedTeam,
      jersey_number: jerseyNumber,
      position: p.position || 'G',
      event: athleteEvent,
      event_id: athleteEventId,
      heat,
      lane,
      placement_rank: rank,
      finish_time: finishTime,
      time: finishTime,
      split: splitTime,
      split_2: split2,
      lap_splits: lapSplits,
      stats: rawStatsObj,
      // Basketball & General
      pts,
      points: pts,
      ast,
      assists: ast,
      to,
      turnovers: to,
      reb,
      rebounds: reb,
      offensive_rebounds: oreb,
      defensive_rebounds: dreb,
      stl,
      steals: stl,
      blk,
      blocks: blk,
      fouls,
      pf: fouls,
      personal_fouls: fouls,
      min,
      minutes: min,
      fg_pct: fgPct,
      fg_made: fgMade,
      fg_attempted: fgAttempted,
      three_made: threeMade,
      three_attempted: threeAttempted,
      ft_made: ftMade,
      ft_attempted: ftAttempted,
      // Volleyball
      kills,
      attack_errors: attackErrors,
      attack_attempts: attackAttempts,
      hitting_pct: hittingPct,
      service_aces: serviceAces,
      service_errors: serviceErrors,
      reception_errors: receptionErrors,
      digs,
      block_points: blockPoints,
      block_solos: blockSolos,
      block_assists: blockAssists,
      sets_played: setsPlayed,
      set_scores: p.set_scores || p.set_score || '',
      // Soccer
      goals,
      shots,
      shots_on_target: shotsOnTarget,
      saves,
      tackles,
      yellow_cards: yellowCards,
      red_cards: redCards,
      // Timed / Individual
      stroke_count: strokeCount,
      stroke_rate: strokeRate,
      distance_m: distanceM,
      lap_count: lapCount,
      wind,
    };
  });

  const ftTotalMade = rawPlayers.reduce((acc: number, p: any) => acc + parseRobustStatNum(p.ft_made ?? p.ftm, 'ft_made', 0), 0);
  const ftTotalAttempts = rawPlayers.reduce((acc: number, p: any) => acc + parseRobustStatNum(p.ft_attempted ?? p.fta, 'ft_attempted', 0), 0);
  const pt2TotalMade = rawPlayers.reduce((acc: number, p: any) => acc + parseRobustStatNum(p.fg_made ?? p.fgm, 'fg_made', 0), 0);
  const pt2TotalAttempts = rawPlayers.reduce((acc: number, p: any) => acc + parseRobustStatNum(p.fg_attempted ?? p.fga, 'fg_attempted', 0), 0);
  const totalAssists = rawPlayers.reduce((acc: number, p: any) => acc + parseRobustStatNum(p.assists ?? p.ast, 'assists', 0), 0);
  const totalTurnovers = rawPlayers.reduce((acc: number, p: any) => acc + parseRobustStatNum(p.turnovers ?? p.to, 'turnovers', 0), 0);

  const homeAthleteSum = athleteOverview
    .filter((a) => a.team_name === homeTeamName)
    .reduce((sum, a) => sum + (a.pts || a.kills || a.goals || 0), 0);
  const oppAthleteSum = athleteOverview
    .filter((a) => a.team_name === oppTeamName)
    .reduce((sum, a) => sum + (a.pts || a.kills || a.goals || 0), 0);

  const detectedScoresList = teamScoresArr
    .map((t: any) => Number(t.score))
    .filter((s: number) => !isNaN(s) && s > 0);

  let hScore: number;
  let aScore: number;

  if (detectedScoresList.length >= 2) {
    const maxScore = Math.max(...detectedScoresList);
    const minScore = Math.min(...detectedScoresList);
    if (homeAthleteSum >= oppAthleteSum) {
      hScore = maxScore;
      aScore = minScore;
    } else {
      hScore = minScore;
      aScore = maxScore;
    }
  } else {
    hScore = homeAthleteSum;
    aScore = oppAthleteSum;
  }

  const ocrHomeRosterIds: string[] = [];
  const ocrAwayRosterIds: string[] = [];
  athleteOverview.forEach((a) => {
    if (a.team_name === homeTeamName) {
      ocrHomeRosterIds.push(a.athlete_id);
    } else {
      ocrAwayRosterIds.push(a.athlete_id);
    }
  });

  return {
    team_name: homeTeamName,
    opponent_team_name: oppTeamName,
    final_score: `${hScore} - ${aScore}`,
    game_result: hScore >= aScore ? 'WIN' : 'LOSS',
    team_scores: [
      { team: homeTeamName, score: hScore },
      { team: oppTeamName, score: aScore },
    ],
    teams: detectedTeamNames,
    sport_type: rawSport,
    scoresheet_url: scoresheetUrl,
    scoresheetUrl: scoresheetUrl,
    roster_athletes: ocrHomeRosterIds,
    rosterAthletes: ocrHomeRosterIds,
    away_roster_athletes: ocrAwayRosterIds,
    awayRosterAthletes: ocrAwayRosterIds,
    player_stats: athleteOverview,
    playerStats: athleteOverview,
    athlete_overview: athleteOverview.length > 0 ? athleteOverview : [
      {
        athlete_id: `ath_${startingIdx + 1}`,
        player_name: 'EXTRACTED ATHLETE',
        team_name: homeTeamName,
        pts: 0,
        ast: 0,
        to: 0,
        reb: 0,
        stl: 0,
        blk: 0,
        min: 0,
        fg_pct: '0%',
      },
    ],
    expanded_metrics: {
      shooting_efficiency: {
        ft_made: ftTotalMade,
        ft_attempts: ftTotalAttempts,
        pt2_made: pt2TotalMade,
        pt2_attempts: pt2TotalAttempts,
        pt3_made: 0,
        pt3_attempts: 0,
      },
      possession_errors: {
        key_drives: 0,
        assists: totalAssists,
        turnovers: totalTurnovers,
        scv_12s: 0,
      },
    },
  };
};

// Helper to test if two scoresheets belong to the same match
const isSameMatch = (m1: any, m2: any): boolean => {
  const s1 = String(m1.sport_category || m1.sport_type || '').trim().toLowerCase();
  const s2 = String(m2.sport_category || m2.sport_type || '').trim().toLowerCase();
  const h1 = String(m1.home_team_name || m1.home_team || m1.team_name || '').trim().toLowerCase();
  const h2 = String(m2.home_team_name || m2.home_team || m2.team_name || '').trim().toLowerCase();
  const o1 = String(m1.opponent_team_name || m1.away_team || '').trim().toLowerCase();
  const o2 = String(m2.opponent_team_name || m2.away_team || '').trim().toLowerCase();

  const sameSport = s1 === s2 || !s1 || !s2;
  const sameHome = h1 === h2 || h1.includes(h2) || h2.includes(h1);
  const sameOpp = !o1 || !o2 || o1 === o2 || o1.includes(o2) || o2.includes(o1);

  return sameSport && sameHome && sameOpp;
};

// Multi-page continuation merging (same match)
const mergeContinuationRosters = (base: RawOCRDetectedData, continuation: RawOCRDetectedData): RawOCRDetectedData => {
  const mergedAthletes = [...base.athlete_overview];

  // Detect individual/timed sport: Core (Swimming, Track & Field, Running) or Custom Sports added by System Admin
  const sportName = (base.sport_type || continuation.sport_type || '').trim().toUpperCase();
  let isIndividualSport =
    sportName.includes('SWIM') ||
    sportName.includes('TRACK') ||
    sportName.includes('FIELD') ||
    sportName.includes('RUN') ||
    sportName.includes('ATHLETIC') ||
    sportName.includes('TIME') ||
    sportName.includes('RACE') ||
    sportName.includes('CYCL') ||
    sportName.includes('ROW') ||
    sportName.includes('TRIATHLON') ||
    sportName.includes('SPRINT') ||
    sportName.includes('HURDLE') ||
    sportName.includes('MARATHON') ||
    sportName.includes('INDIVIDUAL');

  if (!isIndividualSport) {
    try {
      const rawCat = typeof localStorage !== 'undefined'
        ? (localStorage.getItem('atleta_admin_sports_catalog') || localStorage.getItem('admin_sports_catalog'))
        : null;
      if (rawCat) {
        const cat = JSON.parse(rawCat);
        if (Array.isArray(cat)) {
          const match = cat.find((s: any) =>
            String(s.sport_name || s.short_identifier || s.sport_id || '').toUpperCase() === sportName
          );
          if (match && Array.isArray(match.configurable_stats)) {
            isIndividualSport = match.configurable_stats.some((st: any) => {
              const mCat = String(st.measurement_category || '').toLowerCase();
              const key = String(st.stat_name_key || '').toLowerCase();
              return mCat.includes('time') || key.includes('time') || key.includes('split') || key.includes('lap') || key.includes('distance');
            });
          }
        }
      }
    } catch {}
  }

  continuation.athlete_overview.forEach((incoming) => {
    const incomingEvent = String(incoming.event || incoming.event_id || (incoming.stats as any)?.event || '').trim().toLowerCase();
    const incomingDist = String(incoming.distance_m || (incoming.stats as any)?.distance_m || '').trim().toLowerCase();
    const incomingHeat = String(incoming.heat || (incoming.stats as any)?.heat || '').trim().toLowerCase();

    const existingIdx = mergedAthletes.findIndex((existing) => {
      const existingEvent = String(existing.event || existing.event_id || (existing.stats as any)?.event || '').trim().toLowerCase();
      const existingDist = String(existing.distance_m || (existing.stats as any)?.distance_m || '').trim().toLowerCase();
      const existingHeat = String(existing.heat || (existing.stats as any)?.heat || '').trim().toLowerCase();

      // For individual/timed sports (Swimming & Track, plus custom individual sports):
      // Each event/distance result is separate and must not be collapsed by player name!
      if (isIndividualSport) {
        if (incomingEvent && existingEvent && incomingEvent !== existingEvent) {
          return false;
        }
        if (incomingDist && existingDist && incomingDist !== existingDist) {
          return false;
        }
        if (incomingHeat && existingHeat && incomingHeat !== existingHeat) {
          return false;
        }

        const nameMatches =
          incoming.player_name &&
          existing.player_name &&
          incoming.player_name !== 'EXTRACTED ATHLETE' &&
          incoming.player_name.trim().toLowerCase() === existing.player_name.trim().toLowerCase();

        // Only merge if it is verified to be the exact same event & distance & heat
        if (nameMatches && incomingEvent && existingEvent && incomingEvent === existingEvent) {
          return true;
        }

        // Even if name is the same, if events/distances differ or are distinct race entries, keep them separate!
        return false;
      }

      // Team sports (Basketball, Volleyball, Soccer)
      if (incomingEvent && existingEvent && incomingEvent !== existingEvent) {
        return false;
      }

      if (incoming.jersey_number && existing.jersey_number && incoming.jersey_number === existing.jersey_number) {
        if (!incoming.team_name || !existing.team_name || incoming.team_name === existing.team_name) return true;
      }
      if (incoming.player_name && existing.player_name && incoming.player_name !== 'EXTRACTED ATHLETE' && incoming.player_name === existing.player_name) {
        return true;
      }
      return false;
    });

    if (existingIdx !== -1) {
      const curr = mergedAthletes[existingIdx];
      const curPts = Number(curr.pts || 0);
      const incPts = Number(incoming.pts || 0);
      const curFga = Number(curr.fg_attempted || 0);
      const incFga = Number(incoming.fg_attempted || 0);
      const isCumulative = (incPts >= curPts && incFga >= curFga && incPts > 0) || (incPts > 0 && curPts === 0);

      mergedAthletes[existingIdx] = {
        ...curr,
        ...incoming,
        pts: isCumulative ? incPts : (curPts + incPts),
        points: isCumulative ? incPts : (curPts + incPts),
        ast: isCumulative ? Number(incoming.ast || 0) : ((curr.ast || 0) + (incoming.ast || 0)),
        to: isCumulative ? Number(incoming.to || 0) : ((curr.to || 0) + (incoming.to || 0)),
        reb: isCumulative ? Number(incoming.reb || 0) : ((curr.reb || 0) + (incoming.reb || 0)),
        stl: isCumulative ? Number(incoming.stl || 0) : ((curr.stl || 0) + (incoming.stl || 0)),
        blk: isCumulative ? Number(incoming.blk || 0) : ((curr.blk || 0) + (incoming.blk || 0)),
        min: isCumulative ? Number(incoming.min || 0) : ((curr.min || 0) + (incoming.min || 0)),
        fouls: isCumulative ? Number(incoming.fouls || 0) : ((curr.fouls || 0) + (incoming.fouls || 0)),
        pf: isCumulative ? Number(incoming.pf || 0) : ((curr.pf || 0) + (incoming.pf || 0)),
        oreb: isCumulative ? Number(incoming.oreb || 0) : ((curr.oreb || 0) + (incoming.oreb || 0)),
        dreb: isCumulative ? Number(incoming.dreb || 0) : ((curr.dreb || 0) + (incoming.dreb || 0)),
        fg_made: isCumulative ? Number(incoming.fg_made || 0) : ((curr.fg_made || 0) + (incoming.fg_made || 0)),
        fg_attempted: isCumulative ? incFga : (curFga + incFga),
        three_made: isCumulative ? Number(incoming.three_made || 0) : ((curr.three_made || 0) + (incoming.three_made || 0)),
        three_attempted: isCumulative ? Number(incoming.three_attempted || 0) : ((curr.three_attempted || 0) + (incoming.three_attempted || 0)),
        ft_made: isCumulative ? Number(incoming.ft_made || 0) : ((curr.ft_made || 0) + (incoming.ft_made || 0)),
        ft_attempted: isCumulative ? Number(incoming.ft_attempted || 0) : ((curr.ft_attempted || 0) + (incoming.ft_attempted || 0)),
        kills: isCumulative ? Number(incoming.kills || 0) : ((curr.kills || 0) + (incoming.kills || 0)),
        attack_errors: isCumulative ? Number(incoming.attack_errors || 0) : ((curr.attack_errors || 0) + (incoming.attack_errors || 0)),
        attack_attempts: isCumulative ? Number(incoming.attack_attempts || 0) : ((curr.attack_attempts || 0) + (incoming.attack_attempts || 0)),
        service_aces: isCumulative ? Number(incoming.service_aces || 0) : ((curr.service_aces || 0) + (incoming.service_aces || 0)),
        service_errors: isCumulative ? Number(incoming.service_errors || 0) : ((curr.service_errors || 0) + (incoming.service_errors || 0)),
        reception_errors: isCumulative ? Number(incoming.reception_errors || 0) : ((curr.reception_errors || 0) + (incoming.reception_errors || 0)),
        digs: isCumulative ? Number(incoming.digs || 0) : ((curr.digs || 0) + (incoming.digs || 0)),
        block_points: isCumulative ? Number(incoming.block_points || 0) : ((curr.block_points || 0) + (incoming.block_points || 0)),
        sets_played: isCumulative ? Number(incoming.sets_played || 0) : ((curr.sets_played || 0) + (incoming.sets_played || 0)),
        goals: isCumulative ? Number(incoming.goals || 0) : ((curr.goals || 0) + (incoming.goals || 0)),
        shots: isCumulative ? Number(incoming.shots || 0) : ((curr.shots || 0) + (incoming.shots || 0)),
        shots_on_target: isCumulative ? Number(incoming.shots_on_target || 0) : ((curr.shots_on_target || 0) + (incoming.shots_on_target || 0)),
        saves: isCumulative ? Number(incoming.saves || 0) : ((curr.saves || 0) + (incoming.saves || 0)),
        tackles: isCumulative ? Number(incoming.tackles || 0) : ((curr.tackles || 0) + (incoming.tackles || 0)),
        stats: {
          ...(curr.stats || {}),
          ...(incoming.stats || {}),
        },
      };
    } else {
      const uniqueAthleteId =
        isIndividualSport && mergedAthletes.some((a) => a.athlete_id === incoming.athlete_id)
          ? `${incoming.athlete_id || 'ath'}_${mergedAthletes.length + 1}`
          : (incoming.athlete_id || `ath_${mergedAthletes.length + 1}`);

      mergedAthletes.push({
        ...incoming,
        athlete_id: uniqueAthleteId,
        row_uid: incoming.row_uid || `${uniqueAthleteId}_${mergedAthletes.length + 1}`,
      });
    }
  });

  const allTeams = Array.from(new Set([...(base.teams || []), ...(continuation.teams || [])]));
  const hSum = mergedAthletes
    .filter((a) => a.team_name === base.team_name)
    .reduce((sum, a) => sum + (a.pts || a.kills || a.goals || 0), 0);
  const aSum = mergedAthletes
    .filter((a) => a.team_name === base.opponent_team_name)
    .reduce((sum, a) => sum + (a.pts || a.kills || a.goals || 0), 0);

  const homeAthletes = mergedAthletes.filter((a) => a.team_name === base.team_name).map((a) => a.athlete_id);
  const awayAthletes = mergedAthletes.filter((a) => a.team_name === base.opponent_team_name).map((a) => a.athlete_id);
  const combinedScoresheetUrl = base.scoresheet_url || continuation.scoresheet_url || base.scoresheetUrl || continuation.scoresheetUrl;

  return {
    ...base,
    teams: allTeams,
    athlete_overview: mergedAthletes,
    playerStats: mergedAthletes,
    scoresheet_url: combinedScoresheetUrl,
    scoresheetUrl: combinedScoresheetUrl,
    rosterAthletes: Array.from(new Set([...(base.rosterAthletes || []), ...(continuation.rosterAthletes || []), ...homeAthletes])),
    awayRosterAthletes: Array.from(new Set([...(base.awayRosterAthletes || []), ...(continuation.awayRosterAthletes || []), ...awayAthletes])),
    team_scores: (isIndividualSport && hSum === 0 && aSum === 0 && base.team_scores && base.team_scores.length > 0)
      ? base.team_scores
      : [
          { team: base.team_name || 'HOME TEAM', score: hSum },
          { team: base.opponent_team_name || 'OPPONENT TEAM', score: aSum },
        ],
    final_score: (isIndividualSport && hSum === 0 && aSum === 0 && base.final_score) ? base.final_score : `${hSum} - ${aSum}`,
    game_result: hSum >= aSum ? 'WIN' : 'LOSS',
  };
};

export const OCRLoggingPage: React.FC = () => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewFile, setPreviewFile] = useState<UploadedFileItem | null>(null);
  const [ocrResult, setOcrResult] = useState<RawOCRDetectedData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleAddFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErrorMessage(null);

    const newItems: UploadedFileItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let fileType: UploadedFileItem['file_type'] = 'IMAGE';
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'pdf' || file.type === 'application/pdf') fileType = 'PDF';
      else if (ext === 'csv' || file.type === 'text/csv') fileType = 'CSV';
      else if (ext === 'json') fileType = 'JSON';

      newItems.push({
        upload_id: `upl_${Date.now()}_${i}`,
        file_name: file.name.toUpperCase(),
        file_size_bytes: file.size,
        uploaded_at_relative: 'Selected just now',
        file_type: fileType,
        file_url: URL.createObjectURL(file),
        raw_file: file,
      });
    }

    setUploadedFiles((prev) => [...newItems, ...prev]);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleAddFiles(e.dataTransfer.files);
  };

  const handleProcessOCR = async () => {
    if (uploadedFiles.length === 0) {
      setErrorMessage('Please select or drag a scoresheet file first.');
      return;
    }

    const target = uploadedFiles[0];
    if (!target.raw_file) {
      setErrorMessage('Invalid file handle. Please re-select the file.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      let parsedOcrResult: RawOCRDetectedData;

      const rawFiles = uploadedFiles.map((f) => f.raw_file).filter((f): f is File => Boolean(f));
      const responseData = uploadedFiles.length > 1
        ? await scanMultipleScoresheets(rawFiles)
        : await scanScoresheetOCR(target.raw_file);

      const matchesArr = Array.isArray(responseData?.matches) ? responseData.matches : [];
      const isSingleMatchMultiPart =
        matchesArr.length > 1 &&
        matchesArr.every((m: any) => isSameMatch(matchesArr[0], m));

      if (responseData?.batch_mode && isSingleMatchMultiPart) {
        // Multi-part sheets of the same match -> consolidate into one match
        let accumulated = mapSingleMatch(matchesArr[0]);
        for (let p = 1; p < matchesArr.length; p++) {
          const pageData = mapSingleMatch(matchesArr[p], accumulated.athlete_overview.length);
          accumulated = mergeContinuationRosters(accumulated, pageData);
        }
        parsedOcrResult = accumulated;
      } else if (responseData?.batch_mode && matchesArr.length > 1) {
        // Genuinely distinct batch matches
        const separatedMatches = matchesArr.map((m: any, idx: number) => mapSingleMatch(m, idx * 50));
        parsedOcrResult = {
          ...separatedMatches[0],
          batch_matches: separatedMatches,
        };
      } else if (Array.isArray(responseData?.pages) && responseData.pages.length > 1) {
        // Multi-page continuation PDF
        let accumulated = mapSingleMatch(responseData.pages[0]);
        for (let p = 1; p < responseData.pages.length; p++) {
          const pageData = mapSingleMatch(responseData.pages[p], accumulated.athlete_overview.length);
          accumulated = mergeContinuationRosters(accumulated, pageData);
        }
        parsedOcrResult = accumulated;
      } else {
        parsedOcrResult = mapSingleMatch(responseData);
      }

      const resolvedScoresheetUrl = responseData?.scoresheet_url || responseData?.scoresheetUrl || parsedOcrResult.scoresheet_url || parsedOcrResult.scoresheetUrl || target.file_url;
      parsedOcrResult.scoresheet_url = resolvedScoresheetUrl;
      parsedOcrResult.scoresheetUrl = resolvedScoresheetUrl;
      if (!parsedOcrResult.playerStats) {
        parsedOcrResult.playerStats = parsedOcrResult.athlete_overview;
      }
      if (!parsedOcrResult.rosterAthletes || parsedOcrResult.rosterAthletes.length === 0) {
        parsedOcrResult.rosterAthletes = parsedOcrResult.athlete_overview.filter((a) => a.team_name === parsedOcrResult.team_name).map((a) => a.athlete_id);
      }
      if (!parsedOcrResult.awayRosterAthletes || parsedOcrResult.awayRosterAthletes.length === 0) {
        parsedOcrResult.awayRosterAthletes = parsedOcrResult.athlete_overview.filter((a) => a.team_name === parsedOcrResult.opponent_team_name).map((a) => a.athlete_id);
      }

      setOcrResult(parsedOcrResult);
    } catch (err: any) {
      console.error('OCR Error:', err);
      setErrorMessage(err.message || 'AI OCR Vision could not process scoresheet. Please try a clearer picture.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={styles.shell}>
      <Navbar />

      <main style={styles.main}>
        {ocrResult ? (
          <OCROutputView
            rawOCRData={ocrResult}
            onBack={() => setOcrResult(null)}
            onSaveSuccess={() => {
              setOcrResult(null);
              setUploadedFiles([]);
              setSuccessToast('Match and stats saved successfully to database!');
              setTimeout(() => setSuccessToast(null), 4000);
            }}
          />
        ) : (
          <div style={styles.spaceWrapper}>
            {/* Header */}
            <div style={styles.header}>
              <h1 style={styles.title}>
                SCORESHEET OCR LOGGING
              </h1>
              <p style={styles.subtitle}>
                Upload game scoresheets (PNG, JPG, PDF) to automatically extract box scores via Gemini Vision AI
              </p>
            </div>

            {successToast && (
              <div style={styles.toastSuccess}>
                <CheckCircle style={{ width: 16, height: 16, flexShrink: 0, color: '#059669' }} />
                <span>{successToast}</span>
              </div>
            )}

            {errorMessage && (
              <div style={styles.toastError}>
                <AlertCircle style={{ width: 16, height: 16, flexShrink: 0, color: '#DC2626' }} />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Drag and Drop Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                ...styles.dropZone,
                ...(isDragging ? styles.dropZoneDragging : {}),
              }}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => handleAddFiles(e.target.files)}
                accept="image/*,.pdf,.csv,.json"
                style={{ display: 'none' }}
              />
              <div style={styles.dropZoneIconWrap}>
                <UploadCloud style={{ width: 28, height: 28 }} />
              </div>
              <h3 style={styles.dropZoneTitle}>
                DRAG & DROP SCORESHEET HERE OR BROWSE
              </h3>
              <p style={styles.dropZoneDesc}>
                Supports JPG, PNG, WEBP, and PDF scoresheets up to 30MB
              </p>
            </div>

            {/* Uploaded Files Queue */}
            {uploadedFiles.length > 0 && (
              <div style={styles.queueCard}>
                <div style={styles.queueHeader}>
                  <span style={styles.queueTitle}>
                    SELECTED FILES QUEUE ({uploadedFiles.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setUploadedFiles([])}
                    style={styles.clearAllBtn}
                  >
                    Clear All
                  </button>
                </div>

                <div style={styles.fileList}>
                  {uploadedFiles.map((file) => (
                    <div key={file.upload_id} style={styles.fileItem}>
                      <div style={styles.fileItemLeft}>
                        <div style={styles.fileTypeIconWrap}>
                          {file.file_type === 'IMAGE' ? <ImageIcon style={{ width: 20, height: 20 }} /> : <FileText style={{ width: 20, height: 20 }} />}
                        </div>
                        <div style={styles.fileInfoWrap}>
                          <p style={styles.fileName}>{file.file_name}</p>
                          <p style={styles.fileMeta}>
                            {formatFileSize(file.file_size_bytes)} • {file.uploaded_at_relative}
                          </p>
                        </div>
                      </div>

                      <div style={styles.fileItemActions}>
                        {file.file_type === 'IMAGE' && (
                          <button
                            type="button"
                            onClick={() => setPreviewFile(file)}
                            style={styles.actionBtn}
                            title="Preview Image"
                          >
                            <Eye style={{ width: 16, height: 16 }} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setUploadedFiles((prev) => prev.filter((f) => f.upload_id !== file.upload_id))}
                          style={styles.removeBtn}
                          title="Remove"
                        >
                          <Trash2 style={{ width: 16, height: 16 }} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Submit OCR Button */}
                <div style={styles.queueFooter}>
                  <button
                    type="button"
                    onClick={handleProcessOCR}
                    disabled={isProcessing}
                    style={{
                      ...styles.submitBtn,
                      ...(isProcessing ? styles.submitBtnDisabled : {}),
                    }}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
                        <span>PROCESSING WITH GEMINI AI OCR...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles style={{ width: 16, height: 16, color: '#FBBF24' }} />
                        <span>EXTRACT SCORESHEET DATA</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Image Preview Modal */}
      {previewFile && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <span style={styles.modalTitle}>{previewFile.file_name}</span>
              <button
                type="button"
                onClick={() => setPreviewFile(null)}
                style={styles.modalCloseBtn}
              >
                <X style={{ width: 20, height: 20 }} />
              </button>
            </div>
            <div style={styles.modalBody}>
              <img
                src={previewFile.file_url}
                alt="Scoresheet Preview"
                style={styles.modalImg}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OCRLoggingPage;
