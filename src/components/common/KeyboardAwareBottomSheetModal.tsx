/**
 * @fileoverview Bottom-anchored sheet that stays above the soft keyboard.
 *
 * Uses an in-tree overlay (not RN Modal). Modal creates a separate Android Dialog
 * window where keyboard resize / Keyboard events are unreliable — which made
 * bottomGap and lift appear to “do nothing”.
 *
 * Lift strategy:
 * - Android: `softwareKeyboardLayoutMode: resize` shrinks this window; sheet stays
 *   at flex-end with a small marginBottom gap above the keyboard.
 * - iOS: KeyboardAvoidingView (padding) + the same marginBottom gap.
 * - keyboardHeight is only used to drop the home-indicator inset while the
 *   keyboard is open (never added as full keyboard padding — avoids double offset).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Pressable,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  BackHandler,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '../../hooks/useReducedMotion';

type Props = {
  visible: boolean;
  onRequestClose?: () => void;
  children: React.ReactNode;
  /** Extra styles for the sheet panel (not the backdrop). */
  sheetStyle?: StyleProp<ViewStyle>;
  /** Dismiss when tapping the dimmed backdrop. Default true. */
  dismissOnBackdropPress?: boolean;
  /** Visible air gap above the keyboard / home indicator. Default 5. */
  bottomGap?: number;
};

const BACKDROP_OPACITY = 0.7;
const ENTER_MS = 220;
const EXIT_MS = 180;
const SHEET_SPRING = { damping: 18, stiffness: 220, mass: 0.9 };

export const KeyboardAwareBottomSheetModal = ({
  visible,
  onRequestClose,
  children,
  sheetStyle,
  dismissOnBackdropPress = true,
  bottomGap = 5,
}: Props) => {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [mounted, setMounted] = useState(visible);

  const backdropOpacity = useSharedValue(visible ? BACKDROP_OPACITY : 0);
  const sheetTranslateY = useSharedValue(visible ? 0 : 48);

  const finishExit = useCallback(() => {
    setMounted(false);
  }, []);

  useEffect(() => {
    if (visible) {
      setMounted(true);
    }
  }, [visible]);

  useEffect(() => {
    if (!mounted) return;

    if (visible) {
      if (reduceMotion) {
        backdropOpacity.value = BACKDROP_OPACITY;
        sheetTranslateY.value = 0;
        return;
      }
      backdropOpacity.value = 0;
      sheetTranslateY.value = 48;
      backdropOpacity.value = withTiming(BACKDROP_OPACITY, { duration: ENTER_MS });
      sheetTranslateY.value = withSpring(0, SHEET_SPRING);
      return;
    }

    if (reduceMotion) {
      backdropOpacity.value = 0;
      sheetTranslateY.value = 48;
      finishExit();
      return;
    }

    backdropOpacity.value = withTiming(0, { duration: EXIT_MS });
    sheetTranslateY.value = withTiming(48, { duration: EXIT_MS }, (finished) => {
      if (finished) runOnJS(finishExit)();
    });
  }, [visible, mounted, reduceMotion, backdropOpacity, sheetTranslateY, finishExit]);

  useEffect(() => {
    if (!mounted) {
      setKeyboardOpen(false);
      return;
    }

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => setKeyboardOpen(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardOpen(false));
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      onRequestClose?.();
      return true;
    });

    return () => {
      showSub.remove();
      hideSub.remove();
      backSub.remove();
    };
  }, [mounted, onRequestClose]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  if (!mounted) return null;

  const handleBackdropPress = () => {
    if (!dismissOnBackdropPress) return;
    Keyboard.dismiss();
    onRequestClose?.();
  };

  // Keyboard open: only the 5px gap (home indicator is covered by the keyboard).
  // Keyboard closed: safe-area + gap so the sheet clears the home indicator.
  const sheetMarginBottom = keyboardOpen ? bottomGap : insets.bottom + bottomGap;

  return (
    <View style={styles.overlay} accessibilityViewIsModal importantForAccessibility="yes">
      <Animated.View style={[styles.backdrop, backdropStyle]} pointerEvents="none" />
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={handleBackdropPress}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      />
      <KeyboardAvoidingView
        style={styles.dock}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            styles.sheet,
            sheetStyle,
            sheetAnimStyle,
            { marginBottom: sheetMarginBottom, marginHorizontal: 12 },
          ]}
        >
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10000,
    elevation: 10000,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,1)',
  },
  dock: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderWidth: 1,
  },
});
