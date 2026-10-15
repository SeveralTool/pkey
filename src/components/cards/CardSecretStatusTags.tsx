/**
 * @fileoverview Strength, reuse, and breach chips for a password key.
 *
 * Same row under the secret field and on the collapsed secret section.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PasswordCard } from '../../types';
import type { LocaleStrings } from '../../constants/localization';
import { withAlpha, type ThemeColors } from '../../styles/colors';
import { globalStyles as styles } from '../../styles/globalStyles';
import { HibpStatusBadge } from './HibpStatusBadge';

type StrengthTag = Readonly<{
  label: string;
  color: string;
}>;

type CardSecretStatusTagsProps = Readonly<{
  strength: StrengthTag | null;
  duplicated: boolean;
  card: PasswordCard;
  c: ThemeColors;
  t: LocaleStrings;
  hibpEnabled: boolean;
  /** Tighter top gap when the row sits under a section title. */
  compact?: boolean;
}>;

export function CardSecretStatusTags({
  strength,
  duplicated,
  card,
  c,
  t,
  hibpEnabled,
  compact = false,
}: CardSecretStatusTagsProps): React.JSX.Element | null {
  if (!strength && !duplicated && !hibpEnabled) return null;

  return (
    <View style={[styles.tagLineRowFlex, compact ? styles.editorSectionTagRow : null]}>
      {strength ? (
        <View
          style={[
            styles.warningInLineTagFrame,
            {
              borderColor: strength.color,
              backgroundColor: withAlpha(strength.color, 0.08),
            },
          ]}
        >
          <Ionicons name="shield" size={10} color={strength.color} />
          <Text style={[styles.warningInLineText, { color: strength.color }]}>
            {strength.label}
          </Text>
        </View>
      ) : null}
      {duplicated ? (
        <View
          style={[
            styles.warningInLineTagFrame,
            { borderColor: c.danger, backgroundColor: 'rgba(239, 68, 68, 0.05)' },
          ]}
        >
          <Ionicons name="alert-circle" size={10} color={c.danger} />
          <Text style={[styles.warningInLineText, { color: c.danger }]}>{t.tag_duplicated}</Text>
        </View>
      ) : null}
      {hibpEnabled ? <HibpStatusBadge card={card} c={c} t={t} enabled /> : null}
    </View>
  );
}
