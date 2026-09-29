/**
 * @fileoverview Lightweight collapsed header for vault list rows.
 */
import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { PasswordCard } from '../../types';
import { globalStyles as styles, spacing } from '../../styles/globalStyles';
import { getDisplayUrl } from '../../utils/openExternalLink';
import { AutoDetectIcon } from '../common/AutoDetectIcon';
import { CardTagChips } from './CardTagChips';
import { usePressScale } from '../../hooks';
import {
  collapsedSubtitleText,
  type CollapsedSubtitleMode,
} from './collapsedSubtitle';

export type { CollapsedSubtitleMode };

export type CardCollapsedHeaderProps = {
  item: PasswordCard;
  isExpanded: boolean;
  bodyLoading: boolean;
  isDark: boolean;
  c: Record<string, string>;
  t: Record<string, string>;
  isOpeningLink: boolean;
  /** `username` for grouped members so collapsed rows are distinguishable. Default `link`. */
  subtitleMode?: CollapsedSubtitleMode;
  onToggleExpand: () => void;
  onOpenLink: () => void;
  onSetCustomIconModal: (modal: { visible: boolean; cardId: string | null }) => void;
};

export const CardCollapsedHeader = React.memo(function CardCollapsedHeader({
  item,
  isExpanded,
  bodyLoading,
  isDark,
  c,
  t,
  isOpeningLink,
  subtitleMode = 'link',
  onToggleExpand,
  onOpenLink,
  onSetCustomIconModal,
}: CardCollapsedHeaderProps) {
  const {
    onPressIn: onHeaderPressIn,
    onPressOut: onHeaderPressOut,
    animatedStyle: headerPressStyle,
  } = usePressScale();

  const cardTags = item.tags ?? [];
  const inputBg = isDark ? '#1F1F24' : '#F3F4F6';
  const truncatedTitle =
    item.title.trim() === ''
      ? t.default_card_name
      : item.title.length > 10
        ? item.title.substring(0, 10) + '...'
        : item.title;
  const subtitle = collapsedSubtitleText(
    item,
    subtitleMode,
    {
      no_link_placeholder: t.no_link_placeholder,
      stat_empty_username: t.stat_empty_username,
    },
    getDisplayUrl
  );
  const showUsernameSubtitle = subtitleMode === 'username';

  return (
    <Animated.View style={headerPressStyle}>
      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.cardHeaderOuterRowClickable}
        onPressIn={onHeaderPressIn}
        onPressOut={onHeaderPressOut}
        onPress={onToggleExpand}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        accessibilityLabel={
          showUsernameSubtitle ? `${truncatedTitle}, ${subtitle}` : undefined
        }
      >
        <TouchableOpacity
          style={[
            styles.iconModifierButtonLeft,
            { backgroundColor: isDark ? '#2D2D37' : '#F3F4F6' },
          ]}
          onPress={() => onSetCustomIconModal({ visible: true, cardId: item.id })}
        >
          <AutoDetectIcon
            icon={item.icon}
            link={item.link}
            isLoading={false}
            size={18}
            color={c.accent}
          />
        </TouchableOpacity>

        <View style={styles.headerInfoTitleAndLinkRight}>
          <Text style={[styles.cardTitleDisplayHBold, { color: c.text }]}>{truncatedTitle}</Text>
          {showUsernameSubtitle ? (
            <Text
              style={[styles.cardSubLinkLabelMuted, { color: c.textMuted }]}
              numberOfLines={1}
              accessibilityLabel={subtitle}
            >
              {subtitle}
            </Text>
          ) : (
            <TouchableOpacity
              activeOpacity={item.link.trim() ? 0.7 : 1}
              onPress={(e) => {
                e.stopPropagation?.();
                if (item.link.trim()) onOpenLink();
              }}
              disabled={!item.link.trim() || isOpeningLink}
              accessibilityRole="link"
              accessibilityLabel={item.link.trim() ? t.go_to_link : t.no_link_placeholder}
            >
              <Text
                style={[
                  styles.cardSubLinkLabelMuted,
                  {
                    color: item.link.trim() ? c.accent : c.textMuted,
                    opacity: isOpeningLink ? 0.6 : 1,
                  },
                ]}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            </TouchableOpacity>
          )}
          <CardTagChips
            tags={cardTags}
            textColor={c.textMuted}
            borderColor={c.border}
            backgroundColor={inputBg}
          />
        </View>

        {bodyLoading ? (
          <ActivityIndicator
            size="small"
            color={c.textMuted}
            style={{ alignSelf: 'center', marginHorizontal: spacing.sm }}
          />
        ) : (
          <Ionicons
            name={isExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
            size={18}
            color={c.textMuted}
            style={{ alignSelf: 'center', marginHorizontal: spacing.sm }}
          />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
});
