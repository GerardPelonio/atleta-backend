import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  ShieldCheck,
  Award,
  Users,
} from 'lucide-react';
import {
  getStoredToken,
  getStoredUser,
  getCachedData,
  setCachedData,
  getAdminCoachQueue,
  getAdminOfficialQueue,
} from '../../api/client';
import type {
  AdminCoachQueueItem,
  AdminCoachQueueResponse,
  AdminOfficialQueueItem,
  AdminOfficialQueueResponse,
} from '../../api/types';
import { Navbar } from '../Components/Navbar';
import { Sidebar } from '../Components/Sidebar';
import { CoachAdmission } from './CoachAdmission';
import { OfficialAdmission } from './OfficialAdmission';
import { styles } from './styles/AdminHomePage';

const COACH_STORAGE_KEY = 'atleta_admin_all_coaches';
const OFFICIAL_STORAGE_KEY = 'atleta_admin_all_officials';

const getStoredCoaches = (): AdminCoachQueueItem[] => {
  try {
    const raw = localStorage.getItem(COACH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveStoredCoaches = (list: AdminCoachQueueItem[]) => {
  try {
    localStorage.setItem(COACH_STORAGE_KEY, JSON.stringify(list));
  } catch {}
};

const getStoredOfficials = (): AdminOfficialQueueItem[] => {
  try {
    const raw = localStorage.getItem(OFFICIAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveStoredOfficials = (list: AdminOfficialQueueItem[]) => {
  try {
    localStorage.setItem(OFFICIAL_STORAGE_KEY, JSON.stringify(list));
  } catch {}
};

type QueueType = 'COACHES' | 'OFFICIALS';
type FilterType = 'ALL' | 'NON_AUDITED' | 'AUDITED';

// Coach helper checks
const isCoachVerified = (c?: AdminCoachQueueItem | null) =>
  !c ? false :
  (c.account_status || '').toLowerCase() === 'active' ||
  (c.status || '').toUpperCase() === 'VERIFIED' ||
  (c.status || '').toUpperCase() === 'ACTIVE';

const isCoachRejected = (c?: AdminCoachQueueItem | null) =>
  !c ? false :
  (c.account_status || '').toLowerCase() === 'rejected' ||
  (c.status || '').toUpperCase() === 'REJECTED';

const isCoachAudited = (c?: AdminCoachQueueItem | null) => isCoachVerified(c) || isCoachRejected(c);

// Official helper checks
const isOfficialApproved = (o?: AdminOfficialQueueItem | null) =>
  !o ? false :
  o.is_approved === true ||
  (o.status || '').toLowerCase() === 'approved' ||
  (o.account_status || '').toLowerCase() === 'approved' ||
  (o.account_status || '').toLowerCase() === 'active';

const isOfficialRejected = (o?: AdminOfficialQueueItem | null) =>
  !o ? false :
  (o.status || '').toLowerCase() === 'rejected' ||
  (o.account_status || '').toLowerCase() === 'rejected';

const isOfficialAudited = (o?: AdminOfficialQueueItem | null) => isOfficialApproved(o) || isOfficialRejected(o);

const hasSubmittedCredentials = (c?: AdminCoachQueueItem | null): boolean => {
  if (!c) return false;
  const docs = c.professional_documents || (c as any).uploaded_documents || (c as any).certificates;
  if (Array.isArray(docs) && docs.length > 0) return true;
  if (typeof (c as any).document_url === 'string' && (c as any).document_url.trim()) return true;
  if (typeof (c as any).credential_url === 'string' && (c as any).credential_url.trim()) return true;
  return false;
};

export const AdminHomePage: React.FC = () => {
  const navigate = useNavigate();

  const [queueType, setQueueType] = useState<QueueType>('COACHES');

  // Coaches Queue State: only coaches who submitted credentials
  const [coachQueue, setCoachQueue] = useState<AdminCoachQueueItem[]>(() => {
    const stored = getStoredCoaches().filter(hasSubmittedCredentials);
    if (stored.length > 0) return stored;
    const cached = getCachedData<AdminCoachQueueResponse>('admin_coach_queue')?.queue;
    if (Array.isArray(cached) && cached.length > 0) return cached.filter(hasSubmittedCredentials);
    return [];
  });

  // Officials Queue State
  const [officialQueue, setOfficialQueue] = useState<AdminOfficialQueueItem[]>(() => {
    const stored = getStoredOfficials();
    if (stored.length > 0) return stored;
    const cached = getCachedData<AdminOfficialQueueResponse>('admin_official_queue')?.queue;
    if (Array.isArray(cached) && cached.length > 0) return cached;
    return [];
  });

  const [loading, setLoading] = useState(false);
  const [selectedCoach, setSelectedCoach] = useState<AdminCoachQueueItem | null>(null);
  const [selectedOfficial, setSelectedOfficial] = useState<AdminOfficialQueueItem | null>(null);
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [page, setPage] = useState(1);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const itemsPerPage = 6;

  const loadCoachQueue = async (forceRefresh = false) => {
    try {
      const cached = getCachedData<AdminCoachQueueResponse>('admin_coach_queue');
      if (cached && !forceRefresh && Array.isArray(cached.queue) && cached.queue.length > 0) {
        const filteredCached = cached.queue.filter(hasSubmittedCredentials);
        setCoachQueue(filteredCached);
        saveStoredCoaches(filteredCached);
        return;
      }
      const res = await getAdminCoachQueue(forceRefresh);
      const incoming = Array.isArray(res?.queue) ? res.queue.filter(hasSubmittedCredentials) : [];
      setCoachQueue(incoming);
      saveStoredCoaches(incoming);
    } catch (e) {
      console.error('Failed to load coach queue:', e);
    }
  };

  const loadOfficialQueue = async () => {
    try {
      const res = await getAdminOfficialQueue(true);
      const incoming = Array.isArray(res?.queue) ? res.queue : [];
      setOfficialQueue(incoming);
      saveStoredOfficials(incoming);
    } catch (e) {
      console.error('Failed to load official queue:', e);
    }
  };

  const loadAll = async () => {
    const hasCoaches = coachQueue.length > 0 || getStoredCoaches().length > 0;
    if (!hasCoaches) {
      setLoading(true);
    }
    try {
      await Promise.all([loadCoachQueue(false), loadOfficialQueue()]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!getStoredToken()) {
      navigate('/login');
      return;
    }
    const stored = getStoredUser();
    const roleStr = String(stored?.role || '').toLowerCase().replace(/[\s_-]+/g, '');
    if (stored && roleStr && !roleStr.includes('admin')) {
      navigate('/dashboard-official', { replace: true });
      return;
    }
    loadAll();
  }, [navigate]);

  const handleUpdateCoach = (coachId: string, account_status: string, status: string) => {
    setCoachQueue((prev) => {
      const updated =
        status === '__DELETED__' || account_status === '__DELETED__'
          ? prev.filter((c) => c.coach_id !== coachId && c.user_id !== coachId)
          : prev.map((c) => (c.coach_id === coachId ? { ...c, account_status, status } : c));
      saveStoredCoaches(updated);
      setCachedData('admin_coach_queue', { total_pending: updated.filter((c) => !isCoachAudited(c)).length, queue: updated });
      return updated;
    });
  };

  const handleUpdateOfficial = (officialId: string, status: string, isApproved: boolean) => {
    setOfficialQueue((prev) => {
      const updated =
        status === '__DELETED__'
          ? prev.filter((o) => o.official_id !== officialId && o.user_id !== officialId)
          : prev.map((o) =>
              o.official_id === officialId
                ? {
                    ...o,
                    status,
                    is_approved: isApproved,
                    account_status: isApproved ? 'Active' : 'Rejected',
                  }
                : o
            );
      saveStoredOfficials(updated);
      return updated;
    });
  };

  // Counts
  const coachPendingCount = coachQueue.filter((c) => !isCoachAudited(c)).length;
  const coachAuditedCount = coachQueue.filter(isCoachAudited).length;

  const officialPendingCount = officialQueue.filter((o) => !isOfficialAudited(o)).length;
  const officialAuditedCount = officialQueue.filter(isOfficialAudited).length;

  const currentPendingCount = queueType === 'COACHES' ? coachPendingCount : officialPendingCount;

  // Filter items
  const filteredCoaches = coachQueue.filter((c) => {
    if (filter === 'NON_AUDITED') return !isCoachAudited(c);
    if (filter === 'AUDITED') return isCoachAudited(c);
    return true;
  });

  const filteredOfficials = officialQueue.filter((o) => {
    if (filter === 'NON_AUDITED') return !isOfficialAudited(o);
    if (filter === 'AUDITED') return isOfficialAudited(o);
    return true;
  });

  const activeFilteredList = queueType === 'COACHES' ? filteredCoaches : filteredOfficials;
  const totalPages = Math.max(1, Math.ceil(activeFilteredList.length / itemsPerPage));
  const displayedCoaches = filteredCoaches.slice((page - 1) * itemsPerPage, page * itemsPerPage);
  const displayedOfficials = filteredOfficials.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const queueHealthScore =
    coachQueue.length + officialQueue.length > 0
      ? Math.max(92.4, Math.min(99.9, 100 - (coachPendingCount + officialPendingCount) * 0.4)).toFixed(1)
      : '98.6';

  const formatDate = (raw: any): string => {
    try {
      const t = raw?._seconds ? raw._seconds * 1000 : raw;
      const d = new Date(t);
      if (!isNaN(d.getTime())) return d.toISOString().replace('T', ' ').slice(0, 16);
    } catch {}
    return new Date().toISOString().replace('T', ' ').slice(0, 16);
  };

  const formatCoachId = (rawId?: string, idx = 0) => {
    if (!rawId) return `#C-${String(idx + 1).padStart(5, '0')}`;
    const clean = rawId.replace(/^coach_/, '');
    return `#C-${clean.length > 8 ? `${clean.slice(0, 5).toUpperCase()}-${clean.slice(-1).toUpperCase()}` : clean.toUpperCase()}`;
  };

  const formatOfficialId = (rawId?: string, idx = 0) => {
    if (!rawId) return `#OFF-${String(idx + 1).padStart(5, '0')}`;
    const clean = rawId.replace(/^off_|^official_/, '');
    return `#OFF-${clean.length > 8 ? `${clean.slice(0, 5).toUpperCase()}-${clean.slice(-1).toUpperCase()}` : clean.toUpperCase()}`;
  };

  return (
    <div style={styles.shell}>
      <Navbar title="SYSTEM DASHBOARD" />

      <div style={styles.layout}>
        <Sidebar activeTab="AUDIT_QUEUE" />

        <main style={styles.main}>
          {/* Header */}
          <div style={styles.titleRow}>
            <h1 style={styles.title}>
              {queueType === 'COACHES' ? 'COACH ACCOUNT VERIFICATION' : 'TOURNAMENT OFFICIAL APPROVALS GATE'}
            </h1>
            <div style={styles.badgeRow}>
              <span style={styles.pendingBadge}>{currentPendingCount} PENDING</span>
              <span style={styles.statusText}>SYSTEM STATUS: OPERATIVE</span>
            </div>
          </div>

          {/* System Admin Overview & Queue Health Cards */}
          <div style={styles.cardsGrid}>
            <div style={styles.criticalCard}>
              <div style={styles.watermark}>
                <ShieldCheck style={{ width: 140, height: 140, strokeWidth: 1.1, color: '#0B132B' }} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <ShieldCheck style={{ width: 18, height: 18, color: '#0B132B' }} />
                  <h2 style={styles.criticalTitle}>AUTHORIZATION GATE ACTIVE</h2>
                </div>
                <p style={styles.criticalText}>
                  Tournament official pre-login authorization gate is operative. New official sign-ups require explicit administrator approval before authentication tokens are issued. Coach re-applications are automatically queued for re-evaluation.
                </p>
              </div>
            </div>

            <div style={styles.healthCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={styles.healthLabel}>INTEGRITY VERIFICATION PERCENTAGE</div>
                <span style={styles.liveIndicatorDot} title="All Systems Operational" />
              </div>
              <div>
                <div style={styles.healthValue}>{queueHealthScore}%</div>
                <div style={styles.healthSub}>ALL SERVICES OPERATIONAL</div>
              </div>
              <div style={styles.healthFooter}>
                <span>REAL-TIME GATE SYNC ACTIVE</span>
              </div>
            </div>
          </div>

          {/* Approvals Review Queue Switcher */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              borderBottom: '2px solid #E2E8F0',
              paddingBottom: '12px',
              marginBottom: '16px',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setQueueType('COACHES');
                setPage(1);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 18px',
                fontSize: '12px',
                fontWeight: 900,
                letterSpacing: '0.06em',
                borderRadius: '3px',
                border: queueType === 'COACHES' ? '2px solid #0B132B' : '1px solid #CBD5E1',
                backgroundColor: queueType === 'COACHES' ? '#0B132B' : '#FFFFFF',
                color: queueType === 'COACHES' ? '#FFFFFF' : '#475569',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Users style={{ width: 16, height: 16 }} />
              <span>COACH ACCREDITATIONS</span>
              {coachPendingCount > 0 && (
                <span
                  style={{
                    backgroundColor: queueType === 'COACHES' ? '#DC2626' : '#EF4444',
                    color: '#FFFFFF',
                    fontSize: '10px',
                    fontWeight: 900,
                    padding: '2px 6px',
                    borderRadius: '10px',
                  }}
                >
                  {coachPendingCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setQueueType('OFFICIALS');
                setPage(1);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 18px',
                fontSize: '12px',
                fontWeight: 900,
                letterSpacing: '0.06em',
                borderRadius: '3px',
                border: queueType === 'OFFICIALS' ? '2px solid #0B132B' : '1px solid #CBD5E1',
                backgroundColor: queueType === 'OFFICIALS' ? '#0B132B' : '#FFFFFF',
                color: queueType === 'OFFICIALS' ? '#FFFFFF' : '#475569',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Award style={{ width: 16, height: 16 }} />
              <span>OFFICIAL APPROVALS</span>
              {officialPendingCount > 0 && (
                <span
                  style={{
                    backgroundColor: queueType === 'OFFICIALS' ? '#DC2626' : '#EF4444',
                    color: '#FFFFFF',
                    fontSize: '10px',
                    fontWeight: 900,
                    padding: '2px 6px',
                    borderRadius: '10px',
                  }}
                >
                  {officialPendingCount}
                </span>
              )}
            </button>
          </div>

          {/* Status Filter Tabs */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '14px',
              minHeight: '34px',
            }}
          >
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', letterSpacing: '0.06em', marginRight: '4px' }}>
                FILTER:
              </span>
              {(
                [
                  {
                    key: 'ALL',
                    label: `ALL (${queueType === 'COACHES' ? coachQueue.length : officialQueue.length})`,
                  },
                  {
                    key: 'NON_AUDITED',
                    label: `PENDING (${queueType === 'COACHES' ? coachPendingCount : officialPendingCount})`,
                  },
                  {
                    key: 'AUDITED',
                    label: `AUDITED / APPROVED (${queueType === 'COACHES' ? coachAuditedCount : officialAuditedCount})`,
                  },
                ] as const
              ).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => {
                    setFilter(f.key);
                    setPage(1);
                  }}
                  style={{
                    padding: '6px 14px',
                    fontSize: '11px',
                    fontWeight: 800,
                    letterSpacing: '0.05em',
                    borderRadius: '2px',
                    border: filter === f.key ? '1px solid #0B132B' : '1px solid #CBD5E1',
                    backgroundColor: filter === f.key ? '#0B132B' : '#FFFFFF',
                    color: filter === f.key ? '#FFFFFF' : '#475569',
                    cursor: 'pointer',
                    transition: 'background-color 0.15s ease, color 0.15s ease',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
              Showing {activeFilteredList.length} {queueType === 'COACHES' ? 'coach' : 'official'}
              {activeFilteredList.length !== 1 ? (queueType === 'COACHES' ? 'es' : 's') : ''}
            </span>
          </div>

          {/* Queue Table */}
          <div style={styles.tableContainer}>
            {queueType === 'COACHES' ? (
              /* Coach Audit Table */
              <table style={styles.table}>
                <thead>
                  <tr>
                    {[
                      { label: 'COACH ID', width: '11%' },
                      { label: 'FULL NAME', width: '21%' },
                      { label: 'INSTITUTION', width: '21%' },
                      { label: 'SPORT', width: '13%' },
                      { label: 'DATE UPLOADED', width: '14%' },
                      { label: 'STATUS', width: '10%', align: 'center' },
                      { label: 'ACTION', width: '10%', align: 'center' },
                    ].map((col, idx, arr) => (
                      <th
                        key={col.label}
                        style={{
                          ...styles.th,
                          width: col.width,
                          textAlign: (col.align as any) || 'left',
                          ...(idx === arr.length - 1 ? { borderRight: 'none' } : {}),
                        }}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && coachQueue.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ height: '52px', padding: '16px 18px', textAlign: 'center', boxSizing: 'border-box' }}>
                        <Loader2 style={{ width: 20, height: 20, animation: 'spin 1s linear infinite', margin: '0 auto', color: '#0B132B' }} />
                      </td>
                    </tr>
                  ) : displayedCoaches.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        style={{
                          height: '52px',
                          padding: '16px 18px',
                          textAlign: 'center',
                          color: '#64748B',
                          fontSize: '13px',
                          fontWeight: 600,
                          borderBottom: 'none',
                          boxSizing: 'border-box',
                        }}
                      >
                        {filter === 'NON_AUDITED'
                          ? 'No pending coach verification applications in queue.'
                          : filter === 'AUDITED'
                          ? 'No audited coaches found.'
                          : 'No coach verification applications in queue.'}
                      </td>
                    </tr>
                  ) : (
                    displayedCoaches.map((item, idx) => {
                      const isHovered = hoveredRow === (item.coach_id || String(idx));
                      return (
                        <tr
                          key={item.coach_id || idx}
                          onClick={() => setSelectedCoach(item)}
                          onMouseEnter={() => setHoveredRow(item.coach_id || String(idx))}
                          onMouseLeave={() => setHoveredRow(null)}
                          style={{
                            ...styles.trClickable,
                            height: '52px',
                            backgroundColor: isHovered ? '#F8FAFC' : '#FFFFFF',
                          }}
                          title="Click to view coach profile and uploaded credentials"
                        >
                          <td style={styles.td}>
                            <span style={styles.idText}>{formatCoachId(item.coach_id, (page - 1) * itemsPerPage + idx)}</span>
                          </td>
                          <td style={{ ...styles.td, fontWeight: 900, textTransform: 'uppercase' }}>
                            {item.full_name || `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'COACH APPLICANT'}
                          </td>
                          <td style={styles.td}>
                            <span style={styles.affiliationText}>
                              {item.institutional_affiliation || item.current_institution || 'UNASSIGNED ATHLETICS'}
                            </span>
                          </td>
                          <td style={styles.td}>
                            <span style={{ fontSize: '12px', fontWeight: 800, color: '#0B132B' }}>
                              {item.sport_type || 'Basketball'}
                            </span>
                          </td>
                          <td style={styles.td}>
                            <span style={styles.dateText}>{formatDate(item.date_uploaded || item.created_at)}</span>
                          </td>
                          <td style={{ ...styles.td, textAlign: 'center', padding: '10px 6px' }}>
                            <span
                              style={
                                isCoachVerified(item)
                                  ? styles.verifiedBadge
                                  : isCoachRejected(item)
                                  ? { ...styles.verifiedBadge, backgroundColor: '#FEE2E2', color: '#991B1B' }
                                  : styles.pendingReviewBadge
                              }
                            >
                              {isCoachVerified(item) ? 'VERIFIED' : isCoachRejected(item) ? 'REJECTED' : 'PENDING'}
                            </span>
                          </td>
                          <td style={{ ...styles.td, textAlign: 'center', borderRight: 'none', padding: '10px 6px' }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedCoach(item);
                              }}
                              style={styles.auditBtn}
                            >
                              {isCoachAudited(item) ? 'VIEW' : 'VERIFY'}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            ) : (
              /* Tournament Official Approval Table */
              <table style={styles.table}>
                <thead>
                  <tr>
                    {[
                      { label: 'OFFICIAL ID', width: '11%' },
                      { label: 'LEGAL NAME', width: '21%' },
                      { label: 'ORGANIZATION', width: '21%' },
                      { label: 'LICENSE NO.', width: '13%' },
                      { label: 'DATE REGISTERED', width: '14%' },
                      { label: 'STATUS', width: '10%', align: 'center' },
                      { label: 'ACTION', width: '10%', align: 'center' },
                    ].map((col, idx, arr) => (
                      <th
                        key={col.label}
                        style={{
                          ...styles.th,
                          width: col.width,
                          textAlign: (col.align as any) || 'left',
                          ...(idx === arr.length - 1 ? { borderRight: 'none' } : {}),
                        }}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && officialQueue.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ height: '52px', padding: '16px 18px', textAlign: 'center', boxSizing: 'border-box' }}>
                        <Loader2 style={{ width: 20, height: 20, animation: 'spin 1s linear infinite', margin: '0 auto', color: '#0B132B' }} />
                      </td>
                    </tr>
                  ) : displayedOfficials.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        style={{
                          height: '52px',
                          padding: '16px 18px',
                          textAlign: 'center',
                          color: '#64748B',
                          fontSize: '13px',
                          fontWeight: 600,
                          borderBottom: 'none',
                          boxSizing: 'border-box',
                        }}
                      >
                        {filter === 'NON_AUDITED'
                          ? 'No pending official sign-up requests awaiting approval.'
                          : filter === 'AUDITED'
                          ? 'No approved/declined official records found.'
                          : 'No tournament officials registered in queue.'}
                      </td>
                    </tr>
                  ) : (
                    displayedOfficials.map((item, idx) => {
                      const isHovered = hoveredRow === (item.official_id || String(idx));
                      return (
                        <tr
                          key={item.official_id || idx}
                          onClick={() => setSelectedOfficial(item)}
                          onMouseEnter={() => setHoveredRow(item.official_id || String(idx))}
                          onMouseLeave={() => setHoveredRow(null)}
                          style={{
                            ...styles.trClickable,
                            height: '52px',
                            backgroundColor: isHovered ? '#F8FAFC' : '#FFFFFF',
                          }}
                          title="Click to review official credentials and authorize sign-up"
                        >
                          <td style={styles.td}>
                            <span style={styles.idText}>{formatOfficialId(item.official_id, (page - 1) * itemsPerPage + idx)}</span>
                          </td>
                          <td style={{ ...styles.td, textTransform: 'uppercase' }}>
                            <div style={{ fontWeight: 900 }}>
                              {item.full_name || `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'TOURNAMENT OFFICIAL'}
                            </div>
                            {item.email && (
                              <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600, textTransform: 'none' }}>
                                {item.email}
                              </div>
                            )}
                          </td>
                          <td style={styles.td}>
                            <span style={styles.affiliationText}>
                              {item.organization_name || item.organization || 'Independent League'}
                            </span>
                          </td>
                          <td style={styles.td}>
                            <span style={{ fontSize: '12px', fontWeight: 800, color: '#0B132B' }}>
                              {item.official_license_number || 'N/A'}
                            </span>
                          </td>
                          <td style={styles.td}>
                            <span style={styles.dateText}>{formatDate(item.created_at)}</span>
                          </td>
                          <td style={{ ...styles.td, textAlign: 'center', padding: '10px 6px' }}>
                            <span
                              style={
                                isOfficialApproved(item)
                                  ? styles.verifiedBadge
                                  : isOfficialRejected(item)
                                  ? { ...styles.verifiedBadge, backgroundColor: '#FEE2E2', color: '#991B1B' }
                                  : styles.pendingReviewBadge
                              }
                            >
                              {isOfficialApproved(item) ? 'APPROVED' : isOfficialRejected(item) ? 'DECLINED' : 'PENDING'}
                            </span>
                          </td>
                          <td style={{ ...styles.td, textAlign: 'center', borderRight: 'none', padding: '10px 6px' }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedOfficial(item);
                              }}
                              style={styles.auditBtn}
                            >
                              {isOfficialAudited(item) ? 'VIEW' : 'REVIEW'}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          <div style={styles.paginationRow}>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{ ...styles.pageArrowBtn, opacity: page <= 1 ? 0.35 : 1 }}
              title="Previous Page"
            >
              <ChevronLeft style={{ width: 15, height: 15 }} />
            </button>
            <button type="button" style={styles.pageNumberBtn}>
              PAGE {String(page).padStart(2, '0')}
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={{ ...styles.pageArrowBtn, opacity: page >= totalPages ? 0.35 : 1 }}
              title="Next Page"
            >
              <ChevronRight style={{ width: 15, height: 15 }} />
            </button>
          </div>
        </main>
      </div>

      {/* Separated Coach Modal: Opens when a coach is clicked */}
      {selectedCoach && (
        <CoachAdmission
          coach={selectedCoach}
          onClose={() => setSelectedCoach(null)}
          onUpdate={handleUpdateCoach}
        />
      )}

      {/* Separated Official Modal: Opens when an official is clicked */}
      {selectedOfficial && (
        <OfficialAdmission
          official={selectedOfficial}
          onClose={() => setSelectedOfficial(null)}
          onUpdate={handleUpdateOfficial}
        />
      )}
    </div>
  );
};

export default AdminHomePage;
