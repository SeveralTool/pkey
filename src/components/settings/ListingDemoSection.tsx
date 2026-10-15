/**
 * Dev/listing helper: load fictional Play Store vault cards.
 * Hidden unless the vault is empty or already tagged `demo`, and only in
 * development builds (or when re-seeding an existing demo vault).
 */
import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { canReplaceWithListingDemo } from '@pkey/core';
import { useCoreState } from '../../context/CoreStateContext';
import { useDatabase } from '../../context/DatabaseContext';
import { useNotifications } from '../../context/NotificationContext';
import { useSettings } from '../../context/SettingsContext';
import { useUI } from '../../context/UIContext';
import { globalStyles as styles } from '../../styles/globalStyles';
import { SettingsSectionCard } from '../common';

/**
 * Settings block that replaces a demo/empty vault with listing fiction.
 */
export const ListingDemoSection: React.FC = () => {
  const { db } = useCoreState();
  const { c, t } = useSettings();
  const { alert } = useNotifications();
  const { executeSeedListingDemo } = useDatabase();
  const { setCustomPrompt, setCustomPromptInput } = useUI();

  const cards = db.cards ?? [];
  const canSeed = canReplaceWithListingDemo(cards);
  const hasDemo = cards.some((card) =>
    (card.tags ?? []).some((tag) => tag.trim().toLowerCase() === 'demo')
  );
  const visible = canSeed && (typeof __DEV__ !== 'undefined' ? __DEV__ || hasDemo : hasDemo);

  if (!visible) return null;

  const onLoad = () => {
    if (!canSeed) {
      alert({
        title: t.listing_demo_blocked_title,
        message: t.listing_demo_blocked_message,
        variant: 'warning',
      });
      return;
    }
    setCustomPromptInput('');
    setCustomPrompt({
      visible: true,
      title: t.listing_demo_confirm_title,
      message: t.listing_demo_confirm_message,
      secure: false,
      busyMessage: t.listing_demo_busy,
      placeholder: 'DEMO',
      error: undefined,
      onConfirm: (input: string) => {
        if (input.trim().toLowerCase() !== 'demo') {
          setCustomPrompt((prev) => ({ ...prev, error: t.listing_demo_confirm_mismatch }));
          return;
        }
        setCustomPrompt((prev) => ({ ...prev, visible: false }));
        void executeSeedListingDemo();
      },
    });
  };

  return (
    <SettingsSectionCard icon="phone-portrait-outline" title={t.listing_demo_section_title}>
      <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted, marginBottom: 12 }]}>
        {t.listing_demo_section_desc}
      </Text>
      <TouchableOpacity
        style={[styles.secGhostOutlineButton, { borderColor: c.accent, marginTop: 0 }]}
        onPress={onLoad}
        accessibilityRole="button"
        accessibilityLabel={t.listing_demo_load_btn}
      >
        <Ionicons name="download-outline" size={16} color={c.accent} style={{ marginRight: 8 }} />
        <Text style={[styles.secGhostOutlineText, { color: c.accent }]}>
          {t.listing_demo_load_btn}
        </Text>
      </TouchableOpacity>
    </SettingsSectionCard>
  );
};
