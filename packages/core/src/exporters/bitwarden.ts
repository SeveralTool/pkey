/**
 * @fileoverview Bitwarden-compatible unencrypted JSON export (items[]).
 */
import type { PasswordCard } from '../types';
import { buildCardLinkFields, parseLinkIdentity } from '../links';

export interface BitwardenExportItem {
  type: number;
  name: string;
  notes: string;
  login?: {
    username: string;
    password: string;
    totp: string;
    uris: { match: null; uri: string }[];
  };
  secureNote?: { type: number };
}

export interface BitwardenExportPayload {
  encrypted: false;
  folders: [];
  items: BitwardenExportItem[];
}

function toBitwardenUri(raw: string): string {
  const id = parseLinkIdentity(raw);
  if (id?.androidPackage) return `androidapp://${id.androidPackage}`;
  if (id?.kind === 'web' && id.host) return id.canonical;
  return raw;
}

function exportUriList(card: PasswordCard): { match: null; uri: string }[] {
  const fields = buildCardLinkFields([card.link ?? '', ...(card.uris ?? [])]);
  const raw = [fields.link, ...(fields.uris ?? [])].filter(Boolean);
  const seen = new Set<string>();
  const out: { match: null; uri: string }[] = [];
  // https first, then androidapp://
  const ordered = [...raw].sort((a, b) => {
    const ah = /^https?:/i.test(a) ? 0 : 1;
    const bh = /^https?:/i.test(b) ? 0 : 1;
    return ah - bh;
  });
  for (const u of ordered) {
    const uri = toBitwardenUri(u);
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    out.push({ match: null, uri });
  }
  return out;
}

/** Builds a Bitwarden-style unencrypted JSON export object. */
export function exportCardsToBitwarden(cards: PasswordCard[]): BitwardenExportPayload {
  const items: BitwardenExportItem[] = [];
  for (const card of cards) {
    if (!card?.id) continue;
    if (card.type === 'SECRET_PHRASE' || card.type === 'NOTE') {
      items.push({
        type: 2,
        name: card.title || 'Secure Note',
        notes:
          card.type === 'NOTE'
            ? card.notes ?? ''
            : [card.notes, (card.passwordList ?? []).join(' ')].filter(Boolean).join('\n\n'),
        secureNote: { type: 0 },
      });
      continue;
    }
    const password = card.passwordList?.[0] ?? '';
    items.push({
      type: 1,
      name: card.title || 'Login',
      notes: card.notes ?? '',
      login: {
        username: card.username ?? '',
        password,
        totp: card.otpSecret ?? '',
        uris: exportUriList(card),
      },
    });
  }
  return { encrypted: false, folders: [], items };
}

/** Serializes {@link exportCardsToBitwarden} as pretty JSON. */
export function exportCardsToBitwardenJson(cards: PasswordCard[]): string {
  return `${JSON.stringify(exportCardsToBitwarden(cards), null, 2)}\n`;
}
