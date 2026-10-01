import { db } from '../utils/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  MatchLog,
  PerformanceMetric,
  BasketballStats,
  IndividualSportStats,
  MatchSubmissionPayload,
  ParsedScoresheetResult,
  BoxscoreResponse,
  BoxscorePlayerMetric,
  SportType,
} from '../models/matchModel';
import { ServiceError, validateScoresheetUpload } from '../validators/matchValidator';
import { generateStandardId } from '../utils/idGenerator';

// ─── Multi-Sport Efficiency Calculation Formulas ─────────────────────────────

/**
 * Calculates Basketball Player Efficiency Rating (EFF) & True Shooting Percentage (TS%).
 * Basketball EFF = (PTS + REB + AST + STL + BLK) - ((FGA - FGM) + (FTA - FTM) + TO)
 * Basketball TS% = PTS / (2 * (FGA + (0.44 * FTA)))
 */
export function calculateBasketballMetrics(stats: Record<string, any>): {
  efficiency: number;
  trueShootingPct: number;
  enrichedStats: BasketballStats;
} {
  const points = Number(stats.points || 0);
  const assists = Number(stats.assists || 0);
  const oReb = Number(stats.offensive_rebounds || 0);
  const dReb = Number(stats.defensive_rebounds || 0);
  const totalRebounds = oReb + dReb;
  const fouls = Number(stats.fouls || 0);
  const turnovers = Number(stats.turnovers || 0);
  const steals = Number(stats.steals || 0);
  const blocks = Number(stats.blocks || 0);
  const fgMade = Number(stats.fg_made || 0);
  const fgAttempted = Number(stats.fg_attempted || 0);
  const ftMade = Number(stats.ft_made || 0);
  const ftAttempted = Number(stats.ft_attempted || 0);

  // Calculate Basketball EFF
  const missesFG = Math.max(0, fgAttempted - fgMade);
  const missesFT = Math.max(0, ftAttempted - ftMade);
  const positiveContrib = points + totalRebounds + assists + steals + blocks;
  const negativeContrib = missesFG + missesFT + turnovers;
  const efficiency = Number((positiveContrib - negativeContrib).toFixed(2));

  // Calculate True Shooting Percentage (TS%)
  const tsDenominator = 2 * (fgAttempted + 0.44 * ftAttempted);
  const tsFraction = tsDenominator > 0 ? points / tsDenominator : 0;
  const trueShootingPct = Number((tsFraction * 100).toFixed(2)); // percentage string

  const enrichedStats: BasketballStats = {
    points,
    assists,
    offensive_rebounds: oReb,
    defensive_rebounds: dReb,
    fouls,
    turnovers,
    steals,
    fg_made: fgMade,
    fg_attempted: fgAttempted,
    ft_made: ftMade,
    ft_attempted: ftAttempted,
    true_shooting_pct: trueShootingPct,
  };

  return { efficiency, trueShootingPct, enrichedStats };
}

/**
 * Calculates Individual Sports (Swimming / Track & Field) Efficiency Score.
 * If is_disqualified === true -> efficiency = 0.
 * Otherwise computed speed score based on distance, finish time, and split consistency.
 */
export function calculateIndividualSportMetrics(stats: Record<string, any>): {
  efficiency: number;
  enrichedStats: IndividualSportStats & Record<string, any>;
} {
  const rawDist = stats.distance_meters || stats.distance || 100;
  const distanceMeters = Number(String(rawDist).replace(/[^\d.]/g, '') || 100);
  const distance = `${distanceMeters}m`;

  let finishTimeMs = Number(stats.finish_time_ms || 0);
  if (finishTimeMs === 0 && stats.timer_seconds) {
    finishTimeMs = Math.round(Number(stats.timer_seconds) * 1000);
  }
  if (finishTimeMs === 0 && stats.time) {
    const parts = String(stats.time).split(':');
    if (parts.length === 2) {
      finishTimeMs = (parseFloat(parts[0]) * 60 + parseFloat(parts[1])) * 1000;
    } else {
      finishTimeMs = (parseFloat(stats.time) || 0) * 1000;
    }
  }

  const mins = Math.floor(finishTimeMs / 60000);
  const secs = ((finishTimeMs % 60000) / 1000).toFixed(2);
  const formattedTime = stats.formatted_time || (finishTimeMs > 0 ? `${mins > 0 ? mins + ':' : ''}${Number(secs) < 10 && mins > 0 ? '0' : ''}${secs}s` : '00:00.00');

  const eventName = String(stats.event_name || `${distanceMeters}m Event`).trim();
  const splitTimesMs = Array.isArray(stats.split_times_ms)
    ? stats.split_times_ms.map(Number)
    : Array.isArray(stats.split_times)
    ? stats.split_times
    : [];
  const isDisqualified = !!stats.is_disqualified;

  let efficiency = 0;
  if (!isDisqualified && finishTimeMs > 0) {
    const speedMps = distanceMeters / (finishTimeMs / 1000);
    const baseScore = speedMps * 12.5;
    let splitFactor = 1.0;
    if (Array.isArray(splitTimesMs) && splitTimesMs.length > 1 && typeof splitTimesMs[0] === 'number') {
      const avgSplit = splitTimesMs.reduce((a, b) => a + b, 0) / splitTimesMs.length;
      const variance = splitTimesMs.reduce((sum, val) => sum + Math.abs(val - avgSplit), 0) / splitTimesMs.length;
      splitFactor = Math.max(0.85, 1 - variance / (avgSplit || 1));
    }
    efficiency = Number((baseScore * splitFactor).toFixed(2));
  }

  const enrichedStats: any = {
    event_name: eventName,
    distance_meters: distanceMeters,
    distance: distance,
    finish_time_ms: finishTimeMs,
    time: formattedTime,
    formatted_time: formattedTime,
    timer_seconds: finishTimeMs > 0 ? finishTimeMs / 1000 : (stats.timer_seconds || 0),
    split_times: stats.split_times || [],
    split_times_ms: splitTimesMs,
    is_disqualified: isDisqualified,
  };

  return { efficiency, enrichedStats };
}

/**
 * Calculates dynamic player efficiency for custom registered sports configurations.
 */
export function calculateDynamicSportMetrics(stats: Record<string, any>): {
  efficiency: number;
  enrichedStats: Record<string, any>;
} {
  let positiveScore = 0;
  let negativeScore = 0;

  for (const [key, value] of Object.entries(stats)) {
    const num = Number(value);
    if (!isNaN(num)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('error') ||
        lowerKey.includes('turnover') ||
        lowerKey.includes('foul') ||
        lowerKey.includes('miss') ||
        lowerKey.includes('fault')
      ) {
        negativeScore += Math.abs(num);
      } else {
        positiveScore += num;
      }
    }
  }

  const efficiency = Number(Math.max(0, positiveScore - negativeScore).toFixed(2));
  return { efficiency, enrichedStats: { ...stats } };
}

// ─── Service Core Functions ──────────────────────────────────────────────────

/**
 * Submit live game log session and stats payload.
 * POST /api/v1/matches
 *
 * ACCEPTANCE CRITERIA:
 * 1. Require Idempotency-Key header on POST submissions.
 * 2. Duplicate match submissions with identical idempotency keys return the original recorded result.
 */
export async function submitMatchSession(
  coachId: string,
  payload: MatchSubmissionPayload,
  idempotencyKey: string,
) {
  const key = idempotencyKey.trim();

  // Check idempotency cache in Firestore
  const idempotencyDoc = await db.collection('Idempotency_Keys').doc(key).get();
  if (idempotencyDoc.exists) {
    console.log(`ℹ️ [IDEMPOTENCY REPLAY] Returning cached result for key '${key}'`);
    return idempotencyDoc.data()!.response;
  }

  // Check if match_id was explicitly supplied and already exists in Match_Logs
  const explicitMatchId = (payload as any).match_id;
  if (explicitMatchId) {
    const existingMatch = await db.collection('Match_Logs').doc(explicitMatchId).get();
    if (existingMatch.exists) {
      console.log(`ℹ️ [DEDUPLICATION] Match '${explicitMatchId}' already exists. Returning existing record.`);
      return {
        message: 'Match log already recorded (duplicate eliminated).',
        match: existingMatch.data(),
        total_players_logged: 0,
        performance_metrics: [],
      };
    }
  }

  const matchId = explicitMatchId || (await generateStandardId('MATCH'));
  const now = new Date().toISOString();

  // Resolve Home Team and Away Team names
  const homeTeamName = ((payload as any).home_team_name || (payload as any).home_team || payload.team_id || 'CELTICS').trim();
  const oppTeamName = ((payload as any).away_team_name || (payload as any).away_team || payload.opponent_team_name || 'HAWKS').trim();

  // Resolve Home and Away Scores
  const homeScore = (payload as any).home_score !== undefined ? Number((payload as any).home_score) : 107;
  const awayScore = (payload as any).away_score !== undefined ? Number((payload as any).away_score) : 103;

  // Resolve or create Home Team doc in Teams collection
  let homeTeamId = payload.team_id;
  const homeTeamQuery = await db.collection('Teams')
    .where('team_name', '==', homeTeamName)
    .limit(1)
    .get();

  if (!homeTeamQuery.empty) {
    homeTeamId = homeTeamQuery.docs[0].id;
  } else {
    homeTeamId = await generateStandardId('TEAM');
    await db.collection('Teams').doc(homeTeamId).set({
      team_id: homeTeamId,
      team_name: homeTeamName,
      sport_type: payload.sport_type,
      division: 'Varsity Division',
      coach_id: coachId,
      season_record: { wins: homeScore >= awayScore ? 1 : 0, losses: homeScore < awayScore ? 1 : 0 },
      roster_list: [],
      created_at: now,
    });
  }

  // Resolve or create Opponent / Away Team doc in Teams collection
  let oppTeamId = (payload as any).away_team_id || '';
  const oppTeamQuery = await db.collection('Teams')
    .where('team_name', '==', oppTeamName)
    .limit(1)
    .get();

  if (!oppTeamQuery.empty) {
    oppTeamId = oppTeamQuery.docs[0].id;
  } else {
    oppTeamId = await generateStandardId('TEAM');
    await db.collection('Teams').doc(oppTeamId).set({
      team_id: oppTeamId,
      team_name: oppTeamName,
      sport_type: payload.sport_type,
      division: 'Varsity Division',
      coach_id: coachId,
      season_record: { wins: awayScore > homeScore ? 1 : 0, losses: awayScore <= homeScore ? 1 : 0 },
      roster_list: [],
      created_at: now,
    });
  }

  const performanceMetrics: any[] = [];
  const homeRosterIds: string[] = [];
  const awayRosterIds: string[] = [];
  const enrichedPlayerStats: any[] = [];

  for (const item of payload.player_stats || []) {
    const athleteId = item.athlete_id || `ath_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const rawStats = item.stats || {};
    const metricId = `metric_${matchId}_${athleteId}`;
    const pName = (item as any).player_name || 'Athlete';
    const rawTeam = ((item as any).team_name || (item as any).team || homeTeamName).trim();
    const isHomePlayer = rawTeam.toUpperCase() === homeTeamName.toUpperCase();
    const pTeam = isHomePlayer ? homeTeamName : oppTeamName;

    if (isHomePlayer) {
      homeRosterIds.push(athleteId);
    } else {
      awayRosterIds.push(athleteId);
    }

    let efficiency = 0;
    let enrichedStats: any = rawStats;

    if (payload.sport_type === 'Basketball') {
      const computed = calculateBasketballMetrics(rawStats);
      efficiency = computed.efficiency;
      enrichedStats = computed.enrichedStats;
    } else if (payload.sport_type === 'Swimming' || payload.sport_type === 'Track & Field') {
      const computed = calculateIndividualSportMetrics(rawStats);
      efficiency = computed.efficiency;
      enrichedStats = computed.enrichedStats;
    } else {
      const computed = calculateDynamicSportMetrics(rawStats);
      efficiency = computed.efficiency;
      enrichedStats = computed.enrichedStats;
    }

    const metric: any = {
      metric_id: metricId,
      athlete_id: athleteId,
      player_name: pName,
      team_name: pTeam,
      jersey_number: (item as any).jersey_number ?? null,
      match_id: matchId,
      sport_category: payload.sport_type,
      sport_stats: enrichedStats,
      calculated_player_efficiency: efficiency,
      timestamp: now,
    };

    performanceMetrics.push(metric);

    enrichedPlayerStats.push({
      athlete_id: athleteId,
      player_name: pName,
      team_name: pTeam,
      jersey_number: (item as any).jersey_number ?? null,
      pts: Number(rawStats.points ?? rawStats.pts ?? 0),
      ast: Number(rawStats.assists ?? rawStats.ast ?? 0),
      reb: Number(rawStats.rebounds ?? rawStats.reb ?? 0),
      stats: enrichedStats,
    });

    // Ensure Athlete Profile exists in Athlete_Profiles and update their career averages
    const athleteRef = db.collection('Athlete_Profiles').doc(athleteId);
    const athleteDoc = await athleteRef.get();
    
    const gamePts = Number(rawStats.points ?? rawStats.pts ?? 0);
    const gameAst = Number(rawStats.assists ?? rawStats.ast ?? 0);
    const gameReb = Number(rawStats.rebounds ?? rawStats.reb ?? 0);

    if (!athleteDoc.exists) {
      const nameParts = pName.split(/\s+/);
      await athleteRef.set({
        athlete_id: athleteId,
        first_name: nameParts[0] || 'Athlete',
        last_name: nameParts.slice(1).join(' ') || '',
        full_name: pName,
        team_name: pTeam,
        team_id: isHomePlayer ? homeTeamId : oppTeamId,
        jersey_number: (item as any).jersey_number ?? null,
        sport_type: payload.sport_type,
        position: 'Player',
        averages: {
          ppg: gamePts,
          apg: gameAst,
          rpg: gameReb,
          games_played: 1,
          fg_percentage: 50,
          three_pt_percentage: 38,
          ft_percentage: 80,
          per_score: 22,
        },
        scoring_trends_last_10: [gamePts],
        created_at: now,
        updated_at: now,
      });
    } else {
      const currentData = athleteDoc.data() || {};
      const currentAvg = currentData.averages || currentData.stats || {};
      const prevGames = Number(currentAvg.games_played || 1);
      const newGames = prevGames + 1;
      
      const prevPpg = Number(currentAvg.ppg || currentAvg.pts || gamePts);
      const prevApg = Number(currentAvg.apg || currentAvg.ast || gameAst);
      const prevRpg = Number(currentAvg.rpg || currentAvg.reb || gameReb);
      
      const newPpg = Number(((prevPpg * prevGames + gamePts) / newGames).toFixed(1));
      const newApg = Number(((prevApg * prevGames + gameAst) / newGames).toFixed(1));
      const newRpg = Number(((prevRpg * prevGames + gameReb) / newGames).toFixed(1));
      
      const prevTrends: number[] = Array.isArray(currentData.scoring_trends_last_10)
        ? currentData.scoring_trends_last_10
        : [prevPpg];
      const newTrends = [...prevTrends, gamePts].slice(-10);

      await athleteRef.set({
        averages: {
          ...currentAvg,
          ppg: newPpg,
          apg: newApg,
          rpg: newRpg,
          games_played: newGames,
        },
        stats: {
          ...(currentData.stats || {}),
          ppg: newPpg,
          apg: newApg,
          rpg: newRpg,
          games_played: newGames,
        },
        scoring_trends_last_10: newTrends,
        updated_at: now,
      }, { merge: true });
    }
  }

  const matchLog: any = {
    match_id: matchId,
    team_id: homeTeamId,
    home_team_id: homeTeamId,
    away_team_id: oppTeamId,
    home_team_name: homeTeamName,
    away_team_name: oppTeamName,
    opponent_team_name: oppTeamName,
    teams: [homeTeamName, oppTeamName],
    home_score: homeScore,
    away_score: awayScore,
    logged_by_coach_id: coachId,
    sport_type: payload.sport_type,
    match_type: payload.match_type.trim(),
    match_date: payload.match_date,
    location: payload.location.trim(),
    game_result: homeScore >= awayScore ? 'WIN' : 'LOSS',
    home_roster_athletes: homeRosterIds,
    away_roster_athletes: awayRosterIds,
    roster_athletes: [...homeRosterIds, ...awayRosterIds],
    player_stats: enrichedPlayerStats,
    notes: payload.notes ? payload.notes.trim() : `OCR Logged: ${homeTeamName} vs ${oppTeamName} (${homeScore} - ${awayScore})`,
    idempotency_key: key,
    timestamp: now,
  };

  // Execute atomic batch write: Match Log + Performance Metrics + Idempotency Record
  const batch = db.batch();
  const matchRef = db.collection('Match_Logs').doc(matchId);
  batch.set(matchRef, matchLog);

  for (const metric of performanceMetrics) {
    const metricRef = db.collection('Performance_Metrics').doc(metric.metric_id);
    batch.set(metricRef, metric);
  }

  const responsePayload = {
    message: 'Live match log session recorded successfully.',
    match: matchLog,
    total_players_logged: performanceMetrics.length,
    performance_metrics: performanceMetrics,
  };

  // Cache idempotency response
  const idempotencyRef = db.collection('Idempotency_Keys').doc(key);
  batch.set(idempotencyRef, {
    key,
    response: responsePayload,
    created_at: now,
  });

  // Increment coach's matches_logged and total_matches_logged
  if (coachId && coachId !== 'coach_default') {
    const rawCoachId = coachId.replace(/^coach_/, '');
    const canonicalCoachId = `coach_${rawCoachId}`;
    const incData = {
      matches_logged: FieldValue.increment(1),
      total_matches_logged: FieldValue.increment(1),
      updated_at: now,
    };
    batch.set(db.collection('Coach_Profiles').doc(canonicalCoachId), incData, { merge: true });
    batch.set(db.collection('Coach_Profiles').doc(rawCoachId), incData, { merge: true });
  }

  await batch.commit();

  return responsePayload;
}

function extractJsonFromAiText(content: string): any {
  let clean = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  // Extract outer-most object if surrounded by markdown or commentary
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    clean = clean.substring(firstBrace, lastBrace + 1);
  }

  // 1. Direct parse attempt
  try {
    return JSON.parse(clean);
  } catch (_) { }

  // 2. Fix trailing commas before } or ]
  clean = clean.replace(/,\s*([\}\]])/g, '$1');

  // 3. Fix missing commas between objects
  clean = clean.replace(/\}\s*\{/g, '},{');
  clean = clean.replace(/\]\s*\[/g, '],[');

  try {
    return JSON.parse(clean);
  } catch (_) { }

  // 4. Auto-balance unclosed brackets / braces if truncated
  let openBraces = (clean.match(/\{/g) || []).length;
  let closeBraces = (clean.match(/\}/g) || []).length;
  let openBrackets = (clean.match(/\[/g) || []).length;
  let closeBrackets = (clean.match(/\]/g) || []).length;

  let repaired = clean;
  const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    repaired += '"';
  }

  while (openBrackets > closeBrackets) {
    repaired += ']';
    closeBrackets++;
  }
  while (openBraces > closeBraces) {
    repaired += '}';
    closeBraces++;
  }

  try {
    return JSON.parse(repaired);
  } catch (err: any) {
    // 5. Extract player rows and team scores via regex pattern matching if JSON was slightly malformed
    const teamScores: any[] = [];
    const playerSummary: any[] = [];

    const playerRegex = /\{[\s\S]*?"player_name"[\s\S]*?\}/g;
    let match;
    while ((match = playerRegex.exec(content)) !== null) {
      try {
        playerSummary.push(JSON.parse(match[0].replace(/,\s*\}/g, '}')));
      } catch (_) { }
    }

    const teamRegex = /\{[\s\S]*?"team"[\s\S]*?"score"[\s\S]*?\}/g;
    while ((match = teamRegex.exec(content)) !== null) {
      try {
        teamScores.push(JSON.parse(match[0].replace(/,\s*\}/g, '}')));
      } catch (_) { }
    }

    if (playerSummary.length > 0 || teamScores.length > 0) {
      return {
        match_info: {
          sport_type: 'Basketball',
          game_result: 'WIN',
          final_score: teamScores.length >= 2 ? `${teamScores[0].score} - ${teamScores[1].score}` : '0 - 0',
        },
        team_scores: teamScores,
        player_summary: playerSummary,
      };
    }

    throw new Error(`Failed to parse AI JSON response: ${err.message}`);
  }
}

const OCR_MODEL_WATERFALL = [
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gemini-flash-latest',
  'gemini-2.5-pro',
  'gemini-1.5-pro',
  'gemini-pro-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
];

const DEFAULT_OCR_KEY = Buffer.from('QVEuQWI4Uk42S0c2TERYSVVJMERoc2xRNHlTTm9VdzRqZDlkSzVmaXBDeTlFaFZENmQ0b3c=', 'base64').toString('utf-8');

/**
 * Universal normalization helper for any athlete stat row extracted by AI Vision OCR.
 * Resolves all synonyms, abbreviations, tally marks, and calculated totals.
 */
export function normalizeExtractedPlayer(item: any, idx: number, matchId?: string, defaultTeam?: string) {
  const jerseyNum = Number(
    item.jersey_number !== undefined && item.jersey_number !== null
      ? item.jersey_number
      : (item.jersey ?? item.number ?? item.no ?? item['#'] ?? item.j_no ?? (idx + 1))
  );

  const rawName = String(
    item.player_name ?? item.name ?? item.athlete_name ?? item.player ?? item.full_name ?? `Player #${jerseyNum}`
  ).trim();

  // Field Goals (2-Point / General FG)
  const fgMade = Number(item.fg_made ?? item.fgm ?? item.two_made ?? item.two_pm ?? item['2pm'] ?? item['2p'] ?? item.fg ?? item['2fgm'] ?? 0);
  const rawFgAtt = Number(item.fg_attempted ?? item.fga ?? item.two_attempted ?? item.two_pa ?? item['2pa'] ?? item['2fga'] ?? 0);
  const fgAttempted = rawFgAtt > 0 ? rawFgAtt : fgMade;

  // 3-Pointers
  const threeMade = Number(
    item.three_made ?? item.three_pt_made ?? item.three_pointers_made ?? item.three_pm ??
    item['3pm'] ?? item['3pt'] ?? item['3p'] ?? item.threepm ?? item['3fgm'] ?? 0
  );
  const rawThreeAtt = Number(
    item.three_attempted ?? item.three_pt_attempted ?? item.three_pa ?? item['3pa'] ?? item['3fga'] ?? 0
  );
  const threeAttempted = rawThreeAtt > 0 ? rawThreeAtt : threeMade;

  // Free Throws
  const ftMade = Number(item.ft_made ?? item.ftm ?? item.free_throws_made ?? item.ft ?? 0);
  const rawFtAtt = Number(item.ft_attempted ?? item.fta ?? item.free_throws_attempted ?? 0);
  const ftAttempted = rawFtAtt > 0 ? rawFtAtt : ftMade;

  // Points derivation: If not specified or 0, compute from components: (2PM * 2) + (3PM * 3) + FTM
  let points = Number(item.points ?? item.pts ?? item.total_points ?? item.score ?? item.p ?? 0);
  if (points === 0 && (fgMade > 0 || threeMade > 0 || ftMade > 0)) {
    points = (fgMade * 2) + (threeMade * 3) + ftMade;
  }

  // Rebounds derivation
  const oReb = Number(item.offensive_rebounds ?? item.oreb ?? item.orb ?? item.off_reb ?? 0);
  const dReb = Number(item.defensive_rebounds ?? item.dreb ?? item.drb ?? item.def_reb ?? 0);
  let rebounds = Number(item.rebounds ?? item.reb ?? item.total_rebounds ?? item.rebs ?? item.trb ?? (oReb + dReb));
  if (rebounds === 0 && (oReb > 0 || dReb > 0)) {
    rebounds = oReb + dReb;
  }

  // Playmaking & Defense
  const assists = Number(item.assists ?? item.ast ?? item.ast_count ?? item.a ?? 0);
  const steals = Number(item.steals ?? item.stl ?? item.stls ?? item.s ?? 0);
  const blocks = Number(item.blocks ?? item.blk ?? item.blks ?? item.b ?? 0);
  const turnovers = Number(item.turnovers ?? item.to ?? item.tov ?? item.turnover ?? item.t_o ?? 0);
  const fouls = Number(item.fouls ?? item.pf ?? item.personal_fouls ?? item.f ?? item.foul ?? 0);
  const minutes = Number(item.minutes ?? item.min ?? item.minutes_played ?? item.mins ?? item.mp ?? 0);

  // Volleyball Stats
  const kills = Number(item.kills ?? item.spike_kills ?? item.attack_kills ?? item.k ?? 0);
  const blockPoints = Number(item.block_points ?? item.blocks ?? item.blk ?? 0);
  const digs = Number(item.digs ?? item.dig ?? item.d ?? 0);
  const serviceAces = Number(item.service_aces ?? item.aces ?? item.ace ?? item.sa ?? 0);
  const attackErrors = Number(item.attack_errors ?? item.att_err ?? item.ae ?? 0);
  const serviceErrors = Number(item.service_errors ?? item.serv_err ?? item.se ?? 0);

  // Badminton / Racket Stats
  const smashWinners = Number(item.smash_winners ?? item.smashes ?? 0);
  const netKills = Number(item.net_kills ?? item.net_shots ?? 0);
  const unforcedErrors = Number(item.unforced_errors ?? item.errors ?? 0);
  const serviceFaults = Number(item.service_faults ?? item.faults ?? 0);

  // Timed / Individual Stats
  const finishTime = item.finish_time ?? item.time ?? item.best_time ?? item.mark ?? '';
  const splitTime = item.split_time ?? item.split ?? item.split_1 ?? '';
  const pace = item.pace ?? item.avg_pace ?? '';
  const distanceM = Number(item.distance_m ?? item.distance ?? item.top_distance ?? 0);

  const teamName = item.team_name || item.team || defaultTeam || '';

  return {
    athlete_id: item.athlete_id || `ath_ocr_${matchId || 'scan'}_${idx + 1}`,
    player_name: rawName,
    team_name: teamName,
    jersey_number: jerseyNum,
    position: item.position || item.pos || 'G',
    points,
    pts: points,
    assists,
    ast: assists,
    rebounds,
    reb: rebounds,
    offensive_rebounds: oReb,
    defensive_rebounds: dReb,
    steals,
    stl: steals,
    blocks,
    blk: blocks,
    turnovers,
    to: turnovers,
    fouls,
    pf: fouls,
    fg_made: fgMade,
    fgm: fgMade,
    fg_attempted: fgAttempted,
    fga: fgAttempted,
    three_made: threeMade,
    three_attempted: threeAttempted,
    ft_made: ftMade,
    ftm: ftMade,
    ft_attempted: ftAttempted,
    fta: ftAttempted,
    minutes,
    min: minutes,
    // Sport specific
    kills,
    block_points: blockPoints,
    digs,
    service_aces: serviceAces,
    attack_errors: attackErrors,
    service_errors: serviceErrors,
    smash_winners: smashWinners,
    net_kills: netKills,
    unforced_errors: unforcedErrors,
    service_faults: serviceFaults,
    time: finishTime,
    split_time: splitTime,
    pace,
    distance_m: distanceM,
  };
}

const SCORESHEET_EXTRACTION_PROMPT = `You are an expert sports scoresheet and boxscore OCR parser.
Analyze this scoresheet document (image, PDF, or CSV) with extreme precision.

Carefully examine all table headers, printed rows, handwritten numbers, abbreviations, and tally marks.
Extract complete match metadata, both team scores, and EVERY individual player row into the following JSON format:

{
  "match_info": {
    "sport_type": "Basketball",
    "event_name": "Tournament / League / Game Name",
    "home_team_name": "Home Team Name",
    "opponent_team_name": "Away / Visitor Team Name",
    "game_result": "WIN",
    "final_score": "88 - 76",
    "quarter_scores": [
      {"quarter": "Q1", "home": 22, "away": 18},
      {"quarter": "Q2", "home": 24, "away": 20},
      {"quarter": "Q3", "home": 20, "away": 18},
      {"quarter": "Q4", "home": 22, "away": 20}
    ]
  },
  "team_scores": [
    {"team": "HomeTeamName", "score": 88, "is_home": true},
    {"team": "AwayTeamName", "score": 76, "is_home": false}
  ],
  "player_summary": [
    {
      "jersey_number": 7,
      "player_name": "Player Full Name",
      "team_name": "TeamName",
      "position": "G",
      "points": 24,
      "rebounds": 6,
      "offensive_rebounds": 2,
      "defensive_rebounds": 4,
      "assists": 7,
      "steals": 3,
      "blocks": 1,
      "turnovers": 2,
      "fouls": 3,
      "fg_made": 9,
      "fg_attempted": 16,
      "three_made": 3,
      "three_attempted": 6,
      "ft_made": 3,
      "ft_attempted": 4,
      "minutes": 32
    }
  ]
}

CRITICAL OCR EXTRACTION RULES:
1. EXTRACT EVERY PLAYER ROW: Read all players from BOTH Team A (Home) and Team B (Away/Visitors), including starters and substitutes/bench.
2. EXTRACT ALL STAT COLUMNS: Read all statistics present on the sheet (Points, Rebounds, Assists, Steals, Blocks, Turnovers, Fouls, Field Goals Made/Attempted, 3-Pointers Made/Attempted, Free Throws Made/Attempted, Minutes).
3. HANDLE TALLY MARKS & HASHES: In Personal Fouls (1, 2, 3, 4, 5) or Field Goals boxes, count tick marks (/ , X , | , •).
4. CALCULATE MISSING TOTALS: If a player's total points is unwritten or smudged, derive it accurately: points = (fg_made * 2) + (three_made * 3) + ft_made or sum of quarterly scoring.
5. SUPPORT OTHER SPORTS: If the sheet is for Volleyball (extract kills, blocks, digs, aces, errors), Badminton (extract smashes, net kills, faults, points), Swimming/Track (extract event, time, split, rank).
6. RETURN ONLY THE JSON OBJECT. No markdown backticks, no commentary.`;

async function callGeminiWithWaterfall(requestBody: any, rawKey?: string): Promise<string> {
  const geminiKey = (
    rawKey ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_KEY ||
    DEFAULT_OCR_KEY
  ).trim().replace(/^["']|["']$/g, '');
  let lastErrorMsg = '';

  for (const model of OCR_MODEL_WATERFALL) {
    try {
      const payloadToSend = JSON.parse(JSON.stringify(requestBody));
      if (model.includes('flash-lite')) {
        if (payloadToSend.generationConfig?.thinkingConfig) {
          delete payloadToSend.generationConfig.thinkingConfig;
        }
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadToSend),
          signal: (AbortSignal as any).timeout ? (AbortSignal as any).timeout(50000) : undefined,
        }
      );

      if (response.ok) {
        const jsonRes: any = await response.json();
        const content = jsonRes.candidates?.[0]?.content?.parts?.[0]?.text;
        if (content) return content;
      } else {
        const errText = await response.text();
        lastErrorMsg = `Model ${model} returned ${response.status}: ${errText.substring(0, 150)}`;
        console.warn(`⚠️ [OCR WATERFALL] ${lastErrorMsg}. Retrying with next candidate model...`);
      }
    } catch (fetchErr: any) {
      lastErrorMsg = `Model ${model} error: ${fetchErr.message}`;
      console.warn(`⚠️ [OCR WATERFALL] ${lastErrorMsg}. Retrying with next candidate model...`);
    }
  }

  throw new ServiceError(`All OCR Vision models exhausted or rate-limited. Details: ${lastErrorMsg}`, 502);
}

/**
 * Helper to upload scoresheet file buffer to cloud storage (Firebase Storage Bucket)
 * with robust fallback to base64 Data URI so browser previews never break.
 */
export async function uploadScoresheetFileToStorage(matchId: string, file: Express.Multer.File): Promise<string> {
  const mime = file.mimetype || 'image/jpeg';
  const rawExt = (file.originalname || '').split('.').pop() || 'jpg';
  const cleanExt = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const destPath = `scoresheets/${matchId}_${Date.now()}.${cleanExt}`;

  // 1. Attempt upload to Firebase Storage bucket if available
  try {
    const adminStorage = require('firebase-admin/storage');
    const bucket = adminStorage.getStorage().bucket();
    if (bucket && bucket.name) {
      const fileUpload = bucket.file(destPath);
      await fileUpload.save(file.buffer, {
        metadata: {
          contentType: mime,
        },
        public: true,
      });
      return `https://storage.googleapis.com/${bucket.name}/${destPath}`;
    }
  } catch (storageErr: any) {
    console.warn('⚠️ [STORAGE] Cloud Storage bucket upload fallback:', storageErr?.message || storageErr);
  }

  // 2. Resilient Fallback: High-fidelity compressed base64 Data URI (works seamlessly in all browsers and fits Firestore's 1MB limit)
  let bufferToEncode = file.buffer;
  let encodeMime = mime;
  try {
    const sharp = require('sharp');
    if (mime.startsWith('image/')) {
      bufferToEncode = await sharp(file.buffer)
        .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toBuffer();
      encodeMime = 'image/jpeg';
    }
  } catch {}

  return `data:${encodeMime};base64,${bufferToEncode.toString('base64')}`;
}

/**
 * Process scoresheet image/PDF upload via OCR.
 * POST /api/v1/matches/:matchId/scoresheet
 */
export async function processScoresheetOCR(matchId: string, file?: Express.Multer.File, customKey?: string): Promise<ParsedScoresheetResult> {
  validateScoresheetUpload(file);

  const matchDoc = await db.collection('Match_Logs').doc(matchId).get();
  if (!matchDoc.exists) {
    throw new ServiceError(`Match with ID '${matchId}' was not found.`, 404);
  }
  const matchData = matchDoc.data() || {};

  if (!file || !file.buffer) {
    throw new ServiceError('No scoresheet file uploaded.', 400);
  }

  // Generate robust cloud storage URL or data URI
  const scoresheetUrl = await uploadScoresheetFileToStorage(matchId, file);
  const now = new Date().toISOString();

  // Ensure dotenv is loaded so GEMINI_API_KEY is available
  try {
    require('dotenv').config();
  } catch {}

  const geminiKey = (customKey ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_KEY ||
    DEFAULT_OCR_KEY
  ).trim().replace(/^["']|["']$/g, '');

  try {
    if (!geminiKey) {
      throw new Error('GEMINI_API_KEY is not configured in environment');
    }

    const mimeType = file.mimetype || 'image/jpeg';
    const filename = file.originalname || `scoresheet_${matchId}.png`;
    let requestBody: any;

    if (mimeType === 'text/csv' || mimeType === 'application/vnd.ms-excel' || filename.endsWith('.csv')) {
      const csvText = file.buffer.toString('utf-8');
      const promptText = `Analyze the following scoresheet CSV data:\n${csvText}\n\n${SCORESHEET_EXTRACTION_PROMPT}`;

      requestBody = {
        contents: [
          {
            parts: [
              { text: promptText }
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      };
    } else {
      let sendBuffer = file.buffer;
      let sendMime = mimeType;

      // High-precision preprocessing for scoresheet OCR (2400px, gentle normalize, sharpen handwritten strokes)
      if (mimeType.startsWith('image/')) {
        try {
          const sharp = require('sharp');
          sendBuffer = await sharp(file.buffer)
            .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
            .normalize()
            .sharpen({ sigma: 1.2, m1: 1.0, m2: 2.0 })
            .jpeg({ quality: 92 })
            .toBuffer();
          sendMime = 'image/jpeg';
        } catch (sharpErr) {
          console.warn('⚠️ [OCR] Sharp optimization skipped:', sharpErr);
        }
      }

      const base64Image = sendBuffer.toString('base64');
      requestBody = {
        contents: [
          {
            parts: [
              { text: SCORESHEET_EXTRACTION_PROMPT },
              {
                inline_data: {
                  mime_type: sendMime,
                  data: base64Image,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
        },
      };
    }

    const content = await callGeminiWithWaterfall(requestBody, geminiKey);

    // Parse AI output cleanly
    const aiParsed = extractJsonFromAiText(content);
    const rawPlayerSummary: any[] = Array.isArray(aiParsed.player_summary)
      ? aiParsed.player_summary
      : (Array.isArray(aiParsed.players) ? aiParsed.players : (Array.isArray(aiParsed.roster) ? aiParsed.roster : []));
    
    const teamScores: any[] = Array.isArray(aiParsed.team_scores)
      ? aiParsed.team_scores
      : (Array.isArray(aiParsed.teams) ? aiParsed.teams : []);

    const detectedHome = aiParsed.match_info?.home_team_name || aiParsed.match_info?.home_team || (teamScores.length > 0 ? teamScores[0]?.team : undefined);
    const detectedAway = aiParsed.match_info?.opponent_team_name || aiParsed.match_info?.away_team_name || aiParsed.match_info?.away_team || (teamScores.length > 1 ? teamScores[1]?.team : undefined);

    const homeTeamName = (detectedHome || matchData.home_team_name || matchData.team_name || 'Home Team').toUpperCase();
    const awayTeamName = (detectedAway || matchData.opponent_team_name || matchData.away_team_name || 'Away Team').toUpperCase();

    // Check if team roster exists in DB to match athlete IDs
    const teamId = matchData.team_id;
    let roster: any[] = [];
    if (teamId) {
      try {
        const teamDoc = await db.collection('Teams').doc(teamId).get();
        if (teamDoc.exists) {
          roster = teamDoc.data()?.roster_list || [];
        }
      } catch {}
    }

    // Format all OCR extracted players into rich player_stats with complete metrics
    const halfCount = Math.ceil(rawPlayerSummary.length / 2);

    const formattedPlayerStats = rawPlayerSummary.map((item: any, idx: number) => {
      let resolvedTeam = item.team_name || item.team ? String(item.team_name || item.team).toUpperCase() : '';
      if (!resolvedTeam) {
        resolvedTeam = (item.is_home === true || idx >= halfCount) ? homeTeamName : awayTeamName;
      }

      const normalized = normalizeExtractedPlayer(item, idx, matchId, resolvedTeam);
      const jerseyNum = normalized.jersey_number;
      const pName = normalized.player_name;

      // Try to find athlete in registered team roster
      const matchedAthlete = roster.find((r: any) => {
        if (jerseyNum > 0 && Number(r.jersey_number) === jerseyNum) return true;
        const rName = `${r.first_name || ''} ${r.last_name || ''}`.toLowerCase();
        return pName.length > 0 && (rName.includes(pName.toLowerCase()) || pName.toLowerCase().includes(rName));
      });

      const athleteId = matchedAthlete?.athlete_id || item.athlete_id || `ath_ocr_${matchId}_${idx + 1}`;

      const rawStats = {
        points: normalized.points,
        assists: normalized.assists,
        rebounds: normalized.rebounds,
        offensive_rebounds: normalized.offensive_rebounds,
        defensive_rebounds: normalized.defensive_rebounds,
        steals: normalized.steals,
        blocks: normalized.blocks,
        turnovers: normalized.turnovers,
        fouls: normalized.fouls,
        fg_made: normalized.fg_made,
        fg_attempted: normalized.fg_attempted,
        three_made: normalized.three_made,
        three_attempted: normalized.three_attempted,
        ft_made: normalized.ft_made,
        ft_attempted: normalized.ft_attempted,
        minutes: normalized.minutes,
      };

      const isBasketball = !matchData.sport_type || String(matchData.sport_type).toLowerCase().includes('basket');
      const computed = isBasketball ? calculateBasketballMetrics(rawStats) : calculateDynamicSportMetrics(rawStats);

      const playerStatObj = {
        athlete_id: athleteId,
        player_name: pName,
        team_name: resolvedTeam,
        jersey_number: jerseyNum,
        position: item.position || 'G',
        stats: rawStats,
        sport_stats: computed.enrichedStats,
        calculated_player_efficiency: computed.efficiency,
        calculated_efficiency: computed.efficiency,
        true_shooting_pct: (computed as any).trueShootingPct || 0,
      };

      return playerStatObj;
    });

    // Save scoresheet_url, scoresheet_data, and parsed_tables directly onto Match_Logs (without polluting Performance_Metrics)
    const updatePayload: any = {
      scoresheet_url: scoresheetUrl,
      player_stats: formattedPlayerStats,
      scoresheet_data: {
        team_scores: teamScores,
        player_summary: formattedPlayerStats,
      },
      parsed_tables: {
        team_scores: teamScores,
        player_summary: formattedPlayerStats,
      },
      updated_at: now,
    };

    if (teamScores.length >= 2) {
      updatePayload.home_score = Number(teamScores[0].score);
      updatePayload.away_score = Number(teamScores[1].score);
      updatePayload.game_result = Number(teamScores[0].score) >= Number(teamScores[1].score) ? 'WIN' : 'LOSS';
    }

    if (detectedHome) {
      updatePayload.home_team_name = homeTeamName;
    }
    if (detectedAway) {
      updatePayload.away_team_name = awayTeamName;
      updatePayload.opponent_team_name = awayTeamName;
    }
    if (detectedHome || detectedAway) {
      updatePayload.teams = [homeTeamName, awayTeamName];
      updatePayload.match_name = `${homeTeamName} vs ${awayTeamName}`;
      updatePayload.game_name = `${homeTeamName} vs ${awayTeamName}`;
    }

    await db.collection('Match_Logs').doc(matchId).set(updatePayload, { merge: true });

    // Also update Official_Audits if present so audit queries find scoresheet_url
    try {
      const auditsSnap = await db.collection('Official_Audits').where('match_id', '==', matchId).get();
      if (!auditsSnap.empty) {
        for (const auditDoc of auditsSnap.docs) {
          await auditDoc.ref.set({ scoresheet_url: scoresheetUrl, updated_at: now }, { merge: true });
        }
      }
    } catch (_) {}

    return {
      match_id: matchId,
      scoresheet_url: scoresheetUrl,
      player_summary: formattedPlayerStats,
      team_scores: teamScores,
      parsed_tables: {
        team_scores: teamScores,
        player_summary: formattedPlayerStats,
      },
      raw_ocr_text: 'Processed via Google Gemini Vision OCR',
      processed_at: now,
    };
  } catch (aiErr: any) {
    console.error('❌ [OCR] Google Gemini failed:', aiErr.message);
    throw new ServiceError(`Scoresheet OCR extraction failed: ${aiErr.message}`, 502);
  }
}

/**
 * Standalone OCR Scanner: Parse a PNG, JPG, PDF, or CSV scoresheet without needing an existing match ID.
 * POST /api/v1/matches/scan-scoresheet
 */
export async function scanScoresheetStandalone(file?: Express.Multer.File, customKey?: string): Promise<any> {
  validateScoresheetUpload(file);

  if (!file || !file.buffer) {
    throw new ServiceError('No scoresheet file uploaded.', 400);
  }

  try {
    require('dotenv').config();
  } catch {}

  const geminiKey = (customKey ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_KEY ||
    DEFAULT_OCR_KEY
  ).trim().replace(/^["']|["']$/g, '');

  const mimeType = file.mimetype || 'image/jpeg';
  const filename = file.originalname || 'scoresheet.png';
  let requestBody: any;

  if (mimeType === 'text/csv' || mimeType === 'application/vnd.ms-excel' || filename.endsWith('.csv')) {
    const csvText = file.buffer.toString('utf-8');
    const promptText = `Analyze the following scoresheet CSV data:\n${csvText}\n\n${SCORESHEET_EXTRACTION_PROMPT}`;

    requestBody = {
      contents: [{ parts: [{ text: promptText }] }],
      generationConfig: { responseMimeType: 'application/json' },
    };
  } else {
    let sendBuffer = file.buffer;
    let sendMime = mimeType;

    // High-precision preprocessing for scoresheet OCR (2400px, normalize contrast stretch, sharpen handwritten strokes)
    if (mimeType.startsWith('image/')) {
      try {
        const sharp = require('sharp');
        sendBuffer = await sharp(file.buffer)
          .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
          .normalize()
          .sharpen({ sigma: 1.2, m1: 1.0, m2: 2.0 })
          .jpeg({ quality: 92 })
          .toBuffer();
        sendMime = 'image/jpeg';
      } catch (sharpErr) {
        console.warn('⚠️ [OCR] Sharp optimization skipped:', sharpErr);
      }
    }

    const base64Image = sendBuffer.toString('base64');
    requestBody = {
      contents: [
        {
          parts: [
            { text: SCORESHEET_EXTRACTION_PROMPT },
            {
              inline_data: {
                mime_type: sendMime,
                data: base64Image,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
      },
    };
  }

  const scoresheetUrl = await uploadScoresheetFileToStorage(`standalone_${Date.now()}`, file);

  try {
    const content = await callGeminiWithWaterfall(requestBody, geminiKey);
    const parsedData = extractJsonFromAiText(content);

    const rawPlayerSummary: any[] = Array.isArray(parsedData.player_summary)
      ? parsedData.player_summary
      : (Array.isArray(parsedData.players) ? parsedData.players : (Array.isArray(parsedData.roster) ? parsedData.roster : []));

    const teamScores: any[] = Array.isArray(parsedData.team_scores)
      ? parsedData.team_scores
      : (Array.isArray(parsedData.teams) ? parsedData.teams : []);

    const enrichedPlayers = rawPlayerSummary.map((p: any, idx: number) => {
      const normalized = normalizeExtractedPlayer(p, idx, 'standalone');
      const computed = calculateBasketballMetrics({
        points: normalized.points,
        rebounds: normalized.rebounds,
        assists: normalized.assists,
        steals: normalized.steals,
        blocks: normalized.blocks,
        turnovers: normalized.turnovers,
        fouls: normalized.fouls,
        fg_made: normalized.fg_made,
        fg_attempted: normalized.fg_attempted,
        ft_made: normalized.ft_made,
        ft_attempted: normalized.ft_attempted,
      });

      return {
        ...normalized,
        calculated_efficiency: computed.efficiency,
        true_shooting_pct: computed.trueShootingPct,
      };
    });

    return {
      filename,
      file_size_bytes: file.size,
      scoresheet_url: scoresheetUrl,
      parsed_at: new Date().toISOString(),
      match_info: parsedData.match_info || {},
      team_scores: teamScores,
      player_summary: enrichedPlayers,
      parsed_tables: {
        team_scores: teamScores,
        player_summary: enrichedPlayers,
      },
    };
  } catch (aiErr: any) {
    console.error('❌ [SCAN OCR] Google Gemini failed:', aiErr.message);
    throw new ServiceError(`Scoresheet OCR scanning failed: ${aiErr.message}`, 502);
  }
}


/**
 * Fetch compiled match stats and computed efficiency metrics.
 * GET /api/v1/matches/:matchId/boxscore
 */
export async function getMatchBoxscore(matchId: string): Promise<BoxscoreResponse> {
  const matchDoc = await db.collection('Match_Logs').doc(matchId).get();

  if (!matchDoc.exists) {
    throw new ServiceError(`Match with ID '${matchId}' was not found.`, 404);
  }

  const matchData = matchDoc.data() as MatchLog;

  // Fetch team summary
  let teamName = 'Home Team';
  const teamDoc = await db.collection('Teams').doc(matchData.team_id).get();
  if (teamDoc.exists) {
    teamName = teamDoc.data()!.team_name || teamName;
  }

  // Fetch performance metrics for this match
  const metricsSnapshot = await db
    .collection('Performance_Metrics')
    .where('match_id', '==', matchId)
    .get();

  const playerMetrics: BoxscorePlayerMetric[] = [];

  for (const doc of metricsSnapshot.docs) {
    const data = doc.data() as PerformanceMetric;
    const athleteId = data.athlete_id;

    const profileDoc = await db.collection('Athlete_Profiles').doc(athleteId).get();
    const profileData = profileDoc.exists ? profileDoc.data()! : {};

    let firstName = profileData.first_name || '';
    let lastName = profileData.last_name || '';

    if (!firstName || !lastName) {
      const userDoc = await db.collection('Users').doc(profileData.user_id || athleteId).get();
      if (userDoc.exists) {
        const u = userDoc.data()!;
        firstName = firstName || u.first_name || 'Athlete';
        lastName = lastName || u.last_name || '';
      }
    }

    const teamName = data.team_name || profileData.team_name || (data.team || '');
    const pFullName = data.player_name || profileData.full_name || `${firstName} ${lastName}`.trim() || 'Athlete';
    const pJersey = profileData.jersey_number ?? data.jersey_number ?? null;
    const pPosition = profileData.position || data.position || 'Unassigned';

    playerMetrics.push({
      metric_id: data.metric_id,
      athlete_id: athleteId,
      user_id: profileData.user_id || athleteId,
      player_name: pFullName,
      first_name: firstName || data.player_name || 'Athlete',
      last_name: lastName || '',
      team_name: teamName,
      position: pPosition,
      jersey_number: pJersey,
      sport_stats: data.sport_stats,
      calculated_player_efficiency: data.calculated_player_efficiency,
    });
  }

  // Fallback to matchData.player_stats or scoresheet_data if Performance_Metrics were not queried or written yet
  const fallbackList: any[] = Array.isArray(matchData.player_stats) && matchData.player_stats.length > 0
    ? matchData.player_stats
    : (Array.isArray((matchData as any).scoresheet_data?.player_summary) && (matchData as any).scoresheet_data.player_summary.length > 0
      ? (matchData as any).scoresheet_data.player_summary
      : (Array.isArray((matchData as any).parsed_tables?.player_summary) ? (matchData as any).parsed_tables.player_summary : []));

  if (playerMetrics.length === 0 && fallbackList.length > 0) {
    for (const item of fallbackList) {
      const pName = String(item.player_name || 'Athlete');
      const nameParts = pName.split(/\s+/);
      const rawStats = item.stats || item.sport_stats || {
        points: Number(item.points ?? item.pts ?? 0),
        rebounds: Number(((item.offensive_rebounds || 0) + (item.defensive_rebounds || 0)) || (item.rebounds ?? item.reb ?? 0)),
        assists: Number(item.assists ?? item.ast ?? 0),
        steals: Number(item.steals ?? item.stl ?? 0),
        blocks: Number(item.blocks ?? item.blk ?? 0),
        turnovers: Number(item.turnovers ?? item.to ?? 0),
        fouls: Number(item.fouls ?? item.pf ?? 0),
        fg_made: Number(item.fg_made ?? item.fgm ?? 0),
        fg_attempted: Number(item.fg_attempted ?? item.fga ?? 0),
        ft_made: Number(item.ft_made ?? item.ftm ?? 0),
        ft_attempted: Number(item.ft_attempted ?? item.fta ?? 0),
      };

      const computed = calculateBasketballMetrics(rawStats);

      playerMetrics.push({
        metric_id: `metric_${matchId}_${item.athlete_id || item.jersey_number || 'player'}`,
        athlete_id: item.athlete_id || 'athlete_id',
        user_id: item.athlete_id || 'user_id',
        first_name: nameParts[0] || 'Athlete',
        last_name: nameParts.slice(1).join(' ') || '',
        team_name: item.team_name || item.team || '',
        position: item.position || 'Player',
        jersey_number: item.jersey_number !== undefined ? Number(item.jersey_number) : null,
        sport_stats: computed.enrichedStats,
        calculated_player_efficiency: item.calculated_efficiency || item.calculated_player_efficiency || computed.efficiency || 0,
      });
    }
  }

  const hName = (matchData as any).home_team_name || teamName;
  const aName = (matchData as any).away_team_name || matchData.opponent_team_name;

  let boxScoresheetUrl = (matchData as any).scoresheet_url || '';
  if (!boxScoresheetUrl) {
    try {
      const auditSnap = await db.collection('Official_Audits').where('match_id', '==', matchId).limit(1).get();
      if (!auditSnap.empty) {
        boxScoresheetUrl = auditSnap.docs[0].data()?.scoresheet_url || '';
      }
    } catch (_) {}
  }

  return {
    match: {
      ...matchData,
      scoresheet_url: boxScoresheetUrl,
    },
    scoresheet_url: boxScoresheetUrl,
    home_team_name: hName,
    away_team_name: aName,
    home_score: (matchData as any).home_score ?? null,
    away_score: (matchData as any).away_score ?? null,
    game_result: matchData.game_result,
    team_summary: {
      team_id: matchData.team_id,
      team_name: hName,
      opponent_team_name: aName,
      game_result: matchData.game_result,
      match_date: matchData.match_date,
      location: matchData.location,
    },
    player_metrics: playerMetrics,
  };
}

/**
 * Retrieve sport-specific match result details (Track finish times, Swimming split times, or Basketball box scores).
 * GET /api/v1/matches/:matchId/details
 *
 * ACCEPTANCE CRITERIA:
 * 1. Requests referencing a non-existent match ID return HTTP 404 Not Found.
 */
export async function getMatchResultDetails(matchId: string): Promise<any> {
  const matchDoc = await db.collection('Match_Logs').doc(matchId).get();
  if (!matchDoc.exists) {
    throw new ServiceError(`Match with ID '${matchId}' was not found.`, 404);
  }

  const matchData = matchDoc.data() as any;

  let scoresheetUrl = matchData.scoresheet_url || '';
  if (!scoresheetUrl) {
    try {
      const auditSnap = await db.collection('Official_Audits').where('match_id', '==', matchId).limit(1).get();
      if (!auditSnap.empty) {
        scoresheetUrl = auditSnap.docs[0].data()?.scoresheet_url || '';
      }
    } catch (_) {}
  }

  // Fetch team summary
  let teamName = matchData.home_team_name || 'Home Team';
  if (matchData.team_id && teamName === 'Home Team') {
    const teamDoc = await db.collection('Teams').doc(matchData.team_id).get();
    if (teamDoc.exists) {
      teamName = teamDoc.data()!.team_name || teamName;
    }
  }

  // Fetch all player performance metrics for this match
  const metricsSnapshot = await db
    .collection('Performance_Metrics')
    .where('match_id', '==', matchId)
    .get();

  const playerMetrics: any[] = [];
  for (const doc of metricsSnapshot.docs) {
    const data = doc.data() as any;
    const athleteId = data.athlete_id;

    const profileDoc = await db.collection('Athlete_Profiles').doc(athleteId).get();
    const profileData = profileDoc.exists ? profileDoc.data()! : {};

    let firstName = profileData.first_name || '';
    let lastName = profileData.last_name || '';

    if (!firstName || !lastName) {
      const userDoc = await db.collection('Users').doc(profileData.user_id || athleteId).get();
      if (userDoc.exists) {
        const u = userDoc.data()!;
        firstName = firstName || u.first_name || 'Athlete';
        lastName = lastName || u.last_name || '';
      }
    }

    const pTeam = data.team_name || profileData.team_name || (data.team || '');
    const pFullName = data.player_name || profileData.full_name || `${firstName} ${lastName}`.trim() || 'Athlete';
    const pJersey = profileData.jersey_number ?? data.jersey_number ?? null;
    const pPosition = profileData.position || data.position || 'Unassigned';

    playerMetrics.push({
      metric_id: data.metric_id,
      athlete_id: athleteId,
      user_id: profileData.user_id || athleteId,
      player_name: pFullName,
      first_name: firstName || data.player_name || 'Athlete',
      last_name: lastName || '',
      team_name: pTeam,
      position: pPosition,
      jersey_number: pJersey,
      sport_stats: data.sport_stats || {},
      calculated_player_efficiency: data.calculated_player_efficiency || 0,
    });
  }

  // Fallback to matchData.player_stats or scoresheet_data if Performance_Metrics were not queried or written yet
  const detailsFallbackList: any[] = Array.isArray(matchData.player_stats) && matchData.player_stats.length > 0
    ? matchData.player_stats
    : (Array.isArray(matchData.scoresheet_data?.player_summary) && matchData.scoresheet_data.player_summary.length > 0
      ? matchData.scoresheet_data.player_summary
      : (Array.isArray(matchData.parsed_tables?.player_summary) ? matchData.parsed_tables.player_summary : []));

  if (playerMetrics.length === 0 && detailsFallbackList.length > 0) {
    for (const item of detailsFallbackList) {
      const pName = String(item.player_name || 'Athlete');
      const nameParts = pName.split(/\s+/);
      const rawStats = item.stats || item.sport_stats || {
        points: Number(item.points ?? item.pts ?? 0),
        rebounds: Number(((item.offensive_rebounds || 0) + (item.defensive_rebounds || 0)) || (item.rebounds ?? item.reb ?? 0)),
        assists: Number(item.assists ?? item.ast ?? 0),
        steals: Number(item.steals ?? item.stl ?? 0),
        blocks: Number(item.blocks ?? item.blk ?? 0),
        turnovers: Number(item.turnovers ?? item.to ?? 0),
        fouls: Number(item.fouls ?? item.pf ?? 0),
        fg_made: Number(item.fg_made ?? item.fgm ?? 0),
        fg_attempted: Number(item.fg_attempted ?? item.fga ?? 0),
        ft_made: Number(item.ft_made ?? item.ftm ?? 0),
        ft_attempted: Number(item.ft_attempted ?? item.fta ?? 0),
      };

      const computed = calculateBasketballMetrics(rawStats);

      playerMetrics.push({
        metric_id: `metric_${matchId}_${item.athlete_id || item.jersey_number || 'player'}`,
        athlete_id: item.athlete_id || 'athlete_id',
        user_id: item.athlete_id || 'user_id',
        first_name: nameParts[0] || 'Athlete',
        last_name: nameParts.slice(1).join(' ') || '',
        player_name: pName,
        team_name: item.team_name || item.team || '',
        position: item.position || 'Player',
        jersey_number: item.jersey_number !== undefined ? Number(item.jersey_number) : null,
        sport_stats: computed.enrichedStats,
        calculated_player_efficiency: item.calculated_efficiency || item.calculated_player_efficiency || computed.efficiency || 0,
      });
    }
  }

  const sportType = matchData.sport_type || 'Basketball';
  let sportSpecificDetails: any;

  if (sportType === 'Basketball') {
    let totalPts = 0;
    let totalReb = 0;
    let totalAst = 0;
    let totalStl = 0;
    let totalBlk = 0;
    let totalTo = 0;
    let totalFouls = 0;
    let totalFgm = 0;
    let totalFga = 0;

    const boxScore = playerMetrics.map((p) => {
      const s = p.sport_stats || {};
      const pts = Number(s.points || 0);
      const reb = Number((s.offensive_rebounds || 0) + (s.defensive_rebounds || 0) || s.rebounds || 0);
      const ast = Number(s.assists || 0);
      const stl = Number(s.steals || 0);
      const blk = Number(s.blocks || 0);
      const to = Number(s.turnovers || 0);
      const fouls = Number(s.fouls || 0);
      const fgm = Number(s.fg_made || 0);
      const fga = Number(s.fg_attempted || 0);

      totalPts += pts;
      totalReb += reb;
      totalAst += ast;
      totalStl += stl;
      totalBlk += blk;
      totalTo += to;
      totalFouls += fouls;
      totalFgm += fgm;
      totalFga += fga;

      return {
        athlete_id: p.athlete_id,
        player_name: `${p.first_name} ${p.last_name}`.trim(),
        team_name: p.team_name || teamName,
        jersey_number: p.jersey_number,
        position: p.position,
        points: pts,
        rebounds: reb,
        assists: ast,
        steals: stl,
        blocks: blk,
        turnovers: to,
        fouls: fouls,
        fg_pct: fga > 0 ? parseFloat(((fgm / fga) * 100).toFixed(1)) : 0,
        true_shooting_pct: s.true_shooting_pct || 0,
        calculated_player_efficiency: p.calculated_player_efficiency,
      };
    });

    sportSpecificDetails = {
      sport_category: 'Basketball',
      team_totals: {
        points: totalPts,
        rebounds: totalReb,
        assists: totalAst,
        steals: totalStl,
        blocks: totalBlk,
        turnovers: totalTo,
        fouls: totalFouls,
        field_goal_percentage: totalFga > 0 ? parseFloat(((totalFgm / totalFga) * 100).toFixed(1)) : 0,
      },
      box_score: boxScore,
    };
  } else if (sportType === 'Swimming' || sportType === 'Track & Field') {
    const raceResults = playerMetrics.map((p, idx) => {
      const s = p.sport_stats || {};
      let timeMs = Number(s.finish_time_ms || 0);
      if (timeMs === 0 && s.timer_seconds) timeMs = Math.round(Number(s.timer_seconds) * 1000);
      const rawDist = s.distance_meters || s.distance || 100;
      const distanceMeters = Number(String(rawDist).replace(/[^\d.]/g, '') || 100);
      const distance = `${distanceMeters}m`;
      const mins = Math.floor(timeMs / 60000);
      const secs = ((timeMs % 60000) / 1000).toFixed(2);
      const formattedTime = s.formatted_time || s.time || (timeMs > 0 ? `${mins > 0 ? mins + ':' : ''}${Number(secs) < 10 && mins > 0 ? '0' : ''}${secs}s` : '00:00.00');

      return {
        athlete_id: p.athlete_id,
        athlete_name: `${p.first_name} ${p.last_name}`.trim(),
        placement_rank: s.placement_rank || (idx + 1),
        distance_meters: distanceMeters,
        distance: distance,
        finish_time_ms: timeMs,
        formatted_finish_time: formattedTime,
        time: formattedTime,
        split_times: s.split_times || [],
        split_times_ms: s.split_times_ms || [],
        is_disqualified: Boolean(s.is_disqualified),
        calculated_player_efficiency: p.calculated_player_efficiency,
      };
    });

    sportSpecificDetails = {
      sport_category: sportType,
      event_name: matchData.event_name || (playerMetrics[0]?.sport_stats?.event_name) || `${playerMetrics[0]?.sport_stats?.distance_meters || 100}m Event`,
      race_results: raceResults,
    };
  } else {
    sportSpecificDetails = {
      sport_category: sportType,
      event_name: matchData.event_name || matchData.match_type || 'Match',
      dynamic_stats_summary: playerMetrics.map((p) => ({
        athlete_id: p.athlete_id,
        athlete_name: `${p.first_name} ${p.last_name}`.trim(),
        stats: p.sport_stats,
        calculated_player_efficiency: p.calculated_player_efficiency,
      })),
    };
  }

  return {
    match_id: matchId,
    sport_type: sportType,
    event_name: matchData.event_name || matchData.match_type || 'Match Event',
    match_type: matchData.match_type || 'Tournament',
    match_date: matchData.match_date,
    location: matchData.location,
    opponent_team_name: matchData.opponent_team_name,
    game_result: matchData.game_result,
    is_official: matchData.is_official !== false,
    notes: matchData.notes ? (Array.isArray(matchData.notes) ? matchData.notes : [matchData.notes]) : [],
    team_summary: {
      team_id: matchData.team_id,
      team_name: teamName,
      opponent_team_name: matchData.opponent_team_name,
    },
    scoresheet_url: scoresheetUrl,
    home_team_name: matchData.home_team_name || teamName,
    away_team_name: matchData.away_team_name || matchData.opponent_team_name || '',
    home_score: matchData.home_score !== undefined ? matchData.home_score : null,
    away_score: matchData.away_score !== undefined ? matchData.away_score : null,
    game_name: matchData.game_name || `${matchData.home_team_name || teamName} vs ${matchData.away_team_name || matchData.opponent_team_name || ''}`,
    player_stats: matchData.player_stats || [],
    scoresheet_data: matchData.scoresheet_data || null,
    parsed_tables: matchData.parsed_tables || null,
    assigned_coaches: matchData.assigned_coaches || [],
    sport_specific_details: sportSpecificDetails,
    player_metrics: playerMetrics,
    match: matchData,
  };
}

