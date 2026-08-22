import { Router } from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import {
  submitInquiryHandler,
  getAthleteInquiriesHandler,
  respondToInquiryHandler,
} from '../controllers/coachInquiryController';

const router = Router();

router.post('/', authenticate, submitInquiryHandler);
router.get('/', authenticate, getAthleteInquiriesHandler);
router.patch('/:inquiryId/respond', authenticate, respondToInquiryHandler);

export default router;
