/**
 * @fileoverview Generic unencrypted JSON export of vault cards.
 */
import type { PasswordCard } from '../types';

export interface PkeyJsonExportPayload {
  format: 'pkey-json';
  version: 1;
  exportedAt: string;
  cards: PasswordCard[];
}

/** Builds a plain JSON export (cards with secrets; not encrypted). */
export function exportCardsToJson(cards: PasswordCard[]): PkeyJsonExportPayload {
  return {
    format: 'pkey-json',
    version: 1,
    exportedAt: new Date().toISOString(),
    cards: cards.filter((c) => c?.id),
  };
}

/** Serializes {@link exportCardsToJson} as pretty JSON. */
export function exportCardsToJsonString(cards: PasswordCard[]): string {
  return `${JSON.stringify(exportCardsToJson(cards), null, 2)}\n`;
}
