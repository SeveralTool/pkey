/**
 * @fileoverview Horizontal swipe wrapper for vault cards (copy right / delete left).
 */
import React, { useCallback, useRef } from 'react';
import { Platform, StyleSheet, Vibration, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { Ionicons } from '@expo/vector-icons';
import { globalStyles, spacing } from '../../styles/globalStyles';
import { SWIPE_THRESHOLD } from './swipeActions';

export interface SwipeableCardShellProps {
  enabled: boolean;
  successColor: string;
  dangerColor: string;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  accessibilityLabel?: string;
  children: React.ReactNode;
}

const ACTION_WIDTH = SWIPE_THRESHOLD + 12;

function triggerHaptic() {
  if (Platform.OS === 'android') {
    Vibration.vibrate(10);
  }
}

export const SwipeableCardShell: React.FC<SwipeableCardShellProps> = ({
  enabled,
  successColor,
  dangerColor,
  onSwipeRight,
  onSwipeLeft,
  accessibilityLabel,
  children,
}) => {
  const swipeableRef = useRef<Swipeable>(null);

  const closeSwipe = useCallback(() => {
    swipeableRef.current?.close();
  }, []);

  const handleOpen = useCallback(
    (direction: 'left' | 'right') => {
      triggerHaptic();
      if (direction === 'left') {
        onSwipeRight();
      } else {
        onSwipeLeft();
      }
      closeSwipe();
    },
    [closeSwipe, onSwipeLeft, onSwipeRight]
  );

  if (Platform.OS === 'web') {
    return <View style={globalStyles.cardListItemShell}>{children}</View>;
  }

  const renderLeftActions = useCallback(
    () => (
      <View style={[styles.actionPane, { width: ACTION_WIDTH, backgroundColor: successColor }]}>
        <Ionicons name="copy-outline" size={22} color="#FFFFFF" />
      </View>
    ),
    [successColor]
  );

  const renderRightActions = useCallback(
    () => (
      <View
        style={[
          styles.actionPane,
          styles.actionPaneRight,
          { width: ACTION_WIDTH, backgroundColor: dangerColor },
        ]}
      >
        <Ionicons name="trash-outline" size={22} color="#FFFFFF" />
      </View>
    ),
    [dangerColor]
  );

  return (
    <Swipeable
      ref={swipeableRef}
      enabled={enabled}
      friction={2}
      overshootLeft={false}
      overshootRight={false}
      leftThreshold={SWIPE_THRESHOLD}
      rightThreshold={SWIPE_THRESHOLD}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      onSwipeableOpen={handleOpen}
      containerStyle={globalStyles.cardListItemShell}
      childrenContainerStyle={styles.swipeContent}
    >
      <View accessibilityLabel={accessibilityLabel} accessibilityRole="button">
        {children}
      </View>
    </Swipeable>
  );
};

const styles = StyleSheet.create({
  swipeContent: {
    borderRadius: 14,
  },
  actionPane: {
    justifyContent: 'center',
    height: '100%',
    paddingLeft: spacing.lg,
  },
  actionPaneRight: {
    alignItems: 'flex-end',
    paddingLeft: 0,
    paddingRight: spacing.lg,
  },
});
