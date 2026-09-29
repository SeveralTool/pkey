/**
 * Settings section that exposes the current build's integrity metadata so
 * users can independently verify the installed binary against the signed
 * release published on GitHub. Addresses audit findings A7 (no visible
 * commit / signature) and B3 (transparency should extend beyond copy).
 *
 * The commit hash + build timestamp are stamped into `app.json` by
 * `scripts/stampBuildIntegrity.ts` before every EAS build. Dev builds show
 * an "unknown" placeholder and a warning banner.
 */
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '../../context/SettingsContext';
import { globalStyles as styles } from '../../styles/globalStyles';
import { SettingsSectionCard } from '../common';
import { OFFICIAL_REPO_RELEASES_URL } from '../../constants/legalContact';
import { getBuildIntegrityInfo } from '../../services/buildIntegrity';

export const BuildIntegritySection: React.FC = () => {
  const { c, t } = useSettings();
  const info = useMemo(() => getBuildIntegrityInfo(), []);

  const isDev = info.channel === 'development';
  const commitDisplay = info.commitShort ?? String(t.integrity_commit_unknown);
  const buildDisplay = info.buildNumber ?? '—';

  const onOpenReleases = async () => {
    try {
      await Linking.openURL(OFFICIAL_REPO_RELEASES_URL);
    } catch {
      // Deliberate: user has no browser configured. No point exposing a
      // stack trace to a novice user; the deep link failure is inert.
    }
  };

  return (
    <SettingsSectionCard icon="shield-checkmark-outline" title={String(t.integrity_section_title)}>
      <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted, marginBottom: 12 }]}>
        {String(t.integrity_section_desc)}
      </Text>

      {isDev ? (
        <View
          style={{
            backgroundColor: `${c.warning}22`,
            borderColor: c.warning,
            borderWidth: 1,
            borderRadius: 8,
            padding: 10,
            marginBottom: 12,
            flexDirection: 'row',
            gap: 8,
          }}
          accessibilityRole="alert"
        >
          <Ionicons name="warning-outline" size={18} color={c.warning} />
          <Text style={{ color: c.text, flex: 1, fontSize: 12 }}>
            {String(t.integrity_dev_warning)}
          </Text>
        </View>
      ) : null}

      <Row label={String(t.integrity_version_label)} value={info.version} c={c} />
      <Row label={String(t.integrity_build_label)} value={buildDisplay} c={c} />
      <Row
        label={String(t.integrity_channel_label)}
        value={isDev ? String(t.integrity_channel_dev) : String(t.integrity_channel_prod)}
        c={c}
      />
      <Row label={String(t.integrity_commit_label)} value={commitDisplay} c={c} monospace />
      <Row
        label={String(t.integrity_signature_label)}
        value={String(t.integrity_signature_unknown)}
        c={c}
        monospace
      />

      <TouchableOpacity
        onPress={onOpenReleases}
        accessibilityRole="link"
        accessibilityLabel={String(t.integrity_view_releases)}
        style={[styles.secGhostOutlineButton, { borderColor: c.border, marginTop: 10 }]}
      >
        <Ionicons name="open-outline" size={16} color={c.accent} style={{ marginRight: 8 }} />
        <Text style={[styles.secGhostOutlineText, { color: c.accent }]}>
          {String(t.integrity_view_releases)}
        </Text>
      </TouchableOpacity>
    </SettingsSectionCard>
  );
};

interface RowProps {
  label: string;
  value: string;
  c: Record<string, string>;
  monospace?: boolean;
}

const Row: React.FC<RowProps> = ({ label, value, c, monospace }) => (
  <View
    style={{
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    }}
  >
    <Text style={{ color: c.textMuted, fontSize: 13 }}>{label}</Text>
    <Text
      style={{
        color: c.text,
        fontSize: 13,
        fontWeight: '500',
        maxWidth: '65%',
        textAlign: 'right',
        ...(monospace ? { fontFamily: 'Menlo' } : {}),
      }}
      numberOfLines={1}
    >
      {value}
    </Text>
  </View>
);
