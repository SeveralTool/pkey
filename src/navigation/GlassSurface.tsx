/**
 * @fileoverview Translucent chrome for the floating tab pill.
 *
 * iOS 26+: native Liquid Glass (`GlassView`). Older iOS: `BlurView`.
 * Android and Reduce Transparency: frosted solid (no screenshot-style blur).
 */
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';

type GlassSurfaceProps = Readonly<{
  children: React.ReactNode;
  isDark: boolean;
  style?: StyleProp<ViewStyle>;
}>;

/** Frosted / glass panel that always falls back to a readable opaque-ish fill. */
export function GlassSurface({ children, isDark, style }: GlassSurfaceProps): React.JSX.Element {
  const [reduceTransparency, setReduceTransparency] = useState(false);

  useEffect(() => {
    let mounted = true;
    const apply = (enabled: boolean) => {
      if (mounted) setReduceTransparency(enabled);
    };
    void AccessibilityInfo.isReduceTransparencyEnabled().then(apply);
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', apply);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const canLiquidGlass =
    Platform.OS === 'ios' &&
    !reduceTransparency &&
    isLiquidGlassAvailable() &&
    isGlassEffectAPIAvailable();

  if (canLiquidGlass) {
    return (
      <GlassView
        style={style}
        glassEffectStyle="regular"
        isInteractive
        colorScheme={isDark ? 'dark' : 'light'}
      >
        {children}
      </GlassView>
    );
  }

  if (Platform.OS === 'ios' && !reduceTransparency) {
    return (
      <BlurView intensity={64} tint={isDark ? 'dark' : 'light'} style={style}>
        {children}
      </BlurView>
    );
  }

  return (
    <View
      style={[
        {
          backgroundColor: isDark ? 'rgba(24, 24, 24, 0.88)' : 'rgba(255, 255, 255, 0.9)',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
