/**
 * @fileoverview Read-only tag chips for card header display.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { globalStyles as styles } from '../../styles/globalStyles';

interface CardTagChipsProps {
  tags: string[];
  textColor: string;
  borderColor: string;
  backgroundColor: string;
}

export const CardTagChips: React.FC<CardTagChipsProps> = ({
  tags,
  textColor,
  borderColor,
  backgroundColor,
}) => {
  if (!tags.length) return null;

  return (
    <View style={styles.tagLineRowFlex}>
      {tags.map((tag) => (
        <View key={tag} style={[styles.tagChipFrame, { borderColor, backgroundColor }]}>
          <Text style={[styles.tagChipText, { color: textColor }]}>{tag}</Text>
        </View>
      ))}
    </View>
  );
};
