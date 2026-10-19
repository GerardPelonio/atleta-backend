import React, { useState } from 'react';
import {
  X,
  FileText,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import {
  approveCoachAccreditation,
  rejectCoachAccreditation,
} from '../../api/client';
import type { AdminCoachQueueItem } from '../../api/types';
import { styles } from './styles/CoachAdmission';

export interface CoachAdmissionProps {
  coach: AdminCoachQueueItem;
  onClose: () => void;
  onUpdate: (coachId: string, account_status: string, status: string) => void;
}

export const CoachAdmission: React.FC<CoachAdmissionProps> = ({
  coach,
  onClose,
  onUpdate,
}) => {
  const [currentCoach, setCurrentCoach] = useState<AdminCoachQueueItem>(coach);
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

  const formatCoachId = (rawId?: string) => {
    if (!rawId) return '#C-00001';
    const clean = rawId.replace(/^coach_/, '');
    return `#C-${clean.length > 8 ? `${clean.slice(0, 5).toUpperCase()}-${clean.slice(-1).toUpperCase()}` : clean.toUpperCase()}`;
  };

  const isVerified =
    (currentCoach.account_status || '').toLowerCase() === 'active' ||
    (currentCoach.account_status || '').toLowerCase() === 'approved' ||
    (currentCoach.status || '').toUpperCase() === 'VERIFIED' ||
    (currentCoach.status || '').toUpperCase() === 'ACTIVE' ||
    (currentCoach.status || '').toUpperCase() === 'APPROVED';

  const handleApprove = async () => {
    try {
      setActionLoading(true);
      await approveCoachAccreditation(currentCoach.coach_id);
      setCurrentCoach((prev) => ({ ...prev, account_status: 'Active', status: 'VERIFIED' }));
      onUpdate(currentCoach.coach_id, 'Active', 'VERIFIED');
      setActionSuccess('Coach accreditation approved and verified successfully.');
      setTimeout(() => {
        setActionSuccess(null);
        onClose();
      }, 1400);
    } catch (e: any) {
      const msg = e?.message || 'Accreditation approval failed.';
      alert(msg);
      if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('does not exist')) {
        onUpdate(currentCoach.coach_id, '__DELETED__', '__DELETED__');
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
      await rejectCoachAccreditation(currentCoach.coach_id, rejectReason.trim());
      setCurrentCoach((prev) => ({ ...prev, account_status: 'Rejected', status: 'REJECTED' }));
      onUpdate(currentCoach.coach_id, 'Rejected', 'REJECTED');
      setActionSuccess('Coach accreditation application declined.');
      setTimeout(() => {
        setActionSuccess(null);
        onClose();
      }, 1400);
    } catch (e: any) {
      const msg = e?.message || 'Rejection failed.';
      alert(msg);
      if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('does not exist')) {
        onUpdate(currentCoach.coach_id, '__DELETED__', '__DELETED__');
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
            <ShieldCheck style={{ width: 22, height: 22, color: '#0B132B' }} />
            <h3 style={styles.modalTitle}>COACH REGISTRY & DOCUMENTS</h3>
          </div>
          <button type="button" onClick={onClose} style={styles.closeBtn} title="Close Audit">
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

        {/* Coach Bio Profile */}
        <div style={styles.coachBioGrid}>
          {[
            { label: 'UID REFERENCE', value: formatCoachId(currentCoach.coach_id) },
            { label: 'COACH NAME', value: currentCoach.full_name || 'Coach Applicant' },
            {
              label: 'INSTITUTIONAL AFFILIATION',
              value: currentCoach.institutional_affiliation || currentCoach.current_institution || 'Independent / Unassigned',
            },
            {
              label: 'SPORT & EXPERIENCE',
              value: `${currentCoach.sport_type || 'Basketball'} • ${currentCoach.years_of_experience || 0} Years Experience`,
            },
            {
              label: 'APPLICATION DATE',
              value: formatDate(currentCoach.date_uploaded || currentCoach.created_at),
            },
          ].map(({ label, value }) => (
            <div key={label} style={styles.bioItem}>
              <span style={styles.bioLabel}>{label}</span>
              <span style={styles.bioValue}>{value}</span>
            </div>
          ))}
          <div style={styles.bioItem}>
            <span style={styles.bioLabel}>LICENSE STATUS</span>
            <div>
              <span style={isVerified ? styles.verifiedBadge : styles.pendingReviewBadge}>
                {isVerified ? 'Professional License Validated' : 'PENDING_REVIEW'}
              </span>
            </div>
          </div>
        </div>

        {/* Verification Protocol Box */}
        <div
          style={{
            border: '1.5px solid #0B132B',
            borderRadius: '3px',
            padding: '14px 18px',
            backgroundColor: '#F8FAFC',
            marginBottom: '20px',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 900, color: '#0B132B', letterSpacing: '0.08em', marginBottom: '10px' }}>
            VERIFICATION PROTOCOL
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 700, color: '#0B132B', cursor: 'pointer' }}>
              <input type="checkbox" checked={isVerified} readOnly style={{ accentColor: '#0B132B' }} />
              <span>
                PROFESSIONAL LICENSE VALIDATED
                {(!currentCoach.professional_documents || currentCoach.professional_documents.length === 0) && (
                  <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 500, marginLeft: '6px' }}>
                    (Optional — None submitted upon sign-up)
                  </span>
                )}
              </span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 700, color: '#0B132B', cursor: 'pointer' }}>
              <input type="checkbox" checked={isVerified} readOnly style={{ accentColor: '#0B132B' }} />
              INSTITUTIONAL AFFILIATION CONFIRMED
            </label>
          </div>
        </div>

        {/* Documents Preview Grid */}
        <div>
          <div style={styles.docSectionTitle}>
            <FileText style={{ width: 16, height: 16 }} />
            <span>DOCUMENTS PREVIEW: UPLOADED CERTIFICATIONS & CREDENTIALS</span>
          </div>

          {currentCoach.professional_documents && currentCoach.professional_documents.length > 0 ? (
            <div style={styles.docList}>
              {currentCoach.professional_documents.map((doc, idx) => {
                const docName = typeof doc === 'string' ? doc.split('/').pop() || `CERT_${idx + 1}.PDF` : `CERT_${idx + 1}.PDF`;
                const isUrl = typeof doc === 'string' && (doc.startsWith('http://') || doc.startsWith('https://'));

                return (
                  <div key={idx} style={styles.docCard}>
                    <div style={styles.docInfo}>
                      <FileText style={{ width: 22, height: 22, color: '#0B132B' }} />
                      <div>
                        <div style={styles.docMeta}>FILE REF: {docName.toUpperCase()}</div>
                        <div style={styles.docName}>{docName}</div>
                      </div>
                    </div>
                    {isUrl ? (
                      <a href={doc} target="_blank" rel="noopener noreferrer" style={styles.docViewBtn}>
                        <span>VIEW FILE</span>
                        <ExternalLink style={{ width: 12, height: 12 }} />
                      </a>
                    ) : (
                      <span style={{ ...styles.docViewBtn, cursor: 'default' }}>
                        <ShieldCheck style={{ width: 13, height: 13, color: '#16A34A' }} />
                        <span>VALIDATED</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={styles.noDocBox}>
              No uploaded external certificate files attached to this application record.
            </div>
          )}
        </div>

        {/* Decision Actions */}
        {showRejectInput ? (
          <div style={{ marginTop: '16px', borderTop: '1.5px solid #CBD5E1', paddingTop: '16px' }}>
            <label style={{ fontSize: '11px', fontWeight: 800, color: '#DC2626', display: 'block', marginBottom: '6px' }}>
              REJECTION REASON (REQUIRED):
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="State the reason why this coach accreditation is being declined..."
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
                {actionLoading ? 'REJECTING...' : 'CONFIRM REJECTION'}
              </button>
            </div>
          </div>
        ) : (
          <div style={styles.modalActions}>
            {isVerified ? (
              <button type="button" onClick={onClose} style={styles.approveBtn}>
                CLOSE AUDIT
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => setShowRejectInput(true)}
                  style={styles.declineBtn}
                >
                  REJECT APPLICATION
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleApprove}
                  style={styles.approveBtn}
                >
                  {actionLoading ? 'APPROVING COACH ACCOUNT...' : 'APPROVE COACH ACCOUNT'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CoachAdmission;
