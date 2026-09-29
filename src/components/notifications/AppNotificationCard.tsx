/**
 * @fileoverview Floating in-app notification card UI.
 *
 * Design notes:
 * - Leading brand badge (PKEY logo chip) for info/success; status glyph for warning/error.
 * - Vault-card look: theme border/radius/elevation instead of a generic accent bar.
 * - Depleting progress track that pauses while the user holds the card.
 * - Horizontal swipe to dismiss (react-native-gesture-handler).
 * - `sensitive` items never render their message (secrets stay out of the UI).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { NotificationBrandBadge } from './NotificationBrandBadge';
import { getVariantColor } from '../../notifications/inAppNotifications';
import { InAppNotificationItem, NotificationTheme } from '../../notifications/types';
import { notificationThemeFromColors } from '../../notifications/notificationTheme';
import { getLocale } from '../../constants/localization';

const SWIPE_DISMISS_THRESHOLD = 80;
const ENTER_MS = 220;
const EXIT_MS = 160;

interface AppNotificationCardProps {
  item: InAppNotificationItem;
  theme?: NotificationTheme | null;
  onDismiss: (id: string) => void;
}

export const AppNotificationCard: React.FC<AppNotificationCardProps> = ({
  item,
  theme,
  onDismiss,
}) => {
  const resolvedTheme = notificationThemeFromColors(theme);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(item.position === 'top' ? -24 : 24)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(1)).current;

  const accentColor = getVariantColor(item.variant, resolvedTheme);
  const isTop = item.position === 'top';

  const [reduceMotion, setReduceMotion] = useState(false);

  const dismissedRef = useRef(false);
  const pausedRef = useRef(false);
  const fullDurationRef = useRef(item.duration);
  const remainingDurationRef = useRef(item.duration);
  const progressAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  const animateExitAndDismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    progressAnimRef.current?.stop();
    if (reduceMotion) {
      onDismiss(item.id);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: EXIT_MS, useNativeDriver: true }),
      Animated.timing(translateY, {
        toValue: isTop ? -18 : 18,
        duration: EXIT_MS,
        useNativeDriver: true,
      }),
    ]).start(() => onDismiss(item.id));
  }, [isTop, item.id, onDismiss, opacity, reduceMotion, translateY]);

  const startProgress = useCallback(() => {
    if (fullDurationRef.current <= 0) return;
    progressAnimRef.current = Animated.timing(progress, {
      toValue: 0,
      duration: remainingDurationRef.current,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    progressAnimRef.current.start(({ finished }) => {
      if (finished && !pausedRef.current) animateExitAndDismiss();
    });
  }, [animateExitAndDismiss, progress]);

  const pauseProgress = useCallback(() => {
    if (pausedRef.current) return;
    pausedRef.current = true;
    if (progressAnimRef.current) {
      progressAnimRef.current.stop();
      progress.stopAnimation((value) => {
        const clamped = Math.max(0, Math.min(1, value));
        remainingDurationRef.current = fullDurationRef.current * clamped;
      });
    }
  }, [progress]);

  const resumeProgress = useCallback(() => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    if (remainingDurationRef.current > 0) startProgress();
  }, [startProgress]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      translateY.setValue(0);
    } else {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: ENTER_MS, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: ENTER_MS, useNativeDriver: true }),
      ]).start();
    }
  }, [opacity, reduceMotion, translateY]);

  useEffect(() => {
    if (item.duration > 0) {
      fullDurationRef.current = item.duration;
      remainingDurationRef.current = item.duration;
      startProgress();
    }
    return () => progressAnimRef.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.duration]);

  useEffect(() => {
    if (Platform.OS === 'ios' && (item.variant === 'error' || item.variant === 'warning')) {
      AccessibilityInfo.announceForAccessibility(item.title);
    }
  }, [item.title, item.variant]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-24, 24])
        .onBegin(pauseProgress)
        .onFinalize(resumeProgress)
        .onUpdate((event) => {
          if (!dismissedRef.current) translateX.setValue(event.translationX);
        })
        .onEnd((event) => {
          if (Math.abs(event.translationX) > SWIPE_DISMISS_THRESHOLD) {
            Animated.timing(translateX, {
              toValue: event.translationX > 0 ? 420 : -420,
              duration: EXIT_MS,
              useNativeDriver: true,
            }).start(animateExitAndDismiss);
          } else {
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
            }).start();
          }
        }),
    [animateExitAndDismiss, pauseProgress, resumeProgress, translateX]
  );

  const handleDismiss = () => animateExitAndDismiss();

  const handleActionPress = (actionIndex: number) => {
    const action = item.actions[actionIndex];
    animateExitAndDismiss();
    action?.onPress?.();
  };

  const isAlerting = item.variant === 'error' || item.variant === 'warning';

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        testID="notification-card"
        accessibilityLiveRegion="polite"
        accessibilityRole={isAlerting ? 'alert' : undefined}
        style={[
          styles.card,
          {
            backgroundColor: resolvedTheme.cardBg,
            borderColor: resolvedTheme.border,
            opacity,
            transform: [{ translateY }, { translateX }],
          },
        ]}
      >
        <View style={styles.contentRow}>
          <View style={styles.badgeSlot}>
            <NotificationBrandBadge item={item} theme={resolvedTheme} />
          </View>

          <View style={styles.textBlock}>
            <Text
              style={[styles.title, { color: resolvedTheme.text }]}
              numberOfLines={2}
              testID="notification-title"
            >
              {item.title}
            </Text>
            {item.sensitive ? (
              <View style={styles.sensitiveRow}>
                <Ionicons name="lock-closed" size={13} color={accentColor} />
                <Text style={[styles.message, { color: resolvedTheme.textMuted }]}>••••••</Text>
              </View>
            ) : item.message ? (
              <Text
                style={[styles.message, { color: resolvedTheme.textMuted }]}
                numberOfLines={4}
                testID="notification-message"
              >
                {item.message}
              </Text>
            ) : null}
          </View>
        </View>

        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleDismiss}
          accessibilityRole="button"
          accessibilityLabel={getLocale().notif_dismiss_a11y}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <Ionicons name="close" size={18} color={resolvedTheme.textMuted} />
        </TouchableOpacity>

        {item.mode === 'alert' && item.actions.length > 0 ? (
          <View style={styles.actionsRow}>
            {item.actions.map((action, index) => {
              const isDestructive = action.style === 'destructive';
              const isCancel = action.style === 'cancel';
              const buttonColor = isDestructive
                ? resolvedTheme.danger
                : isCancel
                  ? resolvedTheme.textMuted
                  : resolvedTheme.accent;

              return (
                <TouchableOpacity
                  key={`${item.id}-action-${index}`}
                  style={[
                    styles.actionButton,
                    {
                      borderColor: isCancel ? resolvedTheme.border : buttonColor,
                      backgroundColor: isCancel ? 'transparent' : `${buttonColor}18`,
                    },
                  ]}
                  onPress={() => handleActionPress(index)}
                >
                  <Text style={[styles.actionText, { color: buttonColor }]}>{action.text}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        {item.duration > 0 ? (
          <View
            testID="notification-progress"
            style={[styles.progressTrack, { backgroundColor: `${accentColor}26` }]}
          >
            <Animated.View
              style={[
                styles.progressFill,
                { backgroundColor: accentColor, transform: [{ scaleX: progress }] },
              ]}
            />
          </View>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 14,
    paddingBottom: 14,
    paddingHorizontal: 14,
    paddingRight: 38,
  },
  badgeSlot: {
    marginRight: 11,
    marginTop: 1,
  },
  textBlock: {
    flex: 1,
  },
  sensitiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  closeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 2,
    padding: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  actionButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  progressTrack: {
    height: 3,
    borderRadius: 1.5,
    marginHorizontal: 14,
    marginBottom: 12,
    marginTop: 2,
    overflow: 'hidden',
  },
  progressFill: {
    flex: 1,
    borderRadius: 1.5,
    transformOrigin: 'left',
  },
});
