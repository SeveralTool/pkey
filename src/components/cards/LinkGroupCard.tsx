/**
 * @fileoverview Collapsible shell that holds multiple CardItems sharing a host.
 */
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CardIcon } from '../../types';
import { globalStyles as styles, spacing } from '../../styles/globalStyles';
import { AutoDetectIcon } from '../common/AutoDetectIcon';

export interface LinkGroupCardProps {
  label: string;
  count: number;
  icon: CardIcon;
  /** First member URL — resolves a brand glyph for the group host. */
  link?: string;
  expanded: boolean;
  isDark: boolean;
  c: Record<string, string>;
  t: Record<string, string>;
  onToggle: () => void;
  children: React.ReactNode;
}

export const LinkGroupCard = React.memo(function LinkGroupCard({
  label,
  count,
  icon,
  link,
  expanded,
  isDark,
  c,
  t,
  onToggle,
  children,
}: LinkGroupCardProps) {
  const accountsLabel = (t.group_by_link_accounts || '{n} accounts').replace('{n}', String(count));
  const a11y = (t.group_by_link_a11y || '{label}, {n}')
    .replace('{label}', label)
    .replace('{n}', String(count));

  return (
    <View
      style={[
        styles.collapsedOuterInteractiveCardContainer,
        styles.cardListItemShell,
        { backgroundColor: c.cardBg, borderColor: c.border, borderWidth: 1 },
      ]}
      accessibilityLabel={a11y}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.cardHeaderOuterRowClickable}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={a11y}
      >
        <View
          style={[
            styles.iconModifierButtonLeft,
            { backgroundColor: isDark ? '#2D2D37' : '#F3F4F6' },
          ]}
        >
          <AutoDetectIcon icon={icon} link={link} isLoading={false} size={18} color={c.accent} />
        </View>

        <View style={styles.headerInfoTitleAndLinkRight}>
          <Text style={[styles.cardTitleDisplayHBold, { color: c.text }]} numberOfLines={1}>
            {label}
          </Text>
          <Text style={[styles.cardSubLinkLabelMuted, { color: c.textMuted }]} numberOfLines={1}>
            {accountsLabel}
          </Text>
        </View>

        <View
          style={{
            alignSelf: 'center',
            marginRight: spacing.sm,
            minWidth: 28,
            height: 22,
            borderRadius: 14,
            paddingHorizontal: 8,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isDark ? '#2D2D37' : '#F3F4F6',
          }}
        >
          <Text style={{ color: c.accent, fontSize: 11, fontWeight: '700' }}>{count}</Text>
        </View>

        <Ionicons
          name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
          size={18}
          color={c.textMuted}
          style={{ alignSelf: 'center', marginHorizontal: spacing.sm }}
        />
      </TouchableOpacity>

      {expanded && (
        <View
          style={[
            styles.expandedBodyPanelFrame,
            { borderTopColor: c.border, paddingTop: spacing.sm, gap: spacing.sm },
          ]}
        >
          {children}
        </View>
      )}
    </View>
  );
});
