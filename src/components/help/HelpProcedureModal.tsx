/**
 * @fileoverview Full-screen reader for bilingual user help procedures.
 */
import React from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../../context/SettingsContext';
import { useCoreState } from '../../context/CoreStateContext';
import { getProcedure, type ProcedureId } from '../../constants/procedures';
import { resolveAppUiLanguage } from '../../utils/devicePreferences';

export interface HelpProcedureModalProps {
  procedureId: ProcedureId | null;
  onClose: () => void;
}

const renderBlocks = (body: string, color: string, muted: string) =>
  body.split('\n\n').map((block, index) => {
    const trimmed = block.trim();
    if (!trimmed) return null;
    const firstLine = trimmed.split('\n')[0] ?? '';
    const isHeading =
      firstLine === firstLine.toUpperCase() &&
      firstLine.length < 80 &&
      !firstLine.startsWith('•') &&
      !/^\d+\./.test(firstLine);
    return (
      <Text
        key={`${index}-${trimmed.slice(0, 24)}`}
        style={[
          styles.paragraph,
          { color: isHeading ? color : muted },
          isHeading && styles.heading,
        ]}
      >
        {trimmed}
      </Text>
    );
  });

export const HelpProcedureModal: React.FC<HelpProcedureModalProps> = ({
  procedureId,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { c, t } = useSettings();
  const { db } = useCoreState();

  if (!procedureId) return null;

  const lang = resolveAppUiLanguage(db.settings?.language);
  const { title, body } = getProcedure(procedureId, lang);

  return (
    <Modal visible={!!procedureId} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: c.bg, paddingTop: insets.top }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel={t.help_close}
          >
            <Ionicons name="chevron-back" size={24} color={c.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: c.text }]} numberOfLines={2}>
            {title}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 24, minHeight: height * 0.5 },
          ]}
          showsVerticalScrollIndicator
        >
          {renderBlocks(body, c.text, c.textMuted)}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 40,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  headerSpacer: { minWidth: 40 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16 },
  paragraph: { fontSize: 14, lineHeight: 22, marginBottom: 12 },
  heading: { fontSize: 15, fontWeight: '700', marginTop: 4 },
});
