/**
 * @fileoverview Reusable component for a custom input prompt modal.
 *
 * Uses a native RN Modal pinned to the TOP of the screen. That keeps the form
 * above the soft keyboard on every device without KeyboardAvoidingView / bottom
 * sheets (those race with OS biometric dialogs and Android resize/pan).
 *
 * Scrim must be `backgroundColor` on the flex:1 root (not a separate absoluteFill
 * sibling) — Android Dialog + transparent Modal often fails to paint absolute
 * overlays, which made the prompt look like a floating card with no dim.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  InteractionManager,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCoreState } from '../../context/CoreStateContext';
import { useSettings } from '../../context/SettingsContext';
import { useShakeAnimation } from '../../hooks/useShakeAnimation';

/** Fallback when safe-area top is 0 (some Android Modal hosts). */
const STATUS_BAR_FALLBACK = Platform.OS === 'android' ? 28 : 0;

/** Dim strength for the blocking scrim (readable on light and dark themes). */
const SCRIM = 'rgba(0,0,0,0.72)';

/**
 * A modal component that mimics `Alert.prompt` to ensure consistent cross-platform UX.
 */
export const CustomPromptModal = () => {
  const { customPrompt, setCustomPrompt, customPromptInput, setCustomPromptInput, authBusy } =
    useCoreState();
  const { c, t } = useSettings();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const { trigger: triggerShake, animatedStyle: shakeStyle } = useShakeAnimation();
  const prevError = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (customPrompt.error && customPrompt.error !== prevError.current) {
      triggerShake();
    }
    prevError.current = customPrompt.error;
  }, [customPrompt.error, triggerShake]);

  const handleCancel = useCallback(() => {
    if (authBusy) return;
    Keyboard.dismiss();
    setCustomPrompt((prev) => ({ ...prev, visible: false }));
  }, [authBusy, setCustomPrompt]);

  const handleConfirm = () => {
    if (authBusy) return;
    void customPrompt.onConfirm?.(customPromptInput);
  };

  const handleInputChange = useCallback(
    (text: string) => {
      setCustomPromptInput(text);
      if (customPrompt.error) {
        setCustomPrompt((prev) => (prev.error ? { ...prev, error: undefined } : prev));
      }
    },
    [customPrompt.error, setCustomPrompt, setCustomPromptInput]
  );

  const focusInput = useCallback(() => {
    if (authBusy) return;
    inputRef.current?.focus();
  }, [authBusy]);

  // Focus after the host activity settles (esp. post-biometric).
  useEffect(() => {
    if (!customPrompt.visible || authBusy) return;

    const delay = Platform.OS === 'android' ? 450 : 200;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const task = InteractionManager.runAfterInteractions(() => {
      timers.push(setTimeout(focusInput, delay));
    });

    return () => {
      task.cancel?.();
      for (const timer of timers) clearTimeout(timer);
    };
  }, [customPrompt.visible, authBusy, focusInput]);

  return (
    <Modal
      visible={customPrompt.visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleCancel}
    >
      {/* Scrim on flex:1 root — same pattern as IconSelector / ImportWizard. */}
      <View style={[styles.root, { backgroundColor: SCRIM }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={authBusy ? undefined : handleCancel}
          accessibilityRole="button"
          accessibilityLabel={t.close_button}
        />
        {/* Explicit top pin — never flex-end / bottom sheet. */}
        <View
          style={[
            styles.topPin,
            {
              paddingTop: Math.max(insets.top, STATUS_BAR_FALLBACK) + 12,
            },
          ]}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              styles.card,
              shakeStyle,
              {
                backgroundColor: c.cardBg,
                borderColor: customPrompt.error ? c.danger : c.border,
              },
            ]}
          >
            <Text style={{ color: c.text, fontSize: 18, fontWeight: 'bold', marginBottom: 8 }}>
              {customPrompt.title}
            </Text>
            {customPrompt.message ? (
              <Text style={{ color: c.textMuted, fontSize: 13, marginBottom: 16, lineHeight: 18 }}>
                {customPrompt.message}
              </Text>
            ) : null}
            <TextInput
              ref={inputRef}
              style={{
                backgroundColor: c.bg,
                color: c.text,
                borderColor: customPrompt.error ? c.danger : c.border,
                borderWidth: 1,
                borderRadius: 8,
                padding: 12,
                fontSize: 16,
                marginBottom: customPrompt.error || authBusy ? 8 : 20,
                opacity: authBusy ? 0.6 : 1,
              }}
              secureTextEntry={customPrompt.secure}
              showSoftInputOnFocus
              autoFocus={false}
              editable={!authBusy}
              value={customPromptInput}
              onChangeText={handleInputChange}
              placeholder={customPrompt.placeholder ?? t.placeholder_secure_input}
              placeholderTextColor={c.textMuted}
              returnKeyType="done"
              blurOnSubmit={false}
              maxLength={customPrompt.maxLength}
              autoCapitalize={customPrompt.secure ? 'none' : 'sentences'}
              onSubmitEditing={handleConfirm}
            />
            {customPrompt.error ? (
              <Text
                style={{
                  color: c.danger,
                  fontSize: 12,
                  fontWeight: '600',
                  marginBottom: authBusy ? 12 : 16,
                  paddingLeft: 2,
                }}
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
              >
                {customPrompt.error}
              </Text>
            ) : null}
            {authBusy ? (
              <View
                style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 }}
              >
                <ActivityIndicator size="small" color={c.accent} />
                <Text style={{ color: c.textMuted, fontSize: 13, flex: 1, lineHeight: 18 }}>
                  {customPrompt.busyMessage || t.auth_busy_verify}
                </Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
              <TouchableOpacity
                onPress={handleCancel}
                disabled={authBusy}
                accessibilityRole="button"
                accessibilityLabel={t.cancel_button}
                accessibilityState={{ disabled: authBusy }}
                style={{ paddingVertical: 10, paddingHorizontal: 16, opacity: authBusy ? 0.4 : 1 }}
              >
                <Text style={{ color: c.textMuted, fontWeight: 'bold' }}>{t.cancel_button}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirm}
                disabled={authBusy}
                accessibilityRole="button"
                accessibilityLabel={t.continue_button}
                accessibilityState={{ disabled: authBusy }}
                style={{
                  backgroundColor: c.accent,
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderRadius: 8,
                  minWidth: 100,
                  alignItems: 'center',
                  opacity: authBusy ? 0.7 : 1,
                }}
              >
                {authBusy ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{t.continue_button}</Text>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  topPin: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    zIndex: 2,
    elevation: 6,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
  },
});
