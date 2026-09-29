/**
 * @fileoverview HIBP status pill for a vault card.
 *
 * Shows the stored check outcome only when it is "current" (the recorded
 * SHA-256 of the checked password still matches the card's current password).
 * Passwords that were never sent show a neutral "not verified" pill, and the
 * whole badge row is hidden when the opt-in setting is off.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PasswordCard } from '../../types';
import { globalStyles as styles } from '../../styles/globalStyles';
import { primaryPassword, pwHashFor } from '../../services/hibpOrchestrator';

export type HibpBadgeKind = 'verified' | 'breached' | 'error' | 'pending';

/** Resolves the badge state for a card against its current password. */
export const getHibpBadgeKind = (card: PasswordCard): HibpBadgeKind => {
  const password = primaryPassword(card);
  if (card.hibp && password && card.hibp.pwHash === pwHashFor(password)) {
    if (card.hibp.status === 'breached') return 'breached';
    if (card.hibp.status === 'clean') return 'verified';
    return 'error';
  }
  return 'pending';
};

export type HibpStatusBadgeProps = {
  card: PasswordCard;
  c: Record<string, string>;
  t: Record<string, string>;
  enabled: boolean;
};

export const HibpStatusBadge = React.memo(function HibpStatusBadge({
  card,
  c,
  t,
  enabled,
}: HibpStatusBadgeProps) {
  if (!enabled) return null;

  const kind = getHibpBadgeKind(card);
  const config: Record<
    HibpBadgeKind,
    {
      icon: React.ComponentProps<typeof Ionicons>['name'];
      color: string;
      backgroundColor: string;
      borderColor: string;
    }
  > = {
    verified: {
      icon: 'shield-checkmark',
      color: c.success,
      backgroundColor: 'rgba(135, 203, 40, 0.08)',
      borderColor: c.success,
    },
    breached: {
      icon: 'alert-circle',
      color: c.danger,
      backgroundColor: 'rgba(215, 90, 77, 0.1)',
      borderColor: c.danger,
    },
    error: {
      icon: 'cloud-offline-outline',
      color: c.warning,
      backgroundColor: 'rgba(255, 202, 40, 0.08)',
      borderColor: c.warning,
    },
    pending: {
      icon: 'shield-outline',
      color: c.textMuted,
      backgroundColor: 'transparent',
      borderColor: c.border,
    },
  };

  let label: string;
  if (kind === 'breached') {
    const count = card.hibp && card.hibp.status === 'breached' ? card.hibp.count : 0;
    label = t.hibp_badge_breached.replace('{n}', String(count));
  } else if (kind === 'verified') {
    label = t.hibp_badge_verified;
  } else if (kind === 'error') {
    label = t.hibp_badge_error;
  } else {
    label = t.hibp_badge_pending;
  }

  const { icon, color, backgroundColor, borderColor } = config[kind];

  return (
    <View
      style={[styles.warningInLineTagFrame, { borderColor, backgroundColor }]}
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={10} color={color} />
      <Text style={[styles.warningInLineText, { color, fontSize: 9 }]}>{label}</Text>
    </View>
  );
});
