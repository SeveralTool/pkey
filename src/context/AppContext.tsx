/**
 * @fileoverview Composes all app providers in dependency order and exposes a legacy aggregate hook.
 */
import React from 'react';
import { CoreStateProvider, useCoreState } from './CoreStateContext';
import { AuthProvider, useAuth } from './AuthContext';
import { DatabaseProvider, useDatabase } from './DatabaseContext';
import { SettingsProvider, useSettings } from './SettingsContext';
import { NotificationProvider, useNotifications } from './NotificationContext';
import { UIProvider, useUI } from './UIContext';
import { SyncProvider, useSync } from './SyncContext';
import { MigrationProvider, useMigration } from './MigrationContext';

/** Nesting root for core, UI, auth, database, settings, notifications, sync, and migration. */
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // UIProvider sits directly under CoreStateProvider because Auth/Database/Sync
  // consume UI setters (expanded card, cards filter, current tab).
  return (
    <CoreStateProvider>
      <UIProvider>
        <AuthProvider>
          <DatabaseProvider>
            <SettingsProvider>
              <NotificationProvider>
                <SyncProvider>
                  <MigrationProvider>{children}</MigrationProvider>
                </SyncProvider>
              </NotificationProvider>
            </SettingsProvider>
          </DatabaseProvider>
        </AuthProvider>
      </UIProvider>
    </CoreStateProvider>
  );
};

/** @deprecated Prefer granular hooks (useCoreState, useAuth, useDatabase, etc.) to avoid unnecessary re-renders. */
export const useAppContext = () => {
  const core = useCoreState();
  const auth = useAuth();
  const database = useDatabase();
  const settings = useSettings();
  const notifications = useNotifications();
  const ui = useUI();
  const sync = useSync();
  const migration = useMigration();

  return {
    ...core,
    ...auth,
    ...database,
    ...settings,
    ...notifications,
    ...ui,
    ...sync,
    ...migration,
  };
};
