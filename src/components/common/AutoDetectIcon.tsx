/**
 * @fileoverview Icon button with auto-detection and loading state.
 * Displays loader while detecting; always falls back to a visible default glyph.
 */

import React, { useEffect, useState } from 'react';
import { TouchableOpacity, View, Animated, Easing } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { CardIcon } from '../../types';
import { DEFAULT_CARD_ICON, resolveCardIcon, resolveIoniconName } from '../../services/iconDetection';

interface AutoDetectIconProps {
  icon: CardIcon;
  isLoading: boolean;
  /** Card URL — used to drop a leftover favicon from another host. */
  link?: string;
  size?: number;
  color?: string;
  backgroundColor?: string;
  containerStyle?: object;
  onPress?: () => void;
}

const LoaderSpinner: React.FC<{ color: string; size: number }> = ({ color, size }) => {
  const spinAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    spin.start();
    return () => spin.stop();
  }, [spinAnim]);

  const spinValue = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      style={{
        transform: [{ rotate: spinValue }],
      }}
    >
      <Ionicons name="refresh" size={size} color={color} />
    </Animated.View>
  );
};

function glyphName(icon: CardIcon): keyof typeof Ionicons.glyphMap {
  const raw = icon.type === 'icon' ? resolveIoniconName(icon.value) : DEFAULT_CARD_ICON.value;
  const name = raw || DEFAULT_CARD_ICON.value;
  if (name in Ionicons.glyphMap) {
    return name as keyof typeof Ionicons.glyphMap;
  }
  return DEFAULT_CARD_ICON.value as keyof typeof Ionicons.glyphMap;
}

export const AutoDetectIcon: React.FC<AutoDetectIconProps> = ({
  icon,
  isLoading,
  link,
  size = 18,
  color,
  containerStyle,
  onPress,
}) => {
  const resolved = resolveCardIcon(icon, link);
  const imageUri = resolved.type === 'image' ? resolved.uri.trim() : '';
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUri]);

  if (isLoading) {
    return <LoaderSpinner color={color || '#000'} size={size} />;
  }

  const showImage = Boolean(imageUri) && !imageFailed;
  const fallback: CardIcon = imageFailed
    ? resolveCardIcon({ type: 'icon', value: DEFAULT_CARD_ICON.value }, link)
    : resolved;

  const glyph = (
    showImage ? (
      <Image
        key={imageUri}
        recyclingKey={imageUri}
        source={{ uri: imageUri }}
        cachePolicy="memory-disk"
        contentFit="contain"
        onError={() => setImageFailed(true)}
        style={{
          width: size,
          height: size,
          borderRadius: size / 4,
        }}
      />
    ) : (
      <Ionicons name={glyphName(fallback)} size={size} color={color} />
    )
  );

  if (onPress) {
    return (
      <TouchableOpacity style={containerStyle} onPress={onPress} activeOpacity={0.7}>
        {glyph}
      </TouchableOpacity>
    );
  }

  return <View style={containerStyle}>{glyph}</View>;
};

export default AutoDetectIcon;
