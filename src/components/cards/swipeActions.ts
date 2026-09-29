import type { PasswordCard } from '../../types';

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
export function getCardCopyPayload(
  card: Pick<PasswordCard, 'type' | 'passwordList' | 'notes'>
): string {
  if (card.type === 'NOTE') {
    return (card.notes ?? '').trim();
  }
  if (card.type === 'PASSWORD') {
    return (card.passwordList[0] ?? '').trim();
  }
  return card.passwordList.filter((word) => word.trim().length > 0).join(' ');
}

export function hasCardCopyPayload(
  card: Pick<PasswordCard, 'type' | 'passwordList' | 'notes'>
): boolean {
  return getCardCopyPayload(card).length > 0;
}

/** Localized copy-success toast message; omits the title when the card has none. */
export function buildCopySuccessMessage(
  t: Record<string, string>,
  label: string,
  title: string
): string {
  const trimmedTitle = title.trim();
  return trimmedTitle
    ? t.notif_copy_success_message.replace('{label}', label).replace('{title}', trimmedTitle)
    : t.notif_copy_success_message_no_title.replace('{label}', label);
}
