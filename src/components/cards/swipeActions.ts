import type { PasswordCard } from '../../types';
import type { LocaleStrings } from '../../constants/localization';

/** Minimal card shape needed to resolve the copy payload (`notes` only matters for NOTE cards). */
type CopyableCard = Pick<PasswordCard, 'type' | 'passwordList'> & { notes?: string };

/** Localized strings consumed by {@link buildCopySuccessMessage}. */
export type CopySuccessCopy = Pick<
  LocaleStrings,
  'notif_copy_success_message' | 'notif_copy_success_message_no_title'
>;

export const SWIPE_THRESHOLD = 60;
export const SWIPE_MAX_OFFSET = 120;

export function resolveSwipeAction(
  translateX: number,
  threshold = SWIPE_THRESHOLD
): 'copy' | 'delete' | 'none' {
  if (translateX >= threshold) return 'copy';
  if (translateX <= -threshold) return 'delete';
  return 'none';
}

/**
 * Returns the clipboard payload for a card, or empty string when there is nothing to copy.
 */
export function getCardCopyPayload(card: CopyableCard): string {
  if (card.type === 'NOTE') {
    return (card.notes ?? '').trim();
  }
  if (card.type === 'PASSWORD') {
    return (card.passwordList[0] ?? '').trim();
  }
  return card.passwordList.filter((word) => word.trim().length > 0).join(' ');
}

export function hasCardCopyPayload(card: CopyableCard): boolean {
  return getCardCopyPayload(card).length > 0;
}

/** Localized copy-success toast message; omits the title when the card has none. */
export function buildCopySuccessMessage(t: CopySuccessCopy, label: string, title: string): string {
  const trimmedTitle = title.trim();
  return trimmedTitle
    ? t.notif_copy_success_message.replace('{label}', label).replace('{title}', trimmedTitle)
    : t.notif_copy_success_message_no_title.replace('{label}', label);
}
