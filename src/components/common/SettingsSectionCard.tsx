/**
 * @fileoverview Shared settings/stats section card: icon + title + divider header.
 */
import React from 'react';
import { View, Text, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../../context/SettingsContext';
import { globalStyles as styles } from '../../styles/globalStyles';

export interface SettingsSectionCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  children: React.ReactNode;
  /** First section on a tab (no top margin). */
  first?: boolean;
  /** Card outer border (default theme border; danger zone uses danger). */
  borderColor?: string;
  /** Title text color (default theme text). */
  titleColor?: string;
  /** Leading icon color (default theme accent). */
  iconColor?: string;
  /** Divider under the header (default: black / white by theme). */
  dividerColor?: string;
  /** Trailing control in the header (e.g. HelpInfoButton). */
  headerRight?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Card shell used by Settings / Security / Stats section blocks.
 * Structure is fixed; colors can vary per section (e.g. danger zone).
 */
export const SettingsSectionCard: React.FC<SettingsSectionCardProps> = ({
  icon,
  title,
  children,
  first,
  borderColor,
  titleColor,
  iconColor,
  dividerColor,
  headerRight,
  style,
}) => {
  const { c, isDark } = useSettings();
  const cardBorder = borderColor ?? c.border;
  const labelColor = titleColor ?? c.text;
  const leadingColor = iconColor ?? c.accent;
  // Slightly stronger than row borders (c.border), without pure black/white.
  const ruleColor = dividerColor ?? (isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.22)');

  return (
    <View
      style={[
        styles.statsCategoryCardSection,
        {
          backgroundColor: c.cardBg,
          borderColor: cardBorder,
          marginTop: first ? 0 : 16,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.statsSectionHeaderHeadingLine,
          { marginBottom: 8, borderBottomColor: ruleColor },
        ]}
      >
        <Ionicons name={icon} size={18} color={leadingColor} style={{ marginRight: 8 }} />
        <Text style={[styles.statsHLabel, { color: labelColor, flexShrink: 1 }]}>{title}</Text>
        {headerRight}
      </View>
      {children}
    </View>
  );
};
