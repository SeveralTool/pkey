/**
 * @fileoverview Top/bottom notification stack host.
 *
 * Error/warning notifications render at the top (heads-up style, harder to
 * miss); info/success render at the bottom (snackbar style).
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppNotificationCard } from './AppNotificationCard';
import { InAppNotificationItem, NotificationTheme } from '../../notifications/types';
import { estimateToastBottomPadding } from '../../navigation/tabBarInset';

interface NotificationHostProps {
  queue: InAppNotificationItem[];
  theme: NotificationTheme;
  onDismiss: (id: string) => void;
}

export const NotificationHost: React.FC<NotificationHostProps> = ({ queue, theme, onDismiss }) => {
  const insets = useSafeAreaInsets();
  const topItems = queue.filter((item) => item.position === 'top');
  const bottomItems = queue.filter((item) => item.position !== 'top');

  if (queue.length === 0) return null;

  return (
    <>
      {topItems.length > 0 ? (
        <View
          pointerEvents="box-none"
          style={[styles.host, styles.top, { paddingTop: Math.max(insets.top, 12) }]}
        >
          {topItems.map((item) => (
            <AppNotificationCard key={item.id} item={item} theme={theme} onDismiss={onDismiss} />
          ))}
        </View>
      ) : null}
      {bottomItems.length > 0 ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.host,
            styles.bottom,
            { paddingBottom: estimateToastBottomPadding(insets.bottom) },
          ]}
        >
          {bottomItems.map((item) => (
            <AppNotificationCard key={item.id} item={item} theme={theme} onDismiss={onDismiss} />
          ))}
        </View>
      ) : null}
    </>
  );
};

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 9999,
  },
  top: {
    top: 0,
  },
  bottom: {
    bottom: 0,
  },
});
