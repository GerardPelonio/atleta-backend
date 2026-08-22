import { EventEmitter } from 'events';
import { NotificationType } from '../models/notificationModel';

export interface SystemEventPayload {
  recipient_user_id: string;
  type: NotificationType;
  message_body: string;
  metadata?: Record<string, unknown>;
}

export interface MatchCertifiedEventPayload {
  athlete_id: string;
  match_id: string;
}

class SystemEventBus extends EventEmitter {}

export const eventBus = new SystemEventBus();

// Event names constants
export const EVENTS = {
  PUSH_NOTIFICATION: 'system:push_notification',
  MATCH_CERTIFIED: 'system:match_certified',
  SRPE_LOGGED: 'system:srpe_logged',
};
