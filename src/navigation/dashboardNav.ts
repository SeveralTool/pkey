/**
 * @fileoverview Navigation ref for the dashboard native tabs (nested container).
 */
import { createNavigationContainerRef } from '@react-navigation/native';
import type { DashboardTabName, DashboardTabParamList } from './types';

export const dashboardNavRef = createNavigationContainerRef<DashboardTabParamList>();

type TabRootState = Readonly<{
  index: number;
  routes: readonly { name: string }[];
}>;

/**
 * Tab name at the root of the dashboard container.
 * The leaf route can be the card editor; that must not be treated as a tab change.
 */
export function focusedDashboardTabName(state: TabRootState | undefined): string | undefined {
  if (!state || state.routes.length === 0) return undefined;
  if (state.index < 0 || state.index >= state.routes.length) return undefined;
  return state.routes[state.index]?.name;
}

/** Whether `navigateDashboardTab` should dispatch (navigator ready and not already focused). */
export function shouldNavigateDashboardTab(
  ready: boolean,
  currentName: string | undefined,
  target: DashboardTabName
): boolean {
  return ready && currentName !== target;
}

/**
 * Focus a dashboard tab when the native navigator is mounted.
 * No-ops while the vault is locked (Dashboard unmounted) or when already focused.
 */
export function navigateDashboardTab(name: DashboardTabName): void {
  if (
    !shouldNavigateDashboardTab(
      dashboardNavRef.isReady(),
      focusedDashboardTabName(dashboardNavRef.getState()),
      name
    )
  ) {
    return;
  }
  dashboardNavRef.navigate(name);
}
