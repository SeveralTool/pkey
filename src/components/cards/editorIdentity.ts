/**
 * @fileoverview Facts the card editor keeps visible without opening a section.
 */
import type { PasswordCard } from '../../types';

type TypeLabels = Readonly<{
  pass: string;
  phrase: string;
  note: string;
}>;

export type EditorTypeIcon = 'key-outline' | 'list-outline' | 'document-text-outline';

/** Short type name shown as a chip on the editor identity card. */
export function editorTypeLabel(type: PasswordCard['type'], labels: TypeLabels): string {
  if (type === 'NOTE') return labels.note;
  if (type === 'SECRET_PHRASE') return labels.phrase;
  return labels.pass;
}

/** Glyph that matches the key type on the identity chip. */
export function editorTypeIcon(type: PasswordCard['type']): EditorTypeIcon {
  if (type === 'NOTE') return 'document-text-outline';
  if (type === 'SECRET_PHRASE') return 'list-outline';
  return 'key-outline';
}

/** Username line. Empty values stay off the identity card. */
export function editorVisibleUsername(username: string): string | null {
  const trimmed = username.trim();
  return trimmed ? trimmed : null;
}

/**
 * Link line for the identity card.
 * A blank link still occupies the row, with the same placeholder as the list.
 */
export function editorIdentityLink(
  link: string,
  placeholder: string,
  formatLink: (raw: string) => string
): { text: string; openable: boolean } {
  const trimmed = link.trim();
  if (!trimmed) return { text: placeholder, openable: false };
  return { text: formatLink(trimmed), openable: true };
}

/** Collapsed seed-section hint. Empty phrases stay quiet. */
export function editorPhraseSummary(words: readonly string[], template: string): string | null {
  const count = words.filter((word) => word.trim()).length;
  if (count === 0) return null;
  return template.replace('{count}', String(count));
}
