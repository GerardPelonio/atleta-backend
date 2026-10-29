import { db } from '../utils/firebaseAdmin';
import { TournamentBracket, BracketStage, BracketMatch } from '../models/tournamentModel';
import crypto from 'crypto';

const COLLECTION_NAME = 'Tournament_Brackets';

function cleanUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(cleanUndefined) as any;
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = cleanUndefined(value);
    }
  }
  return result as T;
}

export function buildSingleEliminationStages(teams: string[]): BracketStage[] {
  const cleanTeams = teams.map((t, idx) => (t && t.trim()) ? t.trim() : `Team ${idx + 1}`);
  const count = Math.max(2, cleanTeams.length);

  // Find next power of 2
  let bracketSize = 2;
  while (bracketSize < count) {
    bracketSize *= 2;
  }

  const numRounds = Math.log2(bracketSize);
  const byesCount = bracketSize - count;

  // Standard seeding order (e.g. for 8: [1,8, 4,5, 2,7, 3,6])
  const getSeedOrder = (size: number): number[] => {
    let order = [1, 2];
    while (order.length < size) {
      const nextSize = order.length * 2;
      const nextOrder: number[] = [];
      for (const s of order) {
        nextOrder.push(s);
        nextOrder.push(nextSize + 1 - s);
      }
      order = nextOrder;
    }
    return order;
  };

  const seedOrder = getSeedOrder(bracketSize);
  const seededSlots: { team_name: string; seed: number; isBye: boolean }[] = seedOrder.map((seedNum) => {
    if (seedNum <= count) {
      return { team_name: cleanTeams[seedNum - 1], seed: seedNum, isBye: false };
    }
    return { team_name: 'BYE', seed: seedNum, isBye: true };
  });

  const stages: BracketStage[] = [];
  const getStageName = (roundIdx: number, totalRounds: number) => {
    const roundsFromFinals = totalRounds - 1 - roundIdx;
    if (roundsFromFinals === 0) return 'Finals';
    if (roundsFromFinals === 1) return 'Semifinals';
    if (roundsFromFinals === 2) return 'Quarterfinals';
    if (roundsFromFinals === 3) return 'Round of 16';
    return `Round ${roundIdx + 1}`;
  };

  // Round 1
  const r1Matches: BracketMatch[] = [];
  const r1MatchCount = bracketSize / 2;
  for (let i = 0; i < r1MatchCount; i++) {
    const home = seededSlots[i * 2];
    const away = seededSlots[i * 2 + 1];
    const matchId = `M_R1_${i + 1}`;
    const nextMatchId = numRounds > 1 ? `M_R2_${Math.floor(i / 2) + 1}` : undefined;
    const slotForNext = (i % 2 === 0 ? 'home' : 'away') as 'home' | 'away';

    const isByeMatch = home.isBye || away.isBye;
    const winnerName = home.isBye ? away.team_name : (away.isBye ? home.team_name : undefined);

    r1Matches.push({
      match_id: matchId,
      round_number: 1,
      stage_name: getStageName(0, numRounds),
      home_team: { team_name: home.team_name, seed: home.seed, score: 0 },
      away_team: { team_name: away.team_name, seed: away.seed, score: 0 },
      status: isByeMatch ? 'COMPLETED' : 'SCHEDULED',
      winner_team_name: winnerName,
      next_match_id: nextMatchId,
      slot_for_next: slotForNext,
    });
  }
  stages.push({ stage_name: getStageName(0, numRounds), round_number: 1, matches: r1Matches });

  // Subsequent rounds
  for (let r = 1; r < numRounds; r++) {
    const roundNumber = r + 1;
    const roundMatches: BracketMatch[] = [];
    const matchCount = bracketSize / Math.pow(2, r + 1);
    const prevMatches = stages[r - 1].matches;

    for (let m = 0; m < matchCount; m++) {
      const matchId = `M_R${roundNumber}_${m + 1}`;
      const nextMatchId = roundNumber < numRounds ? `M_R${roundNumber + 1}_${Math.floor(m / 2) + 1}` : undefined;
      const slotForNext = (m % 2 === 0 ? 'home' : 'away') as 'home' | 'away';

      // Check if feeder matches had byes and advance them automatically
      const prevHomeMatch = prevMatches[m * 2];
      const prevAwayMatch = prevMatches[m * 2 + 1];

      const homeTeamName = prevHomeMatch?.winner_team_name || `TBD (Winner ${prevHomeMatch?.match_id || ''})`;
      const awayTeamName = prevAwayMatch?.winner_team_name || `TBD (Winner ${prevAwayMatch?.match_id || ''})`;

      const homeReady = homeTeamName && !homeTeamName.startsWith('TBD') && homeTeamName !== 'BYE';
      const awayReady = awayTeamName && !awayTeamName.startsWith('TBD') && awayTeamName !== 'BYE';
      const matchStatus = (homeReady && awayReady) ? 'SCHEDULED' : 'PENDING';

      roundMatches.push({
        match_id: matchId,
        round_number: roundNumber,
        stage_name: getStageName(r, numRounds),
        home_team: { team_name: homeTeamName, score: 0 },
        away_team: { team_name: awayTeamName, score: 0 },
        status: matchStatus,
        next_match_id: nextMatchId,
        slot_for_next: slotForNext,
      });
    }
    stages.push({ stage_name: getStageName(r, numRounds), round_number: roundNumber, matches: roundMatches });
  }

  return stages;
}

export function buildDoubleEliminationStages(teams: string[]): BracketStage[] {
  const cleanTeams = teams.map((t, idx) => (t && t.trim()) ? t.trim() : `Team ${idx + 1}`);
  const count = Math.min(8, Math.max(4, cleanTeams.length));
  const activeTeams = cleanTeams.slice(0, count);

  const stages: BracketStage[] = [];

  // Winners Bracket (Round 1)
  const wbMatches: BracketMatch[] = [
    {
      match_id: 'WB_M1',
      round_number: 1,
      stage_name: 'Winners Bracket Round 1',
      home_team: { team_name: activeTeams[0] || 'Team 1', seed: 1, score: 0 },
      away_team: { team_name: activeTeams[3] || 'Team 4', seed: 4, score: 0 },
      status: 'SCHEDULED',
      next_match_id: 'WB_FINALS',
      slot_for_next: 'home',
    },
    {
      match_id: 'WB_M2',
      round_number: 1,
      stage_name: 'Winners Bracket Round 1',
      home_team: { team_name: activeTeams[1] || 'Team 2', seed: 2, score: 0 },
      away_team: { team_name: activeTeams[2] || 'Team 3', seed: 3, score: 0 },
      status: 'SCHEDULED',
      next_match_id: 'WB_FINALS',
      slot_for_next: 'away',
    },
  ];
  stages.push({ stage_name: 'Winners Bracket Round 1', round_number: 1, matches: wbMatches });

  // Losers Bracket Round 1
  const lbR1Matches: BracketMatch[] = [
    {
      match_id: 'LB_M1',
      round_number: 2,
      stage_name: 'Losers Bracket Semifinals',
      home_team: { team_name: 'TBD (Loser WB M1)', score: 0 },
      away_team: { team_name: 'TBD (Loser WB M2)', score: 0 },
      status: 'PENDING',
      next_match_id: 'LB_FINALS',
      slot_for_next: 'away',
    },
  ];
  stages.push({ stage_name: 'Losers Bracket Semifinals', round_number: 2, matches: lbR1Matches });

  // Winners Bracket Finals
  const wbFinals: BracketMatch[] = [
    {
      match_id: 'WB_FINALS',
      round_number: 2,
      stage_name: 'Winners Bracket Finals',
      home_team: { team_name: 'TBD (Winner WB M1)', score: 0 },
      away_team: { team_name: 'TBD (Winner WB M2)', score: 0 },
      status: 'PENDING',
      next_match_id: 'GRAND_FINALS',
      slot_for_next: 'home',
    },
  ];
  stages.push({ stage_name: 'Winners Bracket Finals', round_number: 2, matches: wbFinals });

  // Losers Bracket Finals
  const lbFinals: BracketMatch[] = [
    {
      match_id: 'LB_FINALS',
      round_number: 3,
      stage_name: 'Losers Bracket Finals',
      home_team: { team_name: 'TBD (Loser WB Finals)', score: 0 },
      away_team: { team_name: 'TBD (Winner LB M1)', score: 0 },
      status: 'PENDING',
      next_match_id: 'GRAND_FINALS',
      slot_for_next: 'away',
    },
  ];
  stages.push({ stage_name: 'Losers Bracket Finals', round_number: 3, matches: lbFinals });

  // Grand Finals
  const grandFinals: BracketMatch[] = [
    {
      match_id: 'GRAND_FINALS',
      round_number: 4,
      stage_name: 'Finals',
      home_team: { team_name: 'TBD (Winners Bracket Champion)', score: 0 },
      away_team: { team_name: 'TBD (Losers Bracket Champion)', score: 0 },
      status: 'PENDING',
    },
  ];
  stages.push({ stage_name: 'Finals', round_number: 4, matches: grandFinals });

  return stages;
}

export function buildRoundRobinStages(teams: string[]): BracketStage[] {
  const cleanTeams = [...teams.map((t, idx) => (t && t.trim()) ? t.trim() : `Team ${idx + 1}`)];
  if (cleanTeams.length % 2 !== 0) {
    cleanTeams.push('BYE');
  }

  const numTeams = cleanTeams.length;
  const numRounds = numTeams - 1;
  const matchesPerRound = numTeams / 2;
  const stages: BracketStage[] = [];

  const teamList = [...cleanTeams];

  for (let r = 0; r < numRounds; r++) {
    const roundMatches: BracketMatch[] = [];
    for (let m = 0; m < matchesPerRound; m++) {
      const home = teamList[m];
      const away = teamList[numTeams - 1 - m];
      const matchId = `RR_R${r + 1}_M${m + 1}`;
      const hasBye = home === 'BYE' || away === 'BYE';
      const winner = home === 'BYE' ? away : (away === 'BYE' ? home : undefined);

      roundMatches.push({
        match_id: matchId,
        round_number: r + 1,
        stage_name: `Round Robin Round ${r + 1}`,
        home_team: { team_name: home, score: 0 },
        away_team: { team_name: away, score: 0 },
        status: hasBye ? 'COMPLETED' : 'SCHEDULED',
        winner_team_name: winner,
      });
    }
    stages.push({
      stage_name: `Round Robin Round ${r + 1}`,
      round_number: r + 1,
      matches: roundMatches,
    });

    // Rotate teams clockwise, keeping the first team fixed
    const fixed = teamList[0];
    const rotating = teamList.slice(1);
    const last = rotating.pop()!;
    rotating.unshift(last);
    teamList.splice(0, teamList.length, fixed, ...rotating);
  }

  return stages;
}

export function createDefaultSingleEliminationBracket(
  tournamentName: string,
  sportType: string,
  teams: string[],
  format: string = 'single_elimination'
): TournamentBracket {
  const bracketId = `BRACKET_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
  const now = new Date().toISOString();

  const defaultTeams = [
    'DLSU GREEN ARCHERS',
    'ATENEO BLUE EAGLES',
    'UP FIGHTING MAROONS',
    'UST GROWLING TIGERS',
    'FEU TAMARAWS',
    'NU BULLDOGS',
    'ADAMSON SOARING FALCONS',
    'UE RED WARRIORS',
  ];

  const seedList = teams && teams.length >= 2 ? teams : defaultTeams;

  let stages: BracketStage[];
  if (format === 'double_elimination') {
    stages = buildDoubleEliminationStages(seedList);
  } else if (format === 'round_robin') {
    stages = buildRoundRobinStages(seedList);
  } else {
    stages = buildSingleEliminationStages(seedList);
  }

  return {
    bracket_id: bracketId,
    tournament_name: tournamentName || 'National Championship Tournament',
    sport_type: sportType || 'Basketball',
    format: (format as any) || 'single_elimination',
    status: 'Active',
    stages,
    created_at: now,
    updated_at: now,
  };
}

export async function getTournamentBrackets(sport?: string): Promise<TournamentBracket[]> {
  try {
    let query: any = db.collection(COLLECTION_NAME);
    if (sport && sport.trim() && sport.toUpperCase() !== 'ALL') {
      query = query.where('sport_type', '==', sport.trim());
    }

    const snap = await query.get().catch(() => null);
    const brackets: TournamentBracket[] = [];

    if (snap && !snap.empty) {
      snap.forEach((doc: any) => {
        brackets.push({ ...doc.data(), bracket_id: doc.id });
      });
    }

    return brackets;
  } catch (err) {
    console.warn('getTournamentBrackets error:', err);
    return [];
  }
}

export async function getTournamentBracketById(bracketId: string): Promise<TournamentBracket | null> {
  const doc = await db.collection(COLLECTION_NAME).doc(bracketId).get().catch(() => null);
  if (doc && doc.exists) {
    return { ...doc.data(), bracket_id: doc.id } as TournamentBracket;
  }
  return null;
}

export async function saveTournamentBracket(
  userId: string,
  bracketData: Partial<TournamentBracket>
): Promise<TournamentBracket> {
  const bracketId = bracketData.bracket_id || `BRACKET_${Date.now()}`;
  const now = new Date().toISOString();

  let stages = bracketData.stages || [];
  if (!stages || stages.length === 0) {
    const defaultBracket = createDefaultSingleEliminationBracket(
      bracketData.tournament_name || 'Tournament Championship',
      bracketData.sport_type || 'Basketball',
      (bracketData as any).teams || [],
      bracketData.format || 'single_elimination'
    );
    stages = defaultBracket.stages;
  }

  const payload: TournamentBracket = {
    bracket_id: bracketId,
    tournament_name: bracketData.tournament_name || 'Tournament Championship',
    sport_type: bracketData.sport_type || 'Basketball',
    division: bracketData.division || 'Collegiate Division',
    format: bracketData.format || 'single_elimination',
    status: bracketData.status || 'Active',
    stages,
    champion_team: bracketData.champion_team || '',
    created_by: userId,
    created_at: bracketData.created_at || now,
    updated_at: now,
  };

  await db.collection(COLLECTION_NAME).doc(bracketId).set(cleanUndefined(payload), { merge: true });
  return payload;
}

export async function advanceBracketMatch(
  bracketId: string,
  matchId: string,
  winnerTeamName: string,
  homeScore?: number,
  awayScore?: number
): Promise<TournamentBracket> {
  let bracket = await getTournamentBracketById(bracketId);
  if (!bracket) {
    bracket = createDefaultSingleEliminationBracket('Tournament Championship', 'Basketball', []);
    bracket.bracket_id = bracketId;
  }

  let nextMatchId: string | undefined;
  let slotForNext: 'home' | 'away' | undefined;
  let isFinalsMatch = false;

  // 1. Find and update target match
  for (const stage of bracket.stages) {
    for (const match of stage.matches) {
      if (match.match_id === matchId) {
        if (homeScore !== undefined) match.home_team.score = homeScore;
        if (awayScore !== undefined) match.away_team.score = awayScore;

        const isHomeWinner = match.home_team.team_name === winnerTeamName;
        match.home_team.is_winner = isHomeWinner;
        match.away_team.is_winner = !isHomeWinner;
        match.winner_team_name = winnerTeamName;
        match.status = 'COMPLETED';

        nextMatchId = match.next_match_id;
        slotForNext = match.slot_for_next;

        if (stage.stage_name === 'Finals' || match.stage_name === 'Finals') {
          isFinalsMatch = true;
          bracket.champion_team = winnerTeamName;
          bracket.status = 'Completed';
        }
      }
    }
  }

  // 2. Advance winner to next match if applicable
  if (nextMatchId && slotForNext) {
    for (const stage of bracket.stages) {
      for (const match of stage.matches) {
        if (match.match_id === nextMatchId) {
          if (slotForNext === 'home') {
            match.home_team.team_name = winnerTeamName;
          } else {
            match.away_team.team_name = winnerTeamName;
          }

          // If both slots are now filled with actual teams, mark as SCHEDULED
          const homeReady = match.home_team.team_name && !match.home_team.team_name.startsWith('TBD');
          const awayReady = match.away_team.team_name && !match.away_team.team_name.startsWith('TBD');
          if (homeReady && awayReady) {
            match.status = 'SCHEDULED';
          }
        }
      }
    }
  }

  bracket.updated_at = new Date().toISOString();
  await db.collection(COLLECTION_NAME).doc(bracketId).set(cleanUndefined(bracket), { merge: true });
  return bracket;
}

export async function deleteTournamentBracket(bracketId: string): Promise<boolean> {
  if (!bracketId) return false;
  try {
    const docRef = db.collection(COLLECTION_NAME).doc(bracketId);
    const doc = await docRef.get();
    if (doc.exists) {
      await docRef.delete();
      return true;
    }

    // Fallback: check if bracket_id field matches
    const snapshot = await db.collection(COLLECTION_NAME).where('bracket_id', '==', bracketId).get();
    if (!snapshot.empty) {
      const batch = db.batch();
      snapshot.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      return true;
    }

    return true; // Idempotent success
  } catch (error) {
    console.error('Error deleting tournament bracket:', error);
    throw error;
  }
}

