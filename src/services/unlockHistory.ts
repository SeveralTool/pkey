/**
 * @fileoverview Persisted unlock events (last success + short history ring).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_UNLOCK_KEY = 'pkey_last_unlock_v1';
const HISTORY_KEY = 'pkey_unlock_history_v1';
const MAX_HISTORY = 20;

export type UnlockMethod = 'password' | 'biometrics';

export interface UnlockEvent {
  at: string;
  method: UnlockMethod;
  ok: boolean;
}

function parseEvent(raw: unknown): UnlockEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Partial<UnlockEvent>;
  if (typeof e.at !== 'string' || (e.method !== 'password' && e.method !== 'biometrics')) {
    return null;
  }
  if (typeof e.ok !== 'boolean') return null;
  return { at: e.at, method: e.method, ok: e.ok };
}

async function readHistory(): Promise<UnlockEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseEvent).filter((e): e is UnlockEvent => e != null);
  } catch {
    return [];
  }
}

/** Last successful unlock (survives logout / process kill). */
export async function getLastSuccessfulUnlock(): Promise<UnlockEvent | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_UNLOCK_KEY);
    if (!raw) return null;
    const event = parseEvent(JSON.parse(raw));
    return event?.ok ? event : null;
  } catch {
    return null;
  }
}

/** Recent unlock attempts (success and failure), newest first. */
export async function getUnlockHistory(): Promise<UnlockEvent[]> {
  return readHistory();
}

/** Appends an unlock event; successful ones also update last-unlock. */
export async function recordUnlockEvent(
  method: UnlockMethod,
  ok: boolean,
  at: string = new Date().toISOString()
): Promise<UnlockEvent> {
  const event: UnlockEvent = { at, method, ok };
  const history = await readHistory();
  const next = [event, ...history].slice(0, MAX_HISTORY);
  try {
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    if (ok) {
      await AsyncStorage.setItem(LAST_UNLOCK_KEY, JSON.stringify(event));
    }
  } catch (e) {
    console.warn('[unlockHistory] persist failed', e);
  }
  return event;
}
