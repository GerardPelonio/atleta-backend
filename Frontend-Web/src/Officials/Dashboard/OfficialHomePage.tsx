import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ExternalLink, Loader2 } from 'lucide-react';
import {
  getStoredToken,
  getStoredUser,
  getCachedData,
  getMe,
  getOfficialDashboard,
  getAllOfficialMatchesMaster,
  getOfficialSettings,
  prefetchMatchAuditDetail,
  isMatchCreatedByOfficial,
  isMatchLocallyCertified,
  isMatchDeleted,
  getSports,
  getScoresheetRequests,
} from '../../api/client';
import type { AuthUser, OfficialDashboardResponse, MatchSummaryItem } from '../../api/types';
import { Navbar } from '../Components/Navbar';
import { Sidebar } from '../Components/Sidebar';
import { styles } from './styles/OfficialHomePage';

export const OfficialHomePage: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(
    () => getCachedData<AuthUser>('user_me') || getStoredUser()
  );
  const [dashboard, setDashboard] = useState<OfficialDashboardResponse | null>(() => {
    const mem = getCachedData<OfficialDashboardResponse>('official_dashboard');
    if (mem) return mem;
    try {
      const raw = localStorage.getItem('atleta_cached_official_dashboard');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [masterMatches, setMasterMatches] = useState<MatchSummaryItem[]>(() => {
    const mem = getCachedData<MatchSummaryItem[]>('all_official_matches_master');
    if (mem && mem.length > 0) return mem;
    try {
      const raw = localStorage.getItem('atleta_cached_official_matches_master');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(() => {
    return !getCachedData('official_dashboard') && !localStorage.getItem('atleta_cached_official_dashboard');
  });
  const [dataReady, setDataReady] = useState<boolean>(() => {
    const memDash = getCachedData<OfficialDashboardResponse>('official_dashboard');
    const memMatches = getCachedData<MatchSummaryItem[]>('all_official_matches_master');
    if (memDash || (memMatches && memMatches.length > 0)) return true;
    try {
      const rawMatches = localStorage.getItem('atleta_cached_official_matches_master');
      if (rawMatches && JSON.parse(rawMatches).length > 0) return true;
    } catch { }
    return false;
  });
  const [acceptedRequests, setAcceptedRequests] = useState<Array<{ id: string; coachName: string; timestamp: number }>>(() => {
    try {
      const raw = localStorage.getItem('atleta_accepted_scoresheet_requests');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const refreshDashboard = () => {
    getOfficialDashboard(true).then((res) => {
      if (res) {
        setDashboard(res);
        try { localStorage.setItem('atleta_cached_official_dashboard', JSON.stringify(res)); } catch { }
        setDataReady(true);
      }
    }).catch(() => { });
    getAllOfficialMatchesMaster(true).then((res) => {
      const incoming = Array.isArray(res) ? res.filter((m) => !isMatchDeleted(m.match_id)) : [];
      setMasterMatches(incoming);
      try { localStorage.setItem('atleta_cached_official_matches_master', JSON.stringify(incoming)); } catch { }
      setDataReady(true);
    }).catch(() => { });
  };

  useEffect(() => {
    if (!getStoredToken()) {
      navigate('/login');
      return;
    }

    // Redirect admin users to their own standalone dashboard
    const stored = getStoredUser();
    const storedRole = String(stored?.role || '').toLowerCase().replace(/[\s_-]+/g, '');
    if (storedRole.includes('admin')) {
      navigate('/dashboard-admin', { replace: true });
      return;
    }

    // 1. Load Matches progressively and cache
    getOfficialDashboard(true).then((res) => {
      if (res && (res.total_matches > 0 || (res.audit_queue && res.audit_queue.length > 0))) {
        setDashboard(res);
        try { localStorage.setItem('atleta_cached_official_dashboard', JSON.stringify(res)); } catch { }
        setDataReady(true);
      }
    }).catch(() => { });

    getAllOfficialMatchesMaster(true).then((res) => {
      const incoming = Array.isArray(res) ? res.filter((m) => !isMatchDeleted(m.match_id)) : [];
      if (incoming.length > 0) {
        setMasterMatches(incoming);
        try { localStorage.setItem('atleta_cached_official_matches_master', JSON.stringify(incoming)); } catch { }
      }
      setLoading(false);
      setDataReady(true);
    }).catch(() => {
      setLoading(false);
      setDataReady(true);
    });

    getMe().then((res) => {
      if (res) {
        setUser(res);
        const meRole = String(res.role || '').toLowerCase().replace(/[\s_-]+/g, '');
        if (meRole.includes('admin')) {
          navigate('/dashboard-admin', { replace: true });
        }
      }
    }).catch(() => { });

    getOfficialSettings().catch(() => { });
    getSports().catch(() => { });

    getScoresheetRequests({ status: 'fulfilled' }).then((reqs) => {
      if (Array.isArray(reqs)) {
        const items = reqs.map((r: any) => ({
          id: r.id || r.requestId,
          coachName: r.coachName || r.coach_name || 'Assigned Coach',
          timestamp: r.fulfilledAt ? new Date(r.fulfilledAt).getTime() : (r.updatedAt ? new Date(r.updatedAt).getTime() : Date.now()),
        }));
        setAcceptedRequests((prev) => {
          const map = new Map<string, { id: string; coachName: string; timestamp: number }>();
          items.forEach((it) => map.set(it.id, it));
          prev.forEach((it) => {
            if (!map.has(it.id)) map.set(it.id, it);
          });
          const merged = Array.from(map.values());
          try { localStorage.setItem('atleta_accepted_scoresheet_requests', JSON.stringify(merged)); } catch {}
          return merged;
        });
      }
    }).catch(() => {});
  }, [navigate]);

  useEffect(() => {
    const role = String(user?.role || '').toLowerCase().replace(/[\s_-]+/g, '');
    if (role.includes('admin')) {
      navigate('/dashboard-admin', { replace: true });
    }
  }, [user, navigate]);

  // Filter matches specifically created/assigned to current official
  const currentOfficialIds = useMemo(() => new Set(
    [
      user?.uid,
      user?.user_id,
      (user as any)?.official_id,
      user?.uid ? `off_${user.uid.replace(/^off_/, '')}` : null,
      user?.uid ? user.uid.replace(/^off_/, '') : null,
      user?.email,
    ].filter(Boolean) as string[]
  ), [user]);

  const officialMatches = useMemo(() => {
    const list: MatchSummaryItem[] = masterMatches.filter(
      (m) => !isMatchDeleted(m.match_id) && isMatchCreatedByOfficial(m, user)
    );
    const existingIds = new Set(list.map((m) => m.match_id.replace(/^#/, '')));

    (dashboard?.audit_queue || []).forEach((item: any, idx: number) => {
      const match = item.match_details || {};
      const rawId = String(match.match_id || item.match_id || `queue_${idx}`).replace(/^#/, '');
      if (isMatchDeleted(rawId)) return;
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

      const fakeSummary: MatchSummaryItem = {
        match_id: `#${rawId}`,
        validation_id: item.audit_id || rawId,
        match_name: customMatchName || fallbackName,
        matchName: customMatchName || fallbackName,
        match_class: customMatchName || fallbackName,
        sport: match.sport_type || 'Basketball',
        coaches: '',
        date_time: match.match_date || item.requested_at || new Date().toISOString(),
        status: 'PENDING',
        raw_match: { ...match, ...item },
      };

      const belongsToMe = isMatchCreatedByOfficial(fakeSummary, user);

      if (belongsToMe && !existingIds.has(rawId)) {
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

        list.push({
          ...fakeSummary,
          coaches: coach,
          status: isAudited ? 'AUDITED' : 'PENDING',
        });
        existingIds.add(rawId);
      }
    });

    // Ensure certified status is accurately reflected for all matches
    list.forEach((m) => {
      const cleanId = m.match_id.replace(/^#/, '');
      const valId = String(m.validation_id || '').replace(/^#/, '');
      const raw = m.raw_match || {};
      if (
        isMatchLocallyCertified(cleanId) ||
        (valId && isMatchLocallyCertified(valId)) ||
        raw.is_certified === true ||
        String(raw.is_certified) === 'true' ||
        raw.status === 'AUDITED' ||
        raw.status === 'OFFICIAL' ||
        (m.status as any) === 'OFFICIAL'
      ) {
        m.status = 'AUDITED';
        if (m.raw_match) m.raw_match.is_certified = true;
      }
    });

    // Sort descending by date/time (newest matches first)
    return list.sort((a, b) => {
      const getT = (m: MatchSummaryItem) => {
        const raw = m.raw_match || {};
        const val = raw.created_at || raw.timestamp || raw.requested_at || raw.match_date;
        return val ? new Date(val).getTime() : 0;
      };
      return getT(b) - getT(a);
    });
  }, [masterMatches, dashboard, user, currentOfficialIds]);

  // Show the last 3 new matches instead of 1 only
  const newMatchesList = useMemo(() => {
    return officialMatches.slice(0, 3);
  }, [officialMatches]);

  // Compute accurate Recent Activities sorted with the latest at the very 1st
  const recentActivities = useMemo(() => {
    interface ActivityEntry {
      id: string;
      description: React.ReactNode;
      timestamp: number;
      dateFormatted: string;
    }

    const formatActDate = (ts: number): string => {
      const now = Date.now();
      const validTs = (!ts || isNaN(ts) || ts <= 0) ? now : ts;
      const diffMs = Math.max(0, now - validTs);
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        return 'Recent';
      }
      if (diffDays === 1) {
        return '1 day ago';
      }
      return `${diffDays} days ago`;
    };

    const list: ActivityEntry[] = [];
    const seen = new Set<string>();

    // 1. Audit / Certified Match actions and Match creations for this official
    officialMatches.forEach((m) => {
      const cleanId = m.match_id.replace(/^#/, '');
      const raw = m.raw_match || {};
      const isAudited = m.status === 'AUDITED' || isMatchLocallyCertified(cleanId) || raw.is_certified;

      const certRaw = raw.certified_at || raw.updated_at || raw.created_at || raw.match_date || m.date_time;
      const certTs = certRaw ? new Date(certRaw).getTime() : 0;

      if (isAudited) {
        const id = `cert_${cleanId}`;
        if (!seen.has(id)) {
          seen.add(id);
          list.push({
            id,
            description: (
              <span>Official match <strong>#{cleanId}</strong> ({m.match_class}) certified</span>
            ),
            timestamp: certTs ? certTs + 1000 : Date.now(),
            dateFormatted: formatActDate(certTs || Date.now()),
          });
        }
      }

      // Match creation action
      const createRaw = raw.created_at || raw.timestamp || raw.requested_at || raw.match_date || m.date_time;
      const createTs = createRaw ? new Date(createRaw).getTime() : 0;
      const createId = `create_${cleanId}`;
      if (!seen.has(createId)) {
        seen.add(createId);
        list.push({
          id: createId,
          description: (
            <span>Match <strong>#{cleanId}</strong> created ({m.match_class} • {m.sport})</span>
          ),
          timestamp: createTs || Date.now(),
          dateFormatted: formatActDate(createTs || Date.now()),
        });
      }
    });

    // 2. Scoresheet Request Acceptance Tracking
    acceptedRequests.forEach((req) => {
      const reqKey = `req_accepted_${req.id}`;
      if (!seen.has(reqKey)) {
        seen.add(reqKey);
        list.push({
          id: reqKey,
          description: (
            <span>Scoresheet Request from <strong>{req.coachName || 'Coach'}</strong> is accepted</span>
          ),
          timestamp: req.timestamp || Date.now(),
          dateFormatted: formatActDate(req.timestamp || Date.now()),
        });
      }
    });

    // Sort strictly DESCENDING: latest at the very first
    return list.sort((a, b) => b.timestamp - a.timestamp);
  }, [officialMatches, acceptedRequests]);

  const totalMatches = officialMatches.length;
  const pendingCount = String(
    officialMatches.filter((i) => i.status === 'PENDING').length
  ).padStart(2, '0');
  const auditedCount = String(
    officialMatches.filter((i) => i.status === 'AUDITED').length
  ).padStart(2, '0');

  const isKpiLoading = (!dataReady && officialMatches.length === 0) || (loading && officialMatches.length === 0);

  const roleStr = String(user?.role || getStoredUser()?.role || '').toLowerCase().replace(/[\s_-]+/g, '');
  if (roleStr.includes('admin')) {
    return (
      <div style={{ display: 'flex', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }}>
        <Loader2 style={{ width: 32, height: 32, animation: 'spin 1s linear infinite', color: '#0B132B' }} />
      </div>
    );
  }

  return (
    <div style={styles.shell}>
      {/* Shared Navbar */}
      <Navbar user={user} />

      {/* Main Body */}
      <div style={styles.layoutBody}>
        {/* Shared Sidebar */}
        <Sidebar
          activeTab="DASHBOARD"
          onMatchCreated={refreshDashboard}
        />

        {/* Dashboard Content Area */}
        <main style={styles.contentArea}>
          <div style={styles.pageHeader}>
            <h1 style={styles.pageTitle}>OFFICIALS DASHBOARD</h1>
            <p style={styles.pageSubtitle}>MANAGE YOUR GAMES, MATCH STATISTICS AND PERFORMANCE METRICS !</p>
          </div>

          {/* Metric Summary KPI Cards */}
          <div style={styles.kpiGrid}>
            <div style={styles.kpiBox}>
              <span style={{ ...styles.kpiLabel, color: '#94A3B8' }}>TOTAL MATCHES</span>
              <h2 style={styles.kpiValue}>
                {isKpiLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', height: '38px' }}>
                    <Loader2 style={{ width: 24, height: 24, animation: 'spin 1s linear infinite', color: '#0B132B' }} />
                  </div>
                ) : (
                  totalMatches
                )}
              </h2>
            </div>
            <div style={styles.kpiBox}>
              <span style={{ ...styles.kpiLabel, color: '#D97706' }}>PENDING VERIFICATION</span>
              <h2 style={styles.kpiValue}>
                {isKpiLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', height: '38px' }}>
                    <Loader2 style={{ width: 24, height: 24, animation: 'spin 1s linear infinite', color: '#D97706' }} />
                  </div>
                ) : (
                  pendingCount
                )}
              </h2>
            </div>
            <div style={styles.kpiBox}>
              <span style={{ ...styles.kpiLabel, color: '#059669' }}>AUDITED COMPLETED</span>
              <h2 style={styles.kpiValue}>
                {isKpiLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', height: '38px' }}>
                    <Loader2 style={{ width: 24, height: 24, animation: 'spin 1s linear infinite', color: '#059669' }} />
                  </div>
                ) : (
                  auditedCount
                )}
              </h2>
            </div>
          </div>

          {/* New Matches Table Section */}
          <div style={styles.sectionHeaderRow}>
            <h3 style={styles.sectionHeading}>NEW MATCHES</h3>
            <Link
              to="/matches"
              className="hover-view-all"
              style={styles.viewAllLink}
            >
              VIEW ALL <ExternalLink style={{ width: 12, height: 12 }} />
            </Link>
          </div>

          <div style={styles.tableFrame}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>MATCH ID</th>
                  <th style={styles.th}>MATCH NAME</th>
                  <th style={styles.th}>SPORT</th>
                  <th style={styles.th}>COACH</th>
                  <th style={{ ...styles.th, borderRight: 'none' }}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {isKpiLoading && newMatchesList.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ ...styles.td, textAlign: 'center', padding: '32px' }}>
                      <Loader2 style={{ width: 24, height: 24, animation: 'spin 1s linear infinite', margin: '0 auto', color: '#0B132B' }} />
                    </td>
                  </tr>
                ) : newMatchesList.length > 0 ? (
                  newMatchesList.map((item, idx) => {
                    const lookupId = item.raw_match?.match_id || item.validation_id || item.match_id.replace(/^#/, '');
                    const isAudited = item.status === 'AUDITED' || isMatchLocallyCertified(lookupId);

                    return (
                      <tr
                        key={item.match_id || idx}
                        className="hover-match-row"
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={() => prefetchMatchAuditDetail(lookupId)}
                        onClick={() => navigate(`/matches/${lookupId}`)}
                      >
                        <td style={{ ...styles.td, ...styles.tdMatchId }}>{item.match_id}</td>
                        <td style={styles.td}>
                          {item.matchName || item.gameReferenceId || item.raw_match?.matchName || item.raw_match?.gameReferenceId || item.raw_match?.game_name || item.raw_match?.gameName || item.match_name || "Unnamed Match"}
                        </td>
                        <td style={styles.td}>{item.sport}</td>
                        <td style={styles.td}>{item.coaches || 'Assigned Coach'}</td>
                        <td style={{ ...styles.td, borderRight: 'none' }}>
                          <span style={isAudited ? styles.statusAudited : styles.statusPending}>
                            {isAudited ? 'AUDITED' : 'PENDING'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} style={{ ...styles.td, textAlign: 'center', color: '#94A3B8', padding: '32px' }}>
                      No new match verification requests at this time.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Recent Activity Section */}
          <div style={styles.recentActivityCard}>
            <div style={styles.activityHead}>RECENT ACTIVITY</div>
            <div style={styles.activityBody}>
              {isKpiLoading && recentActivities.length === 0 ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
                  <Loader2 style={{ width: 22, height: 22, animation: 'spin 1s linear infinite', color: '#0B132B' }} />
                </div>
              ) : recentActivities.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {recentActivities.slice(0, 6).map((act, i) => (
                    <div
                      key={act.id || i}
                      style={{
                        fontSize: '12px',
                        color: '#334155',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingBottom: '8px',
                        borderBottom: i < Math.min(recentActivities.length, 6) - 1 ? '1px solid #F1F5F9' : 'none',
                      }}
                    >
                      <div>{act.description}</div>
                      <span style={{ color: '#94A3B8', whiteSpace: 'nowrap', marginLeft: '12px', fontSize: '11px', fontWeight: 600 }}>
                        {act.dateFormatted}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={styles.emptyNotice}>No recent official audit activity logged.</div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
