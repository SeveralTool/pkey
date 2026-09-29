/**
 * @fileoverview Dashboard tab route names shared by UIContext and the native tab navigator.
 */

export const DASHBOARD_TAB_NAMES = ['cards', 'stats', 'security', 'settings'] as const;

export type DashboardTabName = (typeof DASHBOARD_TAB_NAMES)[number];

export type DashboardTabParamList = {
  cards: undefined;
  stats: undefined;
  security: undefined;
  settings: undefined;
};

/** Type guard for native tab route names and UIContext `currentTab`. */
export function isDashboardTabName(value: unknown): value is DashboardTabName {
  return typeof value === 'string' && (DASHBOARD_TAB_NAMES as readonly string[]).includes(value);
}
