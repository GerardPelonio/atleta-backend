import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { validateInquirySubmission } from '../validators/inquiryValidator';
import { validateUpdateCoachSettings, validateChangeCoachPassword } from '../validators/coachValidator';
import {
  getPublicCoachProfile,
  submitRecruitmentInquiry,
  getAthleteInquiries,
  respondToRecruitmentInquiry,
  ServiceError,
} from '../services/coachInquiryService';
import {
  getCoachSettings,
  updateCoachSettings,
  updateCoachProfile,
  changeCoachPassword,
} from '../services/coachSettingsService';

export async function getCoachProfileHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const rawCoachParam = req.params.coachId;
    const coachId = (Array.isArray(rawCoachParam) ? rawCoachParam[0] : rawCoachParam) || req.user?.uid;

    if (!coachId) {
      res.status(400).json({ error: 'Coach ID is required.' });
      return;
    }

    const coach = await getPublicCoachProfile(coachId);
    if (!coach) {
      res.status(404).json({ error: `Coach with ID '${coachId}' was not found.` });
      return;
    }

    res.status(200).json(coach);
  } catch (error: any) {
    console.error('getCoachProfileHandler error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function submitInquiryHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const athleteId = req.user!.uid;

    const errors = validateInquirySubmission(req.body);
    if (errors.length > 0) {
      res.status(400).json({
        error: 'Bad Request. Validation failed.',
        details: errors,
      });
      return;
    }

    const { coach_id, message } = req.body;
    const inquiry = await submitRecruitmentInquiry(athleteId, coach_id, message);

    res.status(201).json({
      message: 'Recruitment inquiry submitted successfully.',
      inquiry,
    });
  } catch (error: any) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('submitInquiryHandler error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function getAthleteInquiriesHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const athleteId = req.user!.uid;
    const startTime = Date.now();

    const inquiries = await getAthleteInquiries(athleteId);
    const responseTimeMs = Date.now() - startTime;

    res.set('X-Response-Time-Ms', String(responseTimeMs));
    res.status(200).json({
      athlete_id: athleteId,
      total_inquiries: inquiries.length,
      inquiries,
    });
  } catch (error: any) {
    console.error('getAthleteInquiriesHandler error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function respondToInquiryHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const inquiryId = Array.isArray(req.params.inquiryId) ? req.params.inquiryId[0] : req.params.inquiryId;
    const userId = req.user!.uid;
    const { status, decline_reason } = req.body;

    if (!inquiryId) {
      res.status(400).json({ error: 'Inquiry ID is required.' });
      return;
    }

    if (status !== 'Accepted' && status !== 'Declined') {
      res.status(400).json({ error: 'Status must be either "Accepted" or "Declined".' });
      return;
    }

    const updated = await respondToRecruitmentInquiry(inquiryId, userId, status, decline_reason);
    res.status(200).json({
      message: `Inquiry successfully ${status.toLowerCase()}.`,
      inquiry: updated,
    });
  } catch (error: any) {
    if (error instanceof ServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('respondToInquiryHandler error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function getCoachSettingsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const coachId = `coach_${req.user!.uid}`;
    const settings = await getCoachSettings(coachId);
    res.status(200).json(settings);
  } catch (error: any) {
    console.error('getCoachSettingsHandler error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function updateCoachSettingsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const coachId = `coach_${req.user!.uid}`;
    const errors = validateUpdateCoachSettings(req.body);
    if (errors.length > 0) {
      res.status(400).json({ errors });
      return;
    }

    const settings = await updateCoachSettings(coachId, req.body);
    res.status(200).json({
      message: 'Coach settings updated successfully.',
      settings,
    });
  } catch (error: any) {
    console.error('updateCoachSettingsHandler error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function updateCoachProfileHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.uid;
    const coachId = `coach_${userId}`;
    const updatedProfile = await updateCoachProfile(coachId, userId, req.body);

    res.status(200).json({
      message: 'Coach profile updated successfully.',
      profile: updatedProfile,
    });
  } catch (error: any) {
    console.error('updateCoachProfileHandler error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}

export async function changeCoachPasswordHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user!.uid;
    const errors = validateChangeCoachPassword(req.body);
    if (errors.length > 0) {
      res.status(400).json({ errors });
      return;
    }

    const { current_password, new_password } = req.body;
    const result = await changeCoachPassword(userId, current_password, new_password);
    res.status(200).json(result);
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('changeCoachPasswordHandler error:', error);
    res.status(500).json({ error: 'Internal server error.', details: error?.message || String(error) });
  }
}
