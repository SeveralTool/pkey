/**
 * @fileoverview The primary tab displaying the list of credentials.
 */
import React from 'react';
import { View } from 'react-native';
import { CardsList } from '../components/cards/CardsList';
import { globalStyles as styles } from '../styles/globalStyles';

/**
 * Tab view that wraps the `CardsList` component.
 *
 * @returns {JSX.Element} The Cards Tab component.
 */
export const CardsTab = () => {
  return (
    <View style={styles.fullWidthHeightFlex}>
      <CardsList />
    </View>
  );
};
