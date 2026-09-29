/**
 * @fileoverview Locale, theme resolution, and settings toggle handlers.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, useColorScheme } from 'react-native';
import { useCoreState } from './CoreStateContext';
import { useAuth } from './AuthContext';
import { useDatabase } from './DatabaseContext';
import { getLocale, type LocaleStrings } from '../constants/localization';
import { AppSettings } from '../types';
import { canDisableGeneratorOption, isGeneratorOptionKey } from '../utils/passwordGenerator';
import { notifications } from '../notifications/notificationRef';
import { normalizeLanguage, normalizeTheme, resolveThemeIsDark } from '@pkey/core';
import { getTheme, type ThemeColors } from '../styles/colors';

export type SettingsContextData = Readonly<{
  t: LocaleStrings;
  c: ThemeColors;
  isDark: boolean;
  handleToggleSettingsOption: <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => void;
}>;

const SettingsContext = createContext<SettingsContextData>({} as SettingsContextData);

/** Consumes locale strings, theme colors, and settings toggles. */
export const useSettings = () => useContext(SettingsContext);

/** Provides `t`/`c` localization+colors and `handleToggleSettingsOption`. */
export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { db, dbRef } = useCoreState();
  const { performBiometricOrPasswordCheck } = useAuth();
  const { writeDatabaseToDisk } = useDatabase();
  const colorScheme = useColorScheme();
  const [localeEpoch, setLocaleEpoch] = useState(0);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') setLocaleEpoch((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  const t = useMemo(() => {
    return getLocale(db.settings?.language);
  }, [db.settings?.language, localeEpoch]);

  const isDark = resolveThemeIsDark(normalizeTheme(db.settings?.theme), colorScheme === 'dark');

  const c = useMemo(() => getTheme(isDark), [isDark]);

  const tRef = useRef(t);
  tRef.current = t;
  const bioRef = useRef(performBiometricOrPasswordCheck);
  bioRef.current = performBiometricOrPasswordCheck;
  const writeRef = useRef(writeDatabaseToDisk);
  writeRef.current = writeDatabaseToDisk;

  const handleToggleSettingsOption = useCallback(
    <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => {
      const current = dbRef.current;
      const strings = tRef.current;
      const confirm = bioRef.current;
      const write = writeRef.current;

      if (
        (key === 'autoLogout' || key === 'webAutoLogout' || key === 'foregroundIdleLock') &&
        val === 'NEVER'
      ) {
        confirm(() => {
          const nextSettings = { ...current.settings, [key]: val };
          write({ ...current, settings: nextSettings, last_update: new Date().toISOString() });
        }, strings.require_auth_never_logout);
        return;
      }

      if (key === 'webConfirmOnPhone' && val === true) {
        confirm(() => {
          const nextSettings = { ...current.settings, webConfirmOnPhone: true };
          write({ ...current, settings: nextSettings, last_update: new Date().toISOString() });
        }, strings.require_auth_web_confirm_on_phone);
        return;
      }

      if (key === 'webLoginOnPhone' && val === true) {
        confirm(() => {
          const nextSettings = { ...current.settings, webLoginOnPhone: true };
          write({ ...current, settings: nextSettings, last_update: new Date().toISOString() });
        }, strings.require_auth_web_login_on_phone);
        return;
      }

      if (key === 'strictOffline' && val === true) {
        const nextSettings = {
          ...current.settings,
          strictOffline: true,
          webAccessAutoStart: false,
          enableHibpCheck: false,
          enableFaviconLookup: false,
        };
        write({ ...current, settings: nextSettings, last_update: new Date().toISOString() });
        return;
      }

      if (
        isGeneratorOptionKey(key) &&
        val === false &&
        !canDisableGeneratorOption(current.settings, key)
      ) {
        notifications.toast({
          title: strings.gen_option_required_title,
          message: strings.gen_option_required_desc,
          variant: 'warning',
          duration: 6000,
        });
        return;
      }

      const nextSettings = {
        ...current.settings,
        [key]:
          key === 'theme' ? normalizeTheme(val) : key === 'language' ? normalizeLanguage(val) : val,
      };
      write({ ...current, settings: nextSettings, last_update: new Date().toISOString() });
    },
    [dbRef]
  );

  const value = useMemo(
    () => ({ t, c, isDark, handleToggleSettingsOption }),
    [t, c, isDark, handleToggleSettingsOption]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};
