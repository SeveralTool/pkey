/**
 * @fileoverview Tab for adjusting global application configurations and parameters.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCoreState } from '../context/CoreStateContext';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { useDatabase } from '../context/DatabaseContext';
import { globalStyles as styles } from '../styles/globalStyles';
import { estimateTabBarScrollPadding } from '../navigation/tabBarInset';
import { SettingsSectionCard } from '../components/common';
import { HelpInfoButton, HelpProcedureModal } from '../components/help';
import type { ProcedureId } from '../constants/procedures';
import { LegalSettingsSection } from '../components/settings/LegalSettingsSection';
import { BuildIntegritySection } from '../components/settings/BuildIntegritySection';
import { AppearanceSettingsSection } from '../components/settings/AppearanceSettingsSection';
import type { AppSettings } from '../types';
import {
  GENERATOR_OPTION_KEYS,
  GEN_LENGTH_OPTIONS,
  GeneratorOptionKey,
  isLastActiveGeneratorOption,
} from '../utils/passwordGenerator';
/**
 * Truncates a string to `maxLength` characters and appends an ellipsis.
 *
 * @param text - Source string
 * @param maxLength - Maximum length before truncation (default 5)
 * @returns Truncated string or the original when short enough
 */
const truncateText = (text: string, maxLength: number = 5): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '…';
};

/**
 * Renders interactive UI controls mapped directly to the `db.settings` configuration.
 * Triggers `handleToggleSettingsOption` to immediately persist preferences.
 *
 * @returns {JSX.Element} The Settings Tab component.
 */
export const SettingsTab = () => {
  const { db } = useCoreState();
  const { c, t, handleToggleSettingsOption } = useSettings();
  const insets = useSafeAreaInsets();
  const { handleLogout } = useAuth();
  const { toast, alert } = useNotifications();
  const { handleCheckAllPasswords, handleStopHibpChecks, hibpPendingIds, hibpRunProgress } =
    useDatabase();
  const [helpProcedureId, setHelpProcedureId] = useState<ProcedureId | null>(null);

  const handleHibpToggle = (val: boolean) => {
    if (!val) {
      handleToggleSettingsOption('enableHibpCheck', false);
      return;
    }
    alert({
      title: t.hibp_enable_prompt_title,
      message: t.hibp_enable_prompt_desc,
      variant: 'warning',
      actions: [
        { text: t.cancel_button, style: 'cancel' },
        {
          text: t.hibp_enable_only_label,
          onPress: () => handleToggleSettingsOption('enableHibpCheck', true),
        },
        {
          text: t.hibp_enable_and_check_label,
          onPress: () => {
            handleToggleSettingsOption('enableHibpCheck', true);
            handleCheckAllPasswords();
          },
        },
      ],
    });
  };

  const generatorOptionLabels: Record<GeneratorOptionKey, string> = {
    genSymbols: t.gen_symbols,
    genNumbers: t.gen_numbers,
    genUppercase: t.gen_uppercase,
    genLowercase: t.gen_lowercase,
  };

  const showGeneratorOptionRequiredAlert = () => {
    toast({
      title: t.gen_option_required_title,
      message: t.gen_option_required_desc,
      variant: 'warning',
      duration: 6000,
    });
  };

  const settingRowStyle = [
    styles.settingInterativeRowSelectorContainer,
    { borderBottomColor: c.border },
  ];

  const renderGeneratorOptionRow = (key: GeneratorOptionKey) => {
    const isLocked = isLastActiveGeneratorOption(db.settings, key);
    const RowContainer = isLocked ? TouchableOpacity : View;

    return (
      <RowContainer
        key={key}
        style={settingRowStyle}
        {...(isLocked ? { activeOpacity: 0.7, onPress: showGeneratorOptionRequiredAlert } : {})}
      >
        <Text
          style={[styles.settingRowLabelBoldTitle, { color: c.text, opacity: isLocked ? 0.6 : 1 }]}
        >
          {generatorOptionLabels[key]}
        </Text>
        <Switch
          value={db.settings[key]}
          disabled={isLocked}
          onValueChange={(v) => handleToggleSettingsOption(key, v)}
          trackColor={{ false: '#767577', true: c.success }}
          thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : '#F4F3F4'}
        />
      </RowContainer>
    );
  };

  return (
    <ScrollView
      contentContainerStyle={[
        styles.statsPanelContainerScrollBody,
        { paddingBottom: estimateTabBarScrollPadding(insets.bottom) },
      ]}
    >
      <HelpProcedureModal procedureId={helpProcedureId} onClose={() => setHelpProcedureId(null)} />
      {/* GENERAL PARAMS SECTION */}
      <SettingsSectionCard
        icon="options-outline"
        title={t.control_access_security}
        first
        headerRight={<HelpInfoButton onPress={() => setHelpProcedureId('session_lock')} />}
      >
        <View style={settingRowStyle}>
          <View style={styles.settingTextGroupingLeftColumn}>
            <Text style={[styles.settingRowLabelBoldTitle, { color: c.text }]}>
              {t.auto_logout}
            </Text>
            <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted }]}>
              {t.auto_logout_desc}
            </Text>
          </View>
          <View style={styles.horizontalPillsSegmentControls}>
            {(t.settings_buttons_options.auto_logout || []).map(
              (option: { label: string; value: AppSettings['autoLogout'] }, idx: number) => (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.segmentButtonOption,
                    {
                      borderColor: db.settings.autoLogout === option.value ? c.accent : c.border,
                      backgroundColor:
                        db.settings.autoLogout === option.value
                          ? 'rgba(59, 130, 246, 0.1)'
                          : 'transparent',
                    },
                  ]}
                  onPress={() => handleToggleSettingsOption('autoLogout', option.value)}
                >
                  <Text
                    style={[
                      styles.segmentOptionTextLabel,
                      {
                        color: db.settings.autoLogout === option.value ? c.accent : c.textMuted,
                        fontSize: 10,
                      },
                    ]}
                  >
                    {truncateText(option.label, 10)}
                  </Text>
                </TouchableOpacity>
              )
            )}
          </View>
        </View>

        <View style={settingRowStyle}>
          <View style={styles.settingTextGroupingLeftColumn}>
            <Text style={[styles.settingRowLabelBoldTitle, { color: c.text }]}>
              {t.foreground_idle_lock}
            </Text>
            <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted }]}>
              {t.foreground_idle_lock_desc}
            </Text>
          </View>
          <View style={styles.horizontalPillsSegmentControls}>
            {(t.settings_buttons_options.foreground_idle_lock || []).map(
              (
                option: { label: string; value: NonNullable<AppSettings['foregroundIdleLock']> },
                idx: number
              ) => (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.segmentButtonOption,
                    {
                      borderColor:
                        (db.settings.foregroundIdleLock ?? 'NEVER') === option.value
                          ? c.accent
                          : c.border,
                      backgroundColor:
                        (db.settings.foregroundIdleLock ?? 'NEVER') === option.value
                          ? 'rgba(59, 130, 246, 0.1)'
                          : 'transparent',
                    },
                  ]}
                  onPress={() => handleToggleSettingsOption('foregroundIdleLock', option.value)}
                >
                  <Text
                    style={[
                      styles.segmentOptionTextLabel,
                      {
                        color:
                          (db.settings.foregroundIdleLock ?? 'NEVER') === option.value
                            ? c.accent
                            : c.textMuted,
                        fontSize: 10,
                      },
                    ]}
                  >
                    {truncateText(option.label, 10)}
                  </Text>
                </TouchableOpacity>
              )
            )}
          </View>
        </View>

        <View style={settingRowStyle}>
          <View style={styles.settingTextGroupingLeftColumn}>
            <Text style={[styles.settingRowLabelBoldTitle, { color: c.text }]}>
              {t.web_auto_logout}
            </Text>
            <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted }]}>
              {t.web_auto_logout_desc}
            </Text>
          </View>
          <View style={styles.horizontalPillsSegmentControls}>
            {(t.settings_buttons_options.web_auto_logout || []).map(
              (
                option: { label: string; value: NonNullable<AppSettings['webAutoLogout']> },
                idx: number
              ) => (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.segmentButtonOption,
                    {
                      borderColor:
                        (db.settings.webAutoLogout ?? '15M') === option.value ? c.accent : c.border,
                      backgroundColor:
                        (db.settings.webAutoLogout ?? '15M') === option.value
                          ? 'rgba(59, 130, 246, 0.1)'
                          : 'transparent',
                    },
                  ]}
                  onPress={() => handleToggleSettingsOption('webAutoLogout', option.value)}
                >
                  <Text
                    style={[
                      styles.segmentOptionTextLabel,
                      {
                        color:
                          (db.settings.webAutoLogout ?? '15M') === option.value
                            ? c.accent
                            : c.textMuted,
                        fontSize: 10,
                      },
                    ]}
                  >
                    {truncateText(option.label, 10)}
                  </Text>
                </TouchableOpacity>
              )
            )}
          </View>
        </View>

        <View style={settingRowStyle}>
          <View style={styles.settingTextGroupingLeftColumn}>
            <Text style={[styles.settingRowLabelBoldTitle, { color: c.text }]}>
              {t.settings_buttons_options.screenshots.screenshots_title}
            </Text>
            <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted }]}>
              {t.settings_buttons_options.screenshots.screenshots_description}
            </Text>
          </View>
          <Switch
            value={db.settings.allowScreenshots}
            onValueChange={(val) => handleToggleSettingsOption('allowScreenshots', val)}
            trackColor={{ false: '#767577', true: c.success }}
            thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : '#F4F3F4'}
          />
        </View>
      </SettingsSectionCard>

      <AppearanceSettingsSection />

      <SettingsSectionCard icon="options-outline" title={t.preferences_section_title}>
        <View style={settingRowStyle}>
          <View style={styles.settingTextGroupingLeftColumn}>
            <Text style={[styles.settingRowLabelBoldTitle, { color: c.text }]}>
              {t.auto_collapse_title}
            </Text>
            <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted }]}>
              {t.auto_collapse_desc}
            </Text>
          </View>
          <Switch
            value={db.settings.autoCollapse}
            onValueChange={(val) => handleToggleSettingsOption('autoCollapse', val)}
            trackColor={{ false: '#767577', true: c.success }}
            thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : '#F4F3F4'}
          />
        </View>

        <View style={settingRowStyle}>
          <View style={styles.settingTextGroupingLeftColumn}>
            <Text style={[styles.settingRowLabelBoldTitle, { color: c.text }]}>
              {t.group_by_link_title}
            </Text>
            <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted }]}>
              {t.group_by_link_desc}
            </Text>
          </View>
          <Switch
            value={!!db.settings.groupCardsByLink}
            onValueChange={(val) => handleToggleSettingsOption('groupCardsByLink', val)}
            trackColor={{ false: '#767577', true: c.success }}
            thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : '#F4F3F4'}
          />
        </View>

        <View style={settingRowStyle}>
          <View style={styles.settingTextGroupingLeftColumn}>
            <Text style={[styles.settingRowLabelBoldTitle, { color: c.text }]}>
              {t.reveal_copy_password_title}
            </Text>
            <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted }]}>
              {t.reveal_copy_password_desc}
            </Text>
          </View>
          <Switch
            value={db.settings.revealPasswordOnCopy ?? true}
            onValueChange={(val) => handleToggleSettingsOption('revealPasswordOnCopy', val)}
            trackColor={{ false: '#767577', true: c.success }}
            thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : '#F4F3F4'}
          />
        </View>

        <View style={settingRowStyle}>
          <View style={styles.settingTextGroupingLeftColumn}>
            <Text style={[styles.settingRowLabelBoldTitle, { color: c.text }]}>
              {t.open_links_in_app_title}
            </Text>
            <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted }]}>
              {t.open_links_in_app_desc}
            </Text>
          </View>
          <Switch
            value={!!db.settings.openLinksInAppBrowser}
            onValueChange={(val) => handleToggleSettingsOption('openLinksInAppBrowser', val)}
            trackColor={{ false: '#767577', true: c.success }}
            thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : '#F4F3F4'}
          />
        </View>

        <View style={settingRowStyle}>
          <View style={styles.settingTextGroupingLeftColumn}>
            <Text style={[styles.settingRowLabelBoldTitle, { color: c.text }]}>
              {t.strict_offline}
            </Text>
            <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted }]}>
              {t.strict_offline_desc}
            </Text>
          </View>
          <Switch
            value={db.settings.strictOffline === true}
            onValueChange={(val) => handleToggleSettingsOption('strictOffline', val)}
            trackColor={{ false: '#767577', true: c.success }}
            thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : '#F4F3F4'}
          />
        </View>

        {!db.settings.strictOffline && (
          <>
            <View style={settingRowStyle}>
              <View style={styles.settingTextGroupingLeftColumn}>
                <Text style={[styles.settingRowLabelBoldTitle, { color: c.text }]}>
                  {t.enable_favicon_lookup_title}
                </Text>
                <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted }]}>
                  {t.enable_favicon_lookup_desc}
                </Text>
              </View>
              <Switch
                value={!!db.settings.enableFaviconLookup}
                onValueChange={(val) => handleToggleSettingsOption('enableFaviconLookup', val)}
                trackColor={{ false: '#767577', true: c.success }}
                thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : '#F4F3F4'}
              />
            </View>

            <View style={settingRowStyle}>
              <View style={styles.settingTextGroupingLeftColumn}>
                <Text style={[styles.settingRowLabelBoldTitle, { color: c.text }]}>
                  {t.enable_hibp_check_title}
                </Text>
                <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted }]}>
                  {t.enable_hibp_check_desc}
                </Text>
              </View>
              <Switch
                value={!!db.settings.enableHibpCheck}
                onValueChange={handleHibpToggle}
                trackColor={{ false: '#767577', true: c.success }}
                thumbColor={Platform.OS === 'ios' ? '#FFFFFF' : '#F4F3F4'}
              />
            </View>
            {!!db.settings.enableHibpCheck && (
              <View style={{ marginTop: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <TouchableOpacity
                    style={[
                      styles.secGhostOutlineButton,
                      { borderColor: c.border, flex: 1, marginTop: 0 },
                    ]}
                    onPress={handleCheckAllPasswords}
                    disabled={hibpPendingIds.length > 0}
                    accessibilityRole="button"
                    accessibilityLabel={t.hibp_check_all_label}
                  >
                    {hibpPendingIds.length > 0 ? (
                      <ActivityIndicator size="small" color={c.accent} style={{ marginRight: 8 }} />
                    ) : (
                      <Ionicons
                        name="shield-checkmark-outline"
                        size={16}
                        color={c.accent}
                        style={{ marginRight: 8 }}
                      />
                    )}
                    <Text
                      style={[styles.secGhostOutlineText, { color: c.accent, fontSize: 13 }]}
                      numberOfLines={1}
                    >
                      {hibpPendingIds.length > 0 ? t.hibp_check_now_label : t.hibp_check_all_label}
                    </Text>
                  </TouchableOpacity>
                  {hibpRunProgress?.active ? (
                    <TouchableOpacity
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 10,
                        backgroundColor: c.danger,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      onPress={handleStopHibpChecks}
                      accessibilityRole="button"
                      accessibilityLabel={t.hibp_stop_label}
                    >
                      <Ionicons name="stop-circle" size={22} color="#FFFFFF" />
                    </TouchableOpacity>
                  ) : null}
                </View>
                {hibpRunProgress?.active ? (
                  <Text
                    style={[
                      styles.settingRowMutedSubTextDesc,
                      { color: c.textMuted, marginTop: 8 },
                    ]}
                  >
                    {t.hibp_check_progress
                      .replace('{current}', String(hibpRunProgress.done))
                      .replace('{total}', String(hibpRunProgress.total))}
                  </Text>
                ) : null}
              </View>
            )}
          </>
        )}
      </SettingsSectionCard>

      <SettingsSectionCard icon="key-outline" title={t.generator_config}>
        <View style={settingRowStyle}>
          <View style={styles.settingTextGroupingLeftColumn}>
            <Text style={[styles.settingRowLabelBoldTitle, { color: c.text }]}>
              {t.gen_length_label}
            </Text>
            <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted }]}>
              {t.gen_length_min_hint}
            </Text>
          </View>
          <View style={styles.horizontalPillsSegmentControls}>
            {GEN_LENGTH_OPTIONS.map((len) => (
              <TouchableOpacity
                key={len}
                style={[
                  styles.segmentButtonOption,
                  {
                    borderColor: db.settings.genLength === len ? c.accent : c.border,
                    backgroundColor:
                      db.settings.genLength === len ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    minWidth: 32,
                  },
                ]}
                onPress={() => handleToggleSettingsOption('genLength', len)}
              >
                <Text
                  style={[
                    styles.segmentOptionTextLabel,
                    { color: db.settings.genLength === len ? c.accent : c.textMuted, fontSize: 10 },
                  ]}
                >
                  {len}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        {GENERATOR_OPTION_KEYS.map(renderGeneratorOptionRow)}
        <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted, marginTop: 4 }]}>
          {t.gen_min_one_type_hint}
        </Text>
      </SettingsSectionCard>

      <BuildIntegritySection />

      <LegalSettingsSection />

      {/* LOCKOUT AND DISMISS CORE */}
      <TouchableOpacity
        style={[styles.primaryActActionButton, { backgroundColor: c.danger, marginTop: 24 }]}
        onPress={handleLogout}
      >
        <Ionicons name="power" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
        <Text style={styles.primaryActActionText}>{t.logout_btn}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};
