import { Router } from 'express';
import userRoutes from './userRoutes';
import athleteRoutes from './athleteRoutes';
import notificationRoutes from './notificationRoutes';
import analyticsRoutes from './analyticsRoutes';
import teamRoutes from './teamRoutes';
import coachRoutes from './coachRoutes';
import inquiryRoutes from './inquiryRoutes';
import matchRoutes from './matchRoutes';
import scoutingRoutes from './scoutingRoutes';
import officialRoutes from './officialRoutes';
import validationRoutes from './validationRoutes';
import adminRoutes from './adminRoutes';
import sportRoutes from './sportRoutes';
import syncRoutes from './syncRoutes';

const router = Router();

router.use('/admin', adminRoutes);
router.use('/users', userRoutes);
router.use('/athletes', athleteRoutes);
router.use('/notifications', notificationRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/teams', teamRoutes);
router.use('/coaches', coachRoutes);
router.use('/officials', officialRoutes);
router.use('/inquiries', inquiryRoutes);
router.use('/matches', matchRoutes);
router.use('/scouting', scoutingRoutes);
router.use('/validations', validationRoutes);
router.use('/sports', sportRoutes);
router.use('/sync', syncRoutes);

export default router;
