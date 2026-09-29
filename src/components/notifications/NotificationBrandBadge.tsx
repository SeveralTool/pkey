/**
 * @fileoverview Leading brand badge for notification cards.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { getVariantColor, getVariantIcon } from '../../notifications/inAppNotifications';
import { InAppNotificationItem, NotificationTheme } from '../../notifications/types';

interface NotificationBrandBadgeProps {
  item: InAppNotificationItem;
  theme: NotificationTheme;
}

const brandLogo = require('../../../assets/images/brand-logo.png');

const LOGO_VARIANTS: InAppNotificationItem['variant'][] = ['info', 'success'];

export const NotificationBrandBadge: React.FC<NotificationBrandBadgeProps> = ({ item, theme }) => {
  const accentColor = getVariantColor(item.variant, theme);

  if (LOGO_VARIANTS.includes(item.variant)) {
    return (
      <View
        testID="notification-brand-badge"
        style={[styles.badge, styles.badgeWithTint, { backgroundColor: theme.accentSoft }]}
      >
        <Image source={brandLogo} style={styles.logo} contentFit="contain" />
      </View>
    );
  }

  // Error/warning keep a status glyph so the state is legible at a glance.
  return (
    <View style={[styles.badge, { borderColor: accentColor, backgroundColor: `${accentColor}18` }]}>
      <Ionicons name={getVariantIcon(item.variant)} size={20} color={accentColor} />
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  badgeWithTint: {
    borderColor: 'transparent',
  },
  logo: {
    width: 24,
    height: 24,
  },
});
