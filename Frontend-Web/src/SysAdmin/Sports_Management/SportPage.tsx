import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PlusCircle,
  BarChart3,
  ChevronDown,
  Save,
  Plus,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Calculator,
} from 'lucide-react';
import { Navbar } from '../Components/Navbar';
import { Sidebar } from '../Components/Sidebar';
import {
  getStoredToken,
  getStoredUser,
  getCachedData,
  setCachedData,
  getSports,
  createSport,
  updateSport,
  deleteSport,
} from '../../api/client';
import type {
  SportConfiguration,
  BackendConfigurableStat,
} from '../../api/types';
import { styles } from './styles/SportPage';

// ─── HELPER: Convert friendly name to snake_case key ─────────────────────────
const toSnakeCase = (str: string): string => {
  return str
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
};

// ─── FRIENDLY METRIC CATEGORIES MAPPING ──────────────────────────────────────
export type MetricCategoryOption = 'COUNT' | 'PERCENTAGE' | 'TIME' | 'DISTANCE';

const METRIC_TYPE_CONFIG: Record<
  MetricCategoryOption,
  { label: string; backendCategory: 'Cumulative Total' | 'Percentage' | 'Time (ms)' | 'Distance (m)' | 'Count'; hint: string }
> = {
  COUNT: {
    label: 'Score / Count (Points, Goals, Aces)',
    backendCategory: 'Cumulative Total',
    hint: 'Tracks quantities or running score totals recorded during play.',
  },
  PERCENTAGE: {
    label: 'Percentage (%) (Accuracy, Shooting %)',
    backendCategory: 'Percentage',
    hint: 'Calculated success rate, usually (Made / Attempted) * 100.',
  },
  TIME: {
    label: 'Time (ms) (Duration, Lap, Finish Time)',
    backendCategory: 'Time (ms)',
    hint: 'Measures elapsed time in milliseconds or minutes/seconds.',
  },
  DISTANCE: {
    label: 'Distance (m) (Length, Height, Jumps)',
    backendCategory: 'Distance (m)',
    hint: 'Measures distance or height in meters.',
  },
};

// ─── SPORT TEMPLATES (PRESETS FOR FAST EASY CREATION) ────────────────────────
interface SportTemplate {
  name: string;
  shortId: string;
  winCondition: string;
  positions: string[];
  stats: {
    label: string;
    key: string;
    category: MetricCategoryOption;
    formula?: string;
  }[];
}

const SPORT_TEMPLATES: Record<string, SportTemplate> = {
  VOLLEYBALL: {
    name: 'VOLLEYBALL',
    shortId: 'VBALL',
    winCondition: 'HIGHEST_SCORE',
    positions: ['Setter', 'Outside Hitter', 'Middle Blocker', 'Opposite Hitter', 'Libero', 'Defensive Specialist'],
    stats: [
      { label: 'Points', key: 'points', category: 'COUNT' },
      { label: 'Aces', key: 'aces', category: 'COUNT' },
      { label: 'Kill Spikes', key: 'kills', category: 'COUNT' },
      { label: 'Kill Blocks', key: 'blocks', category: 'COUNT' },
      { label: 'Digs', key: 'digs', category: 'COUNT' },
      { label: 'Assists', key: 'assists', category: 'COUNT' },
      { label: 'Service Errors', key: 'service_errors', category: 'COUNT' },
      { label: 'Spike Accuracy', key: 'spike_accuracy', category: 'PERCENTAGE', formula: '(kills / total_attacks) * 100' },
    ],
  },
  PICKLEBALL: {
    name: 'PICKLEBALL',
    shortId: 'PCKL',
    winCondition: 'HIGHEST_SCORE',
    positions: ['Singles Player', 'Doubles Right Court', 'Doubles Left Court'],
    stats: [
      { label: 'Points', key: 'points', category: 'COUNT' },
      { label: 'Winners', key: 'winners', category: 'COUNT' },
      { label: 'Unforced Errors', key: 'unforced_errors', category: 'COUNT' },
      { label: 'Service Aces', key: 'service_aces', category: 'COUNT' },
      { label: 'Third Shot Drops', key: 'third_shot_drops', category: 'COUNT' },
      { label: 'Dink Errors', key: 'dink_errors', category: 'COUNT' },
      { label: 'Kitchen Faults', key: 'kitchen_faults', category: 'COUNT' },
      { label: 'Third Shot %', key: 'third_shot_pct', category: 'PERCENTAGE', formula: '(third_shot_drops / total_third_shots) * 100' },
    ],
  },
  BADMINTON: {
    name: 'BADMINTON',
    shortId: 'BADM',
    winCondition: 'HIGHEST_SCORE',
    positions: ['Singles Player', 'Doubles Front Court', 'Doubles Back Court'],
    stats: [
      { label: 'Points', key: 'points', category: 'COUNT' },
      { label: 'Smash Winners', key: 'smash_winners', category: 'COUNT' },
      { label: 'Net Kills', key: 'net_kills', category: 'COUNT' },
      { label: 'Unforced Errors', key: 'unforced_errors', category: 'COUNT' },
      { label: 'Service Faults', key: 'service_faults', category: 'COUNT' },
      { label: 'Smash Win %', key: 'smash_win_pct', category: 'PERCENTAGE', formula: '(smash_winners / total_smashes) * 100' },
    ],
  },
  SOCCER: {
    name: 'SOCCER / FOOTBALL',
    shortId: 'SOC',
    winCondition: 'HIGHEST_SCORE',
    positions: ['Goalkeeper', 'Center Back', 'Fullback', 'Midfielder', 'Winger', 'Striker'],
    stats: [
      { label: 'Goals', key: 'goals', category: 'COUNT' },
      { label: 'Assists', key: 'assists', category: 'COUNT' },
      { label: 'Shots on Target', key: 'shots_on_target', category: 'COUNT' },
      { label: 'Saves', key: 'saves', category: 'COUNT' },
      { label: 'Fouls', key: 'fouls', category: 'COUNT' },
      { label: 'Yellow Cards', key: 'yellow_cards', category: 'COUNT' },
      { label: 'Red Cards', key: 'red_cards', category: 'COUNT' },
      { label: 'Shot Accuracy', key: 'shot_accuracy', category: 'PERCENTAGE', formula: '(shots_on_target / total_shots) * 100' },
    ],
  },
  TENNIS: {
    name: 'TENNIS',
    shortId: 'TEN',
    winCondition: 'HIGHEST_SCORE',
    positions: ['Singles Player', 'Doubles Server', 'Doubles Receiver'],
    stats: [
      { label: 'Aces', key: 'aces', category: 'COUNT' },
      { label: 'Double Faults', key: 'double_faults', category: 'COUNT' },
      { label: 'Winners', key: 'winners', category: 'COUNT' },
      { label: 'Unforced Errors', key: 'unforced_errors', category: 'COUNT' },
      { label: 'Break Points Won', key: 'break_points_won', category: 'COUNT' },
      { label: 'First Serves In', key: 'first_serves_in', category: 'COUNT' },
      { label: '1st Serve %', key: 'first_serve_pct', category: 'PERCENTAGE', formula: '(first_serves_in / total_serves) * 100' },
    ],
  },
  TABLE_TENNIS: {
    name: 'TABLE TENNIS',
    shortId: 'TT',
    winCondition: 'HIGHEST_SCORE',
    positions: ['Singles Player', 'Doubles Partner'],
    stats: [
      { label: 'Points', key: 'points', category: 'COUNT' },
      { label: 'Forehand Winners', key: 'forehand_winners', category: 'COUNT' },
      { label: 'Backhand Winners', key: 'backhand_winners', category: 'COUNT' },
      { label: 'Service Aces', key: 'service_aces', category: 'COUNT' },
      { label: 'Unforced Errors', key: 'unforced_errors', category: 'COUNT' },
      { label: 'Service Faults', key: 'service_faults', category: 'COUNT' },
    ],
  },
  BASEBALL: {
    name: 'BASEBALL / SOFTBALL',
    shortId: 'BSBL',
    winCondition: 'HIGHEST_SCORE',
    positions: ['Pitcher', 'Catcher', 'First Base', 'Second Base', 'Third Base', 'Shortstop', 'Left Field', 'Center Field', 'Right Field', 'Designated Hitter'],
    stats: [
      { label: 'Hits', key: 'hits', category: 'COUNT' },
      { label: 'Runs', key: 'runs', category: 'COUNT' },
      { label: 'Runs Batted In', key: 'rbi', category: 'COUNT' },
      { label: 'Home Runs', key: 'home_runs', category: 'COUNT' },
      { label: 'Strikeouts', key: 'strikeouts', category: 'COUNT' },
      { label: 'Walks', key: 'walks', category: 'COUNT' },
      { label: 'Stolen Bases', key: 'stolen_bases', category: 'COUNT' },
      { label: 'Batting Average', key: 'batting_average', category: 'PERCENTAGE', formula: '(hits / at_bats) * 100' },
    ],
  },
};

// ─── 3 INITIAL CORE SPORTS ───────────────────────────────────────────────────
export const INITIAL_DEFAULT_SPORTS: SportConfiguration[] = [
  {
    sport_id: 'sport_basketball_default',
    sport_name: 'BASKETBALL',
    short_identifier: 'BBALL',
    configurable_stats: [
      { stat_name_key: 'points', measurement_category: 'Cumulative Total', label: 'POINTS', formula: 'SUM(POINTS)' },
      { stat_name_key: 'assists', measurement_category: 'Cumulative Total', label: 'ASSISTS', formula: 'SUM(ASSISTS)' },
      { stat_name_key: 'offensive_rebounds', measurement_category: 'Cumulative Total', label: 'OFFENSIVE REBOUNDS' },
      { stat_name_key: 'defensive_rebounds', measurement_category: 'Cumulative Total', label: 'DEFENSIVE REBOUNDS' },
      { stat_name_key: 'steals', measurement_category: 'Count', label: 'STEALS' },
      { stat_name_key: 'blocks', measurement_category: 'Count', label: 'BLOCKS' },
      { stat_name_key: 'fouls', measurement_category: 'Count', label: 'FOULS' },
      { stat_name_key: 'turnovers', measurement_category: 'Count', label: 'TURNOVERS' },
      { stat_name_key: 'fg_percentage', measurement_category: 'Percentage', label: 'FIELD GOAL ACCURACY', formula: '(fg_made / fg_attempted) * 100' },
      { stat_name_key: 'three_pt_percentage', measurement_category: 'Percentage', label: '3PT ACCURACY', formula: '(three_made / three_attempted) * 100' },
      { stat_name_key: 'ft_percentage', measurement_category: 'Percentage', label: 'FREE THROW ACCURACY', formula: '(ft_made / ft_attempted) * 100' },
    ],
    scoring_rules: { win_condition: 'HIGHEST_SCORE', period_format: '4_QUARTERS' },
    positions: ['POINT GUARD', 'SHOOTING GUARD', 'SMALL FORWARD', 'POWER FORWARD', 'CENTER'],
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    sport_id: 'sport_swimming_default',
    sport_name: 'SWIMMING',
    short_identifier: 'SWIM',
    configurable_stats: [
      { stat_name_key: 'finish_time_ms', measurement_category: 'Time (ms)', label: 'FINISH TIME', formula: 'split_1 + split_2 + split_3 + split_4' },
      { stat_name_key: 'distance_meters', measurement_category: 'Distance (m)', label: 'DISTANCE (M)' },
      { stat_name_key: 'split_times_ms', measurement_category: 'Time (ms)', label: 'SPLIT TIME (MS)' },
      { stat_name_key: 'lap_count', measurement_category: 'Count', label: 'LAP COUNT' },
      { stat_name_key: 'stroke_rate', measurement_category: 'Cumulative Total', label: 'STROKE RATE' },
    ],
    scoring_rules: { win_condition: 'LOWEST_TIME', lane_assignment: 'SEED_TIME' },
    positions: ['FREESTYLE', 'BACKSTROKE', 'BREASTSTROKE', 'BUTTERFLY', 'INDIVIDUAL MEDLEY', 'RELAY'],
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    sport_id: 'sport_track_field_default',
    sport_name: 'TRACK & FIELD',
    short_identifier: 'TF',
    configurable_stats: [
      { stat_name_key: 'finish_time_ms', measurement_category: 'Time (ms)', label: 'FINISH TIME' },
      { stat_name_key: 'distance_meters', measurement_category: 'Distance (m)', label: 'DISTANCE (M)' },
      { stat_name_key: 'split_times_ms', measurement_category: 'Time (ms)', label: 'SPLIT TIME' },
      { stat_name_key: 'attempt_number', measurement_category: 'Count', label: 'ATTEMPT NUMBER' },
      { stat_name_key: 'pace_per_km', measurement_category: 'Time (ms)', label: 'PACE PER KM' },
    ],
    scoring_rules: { win_condition: 'EVENT_SPECIFIC' },
    positions: ['SPRINTER', 'MIDDLE DISTANCE', 'LONG DISTANCE', 'HURDLER', 'JUMPER', 'THROWER'],
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
];

// Builder Form Metric Row Model
interface MetricFormItem {
  id: string;
  name: string;
  key: string;
  category: MetricCategoryOption;
  isCalculated: boolean;
  formula: string;
}

const DELETED_SPORTS_STORAGE_KEY = 'atleta_deleted_sport_keys';

const getDeletedSportKeys = (): Set<string> => {
  try {
    const raw = localStorage.getItem(DELETED_SPORTS_STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr.map((k: string) => String(k).toLowerCase().trim()));
    }
  } catch {}
  return new Set();
};

const addDeletedSportKey = (id?: string, name?: string) => {
  try {
    const set = getDeletedSportKeys();
    if (id) set.add(id.toLowerCase().trim());
    if (name) set.add(name.toLowerCase().trim());
    localStorage.setItem(DELETED_SPORTS_STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {}
};

const removeDeletedSportKey = (id?: string, name?: string) => {
  try {
    const set = getDeletedSportKeys();
    if (id) set.delete(id.toLowerCase().trim());
    if (name) set.delete(name.toLowerCase().trim());
    localStorage.setItem(DELETED_SPORTS_STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {}
};

export const SportPage: React.FC = () => {
  const navigate = useNavigate();

  // Catalog State
  const [sports, setSports] = useState<SportConfiguration[]>(() => {
    const deleted = getDeletedSportKeys();
    const filterOutDeleted = (list: SportConfiguration[]) =>
      list.filter((s) => {
        const id = (s.sport_id || '').toLowerCase().trim();
        const name = (s.sport_name || '').toLowerCase().trim();
        return !deleted.has(id) && !deleted.has(name);
      });

    const cached = getCachedData<SportConfiguration[]>('admin_sports_catalog');
    if (cached && cached.length > 0) {
      const filtered = filterOutDeleted(cached);
      if (filtered.length > 0) return filtered;
    }
    return filterOutDeleted(INITIAL_DEFAULT_SPORTS);
  });
  const [loading, setLoading] = useState(!getCachedData('admin_sports_catalog'));
  const [viewMode, setViewMode] = useState<'CATALOG' | 'BUILDER'>('CATALOG');

  // Builder State
  const [editingSportId, setEditingSportId] = useState<string | null>(null);
  const [sportName, setSportName] = useState('');
  const [shortId, setShortId] = useState('');
  const [positionsInput, setPositionsInput] = useState('');
  const [winCondition, setWinCondition] = useState('HIGHEST_SCORE');
  const [metrics, setMetrics] = useState<MetricFormItem[]>([]);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Deletion State
  const [sportToDelete, setSportToDelete] = useState<SportConfiguration | null>(null);
  const [deletingSport, setDeletingSport] = useState(false);

  // Helper: Detect core default sports that cannot be deleted
  const isCoreSport = (sport?: SportConfiguration | null): boolean => {
    if (!sport) return false;
    const id = (sport.sport_id || '').toLowerCase();
    const name = (sport.sport_name || '').toLowerCase();
    return (
      id.includes('basketball') ||
      id.includes('swimming') ||
      id.includes('track_field') ||
      name === 'basketball' ||
      name === 'swimming' ||
      name === 'track & field' ||
      name === 'track and field'
    );
  };

  const handleConfirmDelete = async () => {
    if (!sportToDelete) return;
    const cleanId = (sportToDelete.sport_id || '').toLowerCase().trim();
    const cleanName = (sportToDelete.sport_name || '').toLowerCase().trim();

    // 1. Immediately record in persistent tombstone set
    addDeletedSportKey(cleanId, cleanName);

    // 2. Immediately remove from local state & cache so UI updates instantly
    setSports((prev) => {
      const updated = prev.filter((s) => {
        const sId = (s.sport_id || '').toLowerCase().trim();
        const sName = (s.sport_name || '').toLowerCase().trim();
        return sId !== cleanId && sName !== cleanName;
      });
      setCachedData('admin_sports_catalog', updated);
      setCachedData('sports_catalog_false', { total_sports: updated.length, sports: updated });
      setCachedData('sports_catalog_true', {
        total_sports: updated.filter((s) => s.is_active !== false).length,
        sports: updated.filter((s) => s.is_active !== false),
      });
      return updated;
    });

    if (viewMode === 'BUILDER' && editingSportId === sportToDelete.sport_id) {
      setViewMode('CATALOG');
      setEditingSportId(null);
    }

    try {
      setDeletingSport(true);
      await deleteSport(sportToDelete.sport_id);
    } catch (err: any) {
      const msg = (err?.message || '').toLowerCase();
      // If 404 or not found, it is already deleted in the database, which is expected
      if (!msg.includes('not found') && !msg.includes('does not exist')) {
        console.warn('Backend delete notification:', err);
      }
    } finally {
      setDeletingSport(false);
      setSportToDelete(null);
    }
  };

  // Load catalog
  const loadCatalog = async (forceRefresh = false) => {
    try {
      if (sports.length === 0) setLoading(true);
      const res = await getSports(false, forceRefresh);
      const serverSports = Array.isArray(res?.sports)
        ? res.sports
        : Array.isArray(res)
          ? res
          : [];
      const deleted = getDeletedSportKeys();
      const filteredServerSports = serverSports.filter((s) => {
        const id = (s.sport_id || '').toLowerCase().trim();
        const name = (s.sport_name || '').toLowerCase().trim();
        return !deleted.has(id) && !deleted.has(name);
      });

      if (filteredServerSports.length > 0) {
        setSports(filteredServerSports);
        setCachedData('admin_sports_catalog', filteredServerSports);
      } else if (sports.length === 0) {
        setSports(INITIAL_DEFAULT_SPORTS.filter((s) => {
          const id = (s.sport_id || '').toLowerCase().trim();
          const name = (s.sport_name || '').toLowerCase().trim();
          return !deleted.has(id) && !deleted.has(name);
        }));
      }
    } catch (err: any) {
      console.error('Failed to load sports catalog:', err);
      if (sports.length === 0) setSports(INITIAL_DEFAULT_SPORTS);
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
    loadCatalog(true);

    const onSportsUpdated = () => {
      loadCatalog(true);
    };
    window.addEventListener('sports_updated', onSportsUpdated);
    return () => {
      window.removeEventListener('sports_updated', onSportsUpdated);
    };
  }, [navigate]);

  // Apply a Sport Template
  const handleApplyTemplate = (templateKey: string) => {
    setSelectedTemplateKey(templateKey);
    const tmpl = SPORT_TEMPLATES[templateKey];
    if (!tmpl) {
      // Blank custom sport
      setSportName('');
      setShortId('');
      setPositionsInput('');
      setWinCondition('HIGHEST_SCORE');
      setMetrics([
        {
          id: crypto.randomUUID(),
          name: 'Points',
          key: 'points',
          category: 'COUNT',
          isCalculated: false,
          formula: '',
        },
      ]);
      return;
    }

    setSportName(tmpl.name);
    setShortId(tmpl.shortId);
    setWinCondition(tmpl.winCondition);
    setPositionsInput(tmpl.positions.join(', '));
    setMetrics(
      tmpl.stats.map((st) => ({
        id: crypto.randomUUID(),
        name: st.label,
        key: st.key,
        category: st.category,
        isCalculated: !!st.formula,
        formula: st.formula || '',
      }))
    );
  };

  // Open Builder for new sport
  const handleOpenAddSport = () => {
    setEditingSportId(null);
    setSelectedTemplateKey('VOLLEYBALL');
    handleApplyTemplate('VOLLEYBALL');
    setFeedback(null);
    setViewMode('BUILDER');
  };

  // Open Builder to edit existing sport
  const handleEditSport = (sport: SportConfiguration) => {
    setEditingSportId(sport.sport_id);
    setSelectedTemplateKey(null);
    setSportName(sport.sport_name.toUpperCase());
    setShortId(sport.short_identifier.toUpperCase());
    setPositionsInput(Array.isArray(sport.positions) ? sport.positions.join(', ') : '');
    setWinCondition(
      typeof sport.scoring_rules?.win_condition === 'string'
        ? (sport.scoring_rules.win_condition as string)
        : 'HIGHEST_SCORE'
    );

    if (sport.configurable_stats && sport.configurable_stats.length > 0) {
      setMetrics(
        sport.configurable_stats.map((s) => {
          const rawCat = (s.measurement_category || '').toLowerCase();
          let category: MetricCategoryOption = 'COUNT';
          if (rawCat.includes('percent')) category = 'PERCENTAGE';
          else if (rawCat.includes('time')) category = 'TIME';
          else if (rawCat.includes('distance')) category = 'DISTANCE';

          return {
            id: crypto.randomUUID(),
            name: s.label || s.stat_name_key.replace(/_/g, ' ').toUpperCase(),
            key: s.stat_name_key.toLowerCase(),
            category,
            isCalculated: !!s.formula,
            formula: s.formula || '',
          };
        })
      );
    } else {
      setMetrics([
        {
          id: crypto.randomUUID(),
          name: 'Points',
          key: 'points',
          category: 'COUNT',
          isCalculated: false,
          formula: '',
        },
      ]);
    }

    setFeedback(null);
    setViewMode('BUILDER');
  };

  // Metric handlers
  const handleAddMetric = () => {
    setMetrics((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: '',
        key: '',
        category: 'COUNT',
        isCalculated: false,
        formula: '',
      },
    ]);
  };

  const handleRemoveMetric = (id: string) => {
    if (metrics.length <= 1) {
      alert('At least one metric is required for this sport.');
      return;
    }
    setMetrics((prev) => prev.filter((m) => m.id !== id));
  };

  const handleMetricNameChange = (id: string, name: string) => {
    setMetrics((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const autoKey = toSnakeCase(name);
        return {
          ...m,
          name,
          key: autoKey,
        };
      })
    );
  };

  const handleMetricCategoryChange = (id: string, category: MetricCategoryOption) => {
    setMetrics((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        // If changing to percentage, default to calculated if not already set
        const isCalculated = category === 'PERCENTAGE' ? true : m.isCalculated;
        return { ...m, category, isCalculated };
      })
    );
  };

  const handleToggleCalculated = (id: string, isCalculated: boolean) => {
    setMetrics((prev) =>
      prev.map((m) => (m.id === id ? { ...m, isCalculated, formula: isCalculated ? m.formula : '' } : m))
    );
  };

  const handleFormulaChange = (id: string, formula: string) => {
    setMetrics((prev) => prev.map((m) => (m.id === id ? { ...m, formula } : m)));
  };

  // Quick insert variable token into formula
  const handleInsertToken = (id: string, tokenKey: string) => {
    setMetrics((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const current = m.formula.trim();
        const updated = current ? `${current} ${tokenKey}` : tokenKey;
        return { ...m, formula: updated };
      })
    );
  };

  // Auto-generate short ID if empty when typing sport name
  const handleSportNameChange = (name: string) => {
    setSportName(name);
    if (!editingSportId && (!shortId || shortId === toSnakeCase(sportName).substring(0, 5).toUpperCase())) {
      const suggestedShort = toSnakeCase(name).replace(/_/g, '').substring(0, 5).toUpperCase();
      setShortId(suggestedShort);
    }
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const cleanSportName = sportName.trim().toUpperCase();
    const cleanShortId = shortId.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');

    if (!cleanSportName) {
      setFeedback({ type: 'error', message: 'Please provide a sport name.' });
      return;
    }
    if (!cleanShortId) {
      setFeedback({ type: 'error', message: 'Please provide a short code (e.g. VBALL, SOC, TF).' });
      return;
    }

    // Validate metrics
    const seenKeys = new Set<string>();
    const formattedStats: BackendConfigurableStat[] = [];
    const stat_schema: Record<string, any> = {};

    for (let i = 0; i < metrics.length; i++) {
      const m = metrics[i];
      const rawName = m.name.trim();
      const rawKey = m.key.trim() ? toSnakeCase(m.key) : toSnakeCase(rawName);

      if (!rawName || !rawKey) {
        setFeedback({ type: 'error', message: `Metric #${i + 1} needs a name.` });
        return;
      }
      if (seenKeys.has(rawKey)) {
        setFeedback({
          type: 'error',
          message: `Duplicate metric key "${rawKey}" found. Each metric in the sport must be unique.`,
        });
        return;
      }
      seenKeys.add(rawKey);

      const backendCat = METRIC_TYPE_CONFIG[m.category]?.backendCategory || 'Cumulative Total';
      const cleanFormula = m.isCalculated && m.formula.trim() ? m.formula.trim() : undefined;

      const statObj: BackendConfigurableStat = {
        stat_name_key: rawKey,
        measurement_category: backendCat,
        label: rawName.toUpperCase(),
        formula: cleanFormula,
      };

      formattedStats.push(statObj);
      stat_schema[rawKey] = {
        measurement_category: backendCat,
        display_label: rawName.toUpperCase(),
        formula: cleanFormula,
      };
    }

    const positions = positionsInput
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    const payload = {
      sport_name: cleanSportName,
      short_identifier: cleanShortId,
      configurable_stats: formattedStats,
      stat_schema,
      positions,
      scoring_rules: {
        win_condition: winCondition,
      },
    };

    try {
      setSubmitting(true);
      let savedSport: SportConfiguration;

      if (editingSportId) {
        const res = await updateSport(editingSportId, payload);
        savedSport = res?.sport || {
          sport_id: editingSportId,
          ...payload,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setFeedback({ type: 'success', message: `Sport "${cleanSportName}" successfully updated!` });
      } else {
        const res = await createSport(payload);
        savedSport = res?.sport || {
          sport_id: `sport_${Date.now()}`,
          ...payload,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setFeedback({ type: 'success', message: `Sport "${cleanSportName}" successfully created!` });
      }

      removeDeletedSportKey(savedSport.sport_id, cleanSportName);

      setSports((prev) => {
        const cleanId = (savedSport.sport_id || editingSportId || '').toLowerCase();
        const cleanName = (savedSport.sport_name || cleanSportName || '').toUpperCase();
        const exists = prev.some(
          (s) =>
            (s.sport_id || '').toLowerCase() === cleanId ||
            (s.sport_name || '').toUpperCase() === cleanName
        );
        const updated = exists
          ? prev.map((s) =>
              (s.sport_id || '').toLowerCase() === cleanId ||
              (s.sport_name || '').toUpperCase() === cleanName
                ? { ...s, ...savedSport }
                : s
            )
          : [...prev, savedSport];
        setCachedData('admin_sports_catalog', updated);
        setCachedData('sports_catalog_false', { total_sports: updated.length, sports: updated });
        setCachedData('sports_catalog_true', {
          total_sports: updated.filter((s) => s.is_active !== false).length,
          sports: updated.filter((s) => s.is_active !== false),
        });
        return updated;
      });

      setTimeout(() => {
        setViewMode('CATALOG');
        setFeedback(null);
      }, 1000);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save sport configuration.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.shell}>
      <Navbar title="ADMIN DASHBOARD" />

      <div style={styles.layout}>
        <Sidebar activeTab="SPORT_MANAGER" />

        <main style={styles.main}>
          {viewMode === 'CATALOG' ? (
            <div>
              {/* Header */}
              <div style={styles.titleRow}>
                <div>
                  <h1 style={styles.pageTitle}>SPORT CONFIGURATION</h1>
                  <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
                    AVAILABLE SPORTS & LIVE SCORING RULES
                  </p>
                </div>
                <button type="button" onClick={handleOpenAddSport} style={styles.primaryActionBtn}>
                  <PlusCircle style={{ width: 16, height: 16 }} />
                  <span>ADD SPORT</span>
                </button>
              </div>

              {/* Feedback Alert */}
              {feedback && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: '2px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontSize: '13px',
                    fontWeight: 700,
                    backgroundColor: feedback.type === 'success' ? '#DCFCE7' : '#FEE2E2',
                    color: feedback.type === 'success' ? '#166534' : '#991B1B',
                  }}
                >
                  {feedback.type === 'success' ? (
                    <CheckCircle2 style={{ width: 18, height: 18 }} />
                  ) : (
                    <AlertCircle style={{ width: 18, height: 18 }} />
                  )}
                  <span>{feedback.message}</span>
                </div>
              )}

              {/* Table of Available Sports */}
              <div style={styles.catalogTableBox}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>SPORT NAME</th>
                      <th style={styles.th}>SHORT CODE</th>
                      <th style={styles.th}>TRACKED STATS & FORMULAS</th>
                      <th style={{ ...styles.th, textAlign: 'center', borderRight: 'none' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && sports.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ padding: '40px', textAlign: 'center' }}>
                          <Loader2
                            style={{
                              width: 24,
                              height: 24,
                              animation: 'spin 1s linear infinite',
                              margin: '0 auto',
                              color: '#0B132B',
                            }}
                          />
                        </td>
                      </tr>
                    ) : (
                      sports.map((sport) => {
                        const hasStats = sport.configurable_stats && sport.configurable_stats.length > 0;
                        return (
                          <tr key={sport.sport_id || sport.short_identifier}>
                            <td style={{ ...styles.td, fontWeight: 900, textTransform: 'uppercase' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>{sport.sport_name}</span>
                                {['BASKETBALL', 'SWIMMING', 'TRACK & FIELD'].includes(sport.sport_name.toUpperCase()) && (
                                  <span
                                    style={{
                                      fontSize: '9px',
                                      fontWeight: 800,
                                      padding: '2px 6px',
                                      backgroundColor: '#F1F5F9',
                                      color: '#475569',
                                      borderRadius: '2px',
                                      letterSpacing: '0.04em',
                                    }}
                                  >
                                    CORE
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ ...styles.td, fontFamily: 'monospace', fontWeight: 800 }}>
                              {sport.short_identifier}
                            </td>
                            <td style={styles.td}>
                              {hasStats ? (
                                <div>
                                  {sport.configurable_stats.slice(0, 5).map((st, i) => (
                                    <span
                                      key={i}
                                      style={styles.statTag}
                                      title={st.formula ? `Formula: ${st.formula}` : undefined}
                                    >
                                      {st.label || st.stat_name_key.toUpperCase()}
                                    </span>
                                  ))}
                                  {sport.configurable_stats.length > 5 && (
                                    <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>
                                      +{sport.configurable_stats.length - 5} more
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span style={{ color: '#94A3B8', fontSize: '12px' }}>Standard Rules</span>
                              )}
                            </td>
                            <td style={{ ...styles.td, textAlign: 'center', borderRight: 'none' }}>
                              <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleEditSport(sport)}
                                  style={styles.actionBtnOutline}
                                >
                                  EDIT
                                </button>
                                {!isCoreSport(sport) && (
                                  <button
                                    type="button"
                                    onClick={() => setSportToDelete(sport)}
                                    title={`Delete ${sport.sport_name}`}
                                    style={{
                                      ...styles.actionBtnOutline,
                                      borderColor: '#EF4444',
                                      color: '#EF4444',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      padding: '6px 10px',
                                    }}
                                  >
                                    <Trash2 style={{ width: 14, height: 14 }} />
                                    <span>DELETE</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Builder Mode */
            <div>
              {/* Back Button */}
              <div style={styles.topNavRow}>
                <button type="button" onClick={() => setViewMode('CATALOG')} style={styles.breadcrumbBtn}>
                  <ArrowLeft style={{ width: 14, height: 14 }} />
                  <span>BACK TO ALL SPORTS</span>
                </button>
              </div>

              {/* Title */}
              <div style={styles.titleRow}>
                <div>
                  <h1 style={styles.pageTitle}>
                    {editingSportId ? 'EDIT SPORT CONFIGURATION' : 'ADD NEW SPORT'}
                  </h1>
                  <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
                    CONFIGURE SPORT RULES, TRACKED STATS, AND OPTIONAL FORMULAS
                  </p>
                </div>
              </div>

              {/* Quick Template Picker (Shown when creating new sport) */}
              {!editingSportId && (
                <div style={styles.templateBar}>
                  <span style={styles.templateLabel}>Quick Template:</span>
                  {Object.entries(SPORT_TEMPLATES).map(([key, tmpl]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleApplyTemplate(key)}
                      style={selectedTemplateKey === key ? styles.templatePillActive : styles.templatePill}
                    >
                      {tmpl.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleApplyTemplate('CUSTOM')}
                    style={selectedTemplateKey === 'CUSTOM' ? styles.templatePillActive : styles.templatePill}
                  >
                    + Blank Sport
                  </button>
                </div>
              )}

              {/* Feedback Banner */}
              {feedback && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: '2px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontSize: '13px',
                    fontWeight: 700,
                    backgroundColor: feedback.type === 'success' ? '#DCFCE7' : '#FEE2E2',
                    color: feedback.type === 'success' ? '#166534' : '#991B1B',
                  }}
                >
                  {feedback.type === 'success' ? (
                    <CheckCircle2 style={{ width: 18, height: 18 }} />
                  ) : (
                    <AlertCircle style={{ width: 18, height: 18 }} />
                  )}
                  <span>{feedback.message}</span>
                </div>
              )}

              {/* Form Grid */}
              <form onSubmit={handleSubmit}>
                <div style={styles.workspaceGrid}>
                  {/* Left Column: Basic Sport Details */}
                  <div style={styles.leftPanelCard}>
                    <div style={styles.leftPanelHeader}>
                      <PlusCircle style={{ width: 18, height: 18, color: '#0B132B' }} />
                      <span>SPORT DETAILS</span>
                    </div>

                    <div style={styles.fieldGroup}>
                      <label style={styles.fieldLabel}>Sport Name</label>
                      <input
                        type="text"
                        value={sportName}
                        onChange={(e) => handleSportNameChange(e.target.value)}
                        placeholder="e.g. Volleyball, Tennis, Soccer"
                        style={styles.textInput}
                        required
                      />
                    </div>

                    <div style={styles.fieldGroup}>
                      <label style={styles.fieldLabel}>Short Code (2-6 letters)</label>
                      <input
                        type="text"
                        value={shortId}
                        onChange={(e) => setShortId(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                        placeholder="e.g. VBALL"
                        maxLength={10}
                        style={styles.textInput}
                        required
                      />
                    </div>

                    <div style={styles.fieldGroup}>
                      <label style={styles.fieldLabel}>Positions / Player Roles (Optional)</label>
                      <input
                        type="text"
                        value={positionsInput}
                        onChange={(e) => setPositionsInput(e.target.value)}
                        placeholder="e.g. Setter, Outside Hitter, Libero"
                        style={{ ...styles.textInput, fontSize: '11px' }}
                      />
                      <span style={{ fontSize: '10px', color: '#64748B', marginTop: '4px', display: 'block' }}>
                        Separate multiple positions with commas.
                      </span>
                    </div>

                    <div style={{ ...styles.fieldGroup, marginBottom: 0 }}>
                      <label style={styles.fieldLabel}>Match Win Condition</label>
                      <div style={styles.selectWrapper}>
                        <select
                          value={winCondition}
                          onChange={(e) => setWinCondition(e.target.value)}
                          style={{ ...styles.selectDropdown, fontSize: '11px' }}
                        >
                          <option value="HIGHEST_SCORE">Highest Score Wins (Ball Games, Points)</option>
                          <option value="LOWEST_TIME">Lowest Time Wins (Races, Swimming, Sprints)</option>
                          <option value="EVENT_SPECIFIC">Event-Specific (Track & Field, Distance, Sets)</option>
                        </select>
                        <ChevronDown style={styles.selectChevron} />
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Dynamic Tracked Stats & Formulas */}
                  <div style={styles.rightPanelCard}>
                    <div style={styles.rightPanelHeader}>
                      <div style={styles.rightPanelHeaderTitle}>
                        <BarChart3 style={{ width: 18, height: 18, color: '#0B132B' }} />
                        <span>TRACKED METRICS & FORMULAS</span>
                      </div>
                      <span style={styles.metricCountBadge}>
                        {metrics.length} {metrics.length === 1 ? 'Metric' : 'Metrics'}
                      </span>
                    </div>

                    <div style={styles.metricCardsList}>
                      {metrics.map((metric, idx) => {
                        const otherMetrics = metrics.filter((m) => m.id !== metric.id && m.key.trim());

                        return (
                          <div key={metric.id || idx} style={styles.metricRowBox}>
                            {metrics.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveMetric(metric.id)}
                                style={styles.removeStatBtn}
                                title="Remove Metric"
                              >
                                <Trash2 style={{ width: 16, height: 16 }} />
                              </button>
                            )}

                            <div style={styles.metricFormRow}>
                              {/* Metric Name */}
                              <div>
                                <label style={styles.fieldLabel}>Metric Name</label>
                                <input
                                  type="text"
                                  value={metric.name}
                                  onChange={(e) => handleMetricNameChange(metric.id, e.target.value)}
                                  placeholder="e.g. Points, Aces, Spike Kills, Goals"
                                  style={styles.textInput}
                                  required
                                />
                                <span
                                  style={{
                                    fontSize: '10px',
                                    color: '#64748B',
                                    fontFamily: 'monospace',
                                    marginTop: '4px',
                                    display: 'block',
                                  }}
                                >
                                  System Key: {metric.key || '...'}
                                </span>
                              </div>

                              {/* Metric Type */}
                              <div>
                                <label style={styles.fieldLabel}>Measurement Type</label>
                                <div style={styles.selectWrapper}>
                                  <select
                                    value={metric.category}
                                    onChange={(e) =>
                                      handleMetricCategoryChange(metric.id, e.target.value as MetricCategoryOption)
                                    }
                                    style={styles.selectDropdown}
                                  >
                                    {(Object.keys(METRIC_TYPE_CONFIG) as MetricCategoryOption[]).map((cat) => (
                                      <option key={cat} value={cat}>
                                        {METRIC_TYPE_CONFIG[cat].label}
                                      </option>
                                    ))}
                                  </select>
                                  <ChevronDown style={styles.selectChevron} />
                                </div>
                                <span style={{ fontSize: '10px', color: '#64748B', marginTop: '4px', display: 'block' }}>
                                  {METRIC_TYPE_CONFIG[metric.category]?.hint}
                                </span>
                              </div>
                            </div>

                            {/* Direct Stat vs Calculated Formula Switcher */}
                            <div style={styles.calcToggleRow}>
                              <span style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>
                                Calculation Mode:
                              </span>
                              <div style={styles.toggleBtnGroup}>
                                <button
                                  type="button"
                                  onClick={() => handleToggleCalculated(metric.id, false)}
                                  style={!metric.isCalculated ? styles.toggleOptionBtnActive : styles.toggleOptionBtn}
                                >
                                  Direct (Recorded Live)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleCalculated(metric.id, true)}
                                  style={metric.isCalculated ? styles.toggleOptionBtnActive : styles.toggleOptionBtn}
                                >
                                  Formula (Calculated)
                                </button>
                              </div>
                            </div>

                            {/* Formula Builder (Shown if Calculated) */}
                            {metric.isCalculated && (
                              <div style={styles.formulaHelperBox}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                  <Calculator style={{ width: 13, height: 13, color: '#0B132B' }} />
                                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#0B132B' }}>
                                    FORMULA CALCULATION
                                  </span>
                                </div>

                                <p style={{ fontSize: '11px', color: '#64748B', margin: '2px 0 8px 0' }}>
                                  Enter math formula using variable keys (e.g. <code>(kills / total_attacks) * 100</code> or <code>split_1 + split_2</code>).
                                </p>

                                {/* Clickable tokens */}
                                {otherMetrics.length > 0 && (
                                  <div>
                                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#475569' }}>
                                      Click to insert metric variable:
                                    </span>
                                    <div style={styles.chipList}>
                                      {otherMetrics.map((om) => (
                                        <button
                                          key={om.id}
                                          type="button"
                                          onClick={() => handleInsertToken(metric.id, om.key)}
                                          style={styles.variableChip}
                                          title={`Click to insert ${om.key}`}
                                        >
                                          + {om.key}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Formula Presets */}
                                <div style={{ marginBottom: '8px' }}>
                                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#475569', marginRight: '6px' }}>
                                    Quick helpers:
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleFormulaChange(metric.id, '(made / attempted) * 100')}
                                    style={styles.formulaPresetBtn}
                                  >
                                    Accuracy %
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleFormulaChange(metric.id, 'stat_a + stat_b')}
                                    style={styles.formulaPresetBtn}
                                  >
                                    Sum (+)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleFormulaChange(metric.id, 'total / games')}
                                    style={styles.formulaPresetBtn}
                                  >
                                    Average (/)
                                  </button>
                                </div>

                                <input
                                  type="text"
                                  value={metric.formula}
                                  onChange={(e) => handleFormulaChange(metric.id, e.target.value)}
                                  placeholder="e.g. (kills / total_attempts) * 100"
                                  style={{
                                    ...styles.textInput,
                                    fontSize: '12px',
                                    padding: '10px 12px',
                                    backgroundColor: '#FFFFFF',
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Add Metric Button */}
                      <button type="button" onClick={handleAddMetric} style={styles.addMetricDashedBtn}>
                        <div style={styles.plusSquareIcon}>
                          <Plus style={{ width: 16, height: 16 }} />
                        </div>
                        <span style={styles.addMetricText}>+ Add Another Metric</span>
                      </button>
                    </div>

                    {/* Footer */}
                    <div style={styles.panelFooter}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {editingSportId && (() => {
                          const currentSport = sports.find((s) => s.sport_id === editingSportId);
                          if (currentSport && !isCoreSport(currentSport)) {
                            return (
                              <button
                                type="button"
                                onClick={() => setSportToDelete(currentSport)}
                                style={{
                                  padding: '10px 16px',
                                  borderRadius: '8px',
                                  border: '1px solid #EF4444',
                                  backgroundColor: '#FEF2F2',
                                  color: '#DC2626',
                                  fontWeight: 700,
                                  fontSize: '13px',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}
                              >
                                <Trash2 style={{ width: 15, height: 15 }} />
                                <span>DELETE SPORT</span>
                              </button>
                            );
                          }
                          return null;
                        })()}
                        <p style={styles.footerNoticeText}>
                          Configured metrics and formulas automatically sync across the coach mobile app and official scorekeeping screens.
                        </p>
                      </div>
                      <button
                        type="submit"
                        disabled={submitting}
                        style={{
                          ...styles.submitBtn,
                          opacity: submitting ? 0.7 : 1,
                        }}
                      >
                        {submitting ? (
                          <>
                            <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} />
                            <span>SAVING SPORT...</span>
                          </>
                        ) : (
                          <>
                            <span>SAVE SPORT CONFIGURATION</span>
                            <Save style={{ width: 16, height: 16 }} />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          )}
        </main>
      </div>

      {/* Delete Confirmation Modal */}
      {sportToDelete && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              maxWidth: '460px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: '#FEE2E2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#DC2626',
                  flexShrink: 0,
                }}
              >
                <Trash2 style={{ width: 20, height: 20 }} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>
                  Delete Sport Configuration
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748B' }}>
                  Permanent deletion confirmation
                </p>
              </div>
            </div>

            <p style={{ fontSize: '14px', color: '#334155', lineHeight: 1.5, marginBottom: '24px' }}>
              Are you sure you want to permanently delete{' '}
              <strong>{sportToDelete.sport_name}</strong> ({sportToDelete.short_identifier})?
              All configured metrics and scoring rules for this sport will be removed from the system.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                disabled={deletingSport}
                onClick={() => setSportToDelete(null)}
                style={{
                  padding: '9px 16px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#475569',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingSport}
                onClick={handleConfirmDelete}
                style={{
                  padding: '9px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#DC2626',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {deletingSport ? (
                  <>
                    <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 style={{ width: 14, height: 14 }} />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SportPage;
