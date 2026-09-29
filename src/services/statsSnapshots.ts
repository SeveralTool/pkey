/**
 * @fileoverview Lightweight local ring buffer of vault health snapshots for trends.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const SNAPSHOTS_KEY = 'pkey_stats_snapshots_v1';
const MAX_SNAPSHOTS = 14;
/** Minimum gap between snapshots unless health metrics change. */
const MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;

export interface StatsSnapshot {
  at: string;
  healthScore: number;
  weakCount: number;
  staleCount: number;
  duplicatedCount: number;
}

function parseSnapshot(raw: unknown): StatsSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<StatsSnapshot>;
  if (
    typeof s.at !== 'string' ||
    typeof s.healthScore !== 'number' ||
    typeof s.weakCount !== 'number' ||
    typeof s.staleCount !== 'number' ||
    typeof s.duplicatedCount !== 'number'
  ) {
    return null;
  }
  return {
    at: s.at,
    healthScore: s.healthScore,
    weakCount: s.weakCount,
    staleCount: s.staleCount,
    duplicatedCount: s.duplicatedCount,
  };
}

export async function getStatsSnapshots(): Promise<StatsSnapshot[]> {
  try {
    const raw = await AsyncStorage.getItem(SNAPSHOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseSnapshot).filter((s): s is StatsSnapshot => s != null);
  } catch {
    return [];
  }
}

function metricsEqual(a: StatsSnapshot, b: Omit<StatsSnapshot, 'at'>): boolean {
  return (
    a.healthScore === b.healthScore &&
    a.weakCount === b.weakCount &&
    a.staleCount === b.staleCount &&
    a.duplicatedCount === b.duplicatedCount
  );
}

/**
 * Records a snapshot when enough time passed or health metrics changed.
 * Returns the updated list (newest first).
 */
export async function maybeRecordStatsSnapshot(
  metrics: Omit<StatsSnapshot, 'at'>,
  nowMs: number = Date.now()
): Promise<StatsSnapshot[]> {
  const existing = await getStatsSnapshots();
  const latest = existing[0];
  if (latest) {
    const age = nowMs - Date.parse(latest.at);
    if (!Number.isNaN(age) && age < MIN_INTERVAL_MS && metricsEqual(latest, metrics)) {
      return existing;
    }
  }

  const snap: StatsSnapshot = { at: new Date(nowMs).toISOString(), ...metrics };
  const next = [snap, ...existing].slice(0, MAX_SNAPSHOTS);
  try {
    await AsyncStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('[statsSnapshots] persist failed', e);
  }
  return next;
}
