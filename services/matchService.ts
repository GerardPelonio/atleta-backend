import { db } from '../utils/firebaseAdmin';
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
  enrichedStats: IndividualSportStats;
} {
  const eventName = String(stats.event_name || '').trim();
  const distanceMeters = Number(stats.distance_meters || 0);
  const finishTimeMs = Number(stats.finish_time_ms || 0);
  const splitTimesMs = Array.isArray(stats.split_times_ms) ? stats.split_times_ms.map(Number) : [];
  const isDisqualified = !!stats.is_disqualified;

  let efficiency = 0;

  if (!isDisqualified && finishTimeMs > 0) {
    // Speed in meters per second
    const speedMps = distanceMeters / (finishTimeMs / 1000);
    // Base efficiency scaled to 100 max
    const baseScore = speedMps * 12.5;

    // Split consistency factor
    let splitFactor = 1.0;
    if (splitTimesMs.length > 1) {
      const avgSplit = splitTimesMs.reduce((a, b) => a + b, 0) / splitTimesMs.length;
      const variance = splitTimesMs.reduce((sum, val) => sum + Math.abs(val - avgSplit), 0) / splitTimesMs.length;
      splitFactor = Math.max(0.85, 1 - variance / avgSplit);
    }

    efficiency = Number((baseScore * splitFactor).toFixed(2));
  }

  const enrichedStats: IndividualSportStats = {
    event_name: eventName,
    distance_meters: distanceMeters,
    finish_time_ms: finishTimeMs,
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

  const matchId = `match_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  // Resolve Home Team name
  let homeTeamName = (payload as any).home_team_name || '';
  if (!homeTeamName && payload.team_id) {
    const homeTeamDoc = await db.collection('Teams').doc(payload.team_id).get();
    if (homeTeamDoc.exists) {
      homeTeamName = homeTeamDoc.data()?.team_name || 'Home Team';
    }
  }
  if (!homeTeamName) homeTeamName = 'Home Team';

  const oppTeamName = (payload.opponent_team_name || 'Opponent Team').trim();

  const matchLog: any = {
    match_id: matchId,
    team_id: payload.team_id,
    home_team_name: homeTeamName,
    logged_by_coach_id: coachId,
    sport_type: payload.sport_type,
    match_type: payload.match_type.trim(),
    match_date: payload.match_date,
    location: payload.location.trim(),
    opponent_team_name: oppTeamName,
    game_result: payload.game_result,
    roster_athletes: (payload.player_stats || []).map((p) => p.athlete_id),
    player_stats: payload.player_stats || [],
    notes: payload.notes ? payload.notes.trim() : undefined,
    idempotency_key: key,
    timestamp: now,
  };

  const performanceMetrics: any[] = [];

  for (const item of payload.player_stats || []) {
    const athleteId = item.athlete_id || `ath_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const rawStats = item.stats || {};
    const metricId = `metric_${matchId}_${athleteId}`;
    const pName = (item as any).player_name || 'Athlete';
    const pTeam = (item as any).team_name || ((item as any).team || homeTeamName);

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
      match_id: matchId,
      sport_category: payload.sport_type,
      sport_stats: enrichedStats,
      calculated_player_efficiency: efficiency,
      timestamp: now,
    };

    performanceMetrics.push(metric);

    // Ensure Athlete Profile exists in Athlete_Profiles for both Home and Away players
    const athleteRef = db.collection('Athlete_Profiles').doc(athleteId);
    const athleteDoc = await athleteRef.get();
    if (!athleteDoc.exists && pName) {
      const nameParts = pName.split(/\s+/);
      await athleteRef.set({
        athlete_id: athleteId,
        first_name: nameParts[0] || 'Athlete',
        last_name: nameParts.slice(1).join(' ') || '',
        team_name: pTeam,
        sport_type: payload.sport_type,
        position: 'Player',
        created_at: now,
      });
    }
  }

  // Ensure Opponent Team is recorded in Teams collection
  if (oppTeamName) {
    const oppTeamQuery = await db.collection('Teams')
      .where('team_name', '==', oppTeamName)
      .limit(1)
      .get();

    if (oppTeamQuery.empty) {
      const oppTeamId = `team_opp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const oppRoster = (payload.player_stats || [])
        .filter((p: any) => (p.team_name || '').toUpperCase() === oppTeamName.toUpperCase())
        .map((p: any, idx: number) => {
          const nameParts = (p.player_name || '').split(/\s+/);
          return {
            athlete_id: p.athlete_id,
            first_name: nameParts[0] || 'Player',
            last_name: nameParts.slice(1).join(' ') || '',
            jersey_number: p.jersey_number || idx + 1,
            position: 'Player',
          };
        });

      await db.collection('Teams').doc(oppTeamId).set({
        team_id: oppTeamId,
        team_name: oppTeamName,
        sport_type: payload.sport_type,
        roster_list: oppRoster,
        created_at: now,
      });
    }
  }

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
    // 5. Fallback: Extract player rows and team scores via regex pattern matching
    const teamScores: any[] = [];
    const playerSummary: any[] = [];

    const playerRegex = /\{[^{}]*"player_name"[^{}]*\}/g;
    let match;
    while ((match = playerRegex.exec(content)) !== null) {
      try {
        playerSummary.push(JSON.parse(match[0].replace(/,\s*\}/g, '}')));
      } catch (_) { }
    }

    const teamRegex = /\{[^{}]*"team"[^{}]*"score"[^{}]*\}/g;
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
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-flash-latest',
  'gemini-pro-latest',
  'gemini-3.5-flash',
];

async function callGeminiWithWaterfall(requestBody: any, geminiKey: string): Promise<string> {
  let lastErrorMsg = '';

  for (const model of OCR_MODEL_WATERFALL) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(45000),
        }
      );

      if (response.ok) {
        const jsonRes: any = await response.json();
        const content = jsonRes.candidates?.[0]?.content?.parts?.[0]?.text;
        if (content) return content;
      } else {
        const errText = await response.text();
        lastErrorMsg = `Model ${model} returned ${response.status}: ${errText.substring(0, 100)}`;
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
 * Process scoresheet image/PDF upload via OCR.
 * POST /api/v1/matches/:matchId/scoresheet
 */
export async function processScoresheetOCR(matchId: string, file?: Express.Multer.File): Promise<ParsedScoresheetResult> {
  validateScoresheetUpload(file);

  // Save the uploaded file to the scratch folder for analysis
  if (file && file.buffer) {
    try {
      const fs = require('fs');
      const path = require('path');
      const scratchDir = path.resolve(__dirname, '..', 'scratch');
      if (!fs.existsSync(scratchDir)) {
        fs.mkdirSync(scratchDir, { recursive: true });
      }
      fs.writeFileSync(path.join(scratchDir, 'last_uploaded.jpg'), file.buffer);
    } catch (saveErr: any) {
      console.warn('⚠️ [DEBUG] Could not save uploaded file to scratch:', saveErr.message);
    }
  }

  const matchDoc = await db.collection('Match_Logs').doc(matchId).get();
  if (!matchDoc.exists) {
    throw new ServiceError(`Match with ID '${matchId}' was not found.`, 404);
  }

  const filename = file ? file.originalname : `scoresheet_${matchId}.png`;
  const scoresheetUrl = `https://atleta.ph/uploads/scoresheets/${filename}`;
  const now = new Date().toISOString();

  // Ensure dotenv is loaded so GEMINI_API_KEY is available
  require('dotenv').config();
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!geminiKey) {
    throw new ServiceError('GEMINI_API_KEY is not configured in .env', 500);
  }

  if (!file || !file.buffer) {
    throw new ServiceError('No scoresheet file uploaded.', 400);
  }

  try {
    const mimeType = file.mimetype || 'image/jpeg';
    let requestBody: any;

    if (mimeType === 'text/csv' || mimeType === 'application/vnd.ms-excel' || filename.endsWith('.csv')) {
      const csvText = file.buffer.toString('utf-8');
      const promptText = `Analyze the following basketball scoresheet CSV data:
${csvText}

Extract the data into this exact JSON format:
{"team_scores":[{"team":"TeamName","score":0}],"player_summary":[{"player_name":"Full Name","jersey_number":0,"points":0,"rebounds":0,"assists":0,"fouls":0}]}

Important:
- Return ONLY the JSON object, nothing else.`;

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

      // Optimize and compress large camera photos before sending to AI (1200px max for instant transfer)
      if (mimeType.startsWith('image/')) {
        try {
          const sharp = require('sharp');
          sendBuffer = await sharp(file.buffer)
            .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer();
          sendMime = 'image/jpeg';
        } catch (sharpErr) {
          console.warn('⚠️ [OCR] Sharp optimization skipped:', sharpErr);
        }
      }

      const base64Image = sendBuffer.toString('base64');
      const promptText = `Look at this basketball scoresheet carefully. It has two teams with player rows containing jersey numbers (#), player names, quarter scores (Q1-Q4), field goals, free throws, and total points (PTS).

Extract the data into this exact JSON format:
{"team_scores":[{"team":"TeamName","score":0}],"player_summary":[{"player_name":"Full Name","jersey_number":0,"points":0,"rebounds":0,"assists":0,"fouls":0}]}

Important:
- The FINAL SCORE line at the bottom shows each team's total score.
- Each player row has: jersey # | Name | Position | Q1 | Q2 | Q3 | Q4 | FT | FGM/FGA | FTM/FTA | PTS
- The PTS column is the LAST number column on each player row.
- Include ALL players from BOTH teams (VISITORS and HOME).
- Use 0 for any stat you cannot read clearly.
- Return ONLY the JSON object, nothing else.`;

      requestBody = {
        contents: [
          {
            parts: [
              { text: promptText },
              {
                inlineData: {
                  mimeType: sendMime,
                  data: base64Image,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
          maxOutputTokens: 4096,
        },
      };
    }

    const content = await callGeminiWithWaterfall(requestBody, geminiKey);

    // Parse AI output cleanly
    const aiParsed = extractJsonFromAiText(content);
    const playerSummary: any[] = aiParsed.player_summary || [];

    // Save scoresheet_url to Match_Logs
    await db.collection('Match_Logs').doc(matchId).set({ scoresheet_url: scoresheetUrl }, { merge: true });

    // Populate Performance_Metrics for matched roster athletes from OCR
    const matchData = matchDoc.data()!;
    const teamId = matchData.team_id;

    if (teamId && playerSummary.length > 0) {
      const teamDoc = await db.collection('Teams').doc(teamId).get();
      if (teamDoc.exists) {
        const roster = teamDoc.data()?.roster_list || [];
        const batch = db.batch();
        let metricCount = 0;

        for (const item of playerSummary) {
          const jerseyNum = Number(item.jersey_number);
          const pName = String(item.player_name || '').toLowerCase();

          // Find athlete in team roster matching jersey number or name
          const matchedAthlete = roster.find((r: any) => {
            if (jerseyNum > 0 && Number(r.jersey_number) === jerseyNum) return true;
            const rName = `${r.first_name || ''} ${r.last_name || ''}`.toLowerCase();
            return pName.length > 0 && (rName.includes(pName) || pName.includes(rName));
          });

          if (matchedAthlete && matchedAthlete.athlete_id) {
            const athleteId = matchedAthlete.athlete_id;
            const metricId = `metric_${matchId}_${athleteId}`;

            const rawStats = {
              points: Number(item.points || 0),
              assists: Number(item.assists || 0),
              rebounds: Number(item.rebounds || 0),
              fouls: Number(item.fouls || 0),
            };

            const computed = calculateBasketballMetrics(rawStats);
            const metric: PerformanceMetric = {
              metric_id: metricId,
              athlete_id: athleteId,
              match_id: matchId,
              sport_category: matchData.sport_type || 'Basketball',
              sport_stats: computed.enrichedStats,
              calculated_player_efficiency: computed.efficiency,
              timestamp: now,
            };

            const metricRef = db.collection('Performance_Metrics').doc(metricId);
            batch.set(metricRef, metric);
            metricCount++;
          }
        }

        if (metricCount > 0) {
          await batch.commit();
          console.log(`✅ [OCR METRICS] Populated ${metricCount} player Performance_Metrics records from OCR.`);
        }
      }
    }

    return {
      match_id: matchId,
      scoresheet_url: scoresheetUrl,
      parsed_tables: {
        team_scores: aiParsed.team_scores || [],
        player_summary: playerSummary,
      },
      raw_ocr_text: 'Processed via Google Gemini API (gemini-3.5-flash)',
      processed_at: now,
    };
  } catch (aiErr: any) {
    console.error('❌ [OCR] Google Gemini failed:', aiErr.message);
    if (aiErr instanceof ServiceError) {
      throw aiErr;
    }
    throw new ServiceError(`OCR Processing failed: ${aiErr.message}`, 500);
  }
}

/**
 * Standalone OCR Scanner: Parse a PNG, JPG, PDF, or CSV scoresheet without needing an existing match ID.
 * POST /api/v1/matches/scan-scoresheet
 */
export async function scanScoresheetStandalone(file?: Express.Multer.File): Promise<any> {
  validateScoresheetUpload(file);

  if (!file || !file.buffer) {
    throw new ServiceError('No scoresheet file uploaded.', 400);
  }

  require('dotenv').config();
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!geminiKey) {
    throw new ServiceError('GEMINI_API_KEY is not configured in .env', 500);
  }

  const mimeType = file.mimetype || 'image/jpeg';
  const filename = file.originalname || 'scoresheet.png';
  let requestBody: any;

  if (mimeType === 'text/csv' || mimeType === 'application/vnd.ms-excel' || filename.endsWith('.csv')) {
    const csvText = file.buffer.toString('utf-8');
    const promptText = `Analyze the following basketball scoresheet CSV data:
${csvText}

Extract the data into this exact JSON format:
{
  "match_info": {
    "sport_type": "Basketball",
    "event_name": "Tournament / Game Event",
    "opponent_team_name": "Opponent Team",
    "home_team_name": "Home Team",
    "game_result": "WIN",
    "final_score": "0 - 0"
  },
  "team_scores": [
    {"team": "Team A", "score": 0},
    {"team": "Team B", "score": 0}
  ],
  "player_summary": [
    {
      "player_name": "Full Name",
      "jersey_number": 0,
      "points": 0,
      "rebounds": 0,
      "assists": 0,
      "steals": 0,
      "blocks": 0,
      "turnovers": 0,
      "fouls": 0,
      "fg_made": 0,
      "fg_attempted": 0,
      "ft_made": 0,
      "ft_attempted": 0
    }
  ]
}

Important:
- Return ONLY the JSON object, nothing else.`;

    requestBody = {
      contents: [{ parts: [{ text: promptText }] }],
      generationConfig: { responseMimeType: 'application/json' },
    };
  } else {
    let sendBuffer = file.buffer;
    let sendMime = mimeType;

    // Optimize and compress large camera photos before sending to AI
    if (mimeType.startsWith('image/')) {
      try {
        const sharp = require('sharp');
        sendBuffer = await sharp(file.buffer)
          .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
        sendMime = 'image/jpeg';
      } catch (sharpErr) {
        console.warn('⚠️ [OCR] Sharp optimization skipped:', sharpErr);
      }
    }

    const base64Image = sendBuffer.toString('base64');
    const promptText = `Analyze this basketball scoresheet carefully (image or PDF).
Extract the match overview, final team scores, and individual player statistics into this exact JSON format:
{
  "match_info": {
    "sport_type": "Basketball",
    "event_name": "Tournament / League Name",
    "opponent_team_name": "Opponent Team Name",
    "home_team_name": "Home Team Name",
    "game_result": "WIN",
    "final_score": "0 - 0"
  },
  "team_scores": [
    {"team": "TeamName", "score": 0}
  ],
  "player_summary": [
    {
      "player_name": "Full Name",
      "jersey_number": 0,
      "points": 0,
      "rebounds": 0,
      "assists": 0,
      "steals": 0,
      "blocks": 0,
      "turnovers": 0,
      "fouls": 0,
      "fg_made": 0,
      "fg_attempted": 0,
      "ft_made": 0,
      "ft_attempted": 0
    }
  ]
}

Important:
- Extract all players from both teams.
- Compute player points, rebounds, assists, fouls, etc. accurately.
- Return ONLY the JSON object.`;

    requestBody = {
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType: sendMime,
                data: base64Image,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 4096,
      },
    };
  }

  const content = await callGeminiWithWaterfall(requestBody, geminiKey);
  const parsedData = extractJsonFromAiText(content);

  if (Array.isArray(parsedData.player_summary)) {
    parsedData.player_summary = parsedData.player_summary.map((p: any) => {
      const computed = calculateBasketballMetrics({
        points: Number(p.points || 0),
        rebounds: Number(p.rebounds || 0),
        assists: Number(p.assists || 0),
        steals: Number(p.steals || 0),
        blocks: Number(p.blocks || 0),
        turnovers: Number(p.turnovers || 0),
        fouls: Number(p.fouls || 0),
        fg_made: Number(p.fg_made || 0),
        fg_attempted: Number(p.fg_attempted || 0),
        ft_made: Number(p.ft_made || 0),
        ft_attempted: Number(p.ft_attempted || 0),
      });

      return {
        ...p,
        calculated_efficiency: computed.efficiency,
        true_shooting_pct: computed.trueShootingPct,
      };
    });
  }

  return {
    filename,
    file_size_bytes: file.size,
    parsed_at: new Date().toISOString(),
    ...parsedData,
  };
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
    playerMetrics.push({
      metric_id: data.metric_id,
      athlete_id: athleteId,
      user_id: profileData.user_id || athleteId,
      first_name: firstName || data.player_name || 'Athlete',
      last_name: lastName || '',
      team_name: teamName,
      position: profileData.position || 'Unassigned',
      jersey_number: profileData.jersey_number ?? null,
      sport_stats: data.sport_stats,
      calculated_player_efficiency: data.calculated_player_efficiency,
    });
  }

  // Fallback to matchData.player_stats if Performance_Metrics were not queried or written yet
  if (playerMetrics.length === 0 && Array.isArray(matchData.player_stats) && matchData.player_stats.length > 0) {
    for (const item of matchData.player_stats) {
      const pName = (item as any).player_name || 'Athlete';
      const nameParts = pName.split(/\s+/);
      playerMetrics.push({
        metric_id: `metric_${matchId}_${(item as any).athlete_id || 'player'}`,
        athlete_id: (item as any).athlete_id || 'athlete_id',
        user_id: (item as any).athlete_id || 'user_id',
        first_name: nameParts[0] || 'Athlete',
        last_name: nameParts.slice(1).join(' ') || '',
        team_name: (item as any).team_name || (item as any).team || '',
        position: 'Player',
        jersey_number: (item as any).jersey_number ?? null,
        sport_stats: (item as any).stats || (item as any).sport_stats || {},
        calculated_player_efficiency: 0,
      });
    }
  }

  return {
    match: matchData,
    team_summary: {
      team_id: matchData.team_id,
      team_name: (matchData as any).home_team_name || teamName,
      opponent_team_name: matchData.opponent_team_name,
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
    playerMetrics.push({
      metric_id: data.metric_id,
      athlete_id: athleteId,
      user_id: profileData.user_id || athleteId,
      first_name: firstName || data.player_name || 'Athlete',
      last_name: lastName || '',
      team_name: pTeam,
      position: profileData.position || 'Unassigned',
      jersey_number: profileData.jersey_number ?? null,
      sport_stats: data.sport_stats || {},
      calculated_player_efficiency: data.calculated_player_efficiency || 0,
    });
  }

  // Fallback to matchData.player_stats if Performance_Metrics were not queried or written yet
  if (playerMetrics.length === 0 && Array.isArray(matchData.player_stats) && matchData.player_stats.length > 0) {
    for (const item of matchData.player_stats) {
      const pName = (item as any).player_name || 'Athlete';
      const nameParts = pName.split(/\s+/);
      playerMetrics.push({
        metric_id: `metric_${matchId}_${(item as any).athlete_id || 'player'}`,
        athlete_id: (item as any).athlete_id || 'athlete_id',
        user_id: (item as any).athlete_id || 'user_id',
        first_name: nameParts[0] || 'Athlete',
        last_name: nameParts.slice(1).join(' ') || '',
        team_name: (item as any).team_name || (item as any).team || '',
        position: 'Player',
        jersey_number: (item as any).jersey_number ?? null,
        sport_stats: (item as any).stats || (item as any).sport_stats || {},
        calculated_player_efficiency: 0,
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
      const timeMs = Number(s.finish_time_ms || 60000);
      const mins = Math.floor(timeMs / 60000);
      const secs = ((timeMs % 60000) / 1000).toFixed(2);
      const formattedTime = `${mins > 0 ? mins + ':' : ''}${Number(secs) < 10 && mins > 0 ? '0' : ''}${secs}s`;

      return {
        athlete_id: p.athlete_id,
        athlete_name: `${p.first_name} ${p.last_name}`.trim(),
        placement_rank: s.placement_rank || (idx + 1),
        distance_meters: s.distance_meters || 100,
        finish_time_ms: timeMs,
        formatted_finish_time: formattedTime,
        split_times_ms: s.split_times_ms || [],
        is_disqualified: Boolean(s.is_disqualified),
        calculated_player_efficiency: p.calculated_player_efficiency,
      };
    });

    sportSpecificDetails = {
      sport_category: sportType,
      event_name: matchData.event_name || (playerMetrics[0]?.sport_stats?.event_name) || '100m Final',
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
      game_result: matchData.game_result,
      match_date: matchData.match_date,
      location: matchData.location,
    },
    sport_specific_details: sportSpecificDetails,
    player_metrics: playerMetrics,
  };
}

