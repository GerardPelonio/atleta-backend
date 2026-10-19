import { Router } from 'express';
import { authenticate, optionalAuth } from '../middlewares/authMiddleware';
import {
  getPendingValidationsHandler,
  certifyValidationHandler,
  createOfficialMatchHandler,
} from '../controllers/validationController';

const router = Router();

// Official Match Creation Aliases under /validations
router.post('/official', optionalAuth, createOfficialMatchHandler);
router.post('/create-official', optionalAuth, createOfficialMatchHandler);

// Pending Validations Queue (Named and Root Routes)
router.get('/pending', authenticate, getPendingValidationsHandler);
router.get('/list', authenticate, getPendingValidationsHandler);
router.get('/', authenticate, getPendingValidationsHandler);

// Certify / Approve / Fulfill Validation Request
router.post('/:validationId/certify', authenticate, certifyValidationHandler);
router.patch('/:validationId/certify', authenticate, certifyValidationHandler);
router.post('/:validationId/approve', authenticate, certifyValidationHandler);
router.patch('/:validationId/approve', authenticate, certifyValidationHandler);
router.post('/:validationId/fulfill', authenticate, certifyValidationHandler);
router.patch('/:validationId/fulfill', authenticate, certifyValidationHandler);

export default router;

