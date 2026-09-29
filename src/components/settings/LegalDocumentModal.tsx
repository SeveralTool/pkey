/**
 * Full-screen modal for reading a legal document (canonical English body).
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
import Constants from 'expo-constants';
import { useSettings } from '../../context/SettingsContext';
import { useCoreState } from '../../context/CoreStateContext';
import { getLegalDocumentBody, type LegalDocumentId } from '../../constants/legalContent';
import { LEGAL_WEB_URLS } from '../../constants/legalContact';
import { openExternalLink } from '../../utils/openExternalLink';
import { resolveAppUiLanguage } from '../../utils/devicePreferences';

interface Props {
  visible: boolean;
  documentId: LegalDocumentId | null;
  onClose: () => void;
}

const TITLE_KEYS: Record<LegalDocumentId, string> = {
  privacy: 'legal_privacy_title',
  terms: 'legal_terms_title',
  third_party: 'legal_third_party_title',
  official_app: 'legal_official_app_title',
  source_license: 'legal_source_title',
};

const renderLegalBlocks = (body: string, color: string, muted: string) =>
  body.split('\n\n').map((block, index) => {
    const trimmed = block.trim();
    if (!trimmed) return null;
    const isHeading =
      trimmed === trimmed.toUpperCase() && trimmed.length < 80 && !trimmed.startsWith('•');
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

export const LegalDocumentModal: React.FC<Props> = ({ visible, documentId, onClose }) => {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { c, t } = useSettings();
  const { db } = useCoreState();

  if (!documentId) return null;

  const titleKey = TITLE_KEYS[documentId];
  const title = String((t as Record<string, string>)[titleKey] ?? documentId);
  const body = getLegalDocumentBody(documentId);
  const webUrl = LEGAL_WEB_URLS[documentId];
  const showEnglishNotice = resolveAppUiLanguage(db.settings.language) === 'ESP';

  const handleViewOnline = async () => {
    if (!webUrl) return;
    await openExternalLink(webUrl, { preferInAppBrowser: !!db.settings.openLinksInAppBrowser });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: c.bg, paddingTop: insets.top }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel={t.legal_close}
          >
            <Ionicons name="chevron-back" size={24} color={c.accent} />
            <Text style={[styles.backLabel, { color: c.accent }]}>{t.legal_close}</Text>
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
          <Text style={[styles.meta, { color: c.textMuted }]}>
            {t.legal_applies_to_version}: {Constants.expoConfig?.version ?? '—'}
          </Text>

          {showEnglishNotice ? (
            <View
              style={[styles.noticeBanner, { backgroundColor: c.cardBg, borderColor: c.border }]}
            >
              <Ionicons name="information-circle-outline" size={20} color={c.accent} />
              <Text style={[styles.noticeText, { color: c.textMuted }]}>
                {t.legal_english_notice}
              </Text>
            </View>
          ) : null}

          {webUrl ? (
            <TouchableOpacity
              style={[styles.webButton, { borderColor: c.accent }]}
              onPress={handleViewOnline}
            >
              <Ionicons name="open-outline" size={18} color={c.accent} />
              <Text style={[styles.webButtonText, { color: c.accent }]}>{t.legal_view_online}</Text>
            </TouchableOpacity>
          ) : null}

          {renderLegalBlocks(body, c.text, c.textMuted)}
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 88,
  },
  backLabel: { fontSize: 16, marginLeft: 2 },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  headerSpacer: { minWidth: 88 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16 },
  meta: { fontSize: 12, marginBottom: 12 },
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 19 },
  webButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
  },
  webButtonText: { fontSize: 14, fontWeight: '600' },
  paragraph: { fontSize: 14, lineHeight: 22, marginBottom: 12 },
  heading: { fontSize: 15, fontWeight: '700', marginTop: 4 },
});
