/**
 * @fileoverview Final confirmation modal for wiping all vault cards.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCoreState } from '../../context/CoreStateContext';
import { useDatabase } from '../../context/DatabaseContext';
import { useSettings } from '../../context/SettingsContext';
import { KeyboardAwareBottomSheetModal } from '../common/KeyboardAwareBottomSheetModal';

export const DeleteAllConfirmModal = () => {
  const { deleteAllConfirmCount, setDeleteAllConfirmCount } = useCoreState();
  const { executeDeleteAllCards } = useDatabase();
  const { c, t } = useSettings();
  const [deleting, setDeleting] = useState(false);

  const visible = deleteAllConfirmCount !== null;
  const cardCount = deleteAllConfirmCount ?? 0;

  const handleClose = () => {
    if (deleting) return;
    setDeleteAllConfirmCount(null);
  };

  const handleConfirm = () => {
    if (deleting) return;
    setDeleting(true);
    void executeDeleteAllCards(cardCount)
      .catch(() => {
        /* errors surfaced inside executeDeleteAllCards */
      })
      .finally(() => setDeleting(false));
  };

  return (
    <KeyboardAwareBottomSheetModal
      visible={visible}
      onRequestClose={handleClose}
      dismissOnBackdropPress={!deleting}
      sheetStyle={{
        backgroundColor: c.cardBg,
        borderColor: c.danger,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Ionicons name="warning" size={22} color={c.danger} style={{ marginRight: 8 }} />
        <Text style={{ color: c.danger, fontSize: 18, fontWeight: '700', flex: 1 }}>
          {t.confirm_delete_all_title}
        </Text>
      </View>

      <Text style={{ color: c.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 16 }}>
        {t.confirm_delete_all_message.replace('{n}', String(cardCount))}
      </Text>

      {deleting ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 14,
            marginBottom: 8,
            gap: 10,
          }}
        >
          <ActivityIndicator size="small" color={c.danger} />
          <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>
            {t.delete_all_busy}
          </Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 4 }}>
        <TouchableOpacity
          onPress={handleClose}
          disabled={deleting}
          accessibilityRole="button"
          accessibilityLabel={t.cancel_button}
          accessibilityState={{ disabled: deleting }}
          style={{ paddingVertical: 10, paddingHorizontal: 16, opacity: deleting ? 0.4 : 1 }}
        >
          <Text style={{ color: c.textMuted, fontWeight: '700' }}>{t.cancel_button}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleConfirm}
          disabled={deleting}
          accessibilityRole="button"
          accessibilityLabel={t.delete_all_btn}
          accessibilityState={{ disabled: deleting }}
          style={{
            backgroundColor: c.danger,
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderRadius: 8,
            minWidth: 120,
            alignItems: 'center',
            opacity: deleting ? 0.7 : 1,
          }}
        >
          {deleting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={{ color: '#FFF', fontWeight: '700' }}>{t.delete_all_btn}</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAwareBottomSheetModal>
  );
};
