/**
 * @fileoverview Collapsed vault-row subtitle: URL for singles, username for grouped members.
 */
import type { PasswordCard } from '../../types';

export type CollapsedSubtitleMode = 'link' | 'username';

export interface CollapsedSubtitleCopy {
  no_link_placeholder: string;
  stat_empty_username: string;
}

/**
 * Resolves the collapsed-row subtitle.
 * Grouped members share a host on the parent card, so username (or email stored in
 * `username`) is the discriminator. Singles keep the tappable display URL.
 */
export function collapsedSubtitleText(
  item: Pick<PasswordCard, 'username' | 'link'>,
  mode: CollapsedSubtitleMode,
  t: CollapsedSubtitleCopy,
  formatLink: (link: string) => string
): string {
  if (mode === 'username') {
    const username = item.username.trim();
    return username || t.stat_empty_username;
  }
  const link = item.link.trim();
  return link ? formatLink(link) : t.no_link_placeholder;
}
