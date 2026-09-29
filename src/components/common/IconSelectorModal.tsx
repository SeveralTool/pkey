/**
 * @fileoverview Reusable component for selecting an icon for a password card.
 */
import React from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUI } from '../../context/UIContext';
import { useDatabase } from '../../context/DatabaseContext';
import { useSettings } from '../../context/SettingsContext';
import { PRESET_ICONS, resolveIoniconName } from '../../constants/icons';
import { globalStyles as styles } from '../../styles/globalStyles';

/**
 * A modal that displays a grid of preset icons for users to customize their cards.
 * Controlled globally via AppContext.
 *
 * @returns {JSX.Element | null} The rendered modal or null if inactive.
 */
export const IconSelectorModal: React.FC = () => {
  const { customIconModal, setCustomIconModal } = useUI();
  const { handleUpdateCardValue } = useDatabase();
  const { c, isDark, t } = useSettings();

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={customIconModal.visible}
      onRequestClose={() => setCustomIconModal({ visible: false, cardId: null })}
    >
      <View style={styles.modalBgBackdropCenteredOverlay}>
        <View
          style={[styles.modalBoxContainer, { backgroundColor: c.cardBg, borderColor: c.border }]}
        >
          <Text style={[styles.modalHeadingTextTitle, { color: c.text }]}>
            {t.icon_picker_title}
          </Text>

          <View style={styles.modalPresetIconsFlexGrid}>
            {PRESET_ICONS.map((icoItem) => (
              <TouchableOpacity
                key={icoItem.key}
                style={[
                  styles.modalPresetIconBoxItem,
                  { backgroundColor: isDark ? '#2D2D37' : '#F3F4F6', borderColor: c.border },
                ]}
                accessibilityRole="button"
                accessibilityLabel={icoItem.label}
                onPress={() => {
                  if (customIconModal.cardId) {
                    handleUpdateCardValue(customIconModal.cardId, 'icon', {
                      type: 'icon',
                      value: icoItem.key,
                    }); // Cambiado a CardIcon
                  }
                  setCustomIconModal({ visible: false, cardId: null });
                }}
              >
                <Ionicons
                  name={resolveIoniconName(icoItem.key) as keyof typeof Ionicons.glyphMap}
                  size={24}
                  color={c.accent}
                />
                <Text style={[styles.modalIconItemTextLabel, { color: c.textMuted }]}>
                  {icoItem.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[
              styles.primaryActActionButton,
              { backgroundColor: '#4b5563', paddingVertical: 10 },
            ]}
            onPress={() => setCustomIconModal({ visible: false, cardId: null })}
            accessibilityRole="button"
            accessibilityLabel={t.close_button}
          >
            <Text style={styles.primaryActActionText}>{t.close_button}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};
