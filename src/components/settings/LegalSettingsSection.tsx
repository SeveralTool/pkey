/**
 * Settings section: legal documents and app version.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useSettings } from '../../context/SettingsContext';
import { globalStyles as styles } from '../../styles/globalStyles';
import { SettingsSectionCard } from '../common';
import { LEGAL_DOCUMENT_IDS, type LegalDocumentId } from '../../constants/legalContent';
import { LegalDocumentModal } from './LegalDocumentModal';

const TITLE_KEYS: Record<LegalDocumentId, string> = {
  privacy: 'legal_privacy_title',
  terms: 'legal_terms_title',
  third_party: 'legal_third_party_title',
  official_app: 'legal_official_app_title',
  source_license: 'legal_source_title',
};

const SUBTITLE_KEYS: Partial<Record<LegalDocumentId, string>> = {
  privacy: 'legal_privacy_desc',
  terms: 'legal_terms_desc',
  third_party: 'legal_third_party_desc',
  official_app: 'legal_official_app_desc',
  source_license: 'legal_source_desc',
};

const ICONS: Record<LegalDocumentId, keyof typeof Ionicons.glyphMap> = {
  privacy: 'shield-checkmark-outline',
  terms: 'document-text-outline',
  third_party: 'code-slash-outline',
  official_app: 'checkmark-circle-outline',
  source_license: 'git-branch-outline',
};

export const LegalSettingsSection: React.FC = () => {
  const { c, t } = useSettings();
  const [activeDoc, setActiveDoc] = useState<LegalDocumentId | null>(null);

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <>
      <SettingsSectionCard icon="document-text-outline" title={t.legal_section_title}>
        <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted, marginBottom: 8 }]}>
          {t.legal_section_desc}
        </Text>

        {LEGAL_DOCUMENT_IDS.map((id) => {
          const titleKey = TITLE_KEYS[id];
          const subtitleKey = SUBTITLE_KEYS[id];
          return (
            <TouchableOpacity
              key={id}
              style={[styles.settingInterativeRowSelectorContainer, { borderBottomColor: c.border }]}
              onPress={() => setActiveDoc(id)}
              accessibilityRole="button"
              accessibilityLabel={String((t as Record<string, string>)[titleKey])}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}>
                <Ionicons name={ICONS[id]} size={22} color={c.accent} />
                <View style={styles.settingTextGroupingLeftColumn}>
                  <Text style={[styles.settingRowLabelBoldTitle, { color: c.text }]}>
                    {(t as Record<string, string>)[titleKey]}
                  </Text>
                  {subtitleKey ? (
                    <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted }]}>
                      {(t as Record<string, string>)[subtitleKey]}
                    </Text>
                  ) : null}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={c.textMuted} />
            </TouchableOpacity>
          );
        })}

        <View
          style={[
            styles.settingInterativeRowSelectorContainer,
            { borderBottomColor: c.border, marginTop: 8 },
          ]}
        >
          <Text style={[styles.settingRowLabelBoldTitle, { color: c.text }]}>
            {t.legal_app_version}
          </Text>
          <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted }]}>{appVersion}</Text>
        </View>
      </SettingsSectionCard>

      <LegalDocumentModal
        visible={activeDoc !== null}
        documentId={activeDoc}
        onClose={() => setActiveDoc(null)}
      />
    </>
  );
};
