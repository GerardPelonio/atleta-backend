import { Router } from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import {
  submitInquiryHandler,
  getAthleteInquiriesHandler,
  respondToInquiryHandler,
} from '../controllers/coachInquiryController';

const router = Router();

// Submit Recruitment Inquiry (Named and Root Routes)
router.post('/submit', authenticate, submitInquiryHandler);
router.post('/create', authenticate, submitInquiryHandler);
router.post('/send', authenticate, submitInquiryHandler);
router.post('/', authenticate, submitInquiryHandler);

// Retrieve Inquiries Inbox (Named and Root Routes)
router.get('/list', authenticate, getAthleteInquiriesHandler);
router.get('/all', authenticate, getAthleteInquiriesHandler);
router.get('/me', authenticate, getAthleteInquiriesHandler);
router.get('/my-inquiries', authenticate, getAthleteInquiriesHandler);
router.get('/', authenticate, getAthleteInquiriesHandler);

// Respond to Inquiry
router.patch('/:inquiryId/respond', authenticate, respondToInquiryHandler);
router.post('/:inquiryId/respond', authenticate, respondToInquiryHandler);

export default router;

