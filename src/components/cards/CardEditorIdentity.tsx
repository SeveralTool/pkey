/**
 * @fileoverview Always-visible summary of one key on the editor screen.
 *
 * Mirrors the list row: icon, name, username, link, and tags. The type stays
 * as a chip even while the account section is closed.
 */
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PasswordCard } from '../../types';
import type { LocaleStrings } from '../../constants/localization';
import { ACCENT_SELECTED_ALPHA, withAlpha, type ThemeColors } from '../../styles/colors';
import { globalStyles as styles } from '../../styles/globalStyles';
import { getDisplayUrl } from '../../utils/openExternalLink';
import { AutoDetectIcon } from '../common/AutoDetectIcon';
import { CardTagChips } from './CardTagChips';
import {
  editorIdentityLink,
  editorTypeIcon,
  editorTypeLabel,
  editorVisibleUsername,
} from './editorIdentity';

type CardEditorIdentityProps = Readonly<{
  item: PasswordCard;
  isDark: boolean;
  c: ThemeColors;
  t: LocaleStrings;
  isOpeningLink: boolean;
  onOpenLink: (link: string) => void;
  onChangeIcon: () => void;
}>;

export const CardEditorIdentity = React.memo(function CardEditorIdentity({
  item,
  isDark,
  c,
  t,
  isOpeningLink,
  onOpenLink,
  onChangeIcon,
}: CardEditorIdentityProps) {
  const title = item.title.trim() ? item.title.trim() : t.default_card_name;
  const username = editorVisibleUsername(item.username);
  const link = editorIdentityLink(item.link, t.no_link_placeholder, getDisplayUrl);
  const typeLabel = editorTypeLabel(item.type, {
    pass: t.card_type_pass,
    phrase: t.card_type_phrase,
    note: t.card_type_note,
  });
  const tags = item.tags ?? [];
  const iconWell = isDark ? '#2D2D37' : '#F3F4F6';
  const chipFill = withAlpha(c.accent, ACCENT_SELECTED_ALPHA);

  return (
    <View style={[styles.editorIdentityCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
      <View style={styles.editorIdentityRow}>
        <TouchableOpacity
          style={[styles.editorIdentityIcon, { backgroundColor: iconWell }]}
          onPress={onChangeIcon}
          accessibilityRole="button"
          accessibilityLabel={t.card_editor_icon_a11y}
        >
          <AutoDetectIcon
            icon={item.icon}
            link={item.link}
            isLoading={false}
            size={22}
            color={c.accent}
          />
        </TouchableOpacity>
        <View style={styles.editorIdentityText}>
          <Text
            style={[styles.editorIdentityTitle, { color: c.text }]}
            numberOfLines={2}
            accessibilityRole="header"
          >
            {title}
          </Text>
          {username ? (
            <Text style={[styles.editorIdentityMeta, { color: c.textMuted }]} numberOfLines={1}>
              {username}
            </Text>
          ) : null}
        </View>
      </View>

      <View
        style={[styles.editorTypeChip, { borderColor: c.accent, backgroundColor: chipFill }]}
        accessibilityRole="text"
        accessibilityLabel={`${t.card_type_label}: ${typeLabel}`}
      >
        <Ionicons name={editorTypeIcon(item.type)} size={14} color={c.accent} />
        <Text style={[styles.editorTypeChipText, { color: c.accent }]}>{typeLabel}</Text>
      </View>

      {link.openable ? (
        <TouchableOpacity
          style={styles.editorLinkRow}
          onPress={() => onOpenLink(item.link)}
          disabled={isOpeningLink}
          accessibilityRole="link"
          accessibilityLabel={t.go_to_link}
        >
          <Ionicons name="open-outline" size={16} color={isOpeningLink ? c.textMuted : c.accent} />
          <Text
            style={[styles.editorLinkText, { color: isOpeningLink ? c.textMuted : c.accent }]}
            numberOfLines={1}
          >
            {link.text}
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.editorLinkRow} accessibilityLabel={t.no_link_placeholder}>
          <Ionicons name="link-outline" size={16} color={c.textMuted} />
          <Text style={[styles.editorLinkText, { color: c.textMuted }]} numberOfLines={1}>
            {link.text}
          </Text>
        </View>
      )}

      <CardTagChips
        tags={tags}
        textColor={c.textMuted}
        borderColor={c.border}
        backgroundColor={iconWell}
      />
    </View>
  );
});
