/**
 * @fileoverview Cards tab stack: collapsed list, then one native editor screen.
 */
import type { PasswordCard } from '../types';

export const CARDS_LIST_ROUTE = 'cards-list';
export const CARD_EDITOR_ROUTE = 'card-editor';

export type CardsStackParamList = {
  'cards-list': undefined;
  'card-editor': { cardId: string };
};

export type CardEditorSectionId = 'account' | 'secret' | 'otp' | 'notes';

type SectionCard = Readonly<
  Pick<PasswordCard, 'type' | 'title' | 'username' | 'passwordList' | 'notes'>
>;

/**
 * Which editor section to open first.
 * A blank new key starts on account. A note starts on its text. Everything else starts on the secret.
 */
export function initialCardEditorSection(card: SectionCard): CardEditorSectionId {
  const untouched =
    card.title.trim() === '' &&
    card.username.trim() === '' &&
    card.passwordList.every((part) => part.trim() === '') &&
    (card.notes ?? '').trim() === '';
  if (untouched) return 'account';
  if (card.type === 'NOTE') return 'notes';
  return 'secret';
}

/** True once the vault actually contains the id we were asked to open. */
export function isCardReadyToOpen(
  expandedCardId: string | null,
  cardIds: readonly string[]
): boolean {
  return expandedCardId != null && cardIds.includes(expandedCardId);
}

/**
 * Whether the cards list may suspend.
 * Suspending on blur blanks the rows before the native push starts, so the open
 * looks like a cut. `covered` is set only after that push has finished.
 */
export function shouldFreezeCardsList(
  revealed: boolean,
  focused: boolean,
  covered: boolean
): boolean {
  return revealed && !focused && covered;
}

/**
 * Cover flag for a transition event on the list screen.
 * A return (`closing === false`) uncovers immediately so the pop can slide the
 * list. A finished push covers it. `null` means leave the flag unchanged.
 */
export function cardsListCoveredAfter(phase: 'start' | 'end', closing: boolean): boolean | null {
  if (phase === 'start') return closing ? null : false;
  return closing;
}

/**
 * Next set of open editor sections after a header tap.
 * With auto-collapse, one section stays open. Without it, each section toggles on its own.
 */
export function toggleEditorSection(
  open: ReadonlySet<CardEditorSectionId>,
  section: CardEditorSectionId,
  autoCollapse: boolean
): Set<CardEditorSectionId> {
  if (autoCollapse) return open.has(section) ? new Set() : new Set([section]);
  const next = new Set(open);
  if (next.has(section)) next.delete(section);
  else next.add(section);
  return next;
}

/**
 * Drops sections the card type no longer renders, and opens the section that replaces them.
 * Returns null when the open set is already valid.
 */
export function sectionsAfterTypeChange(
  open: ReadonlySet<CardEditorSectionId>,
  type: SectionCard['type']
): ReadonlySet<CardEditorSectionId> | null {
  const dropSecret = type === 'NOTE' && open.has('secret');
  const dropOtp = type !== 'PASSWORD' && open.has('otp');
  if (!dropSecret && !dropOtp) return null;
  const next = new Set(open);
  if (dropSecret) {
    next.delete('secret');
    next.add('notes');
  }
  if (dropOtp) {
    next.delete('otp');
    next.add(type === 'NOTE' ? 'notes' : 'secret');
  }
  return next;
}

/**
 * Repairs sections the card type cannot show, then keeps a single open section when auto-collapse is on.
 * Returns null when nothing has to change.
 */
export function adjustOpenSections(
  open: ReadonlySet<CardEditorSectionId>,
  type: SectionCard['type'],
  autoCollapse: boolean
): ReadonlySet<CardEditorSectionId> | null {
  const repaired = sectionsAfterTypeChange(open, type) ?? open;
  if (autoCollapse && repaired.size > 1) {
    const kept = repaired.values().next().value;
    return kept ? new Set([kept]) : new Set();
  }
  return repaired === open ? null : repaired;
}
