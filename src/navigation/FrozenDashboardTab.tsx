/**
 * @fileoverview Suspends React renders for a dashboard tab that is not focused.
 *
 * Native views stay mounted (react-freeze), so scroll offset and form state
 * survive the switch. The first focused paint always commits; freeze starts
 * only after that, so a tab never mounts already blank.
 */
import React, { useRef } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { Freeze } from 'react-freeze';

type FrozenDashboardTabProps = Readonly<{
  children: React.ReactNode;
}>;

/**
 * Wrap a dashboard tab body. Hooks that should not run while the tab is covered
 * belong in `children`, not in the parent screen shell.
 */
export function FrozenDashboardTab({ children }: FrozenDashboardTabProps): React.JSX.Element {
  const focused = useIsFocused();
  const revealedRef = useRef(false);
  if (focused) revealedRef.current = true;

  return <Freeze freeze={revealedRef.current && !focused}>{children}</Freeze>;
}
