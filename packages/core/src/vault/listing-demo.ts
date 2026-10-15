/**
 * @fileoverview Fictional Play Store listing vault. Never use real credentials.
 *
 * Applied on-device (empty vault or cards already tagged `demo`). The CLI
 * writes a stable CSV for import; it cannot decrypt the phone vault.
 */

import type { CardIcon, PasswordCard } from '../types/index';
import { exportCardsToCsv } from '../exporters/csv';
import { generateSecureId } from '../util/secureRandom';
import { normalizeTags } from '../util/normalizeTags';

/** Tag applied to every listing card. Real vaults without this tag are refused. */
export const LISTING_DEMO_TAG = 'demo';

/** RFC 4226 / 6238 well-known test secret (Base32 of "Hello!"). Not a real OTP. */
const DEMO_OTP_SECRET = 'JBSWY3DPEHPK3PXP';

const DEMO_NOTE =
  'Datos de demostración para la ficha de Play Store. No es una cuenta real.';

const GOOGLE_LINK = 'https://accounts.google.com';

type DemoDraft = {
  type: PasswordCard['type'];
  title: string;
  username: string;
  passwordList: string[];
  link: string;
  notes: string;
  otpSecret?: string;
  extraTags?: string[];
  icon: CardIcon;
};

function icon(value: string): CardIcon {
  return { type: 'icon', value };
}

/** Catalog used by the CLI CSV and the in-app seed (same titles/urls). */
export function listingDemoDrafts(): readonly DemoDraft[] {
  return [
    {
      type: 'PASSWORD',
      title: 'Instagram',
      username: 'pkey.demo',
      passwordList: ['Demo-Ig-2026!'],
      link: 'https://www.instagram.com',
      notes: DEMO_NOTE,
      otpSecret: DEMO_OTP_SECRET,
      extraTags: ['social'],
      icon: icon('logo-instagram'),
    },
    {
      type: 'PASSWORD',
      title: 'Google',
      username: 'pkey.demo@example.com',
      passwordList: ['Demo-Google-2026!'],
      link: GOOGLE_LINK,
      notes: `${DEMO_NOTE} Cuenta personal.`,
      otpSecret: DEMO_OTP_SECRET,
      extraTags: ['correo'],
      icon: icon('logo-google'),
    },
    {
      type: 'PASSWORD',
      title: 'Google',
      username: 'pkey.trabajo@example.com',
      passwordList: ['Demo-Google-Trabajo-2026!'],
      link: GOOGLE_LINK,
      notes: `${DEMO_NOTE} Cuenta de trabajo.`,
      extraTags: ['correo', 'trabajo'],
      icon: icon('logo-google'),
    },
    {
      type: 'PASSWORD',
      title: 'Google',
      username: 'pkey.alt@example.com',
      passwordList: ['Demo-Google-Alt-2026!'],
      link: GOOGLE_LINK,
      notes: `${DEMO_NOTE} Cuenta alternativa.`,
      extraTags: ['correo'],
      icon: icon('logo-google'),
    },
    {
      type: 'PASSWORD',
      title: 'Banco',
      username: 'pkey.demo',
      passwordList: ['Demo-Banco-2026!'],
      link: '',
      notes: `${DEMO_NOTE} Banco ficticio, sin URL a propósito.`,
      extraTags: ['finanzas'],
      icon: icon('bank-outline'),
    },
    {
      type: 'PASSWORD',
      title: 'TikTok',
      username: 'pkey.demo',
      passwordList: ['Demo-TikTok-2026!'],
      link: 'https://www.tiktok.com',
      notes: DEMO_NOTE,
      extraTags: ['social'],
      icon: icon('logo-tiktok'),
    },
    {
      type: 'PASSWORD',
      title: 'Cursor',
      username: 'pkey.demo@example.com',
      passwordList: ['Demo-Cursor-2026!'],
      link: 'https://cursor.com',
      notes: DEMO_NOTE,
      extraTags: ['trabajo'],
      icon: icon('code-slash-outline'),
    },
    {
      type: 'PASSWORD',
      title: 'Twitch',
      username: 'pkey.demo',
      passwordList: ['Demo-Twitch-2026!'],
      link: 'https://www.twitch.tv',
      notes: DEMO_NOTE,
      extraTags: ['social'],
      icon: icon('logo-twitch'),
    },
    {
      type: 'PASSWORD',
      title: 'GitHub',
      username: 'pkey-demo',
      passwordList: ['Demo-GitHub-2026!'],
      link: 'https://github.com',
      notes: DEMO_NOTE,
      extraTags: ['trabajo'],
      icon: icon('logo-github'),
    },
    {
      type: 'PASSWORD',
      title: 'Discord',
      username: 'pkey.demo',
      passwordList: ['Demo-Discord-2026!'],
      link: 'https://discord.com',
      notes: DEMO_NOTE,
      extraTags: ['social'],
      icon: icon('logo-discord'),
    },
  ];
}

/**
 * True when the vault may be replaced by listing demo cards: empty, or every
 * card already carries the `demo` tag.
 */
export function canReplaceWithListingDemo(
  cards: readonly Pick<PasswordCard, 'tags'>[]
): boolean {
  if (!cards.length) return true;
  return cards.every((card) =>
    (card.tags ?? []).some((tag) => tag.trim().toLowerCase() === LISTING_DEMO_TAG)
  );
}

export type BuildListingDemoOptions = {
  now?: Date;
  /** Defaults to `generateSecureId('demo')`. Pass sequential ids for a stable CSV. */
  nextId?: () => string;
};

/** Builds a full card list tagged `demo`, newest first for `updated` sort. */
export function buildListingDemoCards(options: BuildListingDemoOptions = {}): PasswordCard[] {
  const now = options.now ?? new Date();
  const nextId = options.nextId ?? (() => generateSecureId('demo'));
  const drafts = listingDemoDrafts();
  return drafts.map((draft, index) => {
    const stamp = new Date(now.getTime() - index * 60_000).toISOString();
    return {
      id: nextId(),
      type: draft.type,
      title: draft.title,
      icon: draft.icon,
      username: draft.username,
      passwordList: [...draft.passwordList],
      link: draft.link,
      notes: draft.notes,
      creation_date: stamp,
      last_update: stamp,
      ...(draft.otpSecret ? { otpSecret: draft.otpSecret } : {}),
      tags: normalizeTags([LISTING_DEMO_TAG, ...(draft.extraTags ?? [])]),
    };
  });
}

/** Sequential ids so `npm run seed:demo` does not rewrite the CSV every run. */
export function listingDemoSequentialId(index: number): string {
  return `listing-demo-${String(index + 1).padStart(2, '0')}`;
}

/** Unencrypted CSV of the listing catalog (importable into an empty vault). */
export function exportListingDemoCsv(now = new Date('2026-09-29T12:00:00.000Z')): string {
  let n = 0;
  const cards = buildListingDemoCards({
    now,
    nextId: () => listingDemoSequentialId(n++),
  });
  return exportCardsToCsv(cards);
}
