/**
 * @fileoverview Maximum lengths for vault card text fields and clamp helper.
 */

/** Max characters for card title. */
export const CARD_TITLE_MAX = 512;
/** Max characters for username. */
export const CARD_USERNAME_MAX = 512;
/** Max characters for link/URL. */
export const CARD_LINK_MAX = 2048;
/** Max extra URI aliases stored on a card (`uris[]`). */
export const CARD_URIS_MAX = 16;
/** Max characters for a single password entry. */
export const CARD_PASSWORD_MAX = 512;
/** Max characters for notes. */
export const CARD_NOTES_MAX = 10_000;

/** Result of clamping a string field to a max length. */
export interface ClampFieldResult {
  value: string;
  truncated: boolean;
}

/**
 * Trim whitespace then slice to max; reports whether content was cut.
 *
 * @param value - Raw field value.
 * @param max - Maximum allowed length after trim.
 * @returns Clamped value and whether truncation occurred.
 */
export function clampField(value: string, max: number): ClampFieldResult {
  const trimmed = value.trim();
  if (trimmed.length <= max) {
    return { value: trimmed, truncated: false };
  }
  return { value: trimmed.slice(0, max), truncated: true };
}
