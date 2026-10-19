import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import {
  createScoresheetRequestService,
  getScoresheetRequestsService,
  fulfillScoresheetRequestService,
  rejectScoresheetRequestService,
} from '../services/scoresheetRequestService';

export async function createScoresheetRequestHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const coachId = req.user?.uid || req.body?.coachId || req.body?.coach_id || 'coach_default';
    const matchId = String(req.body?.matchId || req.body?.match_id || req.params?.matchId || '');

    if (!matchId) {
      res.status(400).json({ error: 'matchId is required.' });
      return;
    }

    const result = await createScoresheetRequestService({
      coachId,
      coachName: req.body?.coachName || req.body?.coach_name,
      teamId: req.body?.teamId || req.body?.team_id,
      matchId,
      matchName: req.body?.matchName || req.body?.match_name,
      sportType: req.body?.sportType || req.body?.sport_type,
    });

    res.status(201).json({
      message: 'Scoresheet request submitted successfully.',
      request: result,
    });
  } catch (error: any) {
    console.error('createScoresheetRequestHandler error:', error);
    res.status(500).json({ error: error?.message || 'Failed to create scoresheet request.' });
  }
}

export async function getScoresheetRequestsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const status = req.query?.status as string | undefined;
    const coachId = (req.query?.coachId || req.query?.coach_id) as string | undefined;
    const matchId = (req.query?.matchId || req.query?.match_id) as string | undefined;

    const list = await getScoresheetRequestsService({ status, coachId, matchId });
    res.status(200).json({
      requests: list,
      count: list.length,
    });
  } catch (error: any) {
    console.error('getScoresheetRequestsHandler error:', error);
    res.status(500).json({ error: error?.message || 'Failed to fetch scoresheet requests.' });
  }
}

export async function fulfillScoresheetRequestHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const requestId = String(req.params?.requestId || req.params?.matchId || req.body?.requestId || req.body?.matchId || '');
    if (!requestId) {
      res.status(400).json({ error: 'requestId or matchId is required.' });
      return;
    }

    const officialId = req.user?.uid || req.body?.officialId || 'off_default';
    const officialName = req.user
      ? `${(req.user as any).first_name || ''} ${(req.user as any).last_name || ''}`.trim() || req.user.email || 'Tournament Official'
      : (req.body?.officialName || 'Tournament Official');

    // Extract uploaded file
    const file = req.file || (Array.isArray(req.files) && req.files.length > 0 ? req.files[0] : undefined);
    const fallbackUrl = req.body?.scoresheetUrl || req.body?.scoresheet_url || req.body?.url;

    if (!file && !fallbackUrl) {
      res.status(400).json({ error: 'A scoresheet file or scoresheetUrl is required for fulfillment.' });
      return;
    }

    const result = await fulfillScoresheetRequestService(
      requestId,
      { officialId, officialName },
      file,
      fallbackUrl
    );

    res.status(200).json({
      message: 'Scoresheet request fulfilled and shared with coach successfully.',
      request: result,
      scoresheetUrl: result.scoresheetUrl,
    });
  } catch (error: any) {
    console.error('fulfillScoresheetRequestHandler error:', error);
    res.status(500).json({ error: error?.message || 'Failed to fulfill scoresheet request.' });
  }
}

export async function rejectScoresheetRequestHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const requestId = String(req.params?.requestId || req.params?.matchId || req.body?.requestId || req.body?.matchId || '');
    if (!requestId) {
      res.status(400).json({ error: 'requestId is required.' });
      return;
    }

    const officialId = req.user?.uid || req.body?.officialId || 'off_default';
    const officialName = req.user
      ? `${(req.user as any).first_name || ''} ${(req.user as any).last_name || ''}`.trim() || req.user.email || 'Tournament Official'
      : (req.body?.officialName || 'Tournament Official');
    const reason = req.body?.reason || req.body?.rejectionReason || 'Scoresheet request could not be fulfilled at this time.';

    const result = await rejectScoresheetRequestService(
      requestId,
      { officialId, officialName },
      reason
    );

    res.status(200).json({
      message: 'Scoresheet request declined successfully.',
      request: result,
    });
  } catch (error: any) {
    console.error('rejectScoresheetRequestHandler error:', error);
    res.status(500).json({ error: error?.message || 'Failed to decline scoresheet request.' });
  }
}
