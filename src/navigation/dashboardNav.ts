/**
 * @fileoverview Navigation ref for the dashboard native tabs (nested container).
 */
import { createNavigationContainerRef } from '@react-navigation/native';
import type { DashboardTabName, DashboardTabParamList } from './types';

export const dashboardNavRef = createNavigationContainerRef<DashboardTabParamList>();

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
      dashboardNavRef.getCurrentRoute()?.name,
      name
    )
  ) {
    return;
  }
  dashboardNavRef.navigate(name);
}
