import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Edit2,
  Save,
  ShieldCheck,
  RefreshCw,
  Loader2,
  Trophy,
  Layers,
} from 'lucide-react';
import type { RawOCRDetectedData, DetectedAthleteStat, SportConfiguration } from '../../api/types';
import { submitVerifiedMatch, getSports } from '../../api/client';
import { INITIAL_DEFAULT_SPORTS } from '../../SysAdmin/Sports_Management/SportPage';
import { styles } from './styles/OCROutputView';
import {
  resolveSportColumns,
  getMetricValue,
  setMetricValue,
  parseRobustStatNum,
  calculateDynamicMatchScore,
  type SportColumnDef as DynamicColumn,
} from '../../api/sportSchema';

interface OCROutputViewProps {
  rawOCRData: RawOCRDetectedData;
  onBack: () => void;
  onSaveSuccess: () => void;
}

export type { DynamicColumn };

// Helper to look up an athlete metric value by key or alias
const getAthleteStatValue = (a: DetectedAthleteStat, key: string): any => {
  return getMetricValue(a, key);
};

// Helper to ensure each athlete row has a distinct row_uid (Scenario 1 Disambiguation)
const ensureAthleteRowUids = (athletes: DetectedAthleteStat[]): DetectedAthleteStat[] => {
  return athletes.map((a, idx) => {
    const rawEvt = a.event || a.discipline || (a.stats?.event) || '';
    const cleanEvt = rawEvt ? String(rawEvt).trim().toLowerCase().replace(/[^a-z0-9]/g, '_') : 'event';
    const baseId = a.athlete_id || `ath_${idx + 1}`;
    const rowUid = a.row_uid || `${baseId}_${cleanEvt}_${idx + 1}`;
    const eventId = a.event_id || (rawEvt ? `EVT-${cleanEvt.toUpperCase()}` : undefined);

    const safeStats = {
      ...(typeof a.stats === 'object' && a.stats !== null ? a.stats : {}),
      event: rawEvt,
      event_id: eventId,
    };

    return {
      ...a,
      athlete_id: baseId,
      row_uid: rowUid,
      event: rawEvt,
      event_id: eventId,
      stats: safeStats,
    };
  });
};

export const OCROutputView: React.FC<OCROutputViewProps> = ({
  rawOCRData,
  onBack,
  onSaveSuccess,
}) => {
  // Determine list of matches (batch vs single)
  const matchesList = useMemo(() => {
    if (rawOCRData.batch_matches && rawOCRData.batch_matches.length > 0) {
      return rawOCRData.batch_matches;
    }
    return [rawOCRData];
  }, [rawOCRData]);

  const [activeMatchIndex, setActiveMatchIndex] = useState<number>(0);
  const [savedMatches, setSavedMatches] = useState<number[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>('ALL');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Dynamic Sports Configurations fetched from Backend Admin API
  const [configuredSports, setConfiguredSports] = useState<SportConfiguration[]>(() => INITIAL_DEFAULT_SPORTS);

  useEffect(() => {
    let mounted = true;
    getSports()
      .then((res) => {
        if (mounted && res && Array.isArray(res.sports) && res.sports.length > 0) {
          setConfiguredSports(res.sports);
        }
      })
      .catch(() => {
        // Fallback to INITIAL_DEFAULT_SPORTS
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Per-match athlete state dictionary with guaranteed row_uid disambiguation
  const [athleteStatsMap, setAthleteStatsMap] = useState<Record<number, DetectedAthleteStat[]>>(() => {
    const initial: Record<number, DetectedAthleteStat[]> = {};
    const list = (rawOCRData.batch_matches && rawOCRData.batch_matches.length > 0)
      ? rawOCRData.batch_matches
      : [rawOCRData];
    list.forEach((m, idx) => {
      initial[idx] = ensureAthleteRowUids(m.athlete_overview || []);
    });
    return initial;
  });

  const currentMatch = matchesList[activeMatchIndex] || rawOCRData;
  const athleteStats = athleteStatsMap[activeMatchIndex] || [];

  // Helper to update athlete stats for active match using row_uid
  const updateActiveAthleteStats = (
    updater: (prev: DetectedAthleteStat[]) => DetectedAthleteStat[]
  ) => {
    setAthleteStatsMap((prev) => ({
      ...prev,
      [activeMatchIndex]: updater(prev[activeMatchIndex] || []),
    }));
  };

  // Sport type identification
  const sportType = (currentMatch.sport_type || 'BASKETBALL').trim().toUpperCase();
  const isIndividual =
    sportType.includes('SWIM') ||
    sportType.includes('RUN') ||
    sportType.includes('TRACK') ||
    sportType.includes('ATHLETIC') ||
    sportType.includes('TIME');

  // Match configured sport schema from admin /sports API
  const activeSportConfig = useMemo<SportConfiguration | null>(() => {
    const norm = sportType.trim().toUpperCase();
    const exact = configuredSports.find(
      (s) =>
        s.sport_name.trim().toUpperCase() === norm ||
        s.short_identifier.trim().toUpperCase() === norm ||
        norm.includes(s.sport_name.trim().toUpperCase()) ||
        s.sport_name.trim().toUpperCase().includes(norm)
    );
    if (exact) return exact;

    const fallback = INITIAL_DEFAULT_SPORTS.find(
      (s) =>
        s.sport_name.trim().toUpperCase() === norm ||
        s.short_identifier.trim().toUpperCase() === norm ||
        norm.includes(s.sport_name.trim().toUpperCase()) ||
        s.sport_name.trim().toUpperCase().includes(norm)
    );
    return fallback || null;
  }, [configuredSports, sportType]);

  // Dynamically resolve table columns based on admin sport schema + detected metrics
  const dynamicColumns = useMemo<DynamicColumn[]>(() => {
    return resolveSportColumns(sportType, activeSportConfig, athleteStats);
  }, [sportType, activeSportConfig, athleteStats]);

  // Teams list for active match
  const teamList = useMemo(() => {
    const set = new Set<string>();
    if (currentMatch.teams && Array.isArray(currentMatch.teams)) {
      currentMatch.teams.forEach((t) => set.add(String(t).trim().toUpperCase()));
    }
    if (currentMatch.team_scores && Array.isArray(currentMatch.team_scores)) {
      currentMatch.team_scores.forEach((t) => set.add(String(t.team).trim().toUpperCase()));
    }
    if (currentMatch.team_name) set.add(String(currentMatch.team_name).trim().toUpperCase());
    if (currentMatch.opponent_team_name) set.add(String(currentMatch.opponent_team_name).trim().toUpperCase());
    athleteStats.forEach((a) => {
      if (a.team_name) set.add(String(a.team_name).trim().toUpperCase());
    });
    return Array.from(set).filter((t) => t.length > 0);
  }, [currentMatch, athleteStats]);

  // Filtered athletes based on active tab
  const visibleAthletes = useMemo(() => {
    if (selectedTeamFilter === 'ALL') return athleteStats;
    return athleteStats.filter(
      (a) => (a.team_name || '').toUpperCase() === selectedTeamFilter.toUpperCase()
    );
  }, [athleteStats, selectedTeamFilter]);

  // Dynamic Totals across all numeric columns
  const columnTotals = useMemo(() => {
    const totalsMap: Record<string, number> = {};
    dynamicColumns.forEach((col) => {
      if (col.isNumeric) {
        totalsMap[col.key] = visibleAthletes.reduce((sum, a) => {
          const val = getAthleteStatValue(a, col.key);
          const num = typeof val === 'number' ? val : parseFloat(val);
          return sum + (isNaN(num) ? 0 : num);
        }, 0);
      }
    });
    return totalsMap;
  }, [dynamicColumns, visibleAthletes]);

  // Stat Change Handler using row_uid
  const handleStatChange = (
    targetRowUid: string,
    field: string,
    value: string
  ) => {
    updateActiveAthleteStats((prev) => {
      const updated = [...prev];
      const idx = updated.findIndex((a) => (a.row_uid || a.athlete_id) === targetRowUid);
      if (idx === -1) return prev;

      const currentAthlete = { ...updated[idx] };
      const matchedCol = dynamicColumns.find((c) => c.key === field);
      const isStringField =
        field === 'fg_pct' ||
        field === 'hitting_pct' ||
        field === 'time' ||
        field === 'finish_time' ||
        field === 'split' ||
        field === 'event' ||
        field === 'event_id' ||
        field === 'position' ||
        field === 'player_name' ||
        field === 'team_name' ||
        (matchedCol && !matchedCol.isNumeric);

      let parsedVal: any = value;
      if (!isStringField) {
        parsedVal = parseRobustStatNum(value, field);
      }

      setMetricValue(currentAthlete, field, parsedVal);
      updated[idx] = currentAthlete;
      return updated;
    });
  };

  // Toggle Athlete Team between Home and Away (targeted via row_uid)
  const handleToggleTeam = (targetRowUid: string) => {
    updateActiveAthleteStats((prev) => {
      const updated = [...prev];
      const idx = updated.findIndex((a) => (a.row_uid || a.athlete_id) === targetRowUid);
      if (idx === -1) return prev;
      const current = (updated[idx].team_name || '').toUpperCase();
      const home = (currentMatch.team_name || 'HOME').toUpperCase();
      const away = (currentMatch.opponent_team_name || 'AWAY').toUpperCase();
      const nextTeam = current === home ? away : home;
      updated[idx] = {
        ...updated[idx],
        team_name: nextTeam,
      };
      return updated;
    });
  };

  // Dynamic Scores for Home / Away Banner
  const homeTeamName = (currentMatch.team_name || 'HOME TEAM').toUpperCase();
  const awayTeamName = (currentMatch.opponent_team_name || 'AWAY TEAM').toUpperCase();

  const matchScores = useMemo(() => {
    return calculateDynamicMatchScore(
      sportType,
      homeTeamName,
      awayTeamName,
      athleteStats,
      currentMatch.team_scores,
      activeSportConfig?.scoring_rules
    );
  }, [sportType, homeTeamName, awayTeamName, athleteStats, currentMatch.team_scores, activeSportConfig]);

  const homeScore = matchScores.homeScore;
  const awayScore = matchScores.awayScore;
  const scoreUnit = matchScores.scoreUnit;

  const dynamicResult = useMemo(() => {
    if (homeScore > awayScore) {
      return { homeBadge: 'WIN', awayBadge: 'LOSS', summary: `${homeTeamName} WINS`, finalScore: `${homeScore} - ${awayScore}` };
    }
    if (awayScore > homeScore) {
      return { homeBadge: 'LOSS', awayBadge: 'WIN', summary: `${awayTeamName} WINS`, finalScore: `${homeScore} - ${awayScore}` };
    }
    if (homeScore > 0 || awayScore > 0) {
      return { homeBadge: 'DRAW', awayBadge: 'DRAW', summary: 'TIED MATCH', finalScore: `${homeScore} - ${awayScore}` };
    }
    return { homeBadge: 'PENDING', awayBadge: 'PENDING', summary: 'Awaiting match data', finalScore: '0 - 0' };
  }, [homeScore, awayScore, homeTeamName, awayTeamName]);

  const mvpAthlete = useMemo(() => {
    if (!athleteStats || athleteStats.length === 0) return null;
    let bestScore = -999;
    let bestItem: any = null;

    athleteStats.forEach((a) => {
      const name = a.player_name || a.athlete_name || (a as any).name;
      if (!name || name.toUpperCase().includes('TOTAL') || name.toUpperCase().includes('TEAM')) return;

      const pts = Number(getAthleteStatValue(a, 'pts') || getAthleteStatValue(a, 'points') || 0);
      const reb = Number(getAthleteStatValue(a, 'reb') || getAthleteStatValue(a, 'rebounds') || 0);
      const ast = Number(getAthleteStatValue(a, 'ast') || getAthleteStatValue(a, 'assists') || 0);
      const stl = Number(getAthleteStatValue(a, 'stl') || getAthleteStatValue(a, 'steals') || 0);
      const blk = Number(getAthleteStatValue(a, 'blk') || getAthleteStatValue(a, 'blocks') || 0);
      const kills = Number(getAthleteStatValue(a, 'kills') || 0);
      const goals = Number(getAthleteStatValue(a, 'goals') || 0);

      let score = 0;
      let label = '';
      if (kills > 0) {
        score = kills * 1.5 + Number(getAthleteStatValue(a, 'service_aces') || 0) * 2 + blk * 2;
        label = `${kills} Kills, ${blk} Blocks`;
      } else if (goals > 0) {
        score = goals * 6 + ast * 4;
        label = `${goals} Goals, ${ast} Assists`;
      } else {
        score = pts + reb * 1.2 + ast * 1.5 + stl * 2 + blk * 2;
        label = `${pts} PTS, ${reb} REB, ${ast} AST`;
      }

      if (score > bestScore) {
        bestScore = score;
        bestItem = {
          name,
          jersey: a.jersey_number,
          team: a.team_name,
          score,
          label,
          raw: a,
        };
      }
    });
    return bestItem;
  }, [athleteStats]);

  // Save / Commit verified match data to database
  const handleSaveMatch = async () => {
    setFeedback(null);
    setSaving(true);
    try {
      const resolvedScoresheetUrl = currentMatch.scoresheetUrl || currentMatch.scoresheet_url || rawOCRData.scoresheetUrl || rawOCRData.scoresheet_url || '';
      const homeRosterIds = athleteStats
        .filter((a) => (a.team_name || '').toUpperCase() === homeTeamName.toUpperCase())
        .map((a) => a.athlete_id)
        .filter(Boolean);
      const awayRosterIds = athleteStats
        .filter((a) => (a.team_name || '').toUpperCase() === awayTeamName.toUpperCase())
        .map((a) => a.athlete_id)
        .filter(Boolean);

      const finalPlayerStats = athleteStats.map((a) => {
        const completeStats: Record<string, any> = {
          ...(a.stats || {}),
        };

        dynamicColumns.forEach((col) => {
          const val = getAthleteStatValue(a, col.key);
          if (val !== undefined && val !== null && val !== '') {
            completeStats[col.key] = val;
          }
        });

        const athleteEvent = a.event || a.discipline || completeStats.event || '';
        const athleteEventId = a.event_id || (athleteEvent ? `EVT-${athleteEvent.toLowerCase().replace(/[^a-z0-9]/g, '_').toUpperCase()}` : undefined);
        const athleteFinishTime = a.finish_time || a.time || completeStats.finish_time || completeStats.time || '';
        const athleteSplit = a.split || completeStats.split || '';
        const athleteRank = a.placement_rank || a.rank || completeStats.placement_rank || completeStats.rank || '';

        completeStats.event = athleteEvent;
        completeStats.event_id = athleteEventId;
        completeStats.finish_time = athleteFinishTime;
        completeStats.split = athleteSplit;
        completeStats.placement_rank = athleteRank;

        return {
          athlete_id: a.athlete_id,
          row_uid: a.row_uid,
          player_name: a.player_name,
          team_name: a.team_name,
          jersey_number: a.jersey_number,
          position: a.position,
          event: athleteEvent,
          event_id: athleteEventId,
          heat: a.heat !== undefined ? a.heat : completeStats.heat,
          lane: a.lane !== undefined ? a.lane : completeStats.lane,
          placement_rank: athleteRank,
          finish_time: athleteFinishTime,
          time: athleteFinishTime,
          split: athleteSplit,
          // Dynamic stats dictionary without truncation
          stats: completeStats,
          // Secondary and common metrics explicitly preserved
          pts: parseRobustStatNum(completeStats.pts ?? completeStats.points ?? a.pts ?? 0, 'pts'),
          points: parseRobustStatNum(completeStats.pts ?? completeStats.points ?? a.pts ?? 0, 'pts'),
          ast: parseRobustStatNum(completeStats.ast ?? completeStats.assists ?? a.ast ?? 0, 'ast'),
          assists: parseRobustStatNum(completeStats.ast ?? completeStats.assists ?? a.ast ?? 0, 'ast'),
          reb: parseRobustStatNum(completeStats.reb ?? completeStats.rebounds ?? a.reb ?? 0, 'reb'),
          rebounds: parseRobustStatNum(completeStats.reb ?? completeStats.rebounds ?? a.reb ?? 0, 'reb'),
          stl: parseRobustStatNum(completeStats.stl ?? completeStats.steals ?? a.stl ?? 0, 'stl'),
          steals: parseRobustStatNum(completeStats.stl ?? completeStats.steals ?? a.stl ?? 0, 'stl'),
          blk: parseRobustStatNum(completeStats.blk ?? completeStats.blocks ?? a.blk ?? 0, 'blk'),
          blocks: parseRobustStatNum(completeStats.blk ?? completeStats.blocks ?? a.blk ?? 0, 'blk'),
          to: parseRobustStatNum(completeStats.to ?? completeStats.turnovers ?? a.to ?? 0, 'to'),
          turnovers: parseRobustStatNum(completeStats.to ?? completeStats.turnovers ?? a.to ?? 0, 'to'),
          fouls: parseRobustStatNum(completeStats.fouls ?? completeStats.pf ?? a.fouls ?? a.pf ?? 0, 'fouls'),
          pf: parseRobustStatNum(completeStats.fouls ?? completeStats.pf ?? a.fouls ?? a.pf ?? 0, 'fouls'),
          oreb: parseRobustStatNum(completeStats.oreb ?? completeStats.offensive_rebounds ?? a.oreb ?? 0, 'oreb'),
          dreb: parseRobustStatNum(completeStats.dreb ?? completeStats.defensive_rebounds ?? a.dreb ?? 0, 'dreb'),
          min: parseRobustStatNum(completeStats.min ?? completeStats.minutes ?? a.min ?? 0, 'min'),
          fg_made: parseRobustStatNum(completeStats.fg_made ?? a.fg_made ?? 0, 'fg_made'),
          fg_attempted: parseRobustStatNum(completeStats.fg_attempted ?? a.fg_attempted ?? 0, 'fg_attempted'),
          three_made: parseRobustStatNum(completeStats.three_made ?? a.three_made ?? 0, 'three_made'),
          three_attempted: parseRobustStatNum(completeStats.three_attempted ?? a.three_attempted ?? 0, 'three_attempted'),
          ft_made: parseRobustStatNum(completeStats.ft_made ?? a.ft_made ?? 0, 'ft_made'),
          ft_attempted: parseRobustStatNum(completeStats.ft_attempted ?? a.ft_attempted ?? 0, 'ft_attempted'),
          kills: parseRobustStatNum(completeStats.kills ?? a.kills ?? 0, 'kills'),
          attack_errors: parseRobustStatNum(completeStats.attack_errors ?? a.attack_errors ?? 0, 'attack_errors'),
          attack_attempts: parseRobustStatNum(completeStats.attack_attempts ?? a.attack_attempts ?? 0, 'attack_attempts'),
          service_aces: parseRobustStatNum(completeStats.service_aces ?? a.service_aces ?? 0, 'service_aces'),
          service_errors: parseRobustStatNum(completeStats.service_errors ?? a.service_errors ?? 0, 'service_errors'),
          reception_errors: parseRobustStatNum(completeStats.reception_errors ?? a.reception_errors ?? 0, 'reception_errors'),
          digs: parseRobustStatNum(completeStats.digs ?? a.digs ?? 0, 'digs'),
          block_points: parseRobustStatNum(completeStats.block_points ?? a.block_points ?? 0, 'block_points'),
          sets_played: parseRobustStatNum(completeStats.sets_played ?? a.sets_played ?? 0, 'sets_played'),
          goals: parseRobustStatNum(completeStats.goals ?? a.goals ?? 0, 'goals'),
          shots: parseRobustStatNum(completeStats.shots ?? a.shots ?? 0, 'shots'),
          shots_on_target: parseRobustStatNum(completeStats.shots_on_target ?? a.shots_on_target ?? 0, 'shots_on_target'),
          saves: parseRobustStatNum(completeStats.saves ?? a.saves ?? 0, 'saves'),
          tackles: parseRobustStatNum(completeStats.tackles ?? a.tackles ?? 0, 'tackles'),
        };
      });

      const payload = {
        team_id: currentMatch.team_name || 'team_official',
        sport_type: sportType,
        match_name: `${homeTeamName} vs ${awayTeamName}`,
        match_type: 'Official Match',
        match_date: currentMatch.match_date || new Date().toISOString(),
        location: currentMatch.location || 'Tournament Arena',
        opponent_team_name: awayTeamName,
        game_result: dynamicResult.homeBadge,
        final_score: currentMatch.final_score || dynamicResult.finalScore,
        home_score: homeScore,
        away_score: awayScore,
        notes: `Official OCR Logged Match (${sportType} - ${homeTeamName}: ${homeScore} vs ${awayTeamName}: ${awayScore})`,
        player_stats: finalPlayerStats,
        playerStats: finalPlayerStats,
        roster_athletes: homeRosterIds,
        rosterAthletes: homeRosterIds,
        away_roster_athletes: awayRosterIds,
        awayRosterAthletes: awayRosterIds,
        scoresheet_url: resolvedScoresheetUrl,
        scoresheetUrl: resolvedScoresheetUrl,
      };

      await submitVerifiedMatch(payload);

      const nextSaved = Array.from(new Set([...savedMatches, activeMatchIndex]));
      setSavedMatches(nextSaved);

      if (matchesList.length > 1 && nextSaved.length < matchesList.length) {
        setFeedback({
          type: 'success',
          message: `Match ${activeMatchIndex + 1} (${sportType}) logged successfully! Switch tabs to review other matches.`,
        });
      } else {
        setFeedback({
          type: 'success',
          message: `All verified match statistics logged into the Firestore database!`,
        });
        setTimeout(() => {
          onSaveSuccess();
        }, 1500);
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to submit verified match statistics.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Batch Match Tabs (If multiple matches detected) */}
      {matchesList.length > 1 && (
        <div style={styles.batchTabsWrap}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '8px' }}>
            <Layers style={{ width: 16, height: 16, color: '#0B132B' }} />
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#0B132B', textTransform: 'uppercase' }}>
              Batch Matches ({matchesList.length}):
            </span>
          </div>
          {matchesList.map((m, idx) => {
            const mSport = (m.sport_type || 'MATCH').toUpperCase();
            const mHome = (m.team_name || 'HOME').toUpperCase();
            const mAway = (m.opponent_team_name || 'AWAY').toUpperCase();
            const isSaved = savedMatches.includes(idx);
            const isActive = activeMatchIndex === idx;

            return (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setActiveMatchIndex(idx);
                  setSelectedTeamFilter('ALL');
                  setFeedback(null);
                }}
                style={{
                  ...styles.batchTab,
                  ...(isActive ? styles.batchTabActive : {}),
                }}
              >
                <span>M{idx + 1}: {mSport} • {mHome} vs {mAway}</span>
                {isSaved && <CheckCircle2 style={{ width: 14, height: 14, color: '#10B981' }} />}
              </button>
            );
          })}
        </div>
      )}

      {/* Top Action Bar */}
      <div style={styles.topBar}>
        <button type="button" onClick={onBack} style={styles.backBtn}>
          <ArrowLeft style={{ width: 16, height: 16 }} />
          <span>BACK TO UPLOADER</span>
        </button>

        <div style={styles.actionGroup}>
          <button
            type="button"
            onClick={() => setIsEditing(!isEditing)}
            style={{
              ...styles.editToggleBtn,
              ...(isEditing ? styles.editToggleBtnActive : {}),
            }}
          >
            {isEditing ? (
              <>
                <CheckCircle2 style={{ width: 14, height: 14 }} />
                <span>Done Editing</span>
              </>
            ) : (
              <>
                <Edit2 style={{ width: 14, height: 14 }} />
                <span>Edit Box Score</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleSaveMatch}
            disabled={saving}
            style={{
              ...styles.saveBtn,
              ...(saving ? styles.saveBtnDisabled : {}),
            }}
          >
            {saving ? (
              <>
                <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
                <span>Submitting to Database...</span>
              </>
            ) : (
              <>
                <Save style={{ width: 14, height: 14 }} />
                <span>
                  {savedMatches.includes(activeMatchIndex)
                    ? 'Update Verified Match'
                    : matchesList.length > 1
                    ? `Log Match ${activeMatchIndex + 1}`
                    : 'Confirm & Log Match'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {feedback && (
        <div style={feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError}>
          <ShieldCheck style={{ width: 16, height: 16, flexShrink: 0 }} />
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Dynamic Match Scoreboard Banner (Aligned with Mobile) */}
      <div style={styles.scoreBanner}>
        {/* Banner Top Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.15)',
          backgroundColor: 'rgba(0, 0, 0, 0.25)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Trophy style={{ width: 16, height: 16, color: '#00C8FF' }} />
            <span style={{ fontSize: '12px', fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#FFFFFF' }}>
              MATCH SCOREBOARD • {sportType}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              backgroundColor: '#00C8FF',
              color: '#0B132B',
              fontSize: '11px',
              fontWeight: 900,
              padding: '3px 10px',
              letterSpacing: '0.05em',
              borderRadius: '2px',
            }}>
              FINAL: {currentMatch.final_score || dynamicResult.finalScore}
            </span>
            <span style={{
              backgroundColor: dynamicResult.homeBadge === 'DRAW' ? '#F59E0B' : dynamicResult.homeBadge === 'PENDING' ? '#475569' : '#10B981',
              color: '#FFFFFF',
              fontSize: '11px',
              fontWeight: 900,
              padding: '3px 10px',
              letterSpacing: '0.05em',
              borderRadius: '2px',
            }}>
              {dynamicResult.summary}
            </span>
          </div>
        </div>

        <div style={styles.scoreBannerInner}>
          <div style={styles.teamCol}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={styles.teamTag}>HOME TEAM</span>
              <span style={{
                fontSize: '9.5px',
                fontWeight: 900,
                padding: '1px 6px',
                backgroundColor: dynamicResult.homeBadge === 'WIN' ? '#10B981' : dynamicResult.homeBadge === 'DRAW' ? '#F59E0B' : dynamicResult.homeBadge === 'PENDING' ? '#334155' : '#EF4444',
                color: '#FFFFFF',
                borderRadius: '2px',
              }}>
                {dynamicResult.homeBadge}
              </span>
            </div>
            <h2 style={styles.teamName}>{homeTeamName}</h2>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <span style={styles.teamScore}>{homeScore}</span>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#94A3B8' }}>{scoreUnit}</span>
            </div>
          </div>

          <div style={styles.vsCenter}>
            <span style={styles.vsBadge}>VS</span>
            <span style={styles.sportBadge}>
              <Trophy style={{ width: 14, height: 14, color: '#FBBF24' }} />
              <span>{sportType}</span>
            </span>
          </div>

          <div style={styles.teamColRight}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', justifyContent: 'flex-end' }}>
              <span style={{
                fontSize: '9.5px',
                fontWeight: 900,
                padding: '1px 6px',
                backgroundColor: dynamicResult.awayBadge === 'WIN' ? '#10B981' : dynamicResult.awayBadge === 'DRAW' ? '#F59E0B' : dynamicResult.awayBadge === 'PENDING' ? '#334155' : '#EF4444',
                color: '#FFFFFF',
                borderRadius: '2px',
              }}>
                {dynamicResult.awayBadge}
              </span>
              <span style={styles.teamTag}>AWAY TEAM</span>
            </div>
            <h2 style={styles.teamName}>{awayTeamName}</h2>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', justifyContent: 'flex-end' }}>
              <span style={styles.teamScore}>{awayScore}</span>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#94A3B8' }}>{scoreUnit}</span>
            </div>
          </div>
        </div>
      </div>

      {/* MVP Top Performer Card */}
      {mvpAthlete && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#FFFBEB',
          border: '1.5px solid #F59E0B',
          borderRadius: '8px',
          padding: '12px 20px',
          boxShadow: '0 2px 8px rgba(245, 158, 11, 0.1)',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              backgroundColor: '#FEF3C7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#D97706',
              flexShrink: 0,
            }}>
              <Trophy size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '10px', fontWeight: 800, color: '#B45309', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  ★ AUTOMATIC MATCH MVP
                </span>
              </div>
              <div
                style={{
                  margin: '2px 0 0 0',
                  fontSize: '16px',
                  fontWeight: 800,
                  color: '#0B132B',
                  textAlign: 'left',
                }}
              >
                {mvpAthlete.name} {mvpAthlete.jersey ? `(#${mvpAthlete.jersey})` : ''}
              </div>
              <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
                {mvpAthlete.team} • {mvpAthlete.label}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Team Filter Tabs */}
      <div style={styles.filterTabsWrap}>
        <button
          type="button"
          onClick={() => setSelectedTeamFilter('ALL')}
          style={{
            ...styles.filterTab,
            ...(selectedTeamFilter === 'ALL' ? styles.filterTabActive : {}),
          }}
        >
          All Players ({athleteStats.length})
        </button>
        {teamList.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setSelectedTeamFilter(t)}
            style={{
              ...styles.filterTab,
              ...(selectedTeamFilter === t ? styles.filterTabActive : {}),
            }}
          >
            {t} ({athleteStats.filter((a) => (a.team_name || '').toUpperCase() === t).length})
          </button>
        ))}
      </div>

      {/* Box Score Table */}
      <div style={styles.tableCard}>
        <div style={styles.tableHeader}>
          <span style={styles.tableTitle}>
            EXTRACTED {sportType} STATS ({visibleAthletes.length} ATHLETES)
          </span>
          <span style={styles.tableSubtitle}>
            {isEditing ? 'Editing Mode Active: tap numbers to edit' : 'Tap team badge to toggle Home/Away'}
          </span>
        </div>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.theadRow}>
                <th style={{ ...styles.thCenter, width: '48px' }}>
                  {isIndividual ? 'RANK' : '#'}
                </th>
                <th style={styles.th}>Athlete Name</th>
                <th style={styles.th}>{isIndividual ? 'Team / Affiliation' : 'Team'}</th>
                {isIndividual && <th style={styles.th}>EVENT</th>}
                {dynamicColumns.map((col) => (
                  <th key={col.key} style={styles.thCenter}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {visibleAthletes.map((a, rowIdx) => {
                const isHome = (a.team_name || '').toUpperCase() === homeTeamName;
                const rowIdentity = a.row_uid || a.athlete_id;

                return (
                  <tr key={rowIdentity} style={styles.tbodyRow}>
                    <td style={styles.tdNum}>
                      {isIndividual
                        ? a.placement_rank ? `#${a.placement_rank}` : `#${rowIdx + 1}`
                        : a.jersey_number ? `#${a.jersey_number}` : '-'}
                    </td>
                    <td style={styles.tdAthleteName}>
                      <span style={{ color: '#0B132B', fontWeight: 800 }}>
                        {a.player_name}
                      </span>
                    </td>
                    <td style={styles.tdTeam}>
                      <button
                        type="button"
                        onClick={() => handleToggleTeam(rowIdentity)}
                        title="Click to toggle Home / Away"
                        style={isHome ? styles.teamBadgeHome : styles.teamBadgeAway}
                      >
                        <span>{a.team_name || (isHome ? 'HOME' : 'AWAY')}</span>
                        <RefreshCw style={{ width: 10, height: 10, opacity: 0.6 }} />
                      </button>
                    </td>

                    {isIndividual && (
                      <td style={styles.tdStat}>
                        {isEditing ? (
                          <input
                            type="text"
                            value={a.event || '-'}
                            onChange={(e) => handleStatChange(rowIdentity, 'event', e.target.value)}
                            style={{ ...styles.statInput, width: '100px' }}
                          />
                        ) : (
                          a.event || '-'
                        )}
                      </td>
                    )}

                    {dynamicColumns.map((col) => {
                      const val = getAthleteStatValue(a, col.key);
                      return (
                        <td key={col.key} style={col.key.includes('pct') ? styles.tdFgPct : styles.tdStat}>
                          {isEditing ? (
                            <input
                              type={col.isNumeric ? 'number' : 'text'}
                              value={val !== undefined && val !== null ? val : (col.isNumeric ? 0 : '')}
                              onChange={(e) => handleStatChange(rowIdentity, col.key, e.target.value)}
                              style={{
                                ...styles.statInput,
                                width: col.isNumeric ? '56px' : '75px',
                              }}
                            />
                          ) : (
                            val !== '' && val !== undefined && val !== null ? val : (col.isNumeric ? 0 : '-')
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>

            {/* Totals Row */}
            <tfoot>
              <tr style={styles.tfootRow}>
                <td style={styles.tfootTdTotalLabel} colSpan={3}>
                  TOTALS ({visibleAthletes.length} Athletes)
                </td>
                {isIndividual && <td style={styles.tfootTdDash}>-</td>}
                {dynamicColumns.map((col) => {
                  if (col.isNumeric) {
                    const sum = columnTotals[col.key] || 0;
                    return (
                      <td key={col.key} style={styles.tfootTdStatHighlight}>
                        {Number.isInteger(sum) ? sum : sum.toFixed(1)}
                      </td>
                    );
                  }
                  return (
                    <td key={col.key} style={styles.tfootTdDash}>
                      -
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

    </div>
  );
};
