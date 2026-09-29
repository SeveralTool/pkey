/**
 * @fileoverview Chooser when the PWA vault salt does not match this phone session.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSync } from '../../context/SyncContext';
import { useCoreState } from '../../context/CoreStateContext';
import { useSettings } from '../../context/SettingsContext';
import { KeyboardAwareBottomSheetModal } from '../common/KeyboardAwareBottomSheetModal';

export const VaultForkModal = () => {
  const { vaultForkPrompt, resolveVaultFork } = useSync();
  const { db } = useCoreState();
  const { c, t } = useSettings();
  const [busy, setBusy] = useState(false);

  const visible = !!vaultForkPrompt;
  const phoneCount = db.cards?.length ?? 0;
  const pwaCount = vaultForkPrompt?.pwaCardCount ?? 0;
  const encryptedOnly = vaultForkPrompt?.encryptedOnly === true;
  const message = encryptedOnly
    ? t.vault_fork_message_locked.replace('{phone}', String(phoneCount))
    : t.vault_fork_message.replace('{pwa}', String(pwaCount)).replace('{phone}', String(phoneCount));

  const run = (action: 'use_pwa' | 'use_phone' | 'defer') => {
    if (busy) return;
    setBusy(true);
    try {
      resolveVaultFork(action);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAwareBottomSheetModal
      visible={visible}
      onRequestClose={() => run('defer')}
      dismissOnBackdropPress={!busy}
      sheetStyle={{
        backgroundColor: c.cardBg,
        borderColor: c.warning,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Ionicons name="warning-outline" size={22} color={c.accent} style={{ marginRight: 8 }} />
        <Text style={{ color: c.text, fontSize: 18, fontWeight: '700', flex: 1 }}>
          {t.vault_fork_title}
        </Text>
      </View>

      <Text style={{ color: c.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 16 }}>
        {message}
      </Text>

      {busy ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 12,
            marginBottom: 8,
            gap: 10,
          }}
        >
          <ActivityIndicator size="small" color={c.accent} />
        </View>
      ) : null}

      <TouchableOpacity
        onPress={() => run('use_phone')}
        disabled={busy}
        style={{
          backgroundColor: c.accent,
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderRadius: 8,
          marginBottom: 8,
          opacity: busy ? 0.7 : 1,
        }}
      >
        <Text style={{ color: '#FFF', fontWeight: '700', textAlign: 'center' }}>
          {t.vault_fork_use_phone}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => run('use_pwa')}
        disabled={busy || encryptedOnly}
        style={{
          backgroundColor: c.danger,
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderRadius: 8,
          marginBottom: 8,
          opacity: busy || encryptedOnly ? 0.4 : 1,
        }}
      >
        <Text style={{ color: '#FFF', fontWeight: '700', textAlign: 'center' }}>
          {t.vault_fork_use_pwa}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => run('defer')}
        disabled={busy}
        style={{ paddingVertical: 10, paddingHorizontal: 16, opacity: busy ? 0.4 : 1 }}
      >
        <Text style={{ color: c.textMuted, fontWeight: '700', textAlign: 'center' }}>
          {t.vault_fork_defer}
        </Text>
      </TouchableOpacity>
    </KeyboardAwareBottomSheetModal>
  );
};
