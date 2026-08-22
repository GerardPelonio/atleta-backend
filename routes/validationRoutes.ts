import { Router } from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import {
  getPendingValidationsHandler,
  certifyValidationHandler,
} from '../controllers/validationController';

const router = Router();

router.get('/pending', authenticate, getPendingValidationsHandler);
router.post('/:validationId/certify', authenticate, certifyValidationHandler);

export default router;
