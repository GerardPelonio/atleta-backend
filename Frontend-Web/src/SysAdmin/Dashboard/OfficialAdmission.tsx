import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  AlertCircle,
  Award,
  Building,
} from 'lucide-react';
import {
  approveOfficialRegistration,
  rejectOfficialRegistration,
} from '../../api/client';
import type { AdminOfficialQueueItem } from '../../api/types';
import { styles } from './styles/CoachAdmission';

export interface OfficialAdmissionProps {
  official: AdminOfficialQueueItem;
  onClose: () => void;
  onUpdate: (officialId: string, status: string, isApproved: boolean) => void;
}

export const OfficialAdmission: React.FC<OfficialAdmissionProps> = ({
  official,
  onClose,
  onUpdate,
}) => {
  const [currentOfficial, setCurrentOfficial] = useState<AdminOfficialQueueItem>(official);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const formatDate = (raw: any): string => {
    try {
      const t = raw?._seconds ? raw._seconds * 1000 : raw;
      const d = new Date(t);
      if (!isNaN(d.getTime())) return d.toISOString().replace('T', ' ').slice(0, 16);
    } catch {}
    return new Date().toISOString().replace('T', ' ').slice(0, 16);
  };

  const formatOfficialId = (rawId?: string) => {
    if (!rawId) return '#OFF-00001';
    const clean = rawId.replace(/^off_|^official_/, '');
    return `#OFF-${clean.length > 8 ? `${clean.slice(0, 5).toUpperCase()}-${clean.slice(-1).toUpperCase()}` : clean.toUpperCase()}`;
  };

  const isApproved =
    currentOfficial.is_approved === true ||
    (currentOfficial.status || '').toLowerCase() === 'approved' ||
    (currentOfficial.account_status || '').toLowerCase() === 'approved' ||
    (currentOfficial.account_status || '').toLowerCase() === 'active';

  const isRejected =
    (currentOfficial.status || '').toLowerCase() === 'rejected' ||
    (currentOfficial.account_status || '').toLowerCase() === 'rejected';

  const handleApprove = async () => {
    try {
      setActionLoading(true);
      await approveOfficialRegistration(currentOfficial.official_id);
      setCurrentOfficial((prev) => ({
        ...prev,
        account_status: 'Active',
        status: 'Approved',
        is_approved: true,
      }));
      onUpdate(currentOfficial.official_id, 'Approved', true);
      setActionSuccess('Official sign-up approved. Access granted to official dashboard.');
      setTimeout(() => {
        setActionSuccess(null);
        onClose();
      }, 1400);
    } catch (e: any) {
      const msg = e?.message || 'Official approval failed.';
      alert(msg);
      if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('does not exist')) {
        onUpdate(currentOfficial.official_id, '__DELETED__', false);
        onClose();
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    try {
      setActionLoading(true);
      await rejectOfficialRegistration(currentOfficial.official_id, rejectReason.trim());
      setCurrentOfficial((prev) => ({
        ...prev,
        account_status: 'Rejected',
        status: 'Rejected',
        is_approved: false,
        rejection_reason: rejectReason.trim(),
      }));
      onUpdate(currentOfficial.official_id, 'Rejected', false);
      setActionSuccess('Official sign-up application declined.');
      setTimeout(() => {
        setActionSuccess(null);
        onClose();
      }, 1400);
    } catch (e: any) {
      const msg = e?.message || 'Rejection failed.';
      alert(msg);
      if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('does not exist')) {
        onUpdate(currentOfficial.official_id, '__DELETED__', false);
        onClose();
      }
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.modalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Award style={{ width: 22, height: 22, color: '#0B132B' }} />
            <h3 style={styles.modalTitle}>OFFICIAL SIGN-UP APPROVAL REVIEW</h3>
          </div>
          <button type="button" onClick={onClose} style={styles.closeBtn} title="Close Review">
            <X style={{ width: 20, height: 20 }} />
          </button>
        </div>

        {/* Success Alert Banner */}
        {actionSuccess && (
          <div style={styles.verifiedBanner}>
            <CheckCircle2 style={{ width: 18, height: 18 }} />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* Official Profile Grid */}
        <div style={styles.coachBioGrid}>
          {[
            { label: 'OFFICIAL UID', value: formatOfficialId(currentOfficial.official_id) },
            { label: 'FULL LEGAL NAME', value: currentOfficial.full_name || 'Tournament Official' },
            { label: 'EMAIL ADDRESS', value: currentOfficial.email || 'N/A' },
            {
              label: 'ORGANIZATION / AFFILIATION',
              value: currentOfficial.organization_name || currentOfficial.organization || 'Independent League',
            },
            {
              label: 'OFFICIAL LICENSE NUMBER',
              value: currentOfficial.official_license_number || 'N/A',
            },
            {
              label: 'REGISTRATION DATE',
              value: formatDate(currentOfficial.created_at),
            },
          ].map(({ label, value }) => (
            <div key={label} style={styles.bioItem}>
              <span style={styles.bioLabel}>{label}</span>
              <span style={styles.bioValue}>{value}</span>
            </div>
          ))}

          <div style={styles.bioItem}>
            <span style={styles.bioLabel}>APPROVAL STATUS</span>
            <div>
              <span
                style={
                  isApproved
                    ? styles.verifiedBadge
                    : isRejected
                    ? {
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 900,
                        borderRadius: '2px',
                        backgroundColor: '#FEF2F2',
                        color: '#DC2626',
                        border: '1px solid #FCA5A5',
                      }
                    : styles.pendingReviewBadge
                }
              >
                {isApproved ? 'APPROVED & AUTHORIZED' : isRejected ? 'APPLICATION DECLINED' : 'PENDING ADMIN APPROVAL'}
              </span>
            </div>
          </div>
        </div>

        {/* Assigned Tournaments Section */}
        <div
          style={{
            border: '1.5px solid #0B132B',
            borderRadius: '3px',
            padding: '14px 18px',
            backgroundColor: '#F8FAFC',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Building style={{ width: 16, height: 16, color: '#0B132B' }} />
            <div style={{ fontSize: '11px', fontWeight: 900, color: '#0B132B', letterSpacing: '0.08em' }}>
              ASSIGNED TOURNAMENTS & ACCREDITATIONS
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {Array.isArray(currentOfficial.assigned_tournaments) && currentOfficial.assigned_tournaments.length > 0 ? (
              currentOfficial.assigned_tournaments.map((t, i) => (
                <span
                  key={i}
                  style={{
                    backgroundColor: '#0B132B',
                    color: '#FFFFFF',
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '2px',
                  }}
                >
                  {t}
                </span>
              ))
            ) : (
              <span style={{ fontSize: '12px', color: '#64748B', fontStyle: 'italic' }}>
                {currentOfficial.organization_name || 'All Standard Sanctioned Tournaments'}
              </span>
            )}
          </div>
        </div>

        {/* Previous Rejection Notice if applicable */}
        {isRejected && currentOfficial.rejection_reason && (
          <div
            style={{
              padding: '12px 14px',
              backgroundColor: '#FEF2F2',
              border: '1px solid #F87171',
              borderRadius: '2px',
              marginBottom: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#DC2626', fontWeight: 800, fontSize: '12px', marginBottom: '4px' }}>
              <AlertCircle style={{ width: 16, height: 16 }} />
              DECLINE REASON RECORDED
            </div>
            <div style={{ fontSize: '12px', color: '#991B1B' }}>
              {currentOfficial.rejection_reason}
            </div>
          </div>
        )}

        {/* Decision Actions */}
        {showRejectInput ? (
          <div style={{ marginTop: '16px', borderTop: '1.5px solid #CBD5E1', paddingTop: '16px' }}>
            <label style={{ fontSize: '11px', fontWeight: 800, color: '#DC2626', display: 'block', marginBottom: '6px' }}>
              DECLINE REASON (REQUIRED):
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="State the reason why this official application is being declined..."
              rows={3}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1.5px solid #CBD5E1',
                borderRadius: '2px',
                fontSize: '12px',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button
                type="button"
                onClick={() => setShowRejectInput(false)}
                style={{ ...styles.declineBtn, color: '#0B132B', borderColor: '#0B132B' }}
              >
                CANCEL
              </button>
              <button
                type="button"
                disabled={actionLoading || !rejectReason.trim()}
                onClick={handleReject}
                style={{ ...styles.declineBtn, backgroundColor: '#DC2626', color: '#FFFFFF' }}
              >
                {actionLoading ? 'DECLINING...' : 'CONFIRM DECLINE'}
              </button>
            </div>
          </div>
        ) : (
          <div style={styles.modalActions}>
            {isApproved ? (
              <button type="button" onClick={onClose} style={styles.approveBtn}>
                CLOSE REVIEW
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => setShowRejectInput(true)}
                  style={styles.declineBtn}
                >
                  DECLINE APPLICATION
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleApprove}
                  style={styles.approveBtn}
                >
                  {actionLoading ? 'APPROVING OFFICIAL...' : 'ACCEPT / APPROVE OFFICIAL'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default OfficialAdmission;
