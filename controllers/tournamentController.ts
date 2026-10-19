import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import {
  getTournamentBrackets,
  getTournamentBracketById,
  saveTournamentBracket,
  advanceBracketMatch,
  createDefaultSingleEliminationBracket,
} from '../services/tournamentService';

export async function getBracketsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const sport = (req.query.sport as string) || undefined;
    const brackets = await getTournamentBrackets(sport);
    res.status(200).json({ brackets });
  } catch (error: any) {
    console.error('getBracketsHandler error:', error);
    res.status(500).json({ error: 'Failed to fetch tournament brackets.', details: error?.message });
  }
}

export async function getBracketByIdHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const rawId = req.params.bracketId;
    const bracketId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!bracketId) {
      res.status(400).json({ error: 'Bracket ID is required.' });
      return;
    }
    const bracket = await getTournamentBracketById(bracketId);
    if (!bracket) {
      res.status(404).json({ error: 'Bracket not found.' });
      return;
    }
    res.status(200).json({ bracket });
  } catch (error: any) {
    console.error('getBracketByIdHandler error:', error);
    res.status(500).json({ error: 'Failed to fetch bracket.', details: error?.message });
  }
}

export async function saveBracketHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const uid = req.user?.uid || 'official_admin';
    const saved = await saveTournamentBracket(uid, req.body);
    res.status(200).json({ message: 'Bracket saved successfully.', bracket: saved });
  } catch (error: any) {
    console.error('saveBracketHandler error:', error);
    res.status(500).json({ error: 'Failed to save bracket.', details: error?.message });
  }
}

export async function advanceBracketHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const rawId = req.params.bracketId;
    const bracketId = Array.isArray(rawId) ? rawId[0] : rawId;
    const { match_id, winner_team_name, home_score, away_score } = req.body;

    if (!bracketId || !match_id || !winner_team_name) {
      res.status(400).json({ error: 'bracketId, match_id, and winner_team_name are required.' });
      return;
    }

    const updated = await advanceBracketMatch(
      bracketId,
      match_id,
      winner_team_name,
      home_score !== undefined ? Number(home_score) : undefined,
      away_score !== undefined ? Number(away_score) : undefined
    );

    res.status(200).json({ message: 'Team advanced successfully.', bracket: updated });
  } catch (error: any) {
    console.error('advanceBracketHandler error:', error);
    res.status(500).json({ error: 'Failed to advance team in bracket.', details: error?.message });
  }
}

export async function createDefaultBracketHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { tournament_name, sport_type, teams } = req.body;
    const bracket = createDefaultSingleEliminationBracket(
      tournament_name || 'Tournament Championship',
      sport_type || 'Basketball',
      Array.isArray(teams) ? teams : []
    );
    const uid = req.user?.uid || 'official_admin';
    const saved = await saveTournamentBracket(uid, bracket);
    res.status(201).json({ message: 'Default bracket generated.', bracket: saved });
  } catch (error: any) {
    console.error('createDefaultBracketHandler error:', error);
    res.status(500).json({ error: 'Failed to generate bracket.', details: error?.message });
  }
}
