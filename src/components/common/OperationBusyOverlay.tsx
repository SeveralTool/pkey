/**
 * @fileoverview Full-screen blocking overlay for long import / file operations.
 */
import React from 'react';
import { View, Text, Modal, ActivityIndicator } from 'react-native';
import { useCoreState } from '../../context/CoreStateContext';
import { useSettings } from '../../context/SettingsContext';

export const OperationBusyOverlay = () => {
  const { operationBusy } = useCoreState();
  const { c } = useSettings();

  if (!operationBusy) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.55)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 32,
        }}
      >
        <View
          style={{
            backgroundColor: c.cardBg,
            borderRadius: 16,
            padding: 24,
            minWidth: 220,
            maxWidth: 320,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: c.border,
          }}
        >
          <ActivityIndicator size="large" color={c.accent} />
          <Text
            style={{
              color: c.text,
              fontSize: 15,
              fontWeight: '600',
              marginTop: 16,
              textAlign: 'center',
              lineHeight: 22,
            }}
          >
            {operationBusy}
          </Text>
        </View>
      </View>
    </Modal>
  );
};
