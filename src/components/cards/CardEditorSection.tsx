/**
 * @fileoverview One disclosure card inside the card editor.
 *
 * The body stays unmounted while closed, so OTP timers and the QR camera stay
 * off. Opening and closing animate only the clip height, on the UI thread, for
 * a short fixed time. Reduce Motion skips that and shows or hides at once.
 */
import React, { useRef, useState } from 'react';
import { Platform, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type WithTimingConfig,
} from 'react-native-reanimated';
import { globalStyles as styles } from '../../styles/globalStyles';

type CardEditorSectionProps = Readonly<{
  title: string;
  /** Spoken hint while the section is closed. Not drawn when `summaryTags` is set. */
  summary?: string;
  /** Official chips shown instead of `summary` text while the section is closed. */
  summaryTags?: React.ReactNode;
  expanded: boolean;
  onPress: () => void;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  mutedColor: string;
  reduceMotion: boolean;
  children: React.ReactNode;
}>;

/** Short enough that a low-end phone relayouts the scroll view for only a few frames. */
const SECTION_HEIGHT_MS = 200;

const SECTION_HEIGHT_TIMING: WithTimingConfig = {
  duration: SECTION_HEIGHT_MS,
  easing: Easing.out(Easing.cubic),
};

/**
 * Softer than the tab bar's selection tick.
 * Android uses the frequent-segment tick, which the system keeps very light.
 * iOS has no public tick softer than selection.
 */
function tickSectionToggle(): void {
  const pulse =
    Platform.OS === 'android'
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Frequent_Tick)
      : Haptics.selectionAsync();
  void pulse.catch(() => undefined);
}

export function CardEditorSection({
  title,
  summary,
  summaryTags,
  expanded,
  onPress,
  backgroundColor,
  borderColor,
  textColor,
  mutedColor,
  reduceMotion,
  children,
}: CardEditorSectionProps): React.JSX.Element {
  const hint = !expanded && summary ? summary : null;
  const tags = !expanded && summaryTags ? summaryTags : null;
  const [bodyOn, setBodyOn] = useState(expanded);
  // The section that is already open on first paint stays in normal flow until
  // we know its height, so it does not flash shut. Later toggles use the clip.
  const [natural, setNatural] = useState(expanded);
  const progress = useSharedValue(expanded ? 1 : 0);
  const measured = useSharedValue(0);
  const prevToggle = useRef({ expanded, reduceMotion });

  // Prop-driven shared values update during render, before paint. An effect
  // would start the height one frame later.
  if (
    prevToggle.current.expanded !== expanded ||
    prevToggle.current.reduceMotion !== reduceMotion
  ) {
    prevToggle.current = { expanded, reduceMotion };
    if (reduceMotion) {
      progress.value = expanded ? 1 : 0;
      if (bodyOn !== expanded) setBodyOn(expanded);
    } else if (expanded) {
      if (!bodyOn) setBodyOn(true);
      if (measured.value > 0) {
        if (natural) setNatural(false);
        progress.value = withTiming(1, SECTION_HEIGHT_TIMING);
      }
    } else {
      if (natural) setNatural(false);
      progress.value = withTiming(0, SECTION_HEIGHT_TIMING, (finished) => {
        if (finished) runOnJS(setBodyOn)(false);
      });
    }
  }

  const clipStyle = useAnimatedStyle(() => ({
    height: measured.value * progress.value,
    overflow: 'hidden' as const,
  }));

  const onBodyLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    if (next <= 0 || Math.abs(next - measured.value) < 0.5) return;
    measured.value = next;
    if (natural) setNatural(false);
    if (!expanded || reduceMotion || progress.value > 0) return;
    progress.value = withTiming(1, SECTION_HEIGHT_TIMING);
  };

  return (
    <View style={[styles.editorSectionCard, { backgroundColor, borderColor }]}>
      <Pressable
        onPress={() => {
          tickSectionToggle();
          onPress();
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={hint ? `${title}. ${hint}` : title}
        style={styles.editorSectionHeader}
      >
        <View style={styles.editorSectionHeading}>
          <Text style={[styles.editorSectionTitle, { color: textColor }]}>{title}</Text>
          {tags}
          {hint && !tags ? (
            <Text numberOfLines={1} style={[styles.editorSectionSummary, { color: mutedColor }]}>
              {hint}
            </Text>
          ) : null}
        </View>
        <Ionicons
          name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
          size={18}
          color={mutedColor}
        />
      </Pressable>
      {bodyOn ? (
        <Animated.View
          style={natural || reduceMotion ? undefined : clipStyle}
          pointerEvents={expanded ? 'auto' : 'none'}
        >
          <View
            collapsable={false}
            onLayout={reduceMotion ? undefined : onBodyLayout}
            style={natural || reduceMotion ? undefined : styles.editorSectionMeasure}
          >
            <View style={styles.editorSectionBody}>{children}</View>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}
