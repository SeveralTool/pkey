/**
 * @fileoverview Unencrypted CSV export of vault cards (interoperable escape hatch).
 */
import type { PasswordCard } from '../types';

const HEADERS = [
  'title',
  'type',
  'username',
  'password',
  'link',
  'notes',
  'otpSecret',
  'tags',
] as const;

function csvEscape(value: string): string {
  const s = value ?? '';
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Builds a CSV string suitable for generic password-manager import. */
export function exportCardsToCsv(cards: PasswordCard[]): string {
  const lines = [HEADERS.join(',')];
  for (const card of cards) {
    if (!card?.id) continue;
    const password =
      card.type === 'SECRET_PHRASE'
        ? (card.passwordList ?? []).join(' ')
        : (card.passwordList?.[0] ?? '');
    const row = [
      card.title ?? '',
      card.type ?? 'PASSWORD',
      card.username ?? '',
      password,
      card.link ?? '',
      card.notes ?? '',
      card.otpSecret ?? '',
      (card.tags ?? []).join(';'),
    ].map(csvEscape);
    lines.push(row.join(','));
  }
  return `${lines.join('\n')}\n`;
}
