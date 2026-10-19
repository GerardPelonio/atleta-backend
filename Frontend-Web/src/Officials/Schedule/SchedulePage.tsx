import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';
import {
  getStoredToken,
  getStoredUser,
  getCachedData,
  getMe,
  getOfficialSchedules,
  isMatchCreatedByOfficial,
  isMatchDeleted,
  extractTeamString,
  getCoachNameById,
} from '../../api/client';
import type { AuthUser, OfficialScheduleItem } from '../../api/types';
import { Navbar } from '../Components/Navbar';
import { Sidebar } from '../Components/Sidebar';
import { styles } from './styles/SchedulePage';

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

export const getCanonicalMatchDate = (item: any): { year: number; month: number; day: number; dateStr: string } | null => {
  if (!item) return null;
  const raw = item?.raw_match || {};
  const timeVal = item?.scheduled_time || raw?.match_date || item?.match_date || raw?.timestamp || raw?.requested_at || item?.date_time || '';
  if (!timeVal) return null;

  // 1. Pure date string like YYYY-MM-DD
  if (typeof timeVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(timeVal.trim())) {
    const [y, m, d] = timeVal.trim().split('-').map(Number);
    return {
      year: y,
      month: m,
      day: d,
      dateStr: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    };
  }

  // 2. Normalize potential slashes like "20 OCT 2026 / 02:32"
  const cleaned = typeof timeVal === 'string' ? timeVal.replace(/\s*\/\s*/g, ' ').trim() : timeVal;
  let d = new Date(cleaned);
  if (isNaN(d.getTime())) {
    d = new Date(timeVal);
  }

  // 3. Fallback regex for "DD MMM YYYY" or "YYYY-MM-DD" if Date constructor fails
  if (isNaN(d.getTime()) && typeof timeVal === 'string') {
    const isoMatch = timeVal.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const y = Number(isoMatch[1]);
      const m = Number(isoMatch[2]);
      const day = Number(isoMatch[3]);
      return {
        year: y,
        month: m,
        day,
        dateStr: `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      };
    }
    const dmyMatch = timeVal.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
    if (dmyMatch) {
      const day = Number(dmyMatch[1]);
      const mStr = dmyMatch[2].toUpperCase();
      const y = Number(dmyMatch[3]);
      const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      const mIdx = MONTH_NAMES.indexOf(mStr);
      if (mIdx !== -1) {
        const m = mIdx + 1;
        return {
          year: y,
          month: m,
          day,
          dateStr: `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        };
      }
    }
    return null;
  }

  if (isNaN(d.getTime())) return null;

  // Consistent assignment: use the local date values matching the user's timezone & time formatting
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return {
    year: y,
    month: m,
    day,
    dateStr: `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
};

const resolveTeamNames = (item: any): { home: string; away: string } => {
  if (!item) return { home: 'HOME TEAM', away: 'AWAY TEAM' };
  const raw = item?.raw_match || {};
  const logistics = item?.venue_logistics || {};

  const home =
    extractTeamString(item?.home_team) ||
    extractTeamString(raw.home_team_name) ||
    extractTeamString(raw.home_team) ||
    extractTeamString(logistics.home_team) ||
    extractTeamString(raw.team_id) ||
    extractTeamString(raw.home_team_id) ||
    (Array.isArray(raw.participating_teams) && raw.participating_teams[0] ? extractTeamString(raw.participating_teams[0]) : '') ||
    '';

  const away =
    extractTeamString(item?.away_team) ||
    extractTeamString(raw.opponent_team_name) ||
    extractTeamString(raw.away_team_name) ||
    extractTeamString(raw.away_team) ||
    extractTeamString(logistics.away_team) ||
    extractTeamString(raw.away_team_id) ||
    (Array.isArray(raw.participating_teams) && raw.participating_teams[1] ? extractTeamString(raw.participating_teams[1]) : '') ||
    '';

  const matchClass = item?.match_class || raw?.game_name || raw?.match_type;
  if ((!home || !away) && typeof matchClass === 'string' && (matchClass.includes(' vs. ') || matchClass.includes(' vs '))) {
    const sep = matchClass.includes(' vs. ') ? ' vs. ' : ' vs ';
    const parts = matchClass.split(sep);
    const parsedHome = parts[0]?.trim();
    const parsedAway = parts[1]?.replace(/\([^)]*\)/, '')?.trim();
    return {
      home: home || parsedHome || 'HOME TEAM',
      away: away || parsedAway || 'AWAY TEAM',
    };
  }

  return {
    home: home || 'HOME TEAM',
    away: away || 'AWAY TEAM',
  };
};

const MatchDetailsCard: React.FC<{ match: OfficialScheduleItem }> = ({ match }) => {
  const [coachName, setCoachName] = useState<string>('No Coach Assigned');

  useEffect(() => {
    const rawList = Array.isArray(match.assigned_coaches) && match.assigned_coaches.length > 0
      ? match.assigned_coaches
      : match.coaches
      ? (Array.isArray(match.coaches) ? match.coaches : [match.coaches])
      : match.coach_name
      ? [match.coach_name]
      : (match as any)?.raw_match?.assigned_coaches
      ? (match as any).raw_match.assigned_coaches
      : (match as any)?.raw_match?.coaches
      ? (match as any).raw_match.coaches
      : [];

    const candidateCoaches = (Array.isArray(rawList) ? rawList : [rawList])
      .map(String)
      .map((c) => c.trim())
      .filter((c) => {
        if (!c) return false;
        const lower = c.toLowerCase();
        if (lower === 'official assigned' || lower.startsWith('coach off_') || lower.startsWith('off_') || lower.startsWith('official_')) return false;
        return true;
      });

    if (candidateCoaches.length === 0) {
      setCoachName('No Coach Assigned');
      return;
    }

    let isMounted = true;
    Promise.all(candidateCoaches.map((c) => getCoachNameById(c)))
      .then((names) => {
        if (!isMounted) return;
        const valid = names.map((n) => n.trim()).filter(Boolean);
        if (valid.length > 0) {
          setCoachName(valid.join(', '));
        } else {
          const fallback = candidateCoaches
            .map((c) => c.replace(/^coach[_\s]*/i, '').trim())
            .filter((c) => !c.toLowerCase().startsWith('off_'))
            .join(', ');
          setCoachName(fallback || 'No Coach Assigned');
        }
      })
      .catch(() => {
        if (isMounted) setCoachName('No Coach Assigned');
      });

    return () => {
      isMounted = false;
    };
  }, [match]);

  let timeStr = 'TBD';
  try {
    const timeVal = match?.scheduled_time || (match as any)?.raw_match?.match_date || (match as any)?.match_date;
    if (timeVal) {
      const d = new Date(timeVal);
      if (!isNaN(d.getTime())) {
        timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      }
    }
  } catch {
    timeStr = 'TBD';
  }

  const sport = String(
    match?.sport ||
    match?.venue_logistics?.sport ||
    (match as any)?.raw_match?.sport_type ||
    'BASKETBALL'
  ).toUpperCase();

  const { home, away } = resolveTeamNames(match);
  const homeInitial = home.trim() ? home.trim().charAt(0).toUpperCase() : 'H';
  const awayInitial = away.trim() ? away.trim().charAt(0).toUpperCase() : 'A';

  const venueLocation = String(
    match?.venue ||
    match?.venue_logistics?.location ||
    (match as any)?.raw_match?.location ||
    'MAIN COMPLEX'
  );

  const courtNum = String(
    match?.court_number ||
    match?.venue_logistics?.court ||
    (match as any)?.raw_match?.court_number ||
    '1'
  );

  const userMatchName = String(
    match?.matchName ||
    match?.gameReferenceId ||
    (match as any)?.raw_match?.matchName ||
    (match as any)?.raw_match?.gameReferenceId ||
    (match as any)?.raw_match?.game_name ||
    (match as any)?.raw_match?.gameName ||
    match?.match_name ||
    (match as any)?.raw_match?.match_name ||
    ''
  ).trim();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flexShrink: 0 }}>
      {/* Live Match Card */}
      <div style={styles.matchCardWrapper}>
        <div style={styles.timeTag}>{timeStr}</div>

        <div style={styles.matchCardOuter}>
          <div style={styles.sportPill}>{sport}</div>

          {userMatchName && (
            <div style={{ fontSize: '12px', fontWeight: 900, color: '#0B132B', textTransform: 'uppercase', marginBottom: '10px', letterSpacing: '0.05em' }}>
              {userMatchName}
            </div>
          )}

          <div style={styles.teamList}>
            <div style={styles.teamRow}>
              <div style={styles.teamLetterBox}>{homeInitial}</div>
              <span style={styles.teamName}>{home}</span>
            </div>

            <div style={styles.teamRow}>
              <div style={styles.teamLetterBox}>{awayInitial}</div>
              <span style={styles.teamName}>{away}</span>
            </div>
          </div>

          <div style={styles.dashedDivider} />

          <div style={styles.officialsSection}>
            <span style={styles.officialsLabel}>COACHES:</span>
            <div style={styles.officialsAvatars}>
              <Users style={{ width: 16, height: 16, flexShrink: 0 }} />
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#0B132B', textTransform: 'uppercase' }}>
                {coachName}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Live Venue Logistics Box */}
      <div style={styles.logisticsBox}>
        <h3 style={styles.logisticsTitle}>VENUE LOGISTICS</h3>
        <div style={styles.logisticsGrid}>
          <div style={styles.logisticsRow}>
            <span style={styles.logisticsKey}>LOCATION</span>
            <span style={styles.logisticsVal}>{venueLocation}</span>
          </div>
          <div style={styles.logisticsRow}>
            <span style={styles.logisticsKey}>SPORT</span>
            <span style={styles.logisticsVal}>{sport}</span>
          </div>
          <div style={styles.logisticsRow}>
            <span style={styles.logisticsKey}>COURT</span>
            <span style={styles.logisticsVal}>{courtNum}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const SchedulePage: React.FC = () => {
  const navigate = useNavigate();

  // Month navigation initialized to the exact current date of the device
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1; // 1-12

  const [user, setUser] = useState<AuthUser | null>(
    () => getCachedData<AuthUser>('user_me') || getStoredUser()
  );

  const [schedules, setSchedules] = useState<OfficialScheduleItem[]>(() => {
    const key = `official_schedules_${month}_${year}`;
    return getCachedData<OfficialScheduleItem[]>(key) || getCachedData<OfficialScheduleItem[]>('official_schedules') || [];
  });

  // Selected date initialized to current date of the device
  const now = new Date();
  const todayFormatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => {
    if (now.getFullYear() === year && now.getMonth() + 1 === month) {
      return todayFormatted;
    }
    return `${year}-${String(month).padStart(2, '0')}-01`;
  });

  const refreshSchedules = () => {
    getOfficialSchedules(month, year, true).then((res) => {
      const list = res || [];
      setSchedules(list);
    }).catch(() => {});
  };

  useEffect(() => {
    if (!getStoredToken()) {
      navigate('/login');
      return;
    }

    let isCurrent = true;

    // Synchronously load cache for the newly selected month/year immediately to prevent glitching data
    const cached = getCachedData<OfficialScheduleItem[]>(`official_schedules_${month}_${year}`);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      const uniqueMap = new Map<string, OfficialScheduleItem>();
      for (const item of cached) {
        const canonicalId = String(item.match_id || (item as any).raw_match?.match_id || item.schedule_id || '')
          .replace(/^#/, '').replace(/^sched_/, '').trim();
        const key = canonicalId || String(item.schedule_id || Math.random());
        if (!uniqueMap.has(key)) uniqueMap.set(key, item);
      }
      setSchedules(Array.from(uniqueMap.values()));
    }

    getMe().then((res) => {
      if (isCurrent && res) setUser(res);
    }).catch(() => {});

    getOfficialSchedules(month, year, true).then((res) => {
      if (!isCurrent) return; // Discard stale responses from quickly skipped months

      const list = res || [];
      setSchedules(list);

      // Verify that selected date is in the currently active month & year
      setSelectedDateStr((prev) => {
        const parts = prev ? prev.split('-') : [];
        const selYear = Number(parts[0]);
        const selMonth = Number(parts[1]);

        if (selYear === year && selMonth === month) {
          return prev;
        }

        const nowDate = new Date();
        if (nowDate.getFullYear() === year && nowDate.getMonth() + 1 === month) {
          return `${year}-${String(month).padStart(2, '0')}-${String(nowDate.getDate()).padStart(2, '0')}`;
        }

        if (list.length > 0) {
          const firstParsed = getCanonicalMatchDate(list[0]);
          if (firstParsed && firstParsed.year === year && firstParsed.month === month) {
            return firstParsed.dateStr;
          }
        }

        return `${year}-${String(month).padStart(2, '0')}-01`;
      });
    }).catch(() => {});

    return () => {
      isCurrent = false;
    };
  }, [navigate, month, year]);

  const nextMonth = () => {
    const nextD = new Date(year, month, 1);
    const nextY = nextD.getFullYear();
    const nextM = nextD.getMonth() + 1;
    const nowDate = new Date();
    if (nowDate.getFullYear() === nextY && nowDate.getMonth() + 1 === nextM) {
      setSelectedDateStr(`${nextY}-${String(nextM).padStart(2, '0')}-${String(nowDate.getDate()).padStart(2, '0')}`);
    } else {
      setSelectedDateStr(`${nextY}-${String(nextM).padStart(2, '0')}-01`);
    }
    setCurrentDate(nextD);
  };

  const prevMonth = () => {
    const prevD = new Date(year, month - 2, 1);
    const prevY = prevD.getFullYear();
    const prevM = prevD.getMonth() + 1;
    const nowDate = new Date();
    if (nowDate.getFullYear() === prevY && nowDate.getMonth() + 1 === prevM) {
      setSelectedDateStr(`${prevY}-${String(prevM).padStart(2, '0')}-${String(nowDate.getDate()).padStart(2, '0')}`);
    } else {
      setSelectedDateStr(`${prevY}-${String(prevM).padStart(2, '0')}-01`);
    }
    setCurrentDate(prevD);
  };

  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Calendar calculations (Monday start)
  const firstDayIndex = (new Date(year, month - 1, 1).getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month, 0).getDate();
  const totalCells = Math.ceil((firstDayIndex + daysInMonth) / 7) * 7;
  const numWeeks = Math.max(1, Math.ceil(totalCells / 7));
  const rowHeightPct = `${(100 / numWeeks).toFixed(4)}%`;

  // Strictly filter for current official's matches AND deduplicate by canonical match ID
  const safeSchedules = React.useMemo(() => {
    const rawList = (Array.isArray(schedules) ? schedules : []).filter((s) => {
      const matchId = String(s.match_id || (s as any).raw_match?.match_id || s.schedule_id || '').replace(/^#/, '').replace(/^sched_/, '').trim();
      if (isMatchDeleted(matchId)) return false;
      return isMatchCreatedByOfficial(s as any, user);
    });

    const uniqueMap = new Map<string, OfficialScheduleItem>();
    for (const item of rawList) {
      const canonicalMatchId = String(
        item.match_id ||
        (item as any).raw_match?.match_id ||
        item.schedule_id ||
        ''
      ).replace(/^#/, '').replace(/^sched_/, '').trim();

      const key = canonicalMatchId || String(item.schedule_id || Math.random());
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, item);
      }
    }
    return Array.from(uniqueMap.values());
  }, [schedules, user]);

  const onCellClick = (dayNum: number) => {
    const formatted = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    setSelectedDateStr(formatted);
  };

  // Safe formatting for details sidebar
  let detailsDateHeader = 'TODAY';
  try {
    if (selectedDateStr) {
      const parts = selectedDateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        detailsDateHeader = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      }
    }
  } catch {
    detailsDateHeader = 'TODAY';
  }

  // Matches for the selected date, sorted chronologically by time
  const selectedDayMatches = safeSchedules
    .filter((s) => {
      if (!s || !selectedDateStr) return false;
      const parsed = getCanonicalMatchDate(s);
      return parsed ? parsed.dateStr === selectedDateStr : false;
    })
    .sort((a, b) => {
      const timeA = new Date(a.scheduled_time || (a as any).raw_match?.match_date || (a as any).match_date || 0).getTime();
      const timeB = new Date(b.scheduled_time || (b as any).raw_match?.match_date || (b as any).match_date || 0).getTime();
      return timeA - timeB;
    });

  return (
    <div style={styles.shell}>
      {/* Shared Navbar */}
      <Navbar user={user} />

      {/* Main Body */}
      <div style={styles.layoutBody}>
        {/* Shared Sidebar */}
        <Sidebar
          activeTab="SCHEDULES"
          onMatchCreated={refreshSchedules}
        />

        {/* Schedules Content Area */}
        <main style={styles.contentArea}>
          {/* Left Column: Calendar Section */}
          <div style={styles.calendarSection}>
            {/* Header Controls */}
            <div style={styles.headerControlsRow}>
              <h1 style={styles.monthTitle}>{monthName}</h1>
              <div style={styles.stepBtnGroup}>
                <button type="button" onClick={prevMonth} className="hover-step-btn" style={styles.stepBtn} title="Previous month">
                  <ChevronLeft style={{ width: 18, height: 18 }} />
                </button>
                <div style={styles.stepDivider} />
                <button type="button" onClick={nextMonth} className="hover-step-btn" style={styles.stepBtn} title="Next month">
                  <ChevronRight style={{ width: 18, height: 18 }} />
                </button>
              </div>
            </div>

            {/* Calendar Table Grid */}
            <table style={styles.calendarTable}>
              <thead>
                <tr>
                  {DAYS.map((day) => (
                    <th key={day} style={styles.calTh}>
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: numWeeks }).map((_, weekIndex) => (
                  <tr key={weekIndex} style={{ height: rowHeightPct }}>
                    {Array.from({ length: 7 }).map((_, dayIndex) => {
                      const cellIndex = weekIndex * 7 + dayIndex;
                      const dayNum = cellIndex - firstDayIndex + 1;
                      const isValidDay = dayNum > 0 && dayNum <= daysInMonth;

                      if (!isValidDay) {
                        return <td key={dayIndex} style={{ ...styles.calTdEmpty, height: rowHeightPct }} />;
                      }

                      // Matches for this day (sorted by time)
                      const targetDatePrefix = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                      const matchesForDay = safeSchedules
                        .filter((s) => {
                          if (!s) return false;
                          const parsed = getCanonicalMatchDate(s);
                          return parsed ? parsed.dateStr === targetDatePrefix : false;
                        })
                        .sort((a, b) => {
                          const timeA = new Date(a.scheduled_time || (a as any).raw_match?.match_date || (a as any).match_date || 0).getTime();
                          const timeB = new Date(b.scheduled_time || (b as any).raw_match?.match_date || (b as any).match_date || 0).getTime();
                          return timeA - timeB;
                        });

                      const isSelected = selectedDateStr === targetDatePrefix;

                      return (
                        <td
                          key={dayIndex}
                          onClick={() => onCellClick(dayNum)}
                          className={`hover-calendar-cell ${isSelected ? 'selected' : ''}`}
                          style={{
                            ...styles.calTd,
                            height: rowHeightPct,
                            backgroundColor: isSelected ? '#F0F9FF' : '#FFFFFF',
                          }}
                        >
                          <div
                            style={{
                              ...styles.dateNum,
                              ...(isSelected ? styles.dateNumActive : {}),
                            }}
                          >
                            {String(dayNum).padStart(2, '0')}
                          </div>

                          <div style={styles.badgeWrap}>
                            {matchesForDay.slice(0, 2).map((m, idx) => {
                              const sport = String(m?.sport || m?.venue_logistics?.sport || 'BASKETBALL').toUpperCase();
                              const code = sport.includes('SWIM')
                                ? 'SW'
                                : sport.includes('TRACK') || sport.includes('FIELD')
                                ? 'TF'
                                : '';
                              const badgeStyle =
                                code === 'SW'
                                  ? styles.vbBadge
                                  : code === 'TF'
                                  ? styles.fbBadge
                                  : styles.bbBadge;

                              const { home: mHome, away: mAway } = resolveTeamNames(m);
                              const raw = m?.raw_match || {};
                              const userMatchName = String(
                                m?.matchName ||
                                m?.gameReferenceId ||
                                raw?.matchName ||
                                raw?.gameReferenceId ||
                                raw?.game_name ||
                                raw?.gameName ||
                                m?.match_name ||
                                raw?.match_name ||
                                ''
                              ).trim();
                              const label = userMatchName || (mHome && mAway ? `${mHome} vs. ${mAway}` : mHome || mAway || 'Event');

                              return (
                                <div
                                  key={m?.schedule_id || idx}
                                  style={{ ...styles.matchBadge, ...badgeStyle }}
                                  title={label}
                                >
                                  {code ? <strong>{code} </strong> : null}{label}
                                </div>
                              );
                            })}
                            {matchesForDay.length > 2 && (
                              <div
                                style={{
                                  ...styles.matchBadge,
                                  backgroundColor: '#F1F5F9',
                                  color: '#475569',
                                  border: '1px solid #CBD5E1',
                                  justifyContent: 'center',
                                  fontWeight: 900,
                                  letterSpacing: '0.1em',
                                  padding: '1px 5px',
                                  fontSize: '11px',
                                  lineHeight: 1,
                                }}
                                title={`${matchesForDay.length - 2} more match${matchesForDay.length - 2 > 1 ? 'es' : ''}`}
                              >
                                ...
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Right Column: Live Match Day Details Column */}
          <div style={styles.detailsSection}>
            <div style={styles.detailsCard}>
              <div style={styles.detailsBanner}>
                <h2 style={styles.detailsTitle}>MATCH DAY DETAILS</h2>
                <p style={styles.detailsDateSub}>{detailsDateHeader}</p>
              </div>

              <div style={styles.detailsBody}>
                {selectedDayMatches.length > 0 ? (
                  selectedDayMatches.map((m, idx) => (
                    <MatchDetailsCard key={m?.schedule_id || m?.match_id || idx} match={m} />
                  ))
                ) : (
                  <div style={{ padding: '40px 16px', textAlign: 'center', color: '#94A3B8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '8px' }}>
                    <p style={{ margin: 0, fontWeight: 800, textTransform: 'uppercase', color: '#64748B', fontSize: '12px' }}>
                      No matches scheduled
                    </p>
                    <p style={{ margin: 0, fontSize: '11px', lineHeight: 1.4 }}>
                      Select a date with match badges or click <strong>CREATE MATCH</strong> to add a new game.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default SchedulePage;
