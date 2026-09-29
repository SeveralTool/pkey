import React from 'react';
import { Image, type ImageStyle, type ImageContentFit } from 'expo-image';

interface BrandLogoProps {
  width?: number;
  height?: number;
  style?: ImageStyle;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  width = 200,
  height,
  style,
  resizeMode = 'contain',
}) => {
  const contentFit: ImageContentFit =
    resizeMode === 'stretch' ? 'fill' : resizeMode === 'center' ? 'none' : resizeMode;

  return (
    <Image
      source={require('../../../assets/images/brand-logo.png')}
      style={[{ width, height: height ?? width }, style]}
      contentFit={contentFit}
      accessibilityLabel="PKEY"
    />
  );
};
