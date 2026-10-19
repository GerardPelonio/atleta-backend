import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Undo2,
  Plus,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ExternalLink,
  FileText,
} from 'lucide-react';
import {
  getStoredToken,
  getStoredUser,
  getCachedData,
  getMe,
  fulfillScoresheetRequest,
  rejectScoresheetRequest,
  getOfficialSchedules,
} from '../../api/client';
import type { AuthUser, OfficialNotificationItem, OfficialScheduleItem } from '../../api/types';
import { Navbar } from '../Components/Navbar';
import { Sidebar } from '../Components/Sidebar';
import { useNotifications } from './useNotifications';
import { styles } from './styles/NotificationPage';

export const NotificationPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'ALL' | 'AUDIT' | 'SCHEDULE'>('ALL');
  const [user, setUser] = useState<AuthUser | null>(
    () => getCachedData<AuthUser>('user_me') || getStoredUser()
  );

  const {
    notifications,
    loading,
    refresh,
    markAllRead,
    markSingleRead,
    dismissNotification,
    clearHistory,
  } = useNotifications();

  // File Upload & Request Action States
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [successNotifId, setSuccessNotifId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [rejectModalNotif, setRejectModalNotif] = useState<OfficialNotificationItem | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('Scoresheet request could not be fulfilled at this time.');
  const [uploadSuccessModal, setUploadSuccessModal] = useState<{ matchName: string; coachName: string } | null>(null);
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  useEffect(() => {
    if (!getStoredToken()) {
      navigate('/login');
      return;
    }
    getMe().then((res) => setUser(res)).catch(() => {});
  }, [navigate]);

  const [schedules, setSchedules] = useState<OfficialScheduleItem[]>(() =>
    getCachedData<OfficialScheduleItem[]>('official_schedules_all_all') || []
  );

  useEffect(() => {
    getOfficialSchedules().then((res) => {
      if (Array.isArray(res)) setSchedules(res);
    }).catch(() => {});
  }, []);

  const getDaysLeft = (targetDate?: string): number | null => {
    if (!targetDate) return null;
    const time = new Date(targetDate).getTime();
    if (isNaN(time)) return null;
    return Math.ceil((time - Date.now()) / (1000 * 60 * 60 * 24));
  };

  const formatEtcDateTime = (raw: string): string => {
    try {
      const d = new Date(raw);
      if (isNaN(d.getTime())) return raw || '';
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      const hours = String(d.getUTCHours()).padStart(2, '0');
      const mins = String(d.getUTCMinutes()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${mins} ETC`;
    } catch {
      return raw || '';
    }
  };

  const handleFileUpload = async (notif: OfficialNotificationItem, file: File) => {
    const notifId = notif.notification_id;
    const reqId = notif.request_id || notif.reference_id || notifId.replace(/^req_/, '');
    const matchId = notif.match_id || notif.reference_id || reqId;
    const coachName = notif.requested_by_coach || notif.coach_name || 'Assigned Coach';
    const matchName = notif.match_context || notif.match_name || 'Match';

    try {
      setUploadingId(notifId);
      setUploadError(null);
      setSuccessNotifId(notifId);
      markSingleRead(notifId);

      // Record accepted request into local storage activity tracking instantly
      try {
        const rawExisting = localStorage.getItem('atleta_accepted_scoresheet_requests');
        const existing = rawExisting ? JSON.parse(rawExisting) : [];
        const entry = { id: reqId, coachName, timestamp: Date.now() };
        const updated = [entry, ...existing.filter((e: any) => e.id !== reqId)];
        localStorage.setItem('atleta_accepted_scoresheet_requests', JSON.stringify(updated));
      } catch {}

      // Instant UI interruption for successful scoresheet attachment
      setUploadSuccessModal({ matchName, coachName });

      // Background fulfillment
      fulfillScoresheetRequest(reqId, file, matchId)
        .then(() => refresh())
        .catch((err: any) => {
          console.error('Scoresheet background fulfillment error:', err);
        });
    } catch (err: any) {
      console.error('Scoresheet fulfillment failed:', err);
      setUploadError(err?.message || 'Failed to upload and share scoresheet.');
    } finally {
      setUploadingId(null);
    }
  };

  const confirmReject = async () => {
    if (!rejectModalNotif) return;
    const notif = rejectModalNotif;
    const notifId = notif.notification_id;
    const reqId = notif.request_id || notif.reference_id || notifId.replace(/^req_/, '');

    try {
      setRejectingId(notifId);
      setUploadError(null);

      // Instantly remove notification and persist removal across refresh
      dismissNotification(notifId);
      setRejectModalNotif(null);

      await rejectScoresheetRequest(reqId, rejectReason);
    } catch (err: any) {
      console.error('Scoresheet rejection failed:', err);
      setUploadError(err?.message || 'Failed to reject scoresheet request.');
    } finally {
      setRejectingId(null);
    }
  };

  const filteredNotifications = [...notifications]
    .sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeB - timeA;
    })
    .filter((n) => {
      const isAudit =
        n.type === 'AUDIT_REQUEST' ||
        n.type === 'SCORESHEET_REQUEST' ||
        n.title.toLowerCase().includes('audit') ||
        n.title.toLowerCase().includes('scoresheet') ||
        n.title.toLowerCase().includes('stats');
      if (activeTab === 'AUDIT') return isAudit;
      if (activeTab === 'SCHEDULE') return !isAudit;
      return true;
    });

  return (
    <div style={styles.shell}>
      {/* Shared Navbar */}
      <Navbar user={user} />

      {/* Main Body */}
      <div style={styles.layoutBody}>
        {/* Shared Sidebar */}
        <Sidebar activeTab="DASHBOARD" />

        {/* Content Area */}
        <main style={styles.contentArea}>
          {/* Header Row */}
          <div style={styles.headerRow}>
            <div style={styles.titleGroup}>
              <h1 style={styles.pageTitle}>NOTIFICATION CENTER</h1>
              <p style={styles.pageSubtitle}>
                Comprehensive notification for audit requests, and match timeline updates.
              </p>
            </div>

            <button
              type="button"
              onClick={() => navigate(-1)}
              className="hover-btn-outline"
              style={styles.goBackBtn}
            >
              <span>Go Back</span>
              <Undo2 style={{ width: 16, height: 16 }} />
            </button>
          </div>

          {uploadError && (
            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid #EF4444',
                borderRadius: '4px',
                padding: '12px 16px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                color: '#EF4444',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              <AlertCircle style={{ width: 18, height: 18, flexShrink: 0 }} />
              <span>{uploadError}</span>
            </div>
          )}

          {/* Filter Bar & Action Buttons */}
          <div style={styles.filterBar}>
            <div style={styles.tabList}>
              <button
                type="button"
                onClick={() => setActiveTab('ALL')}
                style={{
                  ...styles.tabBtn,
                  ...(activeTab === 'ALL' ? styles.tabBtnActive : {}),
                }}
              >
                ALL LOGS ({notifications.length})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('AUDIT')}
                style={{
                  ...styles.tabBtn,
                  ...(activeTab === 'AUDIT' ? styles.tabBtnActive : {}),
                }}
              >
                AUDIT REQUESTS
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('SCHEDULE')}
                style={{
                  ...styles.tabBtn,
                  ...(activeTab === 'SCHEDULE' ? styles.tabBtnActive : {}),
                }}
              >
                SCHEDULE UPDATES
              </button>
            </div>

            <div style={styles.actionBtnGroup}>
              <button
                type="button"
                onClick={clearHistory}
                style={styles.darkActionBtn}
                className="hover-btn-solid"
              >
                CLEAR HISTORY
              </button>
              <button
                type="button"
                onClick={markAllRead}
                style={styles.darkActionBtn}
                className="hover-btn-solid"
              >
                MARK ALL AS READ
              </button>
            </div>
          </div>

          {/* Chronological Feed */}
          {loading && notifications.length === 0 ? (
            <div style={{ padding: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Loader2 style={{ width: 28, height: 28, animation: 'spin 1s linear infinite', color: '#0B132B' }} />
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div style={styles.emptyStateWrap}>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0B132B' }}>
                NO NOTIFICATION LOGS FOUND
              </h4>
              <p style={{ margin: 0, fontSize: '12px' }}>
                There are currently no active audit requests or match timeline logs for this filter.
              </p>
            </div>
          ) : (
            <div style={styles.feedList}>
              {filteredNotifications.map((notif) => {
                const isAudit =
                  notif.type === 'AUDIT_REQUEST' ||
                  notif.type === 'SCORESHEET_REQUEST' ||
                  notif.title.toLowerCase().includes('audit') ||
                  notif.title.toLowerCase().includes('scoresheet') ||
                  notif.title.toLowerCase().includes('stats');

                if (isAudit) {
                  const coachName = (notif.requested_by_coach || notif.coach_name || notif.requested_by || 'Coach').toUpperCase();
                  const matchContext = (notif.match_context || notif.match_name || 'Official Match').toUpperCase();
                  const sportDiscipline = (notif.sport_discipline || notif.sport || 'Sports').toUpperCase();
                  const isUploadingThis = uploadingId === notif.notification_id;
                  const isRejectingThis = rejectingId === notif.notification_id;
                  const isFulfilled = notif.status === 'fulfilled' || notif.status === 'accepted' || Boolean(notif.scoresheet_url);
                  const isRejected = notif.status === 'rejected';

                  // Title formatting
                  let displayAuditTitle = notif.title.toUpperCase();
                  if (!displayAuditTitle.startsWith('AUDIT REQUEST')) {
                    displayAuditTitle = `AUDIT REQUEST: ${displayAuditTitle}`;
                  }

                  return (
                    <div
                      key={notif.notification_id}
                      style={{
                        ...styles.auditCard,
                        borderColor: isRejected ? '#EF4444' : (isFulfilled || successNotifId === notif.notification_id) ? '#10B981' : '#0B132B',
                      }}
                    >
                      {/* Top Line */}
                      <div style={styles.cardTopLine}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <h3 style={styles.auditCardTitle}>
                            {displayAuditTitle}
                          </h3>
                          {isFulfilled && (
                            <span
                              style={{
                                color: '#10B981',
                                fontSize: '11px',
                                fontWeight: 800,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                textTransform: 'uppercase',
                              }}
                            >
                              <CheckCircle2 style={{ width: 13, height: 13 }} />
                              ACCEPTED & SHARED
                            </span>
                          )}
                          {isRejected && (
                            <span
                              style={{
                                color: '#EF4444',
                                fontSize: '11px',
                                fontWeight: 800,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                textTransform: 'uppercase',
                              }}
                            >
                              <XCircle style={{ width: 13, height: 13 }} />
                              REJECTED
                            </span>
                          )}
                        </div>
                        <span style={styles.cardTimestamp}>
                          {formatEtcDateTime(notif.created_at)}
                        </span>
                      </div>

                      {/* 3-Column Metadata Row with Vertical Dividers */}
                      <div style={styles.auditMetaRow}>
                        <div style={styles.auditMetaCol}>
                          <span style={styles.auditMetaLabel}>REQUESTED BY</span>
                          <span style={styles.auditMetaVal}>{coachName}</span>
                        </div>

                        <div style={styles.auditMetaDivider} />

                        <div style={styles.auditMetaCol}>
                          <span style={styles.auditMetaLabel}>MATCH CONTEXT</span>
                          <span style={styles.auditMetaVal}>{matchContext}</span>
                        </div>

                        <div style={styles.auditMetaDivider} />

                        <div style={styles.auditMetaCol}>
                          <span style={styles.auditMetaLabel}>SPORT DISCIPLINE</span>
                          <span style={styles.auditMetaVal}>{sportDiscipline}</span>
                        </div>
                      </div>

                      {/* Hidden File Input for Direct Scoresheet Upload */}
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        style={{ display: 'none' }}
                        ref={(el) => {
                          fileInputRefs.current[notif.notification_id] = el;
                        }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleFileUpload(notif, file);
                          }
                          e.target.value = '';
                        }}
                      />

                      {/* Actions Row */}
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {!isRejected && (
                          <button
                            type="button"
                            disabled={isUploadingThis || isRejectingThis}
                            onClick={() => {
                              fileInputRefs.current[notif.notification_id]?.click();
                            }}
                            style={styles.reviewBtn}
                            className="hover-btn-outline"
                          >
                            {isUploadingThis ? (
                              <>
                                <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
                                <span>UPLOADING & ATTACHING...</span>
                              </>
                            ) : isFulfilled ? (
                              <>
                                <CheckCircle2 style={{ width: 14, height: 14, color: '#10B981' }} />
                                <span>RE-ATTACH SCORESHEET</span>
                                <Plus style={{ width: 14, height: 14, strokeWidth: 3 }} />
                              </>
                            ) : (
                              <>
                                <span>REVIEW & ATTACH SCORESHEET</span>
                                <Plus style={{ width: 14, height: 14, strokeWidth: 3 }} />
                              </>
                            )}
                          </button>
                        )}

                        {!isFulfilled && !isRejected && (
                          <button
                            type="button"
                            disabled={isUploadingThis || isRejectingThis}
                            onClick={() => {
                              setRejectModalNotif(notif);
                              setRejectReason('Scoresheet request could not be fulfilled at this time.');
                            }}
                            style={{
                              backgroundColor: '#FFFFFF',
                              border: '1.5px solid #EF4444',
                              color: '#DC2626',
                              borderRadius: '2px',
                              padding: '9px 16px',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              letterSpacing: '0.04em',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              textTransform: 'uppercase',
                              transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#DC2626';
                              e.currentTarget.style.color = '#FFFFFF';
                              e.currentTarget.style.borderColor = '#DC2626';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = '#FFFFFF';
                              e.currentTarget.style.color = '#DC2626';
                              e.currentTarget.style.borderColor = '#EF4444';
                            }}
                          >
                            {isRejectingThis ? (
                              <>
                                <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
                                <span>REJECTING...</span>
                              </>
                            ) : (
                              <>
                                <XCircle style={{ width: 14, height: 14 }} />
                                <span>REJECT REQUEST</span>
                              </>
                            )}
                          </button>
                        )}

                        {notif.scoresheet_url && (
                          <a
                            href={notif.scoresheet_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              color: '#10B981',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              textDecoration: 'none',
                              padding: '8px 12px',
                              border: '1px solid rgba(16, 185, 129, 0.4)',
                              borderRadius: '2px',
                              backgroundColor: 'rgba(16, 185, 129, 0.08)',
                            }}
                          >
                            <FileText style={{ width: 14, height: 14 }} />
                            <span>VIEW ATTACHED SCORESHEET</span>
                            <ExternalLink style={{ width: 12, height: 12 }} />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                }

                // Schedule Updates Card
                const cleanRef = String(notif.reference_id || notif.match_id || notif.notification_id || '').replace(/^#|^sched_|^reminder_|^rem_|^notif_/, '');
                const matchedSched = schedules.find((s) => {
                  const sId = String(s.match_id || s.schedule_id || '').replace(/^#|^sched_/, '');
                  return sId && (cleanRef.includes(sId) || sId.includes(cleanRef));
                });

                const targetDate = matchedSched?.scheduled_time || (matchedSched as any)?.match_date || matchedSched?.venue_logistics?.time || notif.scheduled_time || notif.match_date;
                const daysLeft = getDaysLeft(targetDate);
                const hasDaysLeft = daysLeft !== null && daysLeft >= 1 && daysLeft <= 3;
                const matchName = matchedSched?.matchName || (matchedSched?.home_team && matchedSched?.away_team ? `${matchedSched.home_team} vs. ${matchedSched.away_team}` : notif.match_context || '');
                const venueLabel = matchedSched?.venue || matchedSched?.venue_logistics?.location || 'Assigned Venue';

                let displaySchedTitle = notif.title.trim();
                let displaySchedDesc = notif.message.trim();

                if (hasDaysLeft) {
                  displaySchedTitle = `${daysLeft} DAY${daysLeft > 1 ? 'S' : ''} LEFT${matchName ? `: ${matchName.toUpperCase()}` : ''}`;
                  displaySchedDesc = `Match reminder: ${matchName || 'Your scheduled game'} has ${daysLeft} day${daysLeft > 1 ? 's' : ''} left before the match (${venueLabel}).`;
                } else if (!displaySchedTitle || displaySchedTitle.toLowerCase() === 'notification') {
                  displaySchedTitle = matchName ? `MATCH REMINDER: ${matchName.toUpperCase()}` : 'SCHEDULE UPDATE';
                  if (!displaySchedDesc || displaySchedDesc.toLowerCase() === 'notification') {
                    displaySchedDesc = matchName ? `Upcoming game scheduled for ${matchName} at ${venueLabel}.` : 'You have an upcoming match update.';
                  }
                }

                if (!displaySchedTitle.toUpperCase().startsWith('SCHEDULE UPDATES:')) {
                  displaySchedTitle = `SCHEDULE UPDATES: ${displaySchedTitle.toUpperCase()}`;
                }

                const isRead = Boolean(notif.is_read);

                return (
                  <div
                    key={notif.notification_id}
                    style={{
                      ...styles.scheduleCard,
                      ...(isRead ? {
                        backgroundColor: '#F8FAFC',
                        borderColor: '#CBD5E1',
                        opacity: 0.85,
                      } : {}),
                    }}
                  >
                    <div style={styles.scheduleTopRow}>
                      <h3 style={{
                        ...styles.scheduleHeaderTitle,
                        ...(isRead ? { color: '#64748B' } : {}),
                      }}>
                        <span style={{
                          ...styles.squareBullet,
                          ...(isRead ? { backgroundColor: '#94A3B8' } : {}),
                        }} />
                        <span>{displaySchedTitle}</span>
                        {isRead && (
                          <span style={{
                            fontSize: '9.5px',
                            fontWeight: 800,
                            letterSpacing: '0.05em',
                            color: '#64748B',
                            backgroundColor: '#E2E8F0',
                            padding: '2px 6px',
                            borderRadius: '2px',
                            marginLeft: '8px',
                          }}>
                            READ
                          </span>
                        )}
                      </h3>
                      <span style={styles.cardTimestamp}>
                        {formatEtcDateTime(notif.created_at)}
                      </span>
                    </div>

                    <p style={{
                      ...styles.scheduleDescription,
                      ...(isRead ? { color: '#64748B' } : {}),
                    }}>
                      {displaySchedDesc || notif.message || notif.title}
                    </p>

                    <div style={styles.scheduleActionsRow}>
                      <button
                        type="button"
                        onClick={() => {
                          if (!notif.is_read) markSingleRead(notif.notification_id);
                          navigate('/schedules');
                        }}
                        style={styles.viewDetailsLink}
                      >
                        VIEW DETAILS
                      </button>
                      {!isRead && (
                        <button
                          type="button"
                          onClick={() => markSingleRead(notif.notification_id)}
                          style={{
                            ...styles.viewDetailsLink,
                            color: '#64748B',
                          }}
                        >
                          MARK AS READ
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => dismissNotification(notif.notification_id)}
                        style={styles.dismissLink}
                      >
                        DISMISS
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* UI Interruption: Reject Request Modal */}
          {rejectModalNotif && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(11, 19, 43, 0.6)',
              backdropFilter: 'blur(3px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: '20px',
            }}>
              <div style={{
                backgroundColor: '#FFFFFF',
                border: '2px solid #EF4444',
                borderRadius: '4px',
                width: '100%',
                maxWidth: '460px',
                padding: '24px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#DC2626' }}>
                  <AlertCircle style={{ width: 22, height: 22, flexShrink: 0 }} />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    Reject Scoresheet Request?
                  </h3>
                </div>

                <p style={{ margin: 0, fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>
                  Are you sure you want to reject this request from <strong>{rejectModalNotif.requested_by_coach || rejectModalNotif.coach_name || 'the coach'}</strong> for <strong>{rejectModalNotif.match_context || rejectModalNotif.match_name || 'Match'}</strong>?
                  This will remove the request from your active notification queue.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Reason for Rejection:
                  </label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={2}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      border: '1px solid #CBD5E1',
                      borderRadius: '2px',
                      padding: '8px 10px',
                      fontSize: '12.5px',
                      fontFamily: 'inherit',
                      resize: 'none',
                      outline: 'none',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setRejectModalNotif(null)}
                    style={{
                      padding: '9px 16px',
                      backgroundColor: '#F1F5F9',
                      border: '1px solid #CBD5E1',
                      borderRadius: '2px',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      color: '#475569',
                      cursor: 'pointer',
                      textTransform: 'uppercase',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(rejectingId)}
                    onClick={confirmReject}
                    style={{
                      padding: '9px 16px',
                      backgroundColor: '#DC2626',
                      border: 'none',
                      borderRadius: '2px',
                      fontSize: '11.5px',
                      fontWeight: 800,
                      color: '#FFFFFF',
                      cursor: 'pointer',
                      textTransform: 'uppercase',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    {rejectingId ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> : null}
                    <span>Reject Request</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* UI Interruption: Upload Success Modal */}
          {uploadSuccessModal && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(11, 19, 43, 0.6)',
              backdropFilter: 'blur(3px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              padding: '20px',
            }}>
              <div style={{
                backgroundColor: '#FFFFFF',
                border: '2px solid #10B981',
                borderRadius: '4px',
                width: '100%',
                maxWidth: '440px',
                padding: '24px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                textAlign: 'center',
                alignItems: 'center',
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#10B981',
                }}>
                  <CheckCircle2 style={{ width: 28, height: 28 }} />
                </div>

                <div>
                  <h3 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: 800, color: '#0B132B', textTransform: 'uppercase' }}>
                    Scoresheet Attached Successfully!
                  </h3>
                  <p style={{ margin: 0, fontSize: '13px', color: '#64748B', lineHeight: 1.5 }}>
                    The official scoresheet for <strong>{uploadSuccessModal.matchName}</strong> has been uploaded and linked to <strong>{uploadSuccessModal.coachName}</strong>.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setUploadSuccessModal(null)}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    backgroundColor: '#0B132B',
                    border: 'none',
                    borderRadius: '2px',
                    fontSize: '12px',
                    fontWeight: 800,
                    color: '#FFFFFF',
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
