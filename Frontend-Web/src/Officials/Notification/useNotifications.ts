import { useState, useEffect, useCallback } from 'react';
import {
  getOfficialNotifications,
  markAllOfficialNotificationsAsRead,
  markOfficialNotificationAsRead,
  storeReadNotificationId,
  storeAllReadNotificationIds,
  getStoredReadNotificationIds,
  getCachedData,
} from '../../api/client';
import type { OfficialNotificationItem } from '../../api/types';

const DISMISSED_KEY = 'atleta_dismissed_notification_ids';
const CLEARED_KEY = 'atleta_cleared_notifications';

export const getStoredDismissedIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
};

export const storeDismissedId = (id: string): void => {
  if (!id) return;
  try {
    const set = getStoredDismissedIds();
    set.add(id);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(set)));
  } catch {}
};

export const storeAllDismissedIds = (ids: string[]): void => {
  if (!ids || ids.length === 0) return;
  try {
    const set = getStoredDismissedIds();
    ids.forEach((id) => id && set.add(id));
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(set)));
  } catch {}
};

// Shows Unread Notifications
export function useNotifications() {
  const filterActive = (list: OfficialNotificationItem[]): OfficialNotificationItem[] => {
    const isCleared = typeof localStorage !== 'undefined' && localStorage.getItem(CLEARED_KEY) === 'true';
    const clearedAt = typeof localStorage !== 'undefined' ? Number(localStorage.getItem('atleta_cleared_at') || 0) : 0;
    const dismissed = getStoredDismissedIds();
    const readSet = getStoredReadNotificationIds();

    return list
      .filter((n) => {
        if (dismissed.has(n.notification_id) || dismissed.has(String(n.reference_id || '')) || (n.request_id && dismissed.has(n.request_id))) {
          return false;
        }
        if (isCleared && clearedAt && n.created_at) {
          const t = new Date(n.created_at).getTime();
          if (!isNaN(t) && t <= clearedAt) return false;
        } else if (isCleared && !clearedAt) {
          return false;
        }
        return true;
      })
      .map((n) => ({
        ...n,
        is_read: Boolean(n.is_read) || readSet.has(n.notification_id),
      }));
  };

  const [notifications, setNotifications] = useState<OfficialNotificationItem[]>(() => {
    const cached = getCachedData<{ unread_count: number; notifications: OfficialNotificationItem[] }>('official_notifications');
    return filterActive(cached?.notifications || []);
  });

  const [unreadCount, setUnreadCount] = useState<number>(() => {
    return notifications.filter((n) => !n.is_read).length;
  });

  const [loading, setLoading] = useState<boolean>(() => !getCachedData('official_notifications'));
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = useCallback(async (forceRefresh = false) => {
    try {
      const cached = getCachedData('official_notifications');
      if (!cached) setLoading(true);
      setError(null);
      const res = await getOfficialNotifications(forceRefresh);
      const notifs = filterActive(res.notifications || []);
      const count = notifs.filter((n) => !n.is_read).length;
      setNotifications(notifs);
      setUnreadCount(count);
    } catch (err: any) {
      setError(err?.message || 'Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAllRead = async () => {
    setUnreadCount(0);
    setNotifications((prev) => {
      storeAllReadNotificationIds(prev.map((n) => n.notification_id));
      return prev.map((n) => ({ ...n, is_read: true }));
    });
    await markAllOfficialNotificationsAsRead();
  };

  const markSingleRead = async (id: string) => {
    storeReadNotificationId(id);
    setNotifications((prev) =>
      prev.map((n) => (n.notification_id === id ? { ...n, is_read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    await markOfficialNotificationAsRead(id);
  };

  const dismissNotification = (id: string) => {
    storeDismissedId(id);
    storeReadNotificationId(id);
    setNotifications((prev) => prev.filter((n) => n.notification_id !== id && n.reference_id !== id && n.request_id !== id));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    markOfficialNotificationAsRead(id).catch(() => {});
  };

  const clearHistory = () => {
    const allIds = notifications.map((n) => n.notification_id);
    storeAllReadNotificationIds(allIds);
    storeAllDismissedIds(allIds);
    setNotifications([]);
    setUnreadCount(0);
    try {
      localStorage.setItem(CLEARED_KEY, 'true');
      localStorage.setItem('atleta_cleared_at', String(Date.now()));
    } catch {}
  };

  return {
    notifications,
    unreadCount,
    loading,
    error,
    refresh: () => fetchNotifications(true),
    markAllRead,
    markSingleRead,
    dismissNotification,
    clearHistory,
  };
}
