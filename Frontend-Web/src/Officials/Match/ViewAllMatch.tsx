import React, { useState, useEffect, useMemo, memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  getStoredUser,
  getAllOfficialMatchesMaster,
  getStoredOfficialMatches,
  getCachedData,
  prefetchMatchAuditDetail,
  isMatchCreatedByOfficial,
  getSports,
} from '../../api/client';
import type { MatchSummaryItem } from '../../api/types';
import { styles } from './styles/ViewAllMatch';

interface MatchRowProps {
  item: MatchSummaryItem;
  onClick: () => void;
  isLast?: boolean;
}

const MatchRow = memo(({ item, onClick, isLast }: MatchRowProps) => {
  const isPending = item.status === 'PENDING';

  return (
    <tr
      className="hover-match-row"
      style={{
        ...styles.tr,
        ...(isLast ? { borderBottom: 'none' } : {}),
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = '#F8FAFC';
        prefetchMatchAuditDetail(item.match_id);
      }}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
    >
      <td style={{ ...styles.td, ...styles.tdMatchId }}>{item.match_id}</td>
      <td style={{ ...styles.td, ...styles.tdMatchClass }}>
        {item.matchName || item.gameReferenceId || item.raw_match?.matchName || item.raw_match?.gameReferenceId || item.raw_match?.game_name || item.raw_match?.gameName || item.match_name || "Unnamed Match"}
      </td>
      <td style={{ ...styles.td, ...styles.tdSport }}>{item.sport}</td>
      <td style={{ ...styles.td, ...styles.tdCoaches }}>{item.coaches}</td>
      <td style={{ ...styles.td, ...styles.tdDateTime }}>{item.date_time}</td>
      <td style={{ ...styles.td, borderRight: 'none' }}>
        <span style={isPending ? styles.statusPending : styles.statusAudited}>
          {item.status}
        </span>
      </td>
    </tr>
  );
});

const normalizeSportKey = (name: string): string => (name || '').replace(/&/g, 'AND').replace(/\s+/g, ' ').trim().toUpperCase();

const buildNormalizedSportsList = (rawSports?: any[]): string[] => {
  const cached = rawSports || getCachedData<any>('sports_catalog_false')?.sports || getCachedData<any>('sports_catalog_true')?.sports || [];
  const list = Array.isArray(cached) ? cached : [];
  const seen = new Set<string>(['ALL SPORTS']);
  const sports: string[] = ['ALL SPORTS'];

  list.forEach((s: any) => {
    if (s && s.active !== false) {
      const raw = (s.sport_name || s.name || '').trim();
      const norm = normalizeSportKey(raw);
      if (norm && !seen.has(norm)) {
        seen.add(norm);
        sports.push(raw.toUpperCase());
      }
    }
  });

  return sports;
};

export const ViewAllMatch: React.FC = () => {
  const navigate = useNavigate();
  const user = useMemo(() => getStoredUser(), []);
  const [activeTab, setActiveTab] = useState<'PENDING' | 'PROCESSED'>('PENDING');
  const [selectedSport, setSelectedSport] = useState<string>('ALL');
  const [dynamicSports, setDynamicSports] = useState<string[]>(() => buildNormalizedSportsList());

  // Master in-memory dataset of all official's matches
  const [allMatches, setAllMatches] = useState<MatchSummaryItem[]>(
    () => getStoredOfficialMatches(user)
  );
  const [loading, setLoading] = useState(
    () => getStoredOfficialMatches(user).length === 0
  );

  useEffect(() => {
    // Session token verified when performing restricted actions
  }, [navigate]);

  // Fetch / refresh master dataset in background
  useEffect(() => {
    let isMounted = true;
    const initialList = getStoredOfficialMatches(user);
    if (initialList.length > 0) {
      setAllMatches(initialList);
      setLoading(false);
    } else {
      setLoading(true);
    }

    getAllOfficialMatchesMaster(false)
      .then((data) => {
        if (isMounted) {
          if (Array.isArray(data) && data.length > 0) {
            setAllMatches(data);
          } else {
            const fallback = getStoredOfficialMatches(user);
            if (fallback.length > 0) setAllMatches(fallback);
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load official master matches:', err);
        if (isMounted) {
          const fallback = getStoredOfficialMatches(user);
          if (fallback.length > 0) setAllMatches(fallback);
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    getSports().then((res) => {
      if (isMounted && res) {
        const list = Array.isArray(res.sports) ? res.sports : (Array.isArray(res) ? res : []);
        setDynamicSports(buildNormalizedSportsList(list));
      }
    }).catch(() => { });

    return () => {
      isMounted = false;
    };
  }, []);

  const sportsList = dynamicSports;

  // Filter Sports, Pending/Processed, and ONLY matches created by this official user
  const displayedMatches = useMemo(() => {
    return allMatches.filter((item) => {
      // Show only matches created by their own official user
      if (!isMatchCreatedByOfficial(item, user)) return false;

      // Status Filter
      if (activeTab === 'PENDING' && item.status !== 'PENDING') return false;
      if (activeTab === 'PROCESSED' && item.status !== 'AUDITED') return false;

      // Sport Filter
      const normSport = selectedSport.replace('&', 'AND').toUpperCase().trim();
      if (normSport !== 'ALL' && normSport !== 'ALL SPORTS') {
        const itemSport = (item.sport || '').toLowerCase();
        if (normSport.includes('BASKET')) {
          return itemSport.includes('basket');
        }
        if (normSport.includes('SWIM')) {
          return itemSport.includes('swim') || itemSport.includes('aquatic');
        }
        if (normSport.includes('TRACK') || normSport.includes('FIELD')) {
          return itemSport.includes('track') || itemSport.includes('field') || itemSport.includes('athletic');
        }
        return itemSport.includes(normSport.toLowerCase());
      }

      return true;
    });
  }, [allMatches, activeTab, selectedSport, user]);

  const handleRowClick = (matchId: string) => {
    const cleanId = matchId.replace(/^#/, '');
    navigate(`/matches/${cleanId}`);
  };

  return (
    <div style={styles.shell}>
      <main style={styles.contentArea}>
        {/* Header Row */}
        <div style={styles.pageHeaderRow}>
          <h1 style={styles.pageTitle}>ALL MATCHES</h1>
          <Link to="/dashboard" className="hover-back-link" style={styles.backLink}>
            <span>Back to Main Page</span>
            <span>↩</span>
          </Link>
        </div>

        {/* Filter Bar */}
        <div style={styles.filterBar}>
          {/* PENDING vs PROCESSED */}
          <div style={styles.tabGroup}>
            <button
              type="button"
              onClick={() => setActiveTab('PENDING')}
              className={`hover-tab-btn ${activeTab === 'PENDING' ? 'active' : ''}`}
              style={{
                ...styles.tabBtn,
                ...(activeTab === 'PENDING' ? styles.tabBtnActive : styles.tabBtnInactive),
                borderRight: '2px solid #0B132B',
              }}
            >
              PENDING AUDITS
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('PROCESSED')}
              className={`hover-tab-btn ${activeTab === 'PROCESSED' ? 'active' : ''}`}
              style={{
                ...styles.tabBtn,
                ...(activeTab === 'PROCESSED' ? styles.tabBtnActive : styles.tabBtnInactive),
              }}
            >
              PROCESSED AUDITS
            </button>
          </div>

          {/* Right Sport Filter Segmented Buttons */}
          <div style={styles.sportFilterWrap}>
            <span style={styles.sportFilterLabel}>FILTER SPORT:</span>
            <div style={styles.sportBtnGroup}>
              {sportsList.map((sport, idx) => {
                const normSelected = selectedSport.replace('&', 'AND').toUpperCase().trim();
                const normSport = sport.replace('&', 'AND').toUpperCase().trim();
                const isActive =
                  (sport === 'ALL SPORTS' && (normSelected === 'ALL' || normSelected === 'ALL SPORTS')) ||
                  normSelected === normSport;
                const isLast = idx === sportsList.length - 1;

                return (
                  <button
                    key={sport}
                    type="button"
                    onClick={() => setSelectedSport(sport === 'ALL SPORTS' ? 'ALL' : sport)}
                    className={`hover-sport-btn ${isActive ? 'active' : ''}`}
                    style={{
                      ...styles.sportBtn,
                      ...(isActive ? styles.sportBtnActive : styles.sportBtnInactive),
                      ...(isLast ? { borderRight: 'none' } : {}),
                    }}
                  >
                    {sport}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Audit Queue Table */}
        <div style={styles.tableFrame}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, width: '13%' }}>MATCH ID</th>
                <th style={{ ...styles.th, width: '27%' }}>MATCH NAME</th>
                <th style={{ ...styles.th, width: '13%' }}>SPORT</th>
                <th style={{ ...styles.th, width: '23%' }}>COACHES (TEAM 1, TEAM 2)</th>
                <th style={{ ...styles.th, width: '14%' }}>DATE / TIME</th>
                <th style={{ ...styles.th, width: '10%', borderRight: 'none' }}>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {loading && displayedMatches.length === 0 ? (
                Array.from({ length: 4 }).map((_, idx) => (
                  <tr key={`skel-${idx}`} style={styles.tr}>
                    <td style={styles.td}><div style={styles.skeletonRow} /></td>
                    <td style={styles.td}><div style={styles.skeletonRow} /></td>
                    <td style={styles.td}><div style={styles.skeletonRow} /></td>
                    <td style={styles.td}><div style={styles.skeletonRow} /></td>
                    <td style={styles.td}><div style={styles.skeletonRow} /></td>
                    <td style={{ ...styles.td, borderRight: 'none' }}><div style={styles.skeletonRow} /></td>
                  </tr>
                ))
              ) : displayedMatches.length > 0 ? (
                displayedMatches.map((item, idx) => (
                  <MatchRow
                    key={item.match_id}
                    item={item}
                    isLast={idx === displayedMatches.length - 1}
                    onClick={() => handleRowClick(item.match_id)}
                  />
                ))
              ) : (
                <tr>
                  <td colSpan={6} style={styles.emptyState}>
                    No matches found in the audit queue for the selected filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
};
export default ViewAllMatch;
