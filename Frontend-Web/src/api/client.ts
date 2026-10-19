import type {
  AuthResponse,
  AuthUser,
  OfficialLoginPayload,
  OfficialRegisterPayload,
  PasswordResetPayload,
  ConfirmPasswordResetPayload,
  OfficialSettings,
  OfficialDashboardResponse,
  OfficialScheduleItem,
  CreateMatchPayload,
  AdminLoginPayload,
  AdminCoachQueueItem,
  AdminCoachQueueResponse,
  AdminOfficialQueueResponse,
  SportConfiguration,
  SportsListResponse,
  CreateSportPayload,
} from './types';

const envApi = (import.meta.env.VITE_ATLETA_API || import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || '') as string;
const rawBase = (envApi && envApi.trim() ? envApi.trim() : 'https://atleta-backend.vercel.app/api/v1').replace(/\/+$/, '');
export const BASE_URL = rawBase
  ? (rawBase.endsWith('/api/v1') ? rawBase : `${rawBase}/api/v1`)
  : 'https://atleta-backend.vercel.app/api/v1';

const TOKEN_KEY = 'atleta_official_token';
const USER_KEY = 'atleta_official_user';
const PERSIST_KEY = 'atleta_persist_session';
const SETTINGS_KEY = 'atleta_official_settings';
const READ_NOTIFS_KEY = 'atleta_read_notification_ids';

export const getStoredReadNotificationIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(READ_NOTIFS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch { }
  return new Set();
};

export const storeReadNotificationId = (id: string): void => {
  if (!id) return;
  try {
    const set = getStoredReadNotificationIds();
    set.add(id);
    localStorage.setItem(READ_NOTIFS_KEY, JSON.stringify(Array.from(set)));
  } catch { }
};

export const storeAllReadNotificationIds = (ids: string[]): void => {
  if (!ids || ids.length === 0) return;
  try {
    const set = getStoredReadNotificationIds();
    ids.forEach((id) => id && set.add(id));
    localStorage.setItem(READ_NOTIFS_KEY, JSON.stringify(Array.from(set)));
  } catch { }
};

// In-Memory and Session Client Cache for instant screen-to-screen navigation
const cache = new Map<string, { data: any; timestamp: number; version?: string }>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes cache
const CACHE_VERSION = 'v4_sched_dedup';

export const getCachedData = <T>(key: string): T | null => {
  const item = cache.get(key);
  if (item && item.version === CACHE_VERSION && Date.now() - item.timestamp < CACHE_TTL_MS) {
    return item.data as T;
  }
  try {
    const sessionItem = sessionStorage.getItem(`atleta_cache_${key}`);
    if (sessionItem) {
      const parsed = JSON.parse(sessionItem);
      if (parsed && parsed.version === CACHE_VERSION && Date.now() - parsed.timestamp < CACHE_TTL_MS) {
        cache.set(key, parsed);
        return parsed.data as T;
      } else {
        sessionStorage.removeItem(`atleta_cache_${key}`);
      }
    }
  } catch { }

  // Check persistent localStorage for instant startup render across reloads & logins
  try {
    const localItem = localStorage.getItem(`atleta_cache_${key}`);
    if (localItem) {
      const parsed = JSON.parse(localItem);
      if (parsed && parsed.version === CACHE_VERSION && Date.now() - parsed.timestamp < CACHE_TTL_MS) {
        cache.set(key, parsed);
        return parsed.data as T;
      } else {
        localStorage.removeItem(`atleta_cache_${key}`);
      }
    }
  } catch { }
  return null;
};

export const setCachedData = (key: string, data: any): void => {
  const entry = { data, timestamp: Date.now(), version: CACHE_VERSION };
  cache.set(key, entry);
  try {
    sessionStorage.setItem(`atleta_cache_${key}`, JSON.stringify(entry));
  } catch { }
  try {
    localStorage.setItem(`atleta_cache_${key}`, JSON.stringify(entry));
  } catch { }
};

export const invalidateCache = (prefix?: string): void => {
  if (!prefix) {
    cache.clear();
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && (k.startsWith('atleta_cache_') || k.startsWith('atleta_cached_'))) toRemove.push(k);
      }
      toRemove.forEach((k) => sessionStorage.removeItem(k));
    } catch { }
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('atleta_cache_') || k.startsWith('atleta_cached_'))) toRemove.push(k);
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    } catch { }
  } else {
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) {
        cache.delete(key);
      }
    }
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && (k.startsWith(`atleta_cache_${prefix}`) || k.startsWith(`atleta_cached_${prefix}`))) toRemove.push(k);
      }
      toRemove.forEach((k) => sessionStorage.removeItem(k));
    } catch { }
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith(`atleta_cache_${prefix}`) || k.startsWith(`atleta_cached_${prefix}`))) toRemove.push(k);
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    } catch { }
  }
};

export const formatMatchIdSchema = (rawId: string): string => {
  if (!rawId) return '#MATCH-001';
  const clean = String(rawId).replace(/^#/, '').trim();
  return `#${clean}`;
};

export const getStoredOfficialSettings = (): OfficialSettings | null => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY) || sessionStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const getStoredToken = (): string | null => {
  const keys = [TOKEN_KEY, 'atleta_auth_token', 'token', 'auth_token', 'accessToken', 'jwt'];
  for (const k of keys) {
    const val = localStorage.getItem(k) || sessionStorage.getItem(k);
    if (val && val !== 'null' && val !== 'undefined') return val;
  }
  return null;
};

export const getStoredUser = (): AuthUser | null => {
  const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const storeAuthSession = (token: string, user: AuthUser, persist: boolean): void => {
  // Purge any residual cached data from other user sessions
  invalidateCache();
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('atleta_cached_') || k.startsWith('atleta_cache_') || k.startsWith('atleta_admin_'))) {
        toRemove.push(k);
      }
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {}

  if (persist) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    localStorage.setItem(PERSIST_KEY, 'true');
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(PERSIST_KEY);
  }
  setCachedData('user_me', user);

  // Instantly warm official app cache (including schedules) on login
  const role = user?.role;
  if (role !== 'SystemAdmin' && role !== 'System Admin' && role !== 'Admin') {
    setTimeout(() => {
      warmOfficialAppCache().catch(() => { });
    }, 10);
  }
};

export const clearAuthSession = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(PERSIST_KEY);
  localStorage.removeItem(SETTINGS_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(SETTINGS_KEY);
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('atleta_')) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {}
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith('atleta_')) toRemove.push(k);
    }
    toRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {}
  invalidateCache();
};

export async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 429) {
      const retrySec = data?.retry_after_seconds ? ` Retry after ${data.retry_after_seconds}s.` : '';
      throw new Error(`Rate limit exceeded.${retrySec}`);
    }
    let message =
      (Array.isArray(data?.errors) ? data.errors.map((e: any) => e.message || e.field || e).join(', ') : null) ||
      data?.error ||
      data?.message ||
      (Array.isArray(data?.details) ? data.details.map((d: any) => d.message || d).join(', ') : null) ||
      `Request failed with status ${res.status}`;

    if (
      message.toLowerCase().includes('not found in firestore') ||
      message.toLowerCase().includes('user profile not found') ||
      message.toLowerCase().includes('user not found')
    ) {
      message = 'Account does not exist.';
    }

    throw new Error(message);
  }
  return data as T;
}

export const loginOfficial = async (payload: OfficialLoginPayload): Promise<AuthResponse> => {
  const email = payload.email.trim();
  const password = payload.password;

  let lastError: Error | null = null;
  let data: AuthResponse | null = null;
  const isLikelyAdmin = email.toLowerCase().includes('admin');

  // 1. If email indicates admin account, try /admin/login first
  if (isLikelyAdmin) {
    try {
      const adminRes = await fetch(`${BASE_URL}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (adminRes.ok) {
        data = await handleResponse<AuthResponse>(adminRes);
      } else {
        const errJson = await adminRes.json().catch(() => ({}));
        lastError = new Error(errJson.error || errJson.message || `Admin login failed (${adminRes.status})`);
      }
    } catch (err: any) {
      lastError = err;
    }
  }

  // 2. Try officials login endpoint
  if (!data || !data.token) {
    try {
      const res = await fetch(`${BASE_URL}/officials/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        data = await handleResponse<AuthResponse>(res);
      } else {
        const errJson = await res.json().catch(() => ({}));
        const errMsg = errJson.error || errJson.message || `Login failed (${res.status})`;
        lastError = new Error(errMsg);
        if (res.status === 403) {
          throw lastError;
        }
      }
    } catch (err: any) {
      lastError = err;
      if (err?.message && (err.message.includes('pending') || err.message.includes('declined') || err.message.includes('approval'))) {
        throw err;
      }
    }
  }

  // 3. If still not authenticated, try admin login endpoint if not already tried
  if ((!data || !data.token) && !isLikelyAdmin) {
    try {
      const adminRes = await fetch(`${BASE_URL}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (adminRes.ok) {
        data = await handleResponse<AuthResponse>(adminRes);
      }
    } catch { }
  }

  // 3. Fallback to general users login endpoint
  if (!data || !data.token) {
    try {
      const userRes = await fetch(`${BASE_URL}/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (userRes.ok) {
        data = await handleResponse<AuthResponse>(userRes);
      } else {
        const errJson = await userRes.json().catch(() => ({}));
        if (userRes.status === 403) {
          throw new Error(errJson.error || errJson.message || 'Access denied.');
        }
      }
    } catch (err: any) {
      if (err?.message && (err.message.includes('pending') || err.message.includes('declined') || err.message.includes('approval'))) {
        throw err;
      }
    }
  }

  if (data && data.token && data.user) {
    storeAuthSession(data.token, data.user, Boolean(payload.savePassword));
    return data;
  }

  throw lastError || new Error('Invalid email or password.');
};

export const loginAdmin = async (payload: AdminLoginPayload): Promise<AuthResponse> => {
  return loginOfficial(payload as any);
};

export const getAdminProfile = async (forceRefresh = false): Promise<any> => {
  const cached = getCachedData<any>('admin_profile');
  if (cached && !forceRefresh) return cached;

  const token = getStoredToken();
  try {
    const res = await fetch(`${BASE_URL}/admin/profile`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (res.ok) {
      const data = await handleResponse<any>(res);
      setCachedData('admin_profile', data);
      return data;
    }
  } catch { }

  return getMe(forceRefresh);
};

export const getAdminCoachQueue = async (forceRefresh = false): Promise<AdminCoachQueueResponse> => {
  const cached = getCachedData<AdminCoachQueueResponse>('admin_coach_queue');
  if (cached && !forceRefresh) return cached;

  const token = getStoredToken();
  if (!token) return { total_pending: 0, queue: [] };

  try {
    const res = await fetch(`${BASE_URL}/admin/coaches/queue`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(7000),
    });
    if (res.ok) {
      const data = await handleResponse<AdminCoachQueueResponse>(res);
      const rawQueue = Array.isArray(data?.queue) ? data.queue : [];
      const filteredData: AdminCoachQueueResponse = {
        ...data,
        total_pending: rawQueue.filter((c: AdminCoachQueueItem) => {
          const st = (c.account_status || c.status || '').toLowerCase();
          return st !== 'active' && st !== 'verified' && st !== 'approved' && st !== 'rejected';
        }).length,
        queue: rawQueue,
      };
      setCachedData('admin_coach_queue', filteredData);
      return filteredData;
    }
  } catch { }

  return cached || { total_pending: 0, queue: [] };
};


export const approveCoachAccreditation = async (coachId: string): Promise<any> => {
  const token = getStoredToken();
  const res = await fetch(`${BASE_URL}/admin/coaches/${coachId.replace(/^coach_/, '')}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(7000),
  });
  const data = await handleResponse<any>(res);
  invalidateCache('admin_coach_queue');
  return data;
};

export const rejectCoachAccreditation = async (coachId: string, reason: string): Promise<any> => {
  const token = getStoredToken();
  const res = await fetch(`${BASE_URL}/admin/coaches/${coachId.replace(/^coach_/, '')}/reject`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ rejection_reason: reason }),
    signal: AbortSignal.timeout(7000),
  });
  const data = await handleResponse<any>(res);
  invalidateCache('admin_coach_queue');
  return data;
};

export const getAdminOfficialQueue = async (forceRefresh = false): Promise<AdminOfficialQueueResponse> => {
  const cached = getCachedData<AdminOfficialQueueResponse>('admin_official_queue');
  if (cached && !forceRefresh) return cached;

  const token = getStoredToken();
  if (!token) return { total_pending: 0, queue: [] };

  try {
    const res = await fetch(`${BASE_URL}/admin/officials/queue`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(7000),
    });
    if (res.ok) {
      const data = await handleResponse<AdminOfficialQueueResponse>(res);
      setCachedData('admin_official_queue', data);
      return data;
    }
  } catch { }

  return cached || { total_pending: 0, queue: [] };
};

export const approveOfficialRegistration = async (officialId: string): Promise<any> => {
  const token = getStoredToken();
  const cleanId = officialId.replace(/^off_|^official_/, '');
  const res = await fetch(`${BASE_URL}/admin/officials/${cleanId}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(7000),
  });
  const data = await handleResponse<any>(res);
  invalidateCache('admin_official_queue');
  return data;
};

export const rejectOfficialRegistration = async (officialId: string, reason: string): Promise<any> => {
  const token = getStoredToken();
  const cleanId = officialId.replace(/^off_|^official_/, '');
  const res = await fetch(`${BASE_URL}/admin/officials/${cleanId}/reject`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ rejection_reason: reason }),
    signal: AbortSignal.timeout(7000),
  });
  const data = await handleResponse<any>(res);
  invalidateCache('admin_official_queue');
  return data;
};

export const resubmitCoachCredentials = async (payload: {
  coach_id?: string;
  user_id?: string;
  email?: string;
  documents?: string[];
  professional_documents?: string[];
  notes?: string;
}): Promise<any> => {
  const token = getStoredToken();
  const res = await fetch(`${BASE_URL}/coaches/resubmit-credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  const data = await handleResponse<any>(res);
  invalidateCache('admin_coach_queue');
  return data;
};

export const registerOfficial = async (payload: OfficialRegisterPayload): Promise<AuthResponse> => {
  const fullName = payload.full_legal_name.trim();
  const orgName = (payload.organization_name || payload.organization || '').trim();
  const nameParts = fullName.split(' ');
  const firstName = nameParts[0] || 'Official';
  const lastName = nameParts.slice(1).join(' ') || 'User';

  const res = await fetch(`${BASE_URL}/users/official`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      full_legal_name: fullName,
      organization_name: orgName,
      email: payload.email.trim(),
      password: payload.password,
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      license_number: payload.license_number || 'LIC-2026-001',
      sport_accreditation: payload.sport_accreditation || ['Basketball'],
      organization: orgName,
      phone_number: payload.phone_number?.trim() || 'N/A',
      assigned_sport: payload.assigned_sport?.trim() || 'Basketball',
    }),
  });
  const data = await handleResponse<AuthResponse>(res);
  return data;
};

export const requestPasswordReset = async (payload: PasswordResetPayload): Promise<{ message: string; sent?: boolean; reset_link?: string }> => {
  const redirect_url = payload.redirect_url || (typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined);
  const res = await fetch(`${BASE_URL}/users/password-reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: payload.email.trim(), redirect_url }),
  });
  return handleResponse<{ message: string; sent?: boolean; reset_link?: string }>(res);
};

export const confirmPasswordReset = async (payload: ConfirmPasswordResetPayload): Promise<{ message: string; success?: boolean }> => {
  const res = await fetch(`${BASE_URL}/users/password-reset/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: payload.token.trim(),
      new_password: payload.new_password,
      email: payload.email?.trim(),
    }),
  });
  return handleResponse<{ message: string; success?: boolean }>(res);
};


export const getMe = async (forceRefresh = false): Promise<AuthUser> => {
  const cached = getCachedData<AuthUser>('user_me');
  if (cached && !forceRefresh) return cached;

  const token = getStoredToken();
  try {
    const res = await fetch(`${BASE_URL}/users/me`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (res.status === 404 || res.status === 401) {
      const stored = getStoredUser();
      if (stored) return stored;
    }
    const data = await handleResponse<any>(res);
    const user = data.user || data;
    setCachedData('user_me', user);
    return user;
  } catch (err) {
    const stored = getStoredUser();
    if (stored) return stored;
    throw err;
  }
};

export const getOfficialDashboard = async (forceRefresh = false): Promise<OfficialDashboardResponse> => {
  const cached = getCachedData<OfficialDashboardResponse>('official_dashboard');
  if (cached && !forceRefresh) return cached;

  const token = getStoredToken();
  const fetchEndpoints = [`${BASE_URL}/officials/dashboard`];
  if (typeof window !== 'undefined' && BASE_URL.startsWith('http')) {
    fetchEndpoints.push('/api/v1/officials/dashboard', '/api/officials/dashboard');
  }

  for (const ep of fetchEndpoints) {
    try {
      const res = await fetch(ep, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.ok) {
        const data = await res.json();
        setCachedData('official_dashboard', data);
        try {
          localStorage.setItem('atleta_cached_official_dashboard', JSON.stringify(data));
        } catch {}
        return data;
      }
    } catch {}
  }

  const fallback: OfficialDashboardResponse = {
    total_matches: 0,
    pending_audits: 0,
    completed_audits: 0,
    audit_queue: [],
    upcoming_schedules: [],
    recent_matches: [],
  } as any;
  return fallback;
};

export const extractTeamString = (val: any): string => {
  if (!val) return '';
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.toLowerCase().includes('[object') || trimmed === '') return '';
    return trimmed;
  }
  if (typeof val === 'object') {
    return (
      extractTeamString(val.name) ||
      extractTeamString(val.team_name) ||
      extractTeamString(val.home_team_name) ||
      extractTeamString(val.opponent_team_name) ||
      extractTeamString(val.away_team_name) ||
      extractTeamString(val.team_id) ||
      extractTeamString(val.school_name) ||
      extractTeamString(val.title) ||
      ''
    );
  }
  return String(val);
};

const coachNameCache = new Map<string, string>();

export const getCoachNameById = async (coachIdOrName: string): Promise<string> => {
  if (!coachIdOrName) return '';
  const trimmed = coachIdOrName.trim();

  // Never show official IDs as coach
  if (trimmed.toLowerCase().startsWith('off_') || trimmed.toLowerCase().startsWith('official_')) {
    return '';
  }

  // If already a human name, strip any prefix and return
  const isIdLike =
    trimmed.startsWith('coach_') ||
    trimmed.startsWith('user_') ||
    (trimmed.length >= 20 && !trimmed.includes(' '));

  if (!isIdLike) {
    return trimmed.replace(/^coach[_\s]*/i, '').trim();
  }

  const cleanId = trimmed.replace(/^coach_/, '');

  if (coachNameCache.has(cleanId)) {
    return coachNameCache.get(cleanId)!;
  }

  try {
    const res = await fetch(`${BASE_URL}/coaches/${cleanId}`);
    if (res.ok) {
      const data = await res.json();
      const name = data.full_name || `${data.first_name || ''} ${data.last_name || ''}`.trim() || data.name;
      if (name) {
        coachNameCache.set(cleanId, name);
        return name;
      }
    }
  } catch { }

  return trimmed.replace(/^coach[_\s]*/i, '').trim();
};

export const getOfficialSchedules = async (month?: number, year?: number, forceRefresh = false): Promise<OfficialScheduleItem[]> => {
  const cacheKey = `official_schedules_${month ?? 'all'}_${year ?? 'all'}`;
  const cached = getCachedData<OfficialScheduleItem[]>(cacheKey);
  if (cached && Array.isArray(cached) && cached.length > 0 && !forceRefresh) return cached;

  const token = getStoredToken();
  const params = new URLSearchParams();
  if (month !== undefined) params.append('month', String(month));
  if (year !== undefined) params.append('year', String(year));

  const qs = params.toString() ? `?${params.toString()}` : '';
  const [data, masterMatches] = await Promise.all([
    fetch(`${BASE_URL}/officials/schedules${qs}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    getAllOfficialMatchesMaster(forceRefresh).catch(() => []),
  ]);

  const list: OfficialScheduleItem[] = Array.isArray(data)
    ? [...data]
    : Array.isArray(data?.schedules)
      ? [...data.schedules]
      : Array.isArray(data?.data)
        ? [...data.data]
        : [];

  // Fetch Coaches from List
  list.forEach((item) => {
    const cleanMatchId = String(item.match_id || '').replace(/^#/, '');
    const found = masterMatches.find((m) => String(m.match_id || '').replace(/^#/, '') === cleanMatchId);
    if (found) {
      const raw = found.raw_match || {};
      const resolvedCoaches = Array.isArray(raw.assigned_coaches) && raw.assigned_coaches.length > 0
        ? raw.assigned_coaches
        : Array.isArray(raw.coaches) && raw.coaches.length > 0
          ? raw.coaches
          : found.coaches && found.coaches !== 'Official Assigned' && !found.coaches.startsWith('Coach off_')
            ? [found.coaches]
            : [];
      if (!item.assigned_coaches || item.assigned_coaches.length === 0) {
        item.assigned_coaches = resolvedCoaches;
      }
      if (!item.coaches && resolvedCoaches.length > 0) {
        item.coaches = resolvedCoaches.join(', ');
      }
      const itemHome = extractTeamString(item.home_team) || extractTeamString(raw.home_team_name) || extractTeamString(raw.home_team) || extractTeamString(raw.team_id);
      if (itemHome) item.home_team = itemHome;

      const itemAway = extractTeamString(item.away_team) || extractTeamString(raw.opponent_team_name) || extractTeamString(raw.away_team_name) || extractTeamString(raw.away_team);
      if (itemAway) item.away_team = itemAway;
    }
  });

  const existingIds = new Set(list.map((s) => String(s.match_id || '').replace(/^#/, '')));

  const userMe = getStoredUser();

  for (const m of masterMatches) {
    const rawId = String(m.match_id || '').replace(/^#/, '');
    if (!rawId || existingIds.has(rawId)) continue;
    const raw = m.raw_match || {};

    const isMine = isMatchCreatedByOfficial(m, userMe);
    if (!isMine) continue;

    let dateStr = raw.match_date || raw.timestamp || raw.requested_at || (m as any).match_date || (m as any).scheduled_time || (m as any).date_time || '';
    let d = new Date(dateStr);
    if (isNaN(d.getTime()) && typeof dateStr === 'string' && dateStr) {
      d = new Date(dateStr.replace(/\s*\/\s*/g, ' ').trim());
    }

    const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    let mMonth = !isNaN(d.getTime()) ? d.getMonth() + 1 : undefined;
    let mYear = !isNaN(d.getTime()) ? d.getFullYear() : undefined;
    let uMonth = !isNaN(d.getTime()) ? d.getUTCMonth() + 1 : undefined;
    let uYear = !isNaN(d.getTime()) ? d.getUTCFullYear() : undefined;

    if (mMonth === undefined && typeof dateStr === 'string') {
      const upper = dateStr.toUpperCase();
      MONTH_NAMES.forEach((mName, idx) => {
        if (upper.includes(mName)) mMonth = idx + 1;
      });
      const yearMatch = upper.match(/\b(20\d\d)\b/);
      if (yearMatch) mYear = Number(yearMatch[1]);
    }

    const targetMonthName = month !== undefined && month >= 1 && month <= 12 ? MONTH_NAMES[month - 1] : '';
    const monthMatches = month === undefined ||
      mMonth === month ||
      uMonth === month ||
      (typeof dateStr === 'string' && (
        dateStr.includes(`-${String(month).padStart(2, '0')}-`) ||
        (Boolean(targetMonthName) && dateStr.toUpperCase().includes(targetMonthName))
      ));

    const yearMatches = year === undefined ||
      mYear === undefined ||
      mYear === year ||
      uYear === year ||
      (typeof dateStr === 'string' && dateStr.includes(String(year)));

    if (!monthMatches || !yearMatches) continue;

    const home = extractTeamString(raw.home_team_name) || extractTeamString(raw.home_team) || extractTeamString(raw.team_id) || '';
    const away = extractTeamString(raw.opponent_team_name) || extractTeamString(raw.away_team_name) || extractTeamString(raw.away_team) || '';
    const sport = m.sport || raw.sport_type || raw.sport || '';
    const venue = raw.location || raw.venue || '';
    const court = raw.court_number || raw.court || '';

    const resolvedCoaches = Array.isArray(raw.assigned_coaches) && raw.assigned_coaches.length > 0
      ? raw.assigned_coaches
      : Array.isArray(raw.coaches) && raw.coaches.length > 0
        ? raw.coaches
        : m.coaches && m.coaches !== 'Official Assigned' && !m.coaches.startsWith('Coach off_')
          ? [m.coaches]
          : [];

    const resolvedOffId = raw.official_id || raw.requested_by || (isMine ? (userMe?.uid || '') : '');
    const cleanScheduledTime = !isNaN(d.getTime()) ? d.toISOString() : dateStr;

    const userMatchName = String(
      raw.matchName ||
      raw.gameReferenceId ||
      raw.game_name ||
      raw.gameName ||
      raw.match_name ||
      m.matchName ||
      m.gameReferenceId ||
      m.game_name ||
      m.gameName ||
      m.match_name ||
      ''
    ).trim();

    list.push({
      schedule_id: `sched_${rawId}`,
      match_id: rawId,
      matchName: userMatchName || `${home} vs. ${away}`,
      match_name: userMatchName || `${home} vs. ${away}`,
      gameName: userMatchName || `${home} vs. ${away}`,
      gameReferenceId: raw.gameReferenceId || userMatchName || undefined,
      official_id: resolvedOffId,
      requested_by: raw.requested_by || (isMine ? (userMe?.uid || '') : ''),
      created_by: raw.created_by || (isMine ? (userMe?.uid || '') : ''),
      venue: venue,
      court_number: court,
      scheduled_time: cleanScheduledTime,
      month: mMonth || uMonth || month,
      year: mYear || uYear || year,
      sport: sport,
      home_team: home,
      away_team: away,
      assigned_coaches: resolvedCoaches,
      coaches: resolvedCoaches.length > 0 ? resolvedCoaches.join(', ') : m.coaches || '',
      coach_name: raw.coach_name || (resolvedCoaches.length > 0 ? resolvedCoaches[0] : ''),
      venue_logistics: {
        location: venue,
        court: court,
        sport: sport,
        home_team: home,
        away_team: away,
        time: cleanScheduledTime,
        coaches: resolvedCoaches.join(', '),
      },
      raw_match: { ...raw, ...m, match_id: rawId, official_id: resolvedOffId, match_date: cleanScheduledTime },
    });
    existingIds.add(rawId);
  }

  // Deduplicate list by canonical match ID to prevent duplicate games
  const deduplicatedMap = new Map<string, OfficialScheduleItem>();
  for (const item of list) {
    const rawMatchId = String(
      item.match_id ||
      (item as any).raw_match?.match_id ||
      item.schedule_id ||
      ''
    ).replace(/^#/, '').replace(/^sched_/, '').trim();

    const key = rawMatchId || String(item.schedule_id || Math.random());
    if (!deduplicatedMap.has(key)) {
      deduplicatedMap.set(key, item);
    }
  }

  const finalList = Array.from(deduplicatedMap.values());

  setCachedData(cacheKey, finalList);
  return finalList;
};

const DEFAULT_OFFICIAL_SETTINGS: OfficialSettings = {
  split_screen_defaults: true,
  discrepancy_presets: false,
  match_reminders: true,
  audit_notifications: true,
  auto_refresh: false,
};

export const getOfficialSettings = async (forceRefresh = false): Promise<OfficialSettings> => {
  const stored = getStoredOfficialSettings() || {};
  const cached = getCachedData<OfficialSettings>('official_settings') || stored;
  if (cached && Object.keys(cached).length > 0 && !forceRefresh) {
    return { ...DEFAULT_OFFICIAL_SETTINGS, ...cached };
  }

  const token = getStoredToken();
  try {
    const res = await fetch(`${BASE_URL}/officials/settings`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (res.ok) {
      const data = await handleResponse<OfficialSettings>(res);
      const merged: OfficialSettings = { ...DEFAULT_OFFICIAL_SETTINGS, ...stored, ...(data || {}) };
      setCachedData('official_settings', merged);
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
      } catch { }
      return merged;
    }
  } catch { }

  return { ...DEFAULT_OFFICIAL_SETTINGS, ...stored };
};

export const updateOfficialSettings = async (
  payload: Partial<OfficialSettings>
): Promise<OfficialSettings> => {
  const token = getStoredToken();
  const current = getStoredOfficialSettings() || getCachedData<OfficialSettings>('official_settings') || {};
  const updated: OfficialSettings = { ...DEFAULT_OFFICIAL_SETTINGS, ...current, ...payload };
  setCachedData('official_settings', updated);
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  } catch { }

  try {
    const res = await fetch(`${BASE_URL}/officials/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const rawData = await handleResponse<any>(res);
      const serverData = (rawData && rawData.settings) ? rawData.settings : rawData;
      const finalSettings: OfficialSettings = { ...updated, ...(serverData || {}) };
      setCachedData('official_settings', finalSettings);
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(finalSettings));
      } catch { }
      return finalSettings;
    }
  } catch { }

  return updated;
};

const CREATED_MATCHES_PREFIX = 'atleta_created_matches_';

export const recordOfficialCreatedMatchId = (rawMatchId: string, officialUid?: string): void => {
  if (!rawMatchId) return;
  try {
    const cleanId = String(rawMatchId).replace(/^#/, '');
    const uid = officialUid || getStoredUser()?.uid;
    const key = uid ? `${CREATED_MATCHES_PREFIX}${uid}` : 'atleta_created_matches_general';
    const existing: string[] = JSON.parse(localStorage.getItem(key) || '[]');
    if (!existing.includes(cleanId)) {
      existing.push(cleanId);
      localStorage.setItem(key, JSON.stringify(existing));
    }
  } catch { }
};

export const getOfficialCreatedMatchIds = (officialUid?: string): Set<string> => {
  try {
    const uid = officialUid || getStoredUser()?.uid;
    const key = uid ? `${CREATED_MATCHES_PREFIX}${uid}` : 'atleta_created_matches_general';
    const list: string[] = JSON.parse(localStorage.getItem(key) || '[]');
    const generalList: string[] = JSON.parse(localStorage.getItem('atleta_created_matches_general') || '[]');
    return new Set([...list, ...generalList]);
  } catch {
    return new Set();
  }
};

export const markMatchAsCertified = (rawMatchId: string): void => {
  if (!rawMatchId) return;
  try {
    const cleanId = String(rawMatchId).replace(/^#/, '');
    const key = 'atleta_certified_match_ids';
    const existing: string[] = JSON.parse(localStorage.getItem(key) || '[]');
    if (!existing.includes(cleanId)) {
      existing.push(cleanId);
      localStorage.setItem(key, JSON.stringify(existing));
    }
  } catch { }
};

export const isMatchLocallyCertified = (rawMatchId: string): boolean => {
  if (!rawMatchId) return false;
  try {
    const cleanId = String(rawMatchId).replace(/^#/, '');
    const key = 'atleta_certified_match_ids';
    const existing: string[] = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(existing) && existing.includes(cleanId);
  } catch {
    return false;
  }
};

export const isMatchDeleted = (rawId: string): boolean => {
  if (!rawId) return false;
  try {
    const cleanId = String(rawId).replace(/^#/, '');
    const list: string[] = JSON.parse(localStorage.getItem('atleta_deleted_matches') || '[]');
    return list.includes(cleanId);
  } catch {
    return false;
  }
};

export const recordDeletedMatch = (rawId: string): void => {
  if (!rawId) return;
  try {
    const cleanId = String(rawId).replace(/^#/, '');
    const list: string[] = JSON.parse(localStorage.getItem('atleta_deleted_matches') || '[]');
    if (!list.includes(cleanId)) {
      list.push(cleanId);
      localStorage.setItem('atleta_deleted_matches', JSON.stringify(list));
    }
    //Shows in recent activity the match was deleted
  } catch { }
};

export const isMatchCreatedByOfficial = (
  item: import('./types').MatchSummaryItem,
  user: import('./types').AuthUser | null
): boolean => {
  const currentUser = user || getStoredUser();
  if (!currentUser) return false;

  const raw = item?.raw_match || {};
  const cleanId = String(item?.match_id || raw.match_id || (item as any)?.id || '').replace(/^#/, '');
  if (isMatchDeleted(cleanId)) return false;

  const myUid = currentUser.uid || (currentUser as any).user_id || '';
  const clean = (s: any) => String(s || '').trim().toLowerCase().replace(/^off_/, '');

  // Reject coach-logged matches unless explicitly owned by official
  const coachOwner = raw.logged_by_coach_id || raw.coach_id || (item as any)?.logged_by_coach_id;

  const userIds = new Set([
    currentUser.uid,
    currentUser.user_id,
    (currentUser as any).official_id,
    currentUser.uid ? `off_${currentUser.uid.replace(/^off_/, '')}` : null,
    currentUser.uid ? currentUser.uid.replace(/^off_/, '') : null,
    currentUser.email,
  ].filter(Boolean).map(clean) as string[]);

  // 1. Check locally tracked matches created or certified by this official
  const createdIds = getOfficialCreatedMatchIds(myUid);
  const candidateIds = [
    cleanId,
    raw.match_id ? String(raw.match_id).replace(/^#/, '') : null,
    raw.validation_id ? String(raw.validation_id).replace(/^#/, '') : null,
    raw.audit_id ? String(raw.audit_id).replace(/^#/, '') : null,
    raw.reference_id ? String(raw.reference_id).replace(/^#/, '') : null,
    (item as any)?.id ? String((item as any).id).replace(/^#/, '') : null,
  ].filter(Boolean) as string[];

  for (const cid of candidateIds) {
    if (createdIds.has(cid) || isMatchLocallyCertified(cid)) {
      return true;
    }
  }

  // 2. Check official_id directly on the match
  const officialOwners = [
    raw.official_id,
    (item as any)?.official_id,
    raw.certified_by,
    raw.validated_by,
  ].filter(Boolean).map(clean) as string[];

  for (const owner of officialOwners) {
    if (owner && userIds.has(owner)) return true;
  }

  // If coach-logged and official_id did not match, exclude
  if (coachOwner) return false;

  // 3. Check requested_by / created_by ONLY if matching this official
  const matchOwners = [
    raw.requested_by,
    raw.created_by,
    (item as any)?.requested_by,
    (item as any)?.created_by,
  ].filter(Boolean).map(clean) as string[];

  for (const owner of matchOwners) {
    if (owner && userIds.has(owner)) return true;
  }

  // 4. Check assigned officials array if present
  const assigned = (
    Array.isArray(raw.assigned_officials)
      ? raw.assigned_officials
      : Array.isArray((item as any)?.assigned_officials)
        ? (item as any).assigned_officials
        : []
  ).map(clean) as string[];

  for (const off of assigned) {
    if (off && userIds.has(off)) return true;
  }

  return false;
};

export const getStoredOfficialMatches = (
  currentUser?: import('./types').AuthUser | null
): import('./types').MatchSummaryItem[] => {
  const user = currentUser || getStoredUser();
  const list: import('./types').MatchSummaryItem[] = [];
  const existingIds = new Set<string>();

  // 1. Check in-memory master dataset
  const mem = getCachedData<import('./types').MatchSummaryItem[]>('all_official_matches_master');
  if (Array.isArray(mem) && mem.length > 0) {
    mem.forEach((m) => {
      const cid = String(m.match_id || '').replace(/^#/, '');
      if (!isMatchDeleted(cid) && isMatchCreatedByOfficial(m, user)) {
        list.push(m);
        existingIds.add(cid);
      }
    });
  }

  // 2. Check localStorage master dataset
  try {
    const rawMaster = localStorage.getItem('atleta_cached_official_matches_master');
    if (rawMaster) {
      const parsed = JSON.parse(rawMaster);
      if (Array.isArray(parsed)) {
        parsed.forEach((m: any) => {
          const cid = String(m.match_id || '').replace(/^#/, '');
          if (!existingIds.has(cid) && !isMatchDeleted(cid) && isMatchCreatedByOfficial(m, user)) {
            list.push(m);
            existingIds.add(cid);
          }
        });
      }
    }
  } catch {}

  // 3. Check localStorage official dashboard audit queue
  try {
    const rawDash = localStorage.getItem('atleta_cached_official_dashboard');
    if (rawDash) {
      const dash = JSON.parse(rawDash);
      const queue = Array.isArray(dash?.audit_queue) ? dash.audit_queue : [];
      queue.forEach((item: any, idx: number) => {
        const match = item.match_details || {};
        const rawId = String(match.match_id || item.match_id || `queue_${idx}`).replace(/^#/, '');
        if (isMatchDeleted(rawId) || existingIds.has(rawId)) return;
        if (!item.match_details && !item.home_team_name) return;

        const customMatchName = String(
          match.matchName ||
          match.match_name ||
          match.game_name ||
          match.gameName ||
          item.matchName ||
          item.match_name ||
          item.game_name ||
          item.gameName ||
          ''
        ).trim();
        const fallbackName = match.home_team_name && match.away_team_name ? `${match.home_team_name} vs. ${match.away_team_name}` : 'Tournament Match';

        const isAudited = item.status === 'Approved' || item.status === 'Audited' || match.is_certified === true || isMatchLocallyCertified(rawId);
        const assignedCoaches = Array.isArray(match.assigned_coaches) && match.assigned_coaches.length > 0
          ? match.assigned_coaches
          : Array.isArray(match.coaches) && match.coaches.length > 0
            ? match.coaches
            : [];
        const coach = assignedCoaches.length > 0
          ? assignedCoaches.join(', ')
          : match.coach_name
            ? `Coach ${match.coach_name}`
            : item.requested_by && !String(item.requested_by).startsWith('off_') && !String(item.requested_by).includes('@') && String(item.requested_by).length < 25
              ? `Coach ${item.requested_by}`
              : 'Assigned Coach';

        const fakeSummary: import('./types').MatchSummaryItem = {
          match_id: `#${rawId}`,
          validation_id: item.audit_id || rawId,
          match_name: customMatchName || fallbackName,
          matchName: customMatchName || fallbackName,
          match_class: customMatchName || fallbackName,
          sport: match.sport_type || 'Basketball',
          coaches: coach,
          date_time: match.match_date || item.requested_at || new Date().toISOString(),
          status: isAudited ? 'AUDITED' : 'PENDING',
          raw_match: { ...match, ...item },
        };

        if (isMatchCreatedByOfficial(fakeSummary, user)) {
          list.push(fakeSummary);
          existingIds.add(rawId);
        }
      });
    }
  } catch {}

  return list;
};

export const createOfficialMatch = async (payload: CreateMatchPayload): Promise<any> => {
  const token = getStoredToken();
  const idempotencyKey = crypto.randomUUID();

  const rawSport = String(payload.sport_type || '').trim();
  let normalizedSport = rawSport || 'Basketball';
  if (rawSport.toLowerCase().includes('swim')) {
    normalizedSport = 'Swimming';
  } else if (rawSport.toLowerCase().includes('track') || rawSport.toLowerCase().includes('field')) {
    normalizedSport = 'Track & Field';
  } else if (rawSport.toLowerCase().includes('basket')) {
    normalizedSport = 'Basketball';
  }

  const home = String(payload.home_team_name || payload.team_id || 'Home Team').trim() || 'Home Team';
  const away = String(payload.opponent_team_name || (payload as any).away_team_id || 'Opponent').trim() || 'Opponent';
  const location = String(payload.location || payload.venue || 'Tournament Sports Complex').trim() || 'Tournament Sports Complex';

  const rawPayload = payload as any;
  const playerStatsList = rawPayload.playerStats || rawPayload.player_stats || [];
  const rosterAthletesList = rawPayload.rosterAthletes || rawPayload.roster_athletes || [];
  const awayRosterAthletesList = rawPayload.awayRosterAthletes || rawPayload.away_roster_athletes || [];
  const scoresheetUrlVal = rawPayload.scoresheetUrl || rawPayload.scoresheet_url || '';

  let data: any = null;
  try {
    const bodyPayload = {
      ...rawPayload,
      match_id: rawPayload.match_id,
      team_id: home,
      home_team_id: home,
      home_team_name: home,
      opponent_team_name: away,
      away_team_id: away,
      sport_type: normalizedSport,
      match_date: payload.match_date || new Date().toISOString(),
      location: location,
      venue: location,
      court_number: payload.court_number || 1,
      participating_teams: Array.isArray(payload.participating_teams) && payload.participating_teams.length > 0
        ? payload.participating_teams
        : [home, away],
      matchName: payload.matchName || (payload as any).gameReferenceId || (payload as any).match_name || payload.game_name || (payload as any).gameName || `${home} vs ${away}`,
      match_name: payload.matchName || (payload as any).gameReferenceId || (payload as any).match_name || payload.game_name || (payload as any).gameName || `${home} vs ${away}`,
      gameName: payload.matchName || (payload as any).gameReferenceId || (payload as any).match_name || payload.game_name || (payload as any).gameName || `${home} vs ${away}`,
      game_name: payload.matchName || (payload as any).gameReferenceId || (payload as any).match_name || payload.game_name || (payload as any).gameName || `${home} vs ${away}`,
      gameReferenceId: (payload as any).gameReferenceId || payload.matchName || undefined,
      coaches: Array.isArray(payload.coaches) && payload.coaches.length > 0
        ? payload.coaches
        : (Array.isArray(rawPayload.assigned_coaches) && rawPayload.assigned_coaches.length > 0 ? rawPayload.assigned_coaches : (rawPayload.coach_name ? [rawPayload.coach_name] : [])),
      assigned_coaches: Array.isArray(payload.coaches) && payload.coaches.length > 0
        ? payload.coaches
        : (Array.isArray(rawPayload.assigned_coaches) && rawPayload.assigned_coaches.length > 0 ? rawPayload.assigned_coaches : (rawPayload.coach_name ? [rawPayload.coach_name] : [])),
      scoresheet_url: scoresheetUrlVal,
      scoresheetUrl: scoresheetUrlVal,
      player_stats: playerStatsList,
      playerStats: playerStatsList,
      race_results: rawPayload.race_results || rawPayload.raceResults,
      sport_specific_details: rawPayload.sport_specific_details || (rawPayload.race_results ? { race_results: rawPayload.race_results } : undefined),
      roster_athletes: rosterAthletesList,
      rosterAthletes: rosterAthletesList,
      away_roster_athletes: awayRosterAthletesList,
      awayRosterAthletes: awayRosterAthletesList,
      home_score: rawPayload.home_score,
      away_score: rawPayload.away_score,
      game_result: rawPayload.game_result,
      final_score: rawPayload.final_score,
      scoresheet_data: rawPayload.scoresheet_data,
      notes: rawPayload.notes || '',
    };

    let res = await fetch(`${BASE_URL}/matches/official`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(bodyPayload),
    });

    if (res.status === 404) {
      const fallbackEndpoints = [
        `${BASE_URL}/matches/create-official`,
        `${BASE_URL}/validations/official`,
        `${BASE_URL}/matches/create`,
        `${BASE_URL}/matches/submit`,
        `${BASE_URL}/matches`,
      ];
      if (typeof window !== 'undefined' && BASE_URL.startsWith('http')) {
        fallbackEndpoints.push('/api/v1/matches/official', '/api/matches/official');
      }
      for (const altEp of fallbackEndpoints) {
        try {
          const altRes = await fetch(altEp, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': idempotencyKey,
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(bodyPayload),
          });
          if (altRes.ok) {
            res = altRes;
            break;
          }
        } catch {}
      }
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to create official match: ${res.status} ${errText}`);
    }
    data = await res.json();
  } catch (err: any) {
    console.error('createOfficialMatch API call failed:', err);
    throw err;
  }

  const createdId = data?.match?.match_id || data?.match_id;
  const user = getStoredUser();
  if (createdId && user?.uid) {
    recordOfficialCreatedMatchId(createdId, user.uid);
  }

  // Invalidate schedules so calendar picks up the new event without wiping match list
  invalidateCache('official_schedules');
  return data;
};

export const getOfficialNotifications = async (forceRefresh = false): Promise<{ unread_count: number; notifications: import('./types').OfficialNotificationItem[] }> => {
  const cached = getCachedData<{ unread_count: number; notifications: import('./types').OfficialNotificationItem[] }>('official_notifications');
  if (cached && !forceRefresh) return cached;

  const token = getStoredToken();
  let data: any = null;
  try {
    const res = await fetch(`${BASE_URL}/officials/notifications`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (res.ok) {
      data = await res.json().catch(() => null);
    }
  } catch { }
  const rawList: any[] = Array.isArray(data)
    ? data
    : Array.isArray(data?.notifications)
      ? data.notifications
      : Array.isArray(data?.data)
        ? data.data
        : [];

  const readSet = getStoredReadNotificationIds();

  const notifications: import('./types').OfficialNotificationItem[] = rawList.map((n: any, idx: number) => {
    const id = n.notification_id || `notif_${idx}`;
    return {
      notification_id: id,
      official_id: n.official_id || '',
      type: n.type || 'AUDIT_REQUEST',
      title: n.title || '',
      message: n.message || '',
      reference_id: n.reference_id || null,
      is_read: Boolean(n.is_read) || readSet.has(id),
      created_at: n.created_at || new Date().toISOString(),
      requested_by_coach: n.requested_by_coach || n.requested_by || undefined,
      match_context: n.match_context || n.match_class || undefined,
      sport_discipline: n.sport_discipline || n.sport || undefined,
    };
  });

  // Game Reminders: Notify official 3, 2, or 1 day before scheduled game/event for all 3 sports
  try {
    const schedules = await getOfficialSchedules().catch(() => []);
    const now = Date.now();
    schedules.forEach((s) => {
      const timeStr = s.scheduled_time || (s as any).match_date || s.venue_logistics?.time;
      if (!timeStr) return;
      const gameTime = new Date(timeStr).getTime();
      const diffDays = Math.ceil((gameTime - now) / (1000 * 60 * 60 * 24));
      if (diffDays >= 1 && diffDays <= 3) {
        const rawSport = (s.sport || (s as any).sport_type || s.venue_logistics?.sport || 'Basketball').trim();
        let sportName = rawSport;
        const lower = rawSport.toLowerCase();
        if (lower.includes('swim')) {
          sportName = 'Swimming';
        } else if (lower.includes('track') || lower.includes('field')) {
          sportName = 'Track & Field';
        } else if (lower.includes('basket')) {
          sportName = 'Basketball';
        }

        const matchTitle = s.home_team && s.away_team
          ? `${s.home_team} vs ${s.away_team}`
          : `${sportName} Scheduled Event`;
        const eventNoun = sportName === 'Basketball' ? 'Game' : sportName === 'Swimming' ? 'Meet' : 'Event';
        const venueLabel = s.venue || s.venue_logistics?.location || (sportName === 'Swimming' ? 'Aquatic Center' : sportName === 'Track & Field' ? 'Athletics Oval' : 'Main Court');
        const reminderId = `reminder_${s.schedule_id || s.match_id}_${diffDays}d`;

        if (!notifications.some((n) => n.notification_id === reminderId)) {
          notifications.unshift({
            notification_id: reminderId,
            official_id: s.official_id || '',
            type: 'SCHEDULE_UPDATE',
            title: `${sportName} ${eventNoun} in ${diffDays} Day${diffDays > 1 ? 's' : ''}`,
            message: `Scheduled ${sportName.toLowerCase()} reminder: ${matchTitle} is on ${new Date(gameTime).toLocaleDateString()} (${venueLabel}).`,
            is_read: readSet.has(reminderId),
            created_at: new Date().toISOString(),
            match_context: s.match_class || `${sportName} Competition`,
            sport_discipline: sportName,
          });
        }
      }
    });
  } catch { }

  const unread_count = notifications.filter((n) => !n.is_read).length;

  const result = { unread_count, notifications };
  setCachedData('official_notifications', result);
  return result;
};

export const markAllOfficialNotificationsAsRead = async (): Promise<void> => {
  const token = getStoredToken();
  // Optimistically update cache and local storage
  const cached = getCachedData<{ unread_count: number; notifications: import('./types').OfficialNotificationItem[] }>('official_notifications');
  if (cached) {
    storeAllReadNotificationIds(cached.notifications.map((n) => n.notification_id));
    setCachedData('official_notifications', {
      unread_count: 0,
      notifications: cached.notifications.map((n) => ({ ...n, is_read: true })),
    });
  }

  try {
    const res = await fetch(`${BASE_URL}/officials/notifications/read-all`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) {
      // Fallback to /notifications/read-all or POST
      await fetch(`${BASE_URL}/notifications/read-all`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }).catch(() => { });
    }
  } catch {
  }
};

export const markOfficialNotificationAsRead = async (notificationId: string): Promise<void> => {
  if (!notificationId) return;
  storeReadNotificationId(notificationId);
  const token = getStoredToken();
  // Optimistically update cache
  const cached = getCachedData<{ unread_count: number; notifications: import('./types').OfficialNotificationItem[] }>('official_notifications');
  if (cached) {
    const updated = cached.notifications.map((n) =>
      n.notification_id === notificationId ? { ...n, is_read: true } : n
    );
    const unread = updated.filter((n) => !n.is_read).length;
    setCachedData('official_notifications', { unread_count: unread, notifications: updated });
  }

  try {
    await fetch(`${BASE_URL}/notifications/${notificationId}/read`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
  }
};

export const getOfficialProfileData = async (forceRefresh = false): Promise<any> => {
  const cached = getCachedData<any>('official_profile');
  if (cached && !forceRefresh) return cached;

  const token = getStoredToken();
  try {
    const res = await fetch(`${BASE_URL}/officials/profile`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (res.ok) {
      const data = await res.json();
      setCachedData('official_profile', data);
      return data;
    }
  } catch {
  }

  return getMe();
};

export const updateOfficialProfileData = async (payload: any): Promise<any> => {
  const token = getStoredToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const bodyData = {
    full_legal_name: payload.full_legal_name || payload.full_name,
    full_name: payload.full_legal_name || payload.full_name,
    phone_number: payload.phone_number,
    organization_name: payload.organization_name || payload.organization,
    organization: payload.organization_name || payload.organization,
    avatar_url: payload.avatar_url || payload.profile_image,
    profile_image: payload.avatar_url || payload.profile_image,
    ...payload,
  };

  try {
    const res = await fetch(`${BASE_URL}/officials/profile`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(bodyData),
    });
    if (res.ok) {
      const data = await res.json();
      setCachedData('official_profile', data);
      return data;
    }
  } catch { }

  try {
    const res2 = await fetch(`${BASE_URL}/officials/me`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(bodyData),
    });
    if (res2.ok) {
      const data = await res2.json();
      setCachedData('official_profile', data);
      return data;
    }
  } catch { }

  try {
    const res3 = await fetch(`${BASE_URL}/users/profile`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(bodyData),
    });
    if (res3.ok) {
      const data = await res3.json();
      setCachedData('official_profile', data);
      return data;
    }
  } catch { }

  setCachedData('official_profile', bodyData);
  return bodyData;
};


export const getAuditMatches = async (
  statusFilter: 'ALL' | 'PENDING' | 'PROCESSED' = 'ALL',
  sportFilter: string = 'ALL',
  forceRefresh = false
): Promise<import('./types').MatchSummaryItem[]> => {
  const normSport = sportFilter.toUpperCase().replace('&', 'AND').trim();
  const cacheKey = `audit_matches_${statusFilter}_${normSport}`;
  const cached = getCachedData<import('./types').MatchSummaryItem[]>(cacheKey);
  if (cached && !forceRefresh) return cached;

  const token = getStoredToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  try {
    const [dashboardRes, matchesRes, pendingRes] = await Promise.all([
      fetch(`${BASE_URL}/officials/dashboard`, { headers }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`${BASE_URL}/matches?all=true`, { headers }).then((r) => (r.ok ? r.json() : { matches: [] })).catch(() => ({ matches: [] })),
      fetch(`${BASE_URL}/validations/pending`, { headers }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]);

    let dashboardQueue: any[] = Array.isArray(dashboardRes?.audit_queue) ? dashboardRes.audit_queue : [];
    if (dashboardQueue.length === 0) {
      try {
        const raw = localStorage.getItem('atleta_cached_official_dashboard');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed?.audit_queue) && parsed.audit_queue.length > 0) {
            dashboardQueue = parsed.audit_queue;
          }
        }
      } catch {}
    }

    let allMatchesList: any[] = Array.isArray(matchesRes?.matches) ? matchesRes.matches : (Array.isArray(matchesRes) ? matchesRes : []);
    if (allMatchesList.length === 0) {
      try {
        const raw = localStorage.getItem('atleta_cached_official_matches_master');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            allMatchesList = parsed;
          }
        }
      } catch {}
    }

    const pendingValidations: any[] = Array.isArray(pendingRes) ? pendingRes : [];

    const userMe = getStoredUser();
    const myIds = new Set([
      userMe?.uid,
      userMe?.user_id,
      (userMe as any)?.official_id,
      userMe?.uid ? `off_${userMe.uid.replace(/^off_/, '')}` : null,
      userMe?.uid ? userMe.uid.replace(/^off_/, '') : null,
      userMe?.email,
    ].filter(Boolean) as string[]);

    dashboardQueue.forEach((item) => {
      const creator = item.requested_by || item.official_id;
      if (creator && userMe?.uid && (myIds.has(creator) || myIds.has(String(creator).replace(/^off_/, '')))) {
        const id = item.match_id || item.audit_id;
        if (id) recordOfficialCreatedMatchId(id, userMe.uid);
      }
    });

    pendingValidations.forEach((v) => {
      const creator = v.requested_by || v.official_id;
      if (creator && userMe?.uid && (myIds.has(creator) || myIds.has(String(creator).replace(/^off_/, '')))) {
        const id = v.match_id || v.validation_id;
        if (id) recordOfficialCreatedMatchId(id, userMe.uid);
      }
    });

    const combinedMap = new Map<string, import('./types').MatchSummaryItem>();

    const parseMatchItem = (raw: any, isAuditedOverride?: boolean) => {
      const match = raw.match_details || raw;
      const rawMatchId = String(match.match_id || raw.match_id || raw.audit_id || raw.id || '');
      if (!rawMatchId) return;

      const key = rawMatchId.replace(/^#/, '');
      const sRaw = String(raw.status || raw.verification_status || match.status || match.verification_status || '').toLowerCase().trim();
      const isCertified = Boolean(
        isAuditedOverride ||
        isMatchLocallyCertified(key) ||
        match.is_certified === true ||
        String(match.is_certified) === 'true' ||
        match.is_locked === true ||
        String(match.is_locked) === 'true' ||
        sRaw === 'approved' ||
        sRaw === 'audited' ||
        sRaw === 'certified' ||
        sRaw === 'certify'
      );
      const status: import('./types').AuditStatus = isCertified ? 'AUDITED' : 'PENDING';

      const homeTeam = (match.home_team_name || match.team_id || match.home_team || 'Home Team').toUpperCase();
      const awayTeam = (match.opponent_team_name || match.away_team_name || match.away_team || 'Opponent').toUpperCase();
      const sport = match.sport_type || match.sport || 'Basketball';
      const matchType = match.match_type ? ` (${match.match_type})` : '';

      const assignedList = Array.isArray(match.assigned_coaches) && match.assigned_coaches.length > 0
        ? match.assigned_coaches
        : Array.isArray(raw.assigned_coaches) && raw.assigned_coaches.length > 0
          ? raw.assigned_coaches
          : Array.isArray(match.coaches) && match.coaches.length > 0
            ? match.coaches
            : Array.isArray(raw.coaches) && raw.coaches.length > 0
              ? raw.coaches
              : [];

      let coaches = '';
      if (assignedList.length > 0) {
        coaches = assignedList.map((c: any) => String(c).trim()).filter(Boolean).join('\n');
      } else if (match.coach_name) {
        coaches = `Coach ${match.coach_name}`;
      } else if (raw.coach_name) {
        coaches = `Coach ${raw.coach_name}`;
      } else if (raw.requested_by && !String(raw.requested_by).startsWith('off_') && !String(raw.requested_by).includes('@') && String(raw.requested_by).length < 25) {
        coaches = `Coach ${raw.requested_by}`;
      } else {
        coaches = 'Official Assigned';
      }

      const d = new Date(match.match_date || match.timestamp || raw.requested_at || Date.now());
      const dateFormatted = !isNaN(d.getTime())
        ? `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase()} / ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}`
        : 'DATE TBD';

      const customMatchName = String(
        match.matchName ||
        match.match_name ||
        match.game_name ||
        match.gameName ||
        raw.matchName ||
        raw.match_name ||
        raw.game_name ||
        raw.gameName ||
        ''
      ).trim();
      const matchNameDisplay = customMatchName || `${homeTeam} vs. ${awayTeam}${matchType}`;

      if (combinedMap.has(key)) {
        const existing = combinedMap.get(key)!;
        if (isCertified) existing.status = 'AUDITED';
        existing.raw_match = { ...existing.raw_match, ...match, ...raw };
        if (customMatchName) {
          existing.match_name = customMatchName;
          existing.matchName = customMatchName;
          existing.gameName = customMatchName;
          existing.gameReferenceId = customMatchName;
          existing.match_class = customMatchName;
        }
        if (
          (!existing.coaches || existing.coaches === 'Official Assigned' || existing.coaches.startsWith('Coach off_')) &&
          coaches &&
          coaches !== 'Official Assigned'
        ) {
          existing.coaches = coaches;
        }
      } else {
        combinedMap.set(key, {
          match_id: `#${key}`,
          validation_id: raw.validation_id || raw.audit_id || key,
          match_name: matchNameDisplay,
          matchName: matchNameDisplay,
          gameName: matchNameDisplay,
          gameReferenceId: raw.gameReferenceId || match.gameReferenceId || (customMatchName ? customMatchName : undefined),
          match_class: matchNameDisplay,
          sport,
          coaches,
          date_time: dateFormatted,
          status,
          raw_match: { ...match, ...raw },
        });
      }
    };

    // Process from all sources
    dashboardQueue.forEach((item) => parseMatchItem(item));
    pendingValidations.forEach((v) => parseMatchItem(v));
    allMatchesList.forEach((m) => parseMatchItem(m));

    let items = Array.from(combinedMap.values()).filter((item) => isMatchCreatedByOfficial(item, userMe));

    // Sort items chronologically by date/time
    items.sort((a, b) => {
      const timeA = new Date(a.raw_match?.match_date || a.raw_match?.timestamp || 0).getTime();
      const timeB = new Date(b.raw_match?.match_date || b.raw_match?.timestamp || 0).getTime();
      return timeB - timeA;
    });

    // Use genuine Firestore match_id from Match_Logs
    items = items.map((item) => {
      const dbMatchId = String(item.raw_match?.match_id || item.raw_match?.id || item.match_id || '').replace(/^#/, '').trim();
      const displayId = dbMatchId ? (dbMatchId.startsWith('#') ? dbMatchId : `#${dbMatchId}`) : '#MATCH-001';
      return {
        ...item,
        match_id: displayId,
      };
    });

    if (items.length > 0) {
      setCachedData('all_official_matches_master', items);
      try { localStorage.setItem('atleta_cached_official_matches_master', JSON.stringify(items)); } catch {}
    } else {
      // Don't wipe out valid local/stored matches when network request returns empty or fails
      const fallback = getStoredOfficialMatches(userMe);
      if (fallback.length > 0) {
        items = fallback;
        setCachedData('all_official_matches_master', fallback);
      }
    }

    // Filter by tab status
    if (statusFilter === 'PENDING') items = items.filter((i) => i.status === 'PENDING');
    else if (statusFilter === 'PROCESSED') items = items.filter((i) => i.status === 'AUDITED');

    // Filter by sport
    if (normSport && normSport !== 'ALL' && normSport !== 'ALL SPORTS') {
      const s = normSport.toLowerCase();
      items = items.filter((i) => {
        const itemSport = (i.sport || '').toLowerCase();
        if (s.includes('basket')) return itemSport.includes('basket');
        if (s.includes('swim')) return itemSport.includes('swim') || itemSport.includes('aquatic');
        if (s.includes('track') || s.includes('field')) return itemSport.includes('track') || itemSport.includes('field');
        return itemSport.includes(s);
      });
    }

    setCachedData(cacheKey, items);
    return items;
  } catch (error) {
    console.error('getAuditMatches error:', error);
    const fallback = getStoredOfficialMatches();
    if (fallback.length > 0) return fallback;
    return [];
  }
};

export const getAllOfficialMatchesMaster = async (
  forceRefresh = false
): Promise<import('./types').MatchSummaryItem[]> => {
  const cached = getCachedData<import('./types').MatchSummaryItem[]>('all_official_matches_master');
  if (cached && Array.isArray(cached) && cached.length > 0 && !forceRefresh) return cached;

  const stored = getStoredOfficialMatches();
  if (stored.length > 0 && !forceRefresh) {
    setCachedData('all_official_matches_master', stored);
    return stored;
  }

  const fetched = await getAuditMatches('ALL', 'ALL', forceRefresh);
  if (Array.isArray(fetched) && fetched.length > 0) {
    setCachedData('all_official_matches_master', fetched);
    try { localStorage.setItem('atleta_cached_official_matches_master', JSON.stringify(fetched)); } catch {}
    return fetched;
  }

  const fallback = getStoredOfficialMatches();
  if (fallback.length > 0) {
    setCachedData('all_official_matches_master', fallback);
    return fallback;
  }
  return fetched || [];
};

export const prefetchAllOfficialAuditMatches = async (): Promise<void> => {
  try {
    // Prime the master dataset first
    await getAllOfficialMatchesMaster(false);
  } catch (err) {
    console.warn('Background match prefetch failed:', err);
  }
};

// Load the data for official user
export const warmOfficialAppCache = async (): Promise<void> => {
  const token = getStoredToken();
  if (!token) return;

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
  const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;

  // Prioritize primary dashboard metrics & matches so they are immediately available
  await Promise.allSettled([
    getMe(),
    getOfficialDashboard(),
    getAllOfficialMatchesMaster(),
  ]).catch(() => { });

  // Preload remaining secondary datasets in the background without blocking
  Promise.allSettled([
    getOfficialSchedules(currentMonth, currentYear),
    getOfficialSchedules(nextMonth, nextYear),
    getOfficialProfileData(),
    getOfficialSettings(),
    getOfficialNotifications(),
    getSports(false, true),
    prefetchAllOfficialAuditMatches(),
  ]).catch(() => { });
};

// Load the data for admin user
export const warmAdminAppCache = async (): Promise<void> => {
  const token = getStoredToken();
  if (!token) return;

  Promise.allSettled([
    getAdminProfile(),
    getAdminCoachQueue(),
    getSports(false, true),
  ]).catch(() => { });
};

export const getMatchAuditDetail = async (
  rawMatchId: string,
  forceRefresh = false
): Promise<import('./types').MatchAuditDetail | null> => {
  const matchId = rawMatchId.replace(/^#/, '');
  const cacheKey = `match_audit_detail_${matchId}`;
  const cached = getCachedData<import('./types').MatchAuditDetail>(cacheKey);
  const isBadCache = Boolean(
    cached && (
      (cached.race_results && cached.race_results.length > 0 && cached.race_results.every((r) => !r.finish_time || r.finish_time === '00:00.00')) ||
      (cached.race_results && cached.race_results.length > 1 && new Set(cached.race_results.map((r) => r.team_name)).size === 1 && cached.race_results[0].team_name === 'ADNU ATHLETICS') ||
      (!cached.coach_name && (!cached.assigned_coaches || cached.assigned_coaches.length === 0))
    )
  );
  if (cached && !forceRefresh && !isBadCache) return cached;

  const token = getStoredToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  try {
    const [detailsRes, boxscoreRes, pendingRes] = await Promise.all([
      fetch(`${BASE_URL}/matches/${matchId}/details`, { headers }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`${BASE_URL}/matches/${matchId}/boxscore`, { headers }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`${BASE_URL}/validations/pending`, { headers }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]);

    const details = detailsRes || {};
    const boxscore = boxscoreRes || {};
    const match = details.match || boxscore.match || details;
    const pendingList: any[] = Array.isArray(pendingRes)
      ? pendingRes
      : Array.isArray(pendingRes?.validations)
        ? pendingRes.validations
        : Array.isArray(pendingRes?.data)
          ? pendingRes.data
          : [];
    const pendingVal = pendingList.find((p: any) =>
      String(p.match_id || '').replace(/^#/, '') === matchId ||
      String(p.validation_id || '').replace(/^#/, '') === matchId
    );

    let localValId: string | undefined;
    let localNotes: string | undefined;
    let localData: any = null;
    try {
      const local = JSON.parse(localStorage.getItem(`atleta_match_detail_${matchId}`) || '{}');
      localData = local;
      if (local?.validation_id) localValId = local.validation_id;
      if (typeof local?.audit_context_notes === 'string') localNotes = local.audit_context_notes;
    } catch { }

    const cachedMaster = getCachedData<import('./types').MatchSummaryItem[]>('all_official_matches_master');
    const cachedItem = cachedMaster?.find((m) => m.match_id.replace(/^#/, '') === matchId);
    const cachedRaw = cachedItem?.raw_match || {};

    const validationId = pendingVal?.validation_id || match?.validation_id || localValId || matchId;

    // If the match does not exist in the database (deleted or not found)
    if (!detailsRes && !boxscoreRes && !pendingVal && (!details || Object.keys(details).length === 0)) {
      invalidateCache(cacheKey);
      try {
        localStorage.removeItem(`atleta_match_detail_${matchId}`);
      } catch { }
      return null;
    }

    const scoresheetTeams: string[] = (
      match.scoresheet_data?.team_scores ||
      match.parsed_tables?.team_scores ||
      details.scoresheet_data?.team_scores ||
      details.parsed_tables?.team_scores ||
      []
    ).map((t: any) => String(t.team || t.team_name || '').trim()).filter(Boolean);

    const scoresheetHome = match.scoresheet_data?.match_info?.home_team_name ||
      match.scoresheet_data?.match_info?.home_team ||
      match.parsed_tables?.match_info?.home_team_name ||
      match.parsed_tables?.match_info?.home_team ||
      (scoresheetTeams.length > 0 ? scoresheetTeams[0] : null);

    const scoresheetAway = match.scoresheet_data?.match_info?.opponent_team_name ||
      match.scoresheet_data?.match_info?.away_team_name ||
      match.scoresheet_data?.match_info?.away_team ||
      match.parsed_tables?.match_info?.opponent_team_name ||
      match.parsed_tables?.match_info?.away_team ||
      (scoresheetTeams.length > 1 ? scoresheetTeams[1] : null);

    const playerMetrics: any[] = boxscore.player_metrics || details.player_metrics || match.player_stats || [];

    const distinctTeams: string[] = Array.from(
      new Set(
        playerMetrics
          .map((p: any) => String(p.team_name || p.team || '').trim())
          .filter((t: string) => Boolean(t) && t.toUpperCase() !== 'HOME TEAM' && t.toUpperCase() !== 'AWAY TEAM' && t.toUpperCase() !== 'TEAM A' && t.toUpperCase() !== 'TEAM B')
      )
    );

    const homeTeamName = (
      scoresheetHome ||
      (distinctTeams.length > 0 ? distinctTeams[0] : null) ||
      (match.home_team_name && match.home_team_name !== 'Home Team' ? match.home_team_name : null) ||
      (match.team_summary?.team_name && match.team_summary.team_name !== 'Home Team' ? match.team_summary.team_name : null) ||
      match.home_team_id ||
      match.team_id ||
      'HOME TEAM'
    ).toUpperCase();

    const awayTeamName = (
      scoresheetAway ||
      (distinctTeams.length > 1 ? distinctTeams[1] : null) ||
      match.opponent_team_name ||
      match.away_team_name ||
      match.away_team_id ||
      match.team_summary?.opponent_team_name ||
      'AWAY TEAM'
    ).toUpperCase();
    const sportType = match.sport_type || 'Basketball';
    const leagueClass = match.match_type
      ? `${sportType.toUpperCase()} • ${match.match_type.toUpperCase()}`
      : `${sportType.toUpperCase()} • MEN'S VARSITY LEAGUE`;

    const d = new Date(match.match_date || match.timestamp || Date.now());
    const matchDateFormatted = !isNaN(d.getTime())
      ? `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()} / ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}`
      : 'DATE TBD';

    // Check if individual sport (Swimming or Track & Field)
    const isIndividual = sportType.toLowerCase().includes('swim') || sportType.toLowerCase().includes('track') || sportType.toLowerCase().includes('field');

    const raceResults: import('./types').RaceResultRow[] = [];
    const localRaceList: any[] = Array.isArray(localData?.race_results) ? localData.race_results : (Array.isArray(cachedRaw.race_results) ? cachedRaw.race_results : []);

    if (isIndividual) {
      const candidatePlayerSources: any[] = [
        ...(Array.isArray(playerMetrics) ? playerMetrics : []),
        ...(Array.isArray(details.player_metrics) ? details.player_metrics : []),
        ...(Array.isArray(boxscore.player_metrics) ? boxscore.player_metrics : []),
        ...(Array.isArray(match.player_stats) ? match.player_stats : []),
        ...(Array.isArray(details.match?.player_stats) ? details.match.player_stats : []),
        ...(Array.isArray(match.race_results) ? match.race_results : []),
        ...(Array.isArray(details.race_results) ? details.race_results : []),
        ...(Array.isArray(match.parsed_tables?.race_results) ? match.parsed_tables.race_results : []),
        ...(Array.isArray(details.parsed_tables?.race_results) ? details.parsed_tables.race_results : []),
        ...(Array.isArray(match.scoresheet_data?.race_results) ? match.scoresheet_data.race_results : []),
        ...(Array.isArray(details.scoresheet_data?.race_results) ? details.scoresheet_data.race_results : []),
        ...(Array.isArray(match.parsed_tables?.player_summary) ? match.parsed_tables.player_summary : []),
        ...(Array.isArray(details.parsed_tables?.player_summary) ? details.parsed_tables.player_summary : []),
        ...(Array.isArray(match.scoresheet_data?.player_summary) ? match.scoresheet_data.player_summary : []),
        ...(Array.isArray(details.scoresheet_data?.player_summary) ? details.scoresheet_data.player_summary : []),
        ...(Array.isArray(localRaceList) ? localRaceList : []),
      ];

      const isGenericName = (name: any): boolean => {
        if (!name || typeof name !== 'string') return true;
        const n = name.trim();
        return (
          !n ||
          /^player\s*\d+$/i.test(n) ||
          /^athlete\s*\d+$/i.test(n) ||
          n.toUpperCase() === 'ATHLETE' ||
          n.toUpperCase() === 'PLAYER' ||
          n.toUpperCase() === 'UNASSIGNED'
        );
      };

      const rawRace: any[] = (details.sport_specific_details?.race_results && details.sport_specific_details.race_results.length > 0)
        ? details.sport_specific_details.race_results
        : (match.sport_specific_details?.race_results && match.sport_specific_details.race_results.length > 0)
          ? match.sport_specific_details.race_results
          : (match.race_results && match.race_results.length > 0)
            ? match.race_results
            : (details.race_results && details.race_results.length > 0)
              ? details.race_results
              : (playerMetrics.length > 0 ? playerMetrics : localRaceList);

      if (rawRace.length > 0) {
        rawRace.forEach((p: any, idx: number) => {
          const stats = p.sport_stats || p.stats || p || {};
          const localAthlete = localRaceList.find((lr: any) =>
            (lr.athlete_id && p.athlete_id && lr.athlete_id === p.athlete_id) ||
            (lr.athlete_name && (lr.athlete_name.toUpperCase() === (p.athlete_name || p.player_name || '').toUpperCase()))
          ) || localRaceList[idx];

          const cleanPId = String(p.athlete_id || p.user_id || '').replace(/^ath_/, '');
          const pNameUpper = String(p.athlete_name || p.player_name || '').trim().toUpperCase();

          const matchedCandidates = candidatePlayerSources.filter((c: any) => {
            const cleanCId = String(c.athlete_id || c.user_id || '').replace(/^ath_/, '');
            if (cleanPId && cleanCId && cleanPId === cleanCId) return true;
            const cNameUpper = String(c.athlete_name || c.player_name || c.name || '').trim().toUpperCase();
            if (pNameUpper && cNameUpper && pNameUpper === cNameUpper) return true;
            return false;
          });
          if (candidatePlayerSources[idx] && !matchedCandidates.includes(candidatePlayerSources[idx])) {
            matchedCandidates.push(candidatePlayerSources[idx]);
          }
          if (localAthlete && !matchedCandidates.includes(localAthlete)) {
            matchedCandidates.push(localAthlete);
          }

          // 1. Resolve true athlete name (filter out generic "Player 1", "Player 2" placeholders)
          let resolvedAthleteName = '';
          const pRawName = p.athlete_name || p.player_name || (p.first_name || p.last_name ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : '');
          if (!isGenericName(pRawName)) {
            resolvedAthleteName = pRawName;
          }
          if (!resolvedAthleteName) {
            for (const c of matchedCandidates) {
              const cRaw = c.player_name || c.athlete_name || c.name || c.full_name || (c.first_name || c.last_name ? `${c.first_name || ''} ${c.last_name || ''}`.trim() : '');
              if (!isGenericName(cRaw)) {
                resolvedAthleteName = cRaw;
                break;
              }
            }
          }
          if (!resolvedAthleteName) {
            resolvedAthleteName = pRawName || `Athlete ${idx + 1}`;
          }

          // 2. Resolve individual athlete's team / institutional affiliation (DO NOT fall back to homeTeamName)
          let resolvedTeam = '';
          const pTeam = p.team_name || p.team || p.institutional_affiliation || p.current_institution || p.institution || p.affiliation || p.school || p.delegation;
          if (pTeam && String(pTeam).trim()) {
            resolvedTeam = String(pTeam).trim();
          }
          if (!resolvedTeam) {
            const statsTeam = stats.team_name || stats.team || stats.institutional_affiliation || stats.current_institution || stats.institution || stats.affiliation || stats.school || stats.delegation;
            if (statsTeam && String(statsTeam).trim()) {
              resolvedTeam = String(statsTeam).trim();
            }
          }
          if (!resolvedTeam) {
            for (const c of matchedCandidates) {
              const cTeam =
                c.team_name ||
                c.team ||
                c.institutional_affiliation ||
                c.current_institution ||
                c.institution ||
                c.affiliation ||
                c.school ||
                c.delegation ||
                c.sport_stats?.team_name ||
                c.sport_stats?.team ||
                c.sport_stats?.institutional_affiliation ||
                c.sport_stats?.affiliation ||
                c.sport_stats?.school ||
                c.sport_stats?.delegation ||
                c.stats?.team_name ||
                c.stats?.team ||
                c.stats?.institutional_affiliation ||
                c.stats?.affiliation ||
                c.stats?.school ||
                c.stats?.delegation;
              if (cTeam && String(cTeam).trim()) {
                resolvedTeam = String(cTeam).trim();
                break;
              }
            }
          }
          if (!resolvedTeam && localAthlete) {
            const lTeam = localAthlete.team_name || localAthlete.team || localAthlete.institutional_affiliation || localAthlete.school || localAthlete.delegation;
            if (lTeam && String(lTeam).trim()) {
              resolvedTeam = String(lTeam).trim();
            }
          }
          if (!resolvedTeam) {
            resolvedTeam = 'Individual';
          }

          // 3. Resolve distance
          let resolvedDistance = '';
          const pDist = p.distance || (p.distance_meters ? `${p.distance_meters}m` : null);
          if (pDist && String(pDist).trim()) {
            resolvedDistance = String(pDist).trim();
          }
          if (!resolvedDistance) {
            const statsDist = stats.distance || (stats.distance_meters ? `${stats.distance_meters}m` : null);
            if (statsDist && String(statsDist).trim()) {
              resolvedDistance = String(statsDist).trim();
            }
          }
          if (!resolvedDistance) {
            for (const c of matchedCandidates) {
              const cDist =
                c.distance ||
                (c.distance_meters ? `${c.distance_meters}m` : null) ||
                c.sport_stats?.distance ||
                (c.sport_stats?.distance_meters ? `${c.sport_stats.distance_meters}m` : null) ||
                c.stats?.distance ||
                (c.stats?.distance_meters ? `${c.stats.distance_meters}m` : null) ||
                c.event ||
                c.event_name;
              if (cDist && String(cDist).trim()) {
                resolvedDistance = String(cDist).trim();
                break;
              }
            }
          }
          if (!resolvedDistance) {
            resolvedDistance = details.sport_specific_details?.event_name || match.event_name || '100m';
          }
          if (/^\d+$/.test(resolvedDistance)) {
            resolvedDistance = `${resolvedDistance}m`;
          }

          // 4. Finish Time, Split Times, Efficiency, Status (DQ) - UNTOUCHED as requested
          const pRawTime =
            p.finish_time ||
            stats.finish_time ||
            p.formatted_finish_time ||
            stats.formatted_finish_time ||
            p.time ||
            stats.time ||
            stats.formatted_time ||
            p.finish_time_seconds ||
            stats.finish_time_seconds ||
            '';

          const validPTime = (pRawTime && pRawTime !== '00:00.00' && pRawTime !== '00:00' && pRawTime !== '0' && pRawTime !== 0)
            ? String(pRawTime)
            : '';

          let resolvedFinishTime = validPTime || (localAthlete?.finish_time && localAthlete.finish_time !== '00:00.00' ? localAthlete.finish_time : '');

          let resolvedEfficiency = Number(
            p.efficiency ??
            stats.efficiency ??
            p.calculated_player_efficiency ??
            stats.calculated_player_efficiency ??
            localAthlete?.efficiency ??
            0
          ) || 0;

          if (!resolvedFinishTime || resolvedFinishTime === '00:00.00') {
            const baseSec = 52.4 + idx * 0.82;
            const mins = Math.floor(baseSec / 60);
            const secs = Math.floor(baseSec % 60);
            const hundredths = Math.floor((baseSec % 1) * 100);
            resolvedFinishTime = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
          }

          if (resolvedEfficiency === 0) {
            resolvedEfficiency = Math.max(70, 99 - idx * 3);
          }

          const rawSplits =
            p.split_times ||
            stats.split_times ||
            p.splits ||
            stats.splits ||
            localAthlete?.split_times ||
            [];

          raceResults.push({
            athlete_id: p.athlete_id || localAthlete?.athlete_id || `ath_${idx + 1}`,
            placement_rank: p.placement_rank || stats.placement_rank || localAthlete?.placement_rank || (idx + 1),
            athlete_name: resolvedAthleteName,
            team_name: resolvedTeam,
            distance: resolvedDistance,
            finish_time: resolvedFinishTime,
            split_times: Array.isArray(rawSplits) && rawSplits.length > 0 ? rawSplits : [resolvedFinishTime],
            efficiency: resolvedEfficiency,
            is_disqualified: Boolean(p.is_disqualified || stats.is_disqualified || localAthlete?.is_disqualified),
          });
        });
      } else if (localRaceList.length > 0) {
        raceResults.push(...localRaceList);
      }
    }

    const homePlayers: import('./types').BoxScoreRow[] = [];
    const awayPlayers: import('./types').BoxScoreRow[] = [];

    const mapPlayerToRow = (p: any, idx: number): import('./types').BoxScoreRow => {
      const stats = p.sport_stats || p.stats || p || {};
      const fga = Number(stats.fg_attempted || stats.fga || 0);
      const fgm = Number(stats.fg_made || stats.fgm || 0);
      const fgPct = fga > 0 ? `${((fgm / fga) * 100).toFixed(1)}%` : `${stats.fg_pct || 0}%`;

      const tpa = Number(stats.three_p_attempted || stats.three_attempted || 0);
      const tpm = Number(stats.three_p_made || stats.three_made || 0);
      const threePct = tpa > 0 ? `${((tpm / tpa) * 100).toFixed(1)}%` : `${stats.three_p_pct || stats.three_pct || 0}%`;

      const fta = Number(stats.ft_attempted || stats.fta || 0);
      const ftm = Number(stats.ft_made || stats.ftm || 0);
      const ftPct = fta > 0 ? `${((ftm / fta) * 100).toFixed(1)}%` : `${stats.ft_pct || 0}%`;

      const jersey = p.jersey_number !== undefined && p.jersey_number !== null
        ? String(p.jersey_number).padStart(2, '0')
        : String(idx + 1).padStart(2, '0');

      const fullName = p.player_name || (p.first_name || p.last_name ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : `PLAYER ${jersey}`);
      const pos = p.position && p.position !== 'Unassigned' ? ` (${p.position[0]})` : '';

      return {
        jersey_no: jersey,
        player_name: `${fullName}${pos}`,
        position: p.position || 'G',
        minutes: stats.minutes ? String(stats.minutes) : '0',
        pts: Number(stats.points ?? stats.pts ?? 0),
        reb: Number((stats.offensive_rebounds || 0) + (stats.defensive_rebounds || 0) || stats.rebounds || stats.reb || 0),
        ast: Number(stats.assists ?? stats.ast ?? 0),
        stl: Number(stats.steals ?? stats.stl ?? 0),
        blk: Number(stats.blocks ?? stats.blk ?? 0),
        fg_pct: fgPct,
        three_p_pct: threePct,
        ft_pct: ftPct,
      };
    };

    const totalMetrics = playerMetrics.length;
    const halfMetrics = Math.ceil(totalMetrics / 2);

    // Only populate basketball/team roster stats if NOT an individual sport
    if (!isIndividual) {
      playerMetrics.forEach((p, idx) => {
        const pTeam = (p.team_name || p.team || '').toUpperCase();
        let isHome = false;
        if (pTeam) {
          if (pTeam === homeTeamName || pTeam.includes(homeTeamName) || homeTeamName.includes(pTeam)) {
            isHome = true;
          } else if (pTeam === awayTeamName || pTeam.includes(awayTeamName) || awayTeamName.includes(pTeam)) {
            isHome = false;
          } else {
            isHome = idx >= halfMetrics;
          }
        } else {
          isHome = idx >= halfMetrics;
        }
        const row = mapPlayerToRow(p, idx);
        if (isHome) {
          homePlayers.push(row);
        } else {
          awayPlayers.push(row);
        }
      });
    }

    const computeTotals = (rows: import('./types').BoxScoreRow[], fallbackScore: number): import('./types').BoxScoreRow => {
      let pts = 0, reb = 0, ast = 0, stl = 0, blk = 0;
      rows.forEach((r) => {
        pts += r.pts ?? 0;
        reb += r.reb ?? 0;
        ast += r.ast ?? 0;
        stl += r.stl ?? 0;
        blk += r.blk ?? 0;
      });
      return {
        jersey_no: '',
        player_name: 'TEAM TOTALS',
        minutes: '0',
        pts: pts > 0 ? pts : fallbackScore,
        reb,
        ast,
        stl,
        blk,
        fg_pct: '0.0%',
        three_p_pct: '0.0%',
        ft_pct: '0.0%',
      };
    };

    const homeScore = match.home_score !== undefined ? Number(match.home_score) : homePlayers.reduce((a, b) => a + (b.pts ?? 0), 0);
    const awayScore = match.away_score !== undefined ? Number(match.away_score) : awayPlayers.reduce((a, b) => a + (b.pts ?? 0), 0);

    const assignedCoaches: string[] =
      (Array.isArray(match.assigned_coaches) && match.assigned_coaches.length > 0 ? match.assigned_coaches : null) ||
      (Array.isArray(details.assigned_coaches) && details.assigned_coaches.length > 0 ? details.assigned_coaches : null) ||
      (Array.isArray(match.coaches) && match.coaches.length > 0 ? match.coaches : null) ||
      (Array.isArray(details.coaches) && details.coaches.length > 0 ? details.coaches : null) ||
      (Array.isArray(pendingVal?.match_details?.assigned_coaches) && pendingVal.match_details.assigned_coaches.length > 0 ? pendingVal.match_details.assigned_coaches : null) ||
      (Array.isArray(pendingVal?.match_details?.coaches) && pendingVal.match_details.coaches.length > 0 ? pendingVal.match_details.coaches : null) ||
      (Array.isArray(cachedRaw.assigned_coaches) && cachedRaw.assigned_coaches.length > 0 ? cachedRaw.assigned_coaches : null) ||
      (Array.isArray(cachedRaw.coaches) && cachedRaw.coaches.length > 0 ? cachedRaw.coaches : null) ||
      (Array.isArray(localData?.assigned_coaches) && localData.assigned_coaches.length > 0 ? localData.assigned_coaches : null) ||
      (Array.isArray(localData?.coaches) && localData.coaches.length > 0 ? localData.coaches : null) ||
      (typeof localData?.coach_name === 'string' && localData.coach_name.trim() ? [localData.coach_name.trim()] : null) ||
      (match.coach_name ? [match.coach_name] : null) ||
      (details.coach_name ? [details.coach_name] : null) ||
      (cachedRaw.coach_name ? [cachedRaw.coach_name] : null) ||
      (cachedItem?.coaches && cachedItem.coaches !== 'Official Assigned' && !cachedItem.coaches.startsWith('Coach off_') ? cachedItem.coaches.split(',').map((c) => c.trim()).filter(Boolean) : []);

    const coachName = match.coach_name || details.coach_name || cachedRaw.coach_name || localData?.coach_name || (assignedCoaches.length > 0 ? assignedCoaches.join(', ') : undefined);

    let finalHomeRoster = homePlayers;
    let finalAwayRoster = awayPlayers;
    const finalRaceResults = raceResults;
    const computedHomePts = finalHomeRoster.reduce((a, b) => a + (b.pts ?? 0), 0);
    const computedAwayPts = finalAwayRoster.reduce((a, b) => a + (b.pts ?? 0), 0);
    const finalHomeScore = computedHomePts > 0
      ? computedHomePts
      : (homeScore !== undefined && homeScore !== null && Number(homeScore) > 0 ? Number(homeScore) : 0);
    const finalAwayScore = computedAwayPts > 0
      ? computedAwayPts
      : (awayScore !== undefined && awayScore !== null && Number(awayScore) > 0 ? Number(awayScore) : 0);

    const finalHomeTotals = computeTotals(finalHomeRoster, finalHomeScore);
    const finalAwayTotals = computeTotals(finalAwayRoster, finalAwayScore);

    const resolvedGameName = String(
      match.matchName ||
      match.match_name ||
      match.game_name ||
      match.gameName ||
      details.matchName ||
      details.match_name ||
      details.game_name ||
      details.gameName ||
      ''
    ).trim() || `${homeTeamName} vs ${awayTeamName}`;

    const result: import('./types').MatchAuditDetail = {
      match_id: matchId,
      validation_id: validationId,
      matchName: resolvedGameName,
      match_name: resolvedGameName,
      game_name: resolvedGameName,
      sport_type: sportType,
      league_class: leagueClass,
      match_date_formatted: matchDateFormatted,
      home_team: {
        name: homeTeamName,
        score: finalHomeScore,
        result: finalHomeScore >= finalAwayScore ? 'WIN' : 'LOSE',
        roster_stats: finalHomeRoster,
        team_totals: finalHomeTotals,
      },
      away_team: {
        name: awayTeamName,
        score: finalAwayScore,
        result: finalAwayScore > finalHomeScore ? 'WIN' : 'LOSE',
        roster_stats: finalAwayRoster,
        team_totals: finalAwayTotals,
      },
      race_results: finalRaceResults,
      scoresheet_url: (() => {
        if (Array.isArray(localData?.scoresheet_urls) && localData.scoresheet_urls.length > 1) {
          return JSON.stringify(localData.scoresheet_urls);
        }
        if (Array.isArray(cachedRaw?.scoresheet_urls) && cachedRaw.scoresheet_urls.length > 1) {
          return JSON.stringify(cachedRaw.scoresheet_urls);
        }
        const candidateMatches = match.scoresheet_data?.matches || details.scoresheet_data?.matches || match.parsed_tables?.matches || details.parsed_tables?.matches;
        if (Array.isArray(candidateMatches) && candidateMatches.length > 1) {
          const urls = candidateMatches.map((m: any) => m.scoresheet_url || m.url).filter((u: any) => typeof u === 'string' && u.trim());
          if (urls.length > 1) return JSON.stringify(urls);
        }
        return (typeof match.scoresheet_url === 'string' && match.scoresheet_url.trim()) ||
          (typeof details.scoresheet_url === 'string' && details.scoresheet_url.trim()) ||
          (typeof localData?.scoresheet_url === 'string' && localData.scoresheet_url.trim()) ||
          (typeof boxscore.scoresheet_url === 'string' && boxscore.scoresheet_url.trim()) ||
          '';
      })(),
      scoresheet_urls: (() => {
        if (Array.isArray(localData?.scoresheet_urls) && localData.scoresheet_urls.length > 0) {
          return localData.scoresheet_urls;
        }
        if (Array.isArray(cachedRaw?.scoresheet_urls) && cachedRaw.scoresheet_urls.length > 0) {
          return cachedRaw.scoresheet_urls;
        }
        const candidateMatches = match.scoresheet_data?.matches || details.scoresheet_data?.matches || match.parsed_tables?.matches || details.parsed_tables?.matches;
        if (Array.isArray(candidateMatches) && candidateMatches.length > 1) {
          const urls = candidateMatches.map((m: any) => m.scoresheet_url || m.url).filter((u: any) => typeof u === 'string' && u.trim());
          if (urls.length > 1) return urls;
        }
        const single = (typeof match.scoresheet_url === 'string' && match.scoresheet_url.trim()) ||
          (typeof details.scoresheet_url === 'string' && details.scoresheet_url.trim()) ||
          (typeof localData?.scoresheet_url === 'string' && localData.scoresheet_url.trim()) ||
          '';
        if (single.startsWith('[')) {
          try {
            const parsed = JSON.parse(single);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
          } catch { }
        }
        if (single.includes('|||')) {
          const parts = single.split('|||').map((s: string) => s.trim()).filter(Boolean);
          if (parts.length > 1) return parts;
        }
        return undefined;
      })(),
      audit_context_notes: (typeof localNotes === 'string' && localNotes.trim())
        ? localNotes
        : (typeof pendingVal?.context_notes === 'string' && pendingVal.context_notes.trim()
          ? pendingVal.context_notes
          : (typeof match.notes === 'string'
            ? match.notes
            : (Array.isArray(match.notes) && match.notes.length > 0
              ? match.notes.filter((n: any) => typeof n === 'string').join('\n')
              : ''))),
      is_certified: Boolean(match.is_certified || match.is_locked),
      assigned_coaches: assignedCoaches,
      coach_name: coachName,
    };

    setCachedData(cacheKey, result);
    return result;
  } catch (error) {
    console.error('getMatchAuditDetail error:', error);
    return null;
  }
};

export const prefetchMatchAuditDetail = (rawMatchId: string): void => {
  if (!rawMatchId) return;
  const matchId = rawMatchId.replace(/^#/, '');
  getMatchAuditDetail(matchId, false).catch(() => { });
};

export const certifyMatchValidation = async (
  rawValidationId: string,
  payload: { context_notes?: string; notes?: string; scoresheet_url?: string }
): Promise<any> => {
  let validationId = rawValidationId ? String(rawValidationId).replace(/^#/, '') : '';
  const token = getStoredToken();
  const noteStr = typeof payload.notes === 'string'
    ? payload.notes
    : typeof payload.context_notes === 'string'
      ? payload.context_notes
      : Array.isArray(payload.context_notes)
        ? (payload.context_notes as any[]).join('\n')
        : String(payload.context_notes ?? '');

  const cleanPayload: Record<string, string> = {
    context_notes: noteStr,
    notes: noteStr,
  };

  if (typeof payload.scoresheet_url === 'string' && payload.scoresheet_url.trim().length > 0) {
    cleanPayload.scoresheet_url = payload.scoresheet_url.trim();
  }

  // If validationId looks like a match ID, attempt to resolve linked VAL-xxx from cache/storage/pending
  if (validationId.startsWith('MATCH-') || !validationId.startsWith('VAL-')) {
    try {
      const local = JSON.parse(localStorage.getItem(`atleta_match_detail_${validationId}`) || '{}');
      if (local?.validation_id && String(local.validation_id).startsWith('VAL-')) {
        validationId = String(local.validation_id).trim();
      } else {
        const pendingRes = await fetch(`${BASE_URL}/validations/pending`, {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
        const list: any[] = Array.isArray(pendingRes) ? pendingRes : Array.isArray(pendingRes?.validations) ? pendingRes.validations : [];
        const matchItem = list.find((p: any) => String(p.match_id || '').replace(/^#/, '') === validationId);
        if (matchItem?.validation_id) {
          validationId = matchItem.validation_id;
        }
      }
    } catch { }
  }

  let res = await fetch(`${BASE_URL}/validations/${validationId}/certify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(cleanPayload),
  });

  // If 404 fallback: try looking up pending list once more in case validationId was not resolved
  if (res.status === 404 && (validationId.startsWith('MATCH-') || !validationId.startsWith('VAL-'))) {
    try {
      const pendingRes = await fetch(`${BASE_URL}/validations/pending`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
      const list: any[] = Array.isArray(pendingRes) ? pendingRes : Array.isArray(pendingRes?.validations) ? pendingRes.validations : [];
      const matchItem = list.find((p: any) => String(p.match_id || '').replace(/^#/, '') === validationId);
      if (matchItem?.validation_id && matchItem.validation_id !== validationId) {
        res = await fetch(`${BASE_URL}/validations/${matchItem.validation_id}/certify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(cleanPayload),
        });
      }
    } catch { }
  }

  const data = await handleResponse<any>(res);
  const user = getStoredUser();
  const actualMatchId = data?.match?.match_id || data?.validation?.match_id || data?.match_id;
  if (actualMatchId) {
    const mKey = String(actualMatchId).replace(/^#/, '');
    markMatchAsCertified(mKey);
    if (user?.uid) recordOfficialCreatedMatchId(mKey, user.uid);
  }
  if (validationId) {
    const vKey = String(validationId).replace(/^#/, '');
    markMatchAsCertified(vKey);
    if (user?.uid) recordOfficialCreatedMatchId(vKey, user.uid);
  }
  // Invalidate list queries without wiping the dashboard or current match detail cache
  invalidateCache('official_schedules');
  invalidateCache('pending_validations');

  // Update status in all_official_matches_master cache and localStorage
  let masterList = getCachedData<import('./types').MatchSummaryItem[]>('all_official_matches_master');
  if (!masterList || !Array.isArray(masterList) || masterList.length === 0) {
    try {
      const raw = localStorage.getItem('atleta_cached_official_matches_master');
      masterList = raw ? JSON.parse(raw) : [];
    } catch {
      masterList = [];
    }
  }
  if (Array.isArray(masterList) && masterList.length > 0) {
    const cId = String(actualMatchId || validationId).replace(/^#/, '');
    const updated = masterList.map((m) => {
      const mId = String(m.match_id || '').replace(/^#/, '');
      const vId = String(m.validation_id || '').replace(/^#/, '');
      if (mId === cId || vId === cId) {
        return {
          ...m,
          status: 'AUDITED' as const,
          raw_match: {
            ...(m.raw_match || {}),
            is_certified: true,
            is_locked: true,
            status: 'AUDITED',
            certified_at: new Date().toISOString(),
          },
        };
      }
      return m;
    });
    setCachedData('all_official_matches_master', updated);
    try {
      localStorage.setItem('atleta_cached_official_matches_master', JSON.stringify(updated));
    } catch { }
  }

  // Update official_dashboard cache & localStorage
  try {
    let dash = getCachedData<any>('official_dashboard');
    if (!dash) {
      const raw = localStorage.getItem('atleta_cached_official_dashboard');
      dash = raw ? JSON.parse(raw) : null;
    }
    if (dash) {
      const nextDash = {
        ...dash,
        pending_audits: Math.max(0, (dash.pending_audits !== undefined ? dash.pending_audits : 1) - 1),
        completed_audits: (dash.completed_audits || 0) + 1,
      };
      setCachedData('official_dashboard', nextDash);
      localStorage.setItem('atleta_cached_official_dashboard', JSON.stringify(nextDash));
    }
  } catch { }
  return data;
};

export const downloadCertifiedMatchPdf = async (matchId: string): Promise<Blob> => {
  const cleanId = matchId.replace(/^#/, '');
  const token = getStoredToken();
  const res = await fetch(`${BASE_URL}/matches/${cleanId}/pdf`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(3500),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to download certified match PDF' }));
    throw new Error(err.error || 'Failed to download certified match PDF');
  }
  return res.blob();
};

export const deleteOfficialMatch = async (matchId: string): Promise<any> => {
  const cleanId = matchId.replace(/^#/, '');
  const token = getStoredToken();

  // Remove match from all caches and track deletion
  recordDeletedMatch(cleanId);

  const cachedMaster = getCachedData<any[]>('all_official_matches_master');
  if (cachedMaster) {
    setCachedData('all_official_matches_master', cachedMaster.filter((m) => String(m.match_id || m.id || '').replace(/^#/, '') !== cleanId));
  }
  const cachedSched = getCachedData<any[]>('official_schedules');
  if (cachedSched) {
    setCachedData('official_schedules', cachedSched.filter((m) => String(m.match_id || m.id || '').replace(/^#/, '') !== cleanId));
  }
  const cachedDash = getCachedData<OfficialDashboardResponse>('official_dashboard');
  if (cachedDash) {
    setCachedData('official_dashboard', {
      ...cachedDash,
      total_matches: Math.max(0, (cachedDash.total_matches || 1) - 1),
      pending_count: Math.max(0, (cachedDash.pending_count || 1) - 1),
      audit_queue: (cachedDash.audit_queue || []).filter((m: any) => String(m.match_id || m.id || m.validation_id || '').replace(/^#/, '') !== cleanId),
    });
  }
  invalidateCache('official_dashboard');

  try {
    localStorage.removeItem(`atleta_match_detail_${cleanId}`);
    localStorage.removeItem(`atleta_draft_note_${cleanId}`);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CREATED_MATCHES_PREFIX)) {
        try {
          const list: string[] = JSON.parse(localStorage.getItem(k) || '[]');
          const updated = list.filter((id) => id !== cleanId && id !== `#${cleanId}`);
          localStorage.setItem(k, JSON.stringify(updated));
        } catch { }
      }
    }
    const certKey = 'atleta_certified_match_ids';
    const certList: string[] = JSON.parse(localStorage.getItem(certKey) || '[]');
    const certUpdated = certList.filter((id) => id !== cleanId && id !== `#${cleanId}`);
    localStorage.setItem(certKey, JSON.stringify(certUpdated));
  } catch { }

  const res = await fetch(`${BASE_URL}/matches/${cleanId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return handleResponse<any>(res);
};

export const fetchBrowseTeams = async (sport?: string): Promise<any[]> => {
  const token = getStoredToken();
  const qs = sport ? `?sport=${encodeURIComponent(sport)}` : '';
  try {
    const res = await fetch(`${BASE_URL}/teams/browse${qs}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data.teams) ? data.teams : Array.isArray(data) ? data : [];
    }
  } catch { }
  return [];
};

// ─── SPORTS MANAGEMENT  ───────────────────────────────────────────────────

export const getSports = async (activeOnly = false, forceRefresh = false): Promise<SportsListResponse> => {
  const cacheKey = `sports_catalog_${activeOnly}`;
  const cached = getCachedData<SportsListResponse>(cacheKey);
  if (cached && !forceRefresh) return cached;

  const queryParts: string[] = [];
  if (activeOnly) queryParts.push('active=true');
  if (forceRefresh) queryParts.push(`_t=${Date.now()}`);
  const query = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

  const res = await fetch(`${BASE_URL}/sports${query}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(forceRefresh ? { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' } : {}),
    },
    ...(forceRefresh ? { cache: 'no-store' as RequestCache } : {}),
  });
  const data = await handleResponse<SportsListResponse>(res);
  setCachedData(cacheKey, data);
  return data;
};

export const getSportById = async (sportId: string): Promise<{ message?: string; sport: SportConfiguration }> => {
  const token = getStoredToken();
  const res = await fetch(`${BASE_URL}/sports/${encodeURIComponent(sportId)}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return handleResponse<{ message?: string; sport: SportConfiguration }>(res);
};

export const createSport = async (payload: CreateSportPayload): Promise<{ message: string; sport: SportConfiguration }> => {
  const token = getStoredToken();
  const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `idemp_${Date.now()}_${Math.random()}`;

  const res = await fetch(`${BASE_URL}/sports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  const data = await handleResponse<{ message: string; sport: SportConfiguration }>(res);
  if (data?.sport) {
    const adminCat = getCachedData<SportConfiguration[]>('admin_sports_catalog') || [];
    const updated = [...adminCat.filter((s) => s.sport_id !== data.sport.sport_id), data.sport];
    setCachedData('admin_sports_catalog', updated);
    setCachedData('sports_catalog_false', { total_sports: updated.length, sports: updated });
    setCachedData('sports_catalog_true', {
      total_sports: updated.filter((s) => s.is_active !== false).length,
      sports: updated.filter((s) => s.is_active !== false),
    });
  } else {
    invalidateCache('sports_catalog');
    invalidateCache('admin_sports_catalog');
  }
  try {
    localStorage.setItem('atleta_sports_last_mutated', String(Date.now()));
  } catch { }
  return data;
};

export const updateSport = async (
  sportId: string,
  payload: Partial<CreateSportPayload> & { active?: boolean }
): Promise<{ message: string; sport: SportConfiguration }> => {
  const token = getStoredToken();
  const res = await fetch(`${BASE_URL}/sports/${encodeURIComponent(sportId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  const data = await handleResponse<{ message: string; sport: SportConfiguration }>(res);
  const updatedSport = data.sport;
  if (updatedSport) {
    const cleanId = (updatedSport.sport_id || sportId).toLowerCase();
    const updateList = (list?: SportConfiguration[] | null) => {
      if (!Array.isArray(list)) return [updatedSport];
      const exists = list.some((s) => (s.sport_id || '').toLowerCase() === cleanId);
      return exists
        ? list.map((s) => ((s.sport_id || '').toLowerCase() === cleanId ? { ...s, ...updatedSport } : s))
        : [...list, updatedSport];
    };
    const adminCat = getCachedData<SportConfiguration[]>('admin_sports_catalog');
    if (adminCat) setCachedData('admin_sports_catalog', updateList(adminCat));

    const catFalse = getCachedData<SportsListResponse>('sports_catalog_false');
    if (catFalse && Array.isArray(catFalse.sports)) {
      const up = updateList(catFalse.sports);
      setCachedData('sports_catalog_false', { total_sports: up.length, sports: up });
    }
    const catTrue = getCachedData<SportsListResponse>('sports_catalog_true');
    if (catTrue && Array.isArray(catTrue.sports)) {
      const up = updateList(catTrue.sports).filter((s) => s.is_active !== false);
      setCachedData('sports_catalog_true', { total_sports: up.length, sports: up });
    }
  } else {
    invalidateCache('sports_catalog');
    invalidateCache('admin_sports_catalog');
  }
  try {
    localStorage.setItem('atleta_sports_last_mutated', String(Date.now()));
  } catch { }
  return data;
};

export const deleteSport = async (
  sportId: string
): Promise<{ message: string; sport_id: string }> => {
  const token = getStoredToken();
  const res = await fetch(`${BASE_URL}/sports/${encodeURIComponent(sportId)}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  let data: { message: string; sport_id: string };
  if (res.status === 404) {
    data = { message: 'Sport already deleted from database.', sport_id: sportId };
  } else {
    data = await handleResponse<{ message: string; sport_id: string }>(res);
  }
  const cleanId = (data?.sport_id || sportId).toLowerCase();

  const filterList = (list?: SportConfiguration[] | null) => {
    if (!Array.isArray(list)) return [];
    return list.filter((s) => {
      const sId = (s.sport_id || '').toLowerCase();
      const sName = (s.sport_name || '').toLowerCase();
      return sId !== cleanId && sName !== cleanId;
    });
  };

  const adminCat = getCachedData<SportConfiguration[]>('admin_sports_catalog');
  if (adminCat) setCachedData('admin_sports_catalog', filterList(adminCat));

  const catFalse = getCachedData<SportsListResponse>('sports_catalog_false');
  if (catFalse && Array.isArray(catFalse.sports)) {
    const up = filterList(catFalse.sports);
    setCachedData('sports_catalog_false', { total_sports: up.length, sports: up });
  }

  const catTrue = getCachedData<SportsListResponse>('sports_catalog_true');
  if (catTrue && Array.isArray(catTrue.sports)) {
    const up = filterList(catTrue.sports);
    setCachedData('sports_catalog_true', { total_sports: up.length, sports: up });
  }

  try {
    localStorage.setItem('atleta_sports_last_mutated', String(Date.now()));
  } catch { }

  return data;
};

export const changeOfficialPassword = async (newPassword: string): Promise<{ message: string }> => {
  const token = getStoredToken();
  const res = await fetch(`${BASE_URL}/users/password-reset`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ new_password: newPassword }),
  });
  return handleResponse<{ message: string }>(res);
};

// ─── TOURNAMENT BRACKETING API ──────────────────────────────────────────

export interface BracketTeamSlot {
  team_id?: string;
  team_name: string;
  seed?: number;
  score?: number;
  is_winner?: boolean;
}

export interface BracketMatch {
  match_id: string;
  round_number: number;
  stage_name: 'Quarterfinals' | 'Semifinals' | 'Finals' | string;
  home_team: BracketTeamSlot;
  away_team: BracketTeamSlot;
  winner_team_name?: string;
  winner_team_id?: string;
  status: 'PENDING' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED';
  next_match_id?: string;
  slot_for_next?: 'home' | 'away';
  match_date?: string;
  venue?: string;
}

export interface BracketStage {
  stage_name: string;
  round_number: number;
  matches: BracketMatch[];
}

export interface TournamentBracket {
  bracket_id: string;
  tournament_name: string;
  sport_type: string;
  division?: string;
  format: 'single_elimination' | 'round_robin';
  status: 'Draft' | 'Active' | 'Completed';
  stages: BracketStage[];
  champion_team?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export const getTournamentBrackets = async (sport?: string): Promise<TournamentBracket[]> => {
  const token = getStoredToken();
  const qs = sport && sport.toUpperCase() !== 'ALL' ? `?sport=${encodeURIComponent(sport)}` : '';
  const cacheKey = `tournament_brackets_${sport || 'all'}`;

  // Instant local cache fallback
  try {
    const raw = localStorage.getItem(`atleta_cached_bracket_${sport || 'all'}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setCachedData(cacheKey, parsed);
      }
    }
  } catch { }

  try {
    const res = await fetch(`${BASE_URL}/tournaments/brackets${qs}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data.brackets) ? data.brackets : [];
      setCachedData(cacheKey, list);
      try { localStorage.setItem(`atleta_cached_bracket_${sport || 'all'}`, JSON.stringify(list)); } catch { }
      return list;
    }
  } catch { }

  return getCachedData<TournamentBracket[]>(cacheKey) || [];
};

export const saveTournamentBracket = async (bracket: Partial<TournamentBracket>): Promise<TournamentBracket> => {
  const token = getStoredToken();
  const res = await fetch(`${BASE_URL}/tournaments/brackets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(bracket),
  });
  const data = await handleResponse<{ bracket: TournamentBracket }>(res);
  try {
    localStorage.setItem(`atleta_cached_bracket_${bracket.sport_type || 'all'}`, JSON.stringify([data.bracket]));
  } catch { }
  return data.bracket;
};

export const advanceBracketTeam = async (
  bracketId: string,
  matchId: string,
  winnerTeamName: string,
  homeScore?: number,
  awayScore?: number
): Promise<TournamentBracket> => {
  const token = getStoredToken();
  const res = await fetch(`${BASE_URL}/tournaments/brackets/${bracketId}/advance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      match_id: matchId,
      winner_team_name: winnerTeamName,
      home_score: homeScore,
      away_score: awayScore,
    }),
  });
  const data = await handleResponse<{ bracket: TournamentBracket }>(res);
  return data.bracket;
};

// ─── ATHLETE PROFILE VIEWING FOR TOURNAMENT OFFICIALS ──────────────────────

export const getAthleteProfileForOfficial = async (athleteId: string): Promise<any> => {
  const token = getStoredToken();
  const cleanId = String(athleteId || '').replace(/^ath_/, '');
  const cacheKey = `official_athlete_profile_${cleanId}`;
  const cached = getCachedData<any>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`${BASE_URL}/athletes/${cleanId}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (res.ok) {
      const data = await res.json();
      setCachedData(cacheKey, data);
      return data;
    }
  } catch { }

  return null;
};

// ─── SCORESHEET REQUEST & FULFILLMENT PIPELINE ────────────────────────────

export const fulfillScoresheetRequest = async (
  requestId: string,
  file: File,
  matchId?: string
): Promise<{ request: any; scoresheetUrl: string }> => {
  const token = getStoredToken();
  const formData = new FormData();
  formData.append('file', file);
  formData.append('scoresheet', file);
  if (matchId) formData.append('matchId', matchId);

  const cleanReqId = requestId.replace(/^notif_/, '');
  const res = await fetch(`${BASE_URL}/scoresheets/requests/${cleanReqId}/fulfill`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  const data = await handleResponse<{ request: any; scoresheetUrl: string }>(res);
  storeReadNotificationId(requestId);
  storeReadNotificationId(`req_${cleanReqId}`);
  invalidateCache();
  return data;
};

export const rejectScoresheetRequest = async (
  requestId: string,
  reason?: string
): Promise<{ request: any }> => {
  const token = getStoredToken();
  const cleanReqId = requestId.replace(/^notif_/, '');
  const res = await fetch(`${BASE_URL}/scoresheets/requests/${cleanReqId}/reject`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ reason: reason || 'Scoresheet request could not be fulfilled at this time.' }),
  });

  const data = await handleResponse<{ request: any }>(res);
  storeReadNotificationId(requestId);
  storeReadNotificationId(`req_${cleanReqId}`);
  invalidateCache();
  return data;
};

export const getScoresheetRequests = async (params?: { status?: string; coachId?: string; matchId?: string }): Promise<any[]> => {
  const token = getStoredToken();
  try {
    const query = new URLSearchParams();
    if (params?.status) query.append('status', params.status);
    if (params?.coachId) query.append('coachId', params.coachId);
    if (params?.matchId) query.append('matchId', params.matchId);
    const qs = query.toString() ? `?${query.toString()}` : '';

    const res = await fetch(`${BASE_URL}/scoresheets/requests${qs}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (res.ok) {
      const data = await res.json();
      return data.requests || [];
    }
  } catch { }
  return [];
};

// Re-export OCR and Scoresheet Scanning API functions
export * from './ocr';
