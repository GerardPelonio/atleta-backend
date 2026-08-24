import { Router } from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import {
  getPendingValidationsHandler,
  certifyValidationHandler,
} from '../controllers/validationController';

const router = Router();

// Pending Validations Queue (Named and Root Routes)
router.get('/pending', authenticate, getPendingValidationsHandler);
router.get('/list', authenticate, getPendingValidationsHandler);
router.get('/', authenticate, getPendingValidationsHandler);

// Certify Validation
router.post('/:validationId/certify', authenticate, certifyValidationHandler);
router.patch('/:validationId/certify', authenticate, certifyValidationHandler);

export default router;

