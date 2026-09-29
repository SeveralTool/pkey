/**
 * @fileoverview Compact help icon that opens a procedure modal.
 */
import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../../context/SettingsContext';

export interface HelpInfoButtonProps {
  onPress: () => void;
  /** Override accent (e.g. danger zone). Defaults to theme accent. */
  color?: string;
  /** Override the default “Help” accessibility label. */
  accessibilityLabel?: string;
}

export const HelpInfoButton: React.FC<HelpInfoButtonProps> = ({
  onPress,
  color,
  accessibilityLabel,
}) => {
  const { c, t } = useSettings();
  const tint = color ?? c.accent;

  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? t.help_a11y}
      style={styles.btn}
    >
      <Ionicons name="help-circle-outline" size={18} color={tint} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  btn: {
    marginLeft: 6,
    padding: 2,
  },
});
