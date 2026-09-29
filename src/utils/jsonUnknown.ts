/**
 * @fileoverview JSON.parse without asserting a typed result.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Distinguishes invalid JSON from a successful parse of JSON `null`.
 */
export function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

/**
 * Parses JSON text to `unknown`. Invalid JSON yields `null` (same as JSON `null`).
 */
export function parseJsonUnknown(text: string): unknown | null {
  const parsed = tryParseJson(text);
  return parsed.ok ? parsed.value : null;
}
