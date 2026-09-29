/**
 * @fileoverview Unified appearance settings section: theme and language
 * with a dynamic App/Web toggle to avoid UI duplication.
 */
import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useCoreState } from '../../context/CoreStateContext';
import { useSettings } from '../../context/SettingsContext';
import { globalStyles as styles } from '../../styles/globalStyles';
import { SettingsSectionCard } from '../common';
import type { AppSettings } from '../../types';

type ViewMode = 'app' | 'web';

const truncateText = (text: string, maxLength: number = 5): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '…';
};

interface SegmentOptionRowProps {
  label: string;
  description: string;
  options: readonly { label: string; value: string }[];
  currentValue: string;
  onValueChange: (value: string) => void;
  accentColor: string;
  borderColor: string;
  textColor: string;
  mutedColor: string;
  truncateTo?: number;
}

const SegmentOptionRow: React.FC<SegmentOptionRowProps> = React.memo(
  ({
    label,
    description,
    options,
    currentValue,
    onValueChange,
    accentColor,
    borderColor,
    textColor,
    mutedColor,
    truncateTo = 15,
  }) => (
    <View
      style={[
        styles.settingInterativeRowSelectorContainer,
        { borderBottomColor: borderColor },
      ]}
    >
      <View style={styles.settingTextGroupingLeftColumn}>
        <Text style={[styles.settingRowLabelBoldTitle, { color: textColor }]}>{label}</Text>
        <Text style={[styles.settingRowMutedSubTextDesc, { color: mutedColor }]}>
          {description}
        </Text>
      </View>
      <View style={styles.horizontalPillsSegmentControls}>
        {options.map((option, idx) => {
          const selected = currentValue === option.value;
          return (
            <TouchableOpacity
              key={idx}
              style={[
                styles.segmentButtonOption,
                {
                  borderColor: selected ? accentColor : borderColor,
                  backgroundColor: selected ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                },
              ]}
              onPress={() => onValueChange(option.value)}
            >
              <Text
                style={[
                  styles.segmentOptionTextLabel,
                  {
                    color: selected ? accentColor : mutedColor,
                    fontSize: 10,
                  },
                ]}
              >
                {truncateText(option.label, truncateTo)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  ),
);
SegmentOptionRow.displayName = 'SegmentOptionRow';

/**
 * Unified appearance settings section.
 * Provides a local App/Web toggle that dynamically maps
 * to the correct settings keys (theme + language).
 */
export const AppearanceSettingsSection: React.FC = () => {
  const { db } = useCoreState();
  const { t, c, handleToggleSettingsOption } = useSettings();
  const [viewMode, setViewMode] = useState<ViewMode>('app');

  const isWeb = viewMode === 'web';

  const themeCurrent = isWeb
    ? (db.settings.webTheme ?? db.settings.theme)
    : db.settings.theme;

  const languageCurrent = isWeb
    ? (db.settings.webLanguage ?? db.settings.language)
    : db.settings.language;

  const handleThemeChange = useCallback(
    (value: string) => {
      const key: 'theme' | 'webTheme' = isWeb ? 'webTheme' : 'theme';
      handleToggleSettingsOption(key, value as AppSettings['theme']);
    },
    [isWeb, handleToggleSettingsOption],
  );

  const handleLanguageChange = useCallback(
    (value: string) => {
      const key: 'language' | 'webLanguage' = isWeb ? 'webLanguage' : 'language';
      handleToggleSettingsOption(key, value as AppSettings['language']);
    },
    [isWeb, handleToggleSettingsOption],
  );

  const settingRowStyle = [
    styles.settingInterativeRowSelectorContainer,
    { borderBottomColor: c.border },
  ];

  return (
    <SettingsSectionCard icon="color-palette-outline" title={t.appearance_section_title}>
      {/* App / Web toggle */}
      <View style={[settingRowStyle, { paddingVertical: 8 }]}>
        <View style={styles.horizontalPillsSegmentControls}>
          {(['app', 'web'] as ViewMode[]).map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[
                styles.segmentButtonOption,
                {
                  borderColor: viewMode === mode ? c.accent : c.border,
                  backgroundColor:
                    viewMode === mode ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                },
              ]}
              onPress={() => setViewMode(mode)}
              accessibilityRole="button"
              accessibilityState={{ selected: viewMode === mode }}
              accessibilityLabel={mode === 'app' ? t.app_label : t.web_label}
            >
              <Text
                style={[
                  styles.segmentOptionTextLabel,
                  {
                    color: viewMode === mode ? c.accent : c.textMuted,
                    fontSize: 10,
                  },
                ]}
              >
                {mode === 'app' ? t.app_label : t.web_label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Theme */}
      <SegmentOptionRow
        label={isWeb ? t.web_theme_title : t.theme_title}
        description={isWeb ? t.web_theme_description : t.theme_description}
        options={t.settings_buttons_options.theme_title}
        currentValue={themeCurrent}
        onValueChange={handleThemeChange}
        accentColor={c.accent}
        borderColor={c.border}
        textColor={c.text}
        mutedColor={c.textMuted}
      />

      {/* Language */}
      <SegmentOptionRow
        label={isWeb ? t.web_lang_title : t.lang_title}
        description={isWeb ? t.web_lang_description : t.lang_description}
        options={t.settings_buttons_options.lang_title}
        currentValue={languageCurrent}
        onValueChange={handleLanguageChange}
        accentColor={c.accent}
        borderColor={c.border}
        textColor={c.text}
        mutedColor={c.textMuted}
        truncateTo={10}
      />
    </SettingsSectionCard>
  );
};
