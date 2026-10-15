/**
 * @fileoverview Tab for adjusting global application configurations and parameters.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Switch, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCoreState } from '../context/CoreStateContext';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { useDatabase } from '../context/DatabaseContext';
import { globalStyles as styles } from '../styles/globalStyles';
import { ACCENT_SELECTED_ALPHA, withAlpha } from '../styles/colors';
import { estimateTabBarScrollPadding } from '../navigation/tabBarInset';
import { DashboardScrollView } from '../navigation/DashboardScrollView';
import { FrozenDashboardTab } from '../navigation/FrozenDashboardTab';
import { SettingsSectionCard } from '../components/common';
import { HelpInfoButton, HelpProcedureModal } from '../components/help';
import type { ProcedureId } from '../constants/procedures';
import { LegalSettingsSection } from '../components/settings/LegalSettingsSection';
import { BuildIntegritySection } from '../components/settings/BuildIntegritySection';
import { ListingDemoSection } from '../components/settings/ListingDemoSection';
import { AppearanceSettingsSection } from '../components/settings/AppearanceSettingsSection';
import type { AppSettings } from '../types';
import {
  GENERATOR_OPTION_KEYS,
  GEN_LENGTH_OPTIONS,
  GeneratorOptionKey,
  isLastActiveGeneratorOption,
} from '../utils/passwordGenerator';
type SegmentOption<T extends string> = { label: string; value: T };

/**
 * Full-label segment pills. The visible text is the accessible name.
 */
function SegmentPills<T extends string>({
  options,
  selected,
  onSelect,
  accent,
  border,
  muted,
}: {
  options: readonly SegmentOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
  accent: string;
  border: string;
  muted: string;
}): React.JSX.Element {
  return (
    <View style={[styles.horizontalPillsSegmentControls, styles.segmentPillsWrap]}>
      {options.map((option) => {
        const isSelected = selected === option.value;
        return (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.segmentButtonOption,
              {
                borderColor: isSelected ? accent : border,
                backgroundColor: isSelected
                  ? withAlpha(accent, ACCENT_SELECTED_ALPHA)
                  : 'transparent',
              },
            ]}
            onPress={() => onSelect(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={option.label}
          >
            <Text
              style={[
                styles.segmentOptionTextLabel,
                { color: isSelected ? accent : muted, fontSize: 10 },
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/**
 * Renders interactive UI controls mapped directly to the `db.settings` configuration.
 * Triggers `handleToggleSettingsOption` to immediately persist preferences.
 *
 * @returns {JSX.Element} The Settings Tab component.
 */
function SettingsTabContent(): React.JSX.Element {
  const { db } = useCoreState();
  const { c, t, handleToggleSettingsOption } = useSettings();
  const insets = useSafeAreaInsets();
  const { handleLogout } = useAuth();
  const { toast, alert } = useNotifications();
  const { handleCheckAllPasswords, handleStopHibpChecks, hibpPendingIds, hibpRunProgress } =
    useDatabase();
  const [helpProcedureId, setHelpProcedureId] = useState<ProcedureId | null>(null);

  // The locale dictionary widens option values to `string`; narrow them to the setting unions.
  const autoLogoutOptions = (t.settings_buttons_options.auto_logout || []) as readonly {
    label: string;
    value: AppSettings['autoLogout'];
  }[];
  const foregroundIdleLockOptions = (t.settings_buttons_options.foreground_idle_lock ||
    []) as readonly {
    label: string;
    value: NonNullable<AppSettings['foregroundIdleLock']>;
  }[];
  const webAutoLogoutOptions = (t.settings_buttons_options.web_auto_logout || []) as readonly {
    label: string;
    value: NonNullable<AppSettings['webAutoLogout']>;
  }[];

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
    <DashboardScrollView
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
        <View style={[settingRowStyle, styles.settingSegmentStack]}>
          <View style={styles.settingSegmentCopy}>
            <Text style={[styles.settingRowLabelBoldTitle, { color: c.text }]}>
              {t.auto_logout}
            </Text>
            <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted }]}>
              {t.auto_logout_desc}
            </Text>
          </View>
          <SegmentPills
            options={autoLogoutOptions}
            selected={db.settings.autoLogout}
            onSelect={(value) => handleToggleSettingsOption('autoLogout', value)}
            accent={c.accent}
            border={c.border}
            muted={c.textMuted}
          />
        </View>

        <View style={[settingRowStyle, styles.settingSegmentStack]}>
          <View style={styles.settingSegmentCopy}>
            <Text style={[styles.settingRowLabelBoldTitle, { color: c.text }]}>
              {t.foreground_idle_lock}
            </Text>
            <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted }]}>
              {t.foreground_idle_lock_desc}
            </Text>
          </View>
          <SegmentPills
            options={foregroundIdleLockOptions}
            selected={db.settings.foregroundIdleLock ?? 'NEVER'}
            onSelect={(value) => handleToggleSettingsOption('foregroundIdleLock', value)}
            accent={c.accent}
            border={c.border}
            muted={c.textMuted}
          />
        </View>

        <View style={[settingRowStyle, styles.settingSegmentStack]}>
          <View style={styles.settingSegmentCopy}>
            <Text style={[styles.settingRowLabelBoldTitle, { color: c.text }]}>
              {t.web_auto_logout}
            </Text>
            <Text style={[styles.settingRowMutedSubTextDesc, { color: c.textMuted }]}>
              {t.web_auto_logout_desc}
            </Text>
          </View>
          <SegmentPills
            options={webAutoLogoutOptions}
            selected={db.settings.webAutoLogout ?? '15M'}
            onSelect={(value) => handleToggleSettingsOption('webAutoLogout', value)}
            accent={c.accent}
            border={c.border}
            muted={c.textMuted}
          />
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
                    accessibilityState={{ disabled: hibpPendingIds.length > 0 }}
                    accessibilityLabel={
                      hibpPendingIds.length > 0 ? t.hibp_check_now_label : t.hibp_check_all_label
                    }
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
                    <Text style={[styles.secGhostOutlineText, { color: c.accent, fontSize: 13 }]}>
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
                      db.settings.genLength === len
                        ? withAlpha(c.accent, ACCENT_SELECTED_ALPHA)
                        : 'transparent',
                    minWidth: 32,
                  },
                ]}
                onPress={() => handleToggleSettingsOption('genLength', len)}
                accessibilityRole="button"
                accessibilityState={{ selected: db.settings.genLength === len }}
                accessibilityLabel={String(len)}
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

      <ListingDemoSection />

      <BuildIntegritySection />

      <LegalSettingsSection />

      {/* LOCKOUT AND DISMISS CORE */}
      <TouchableOpacity
        style={[styles.primaryActActionButton, { backgroundColor: c.danger, marginTop: 24 }]}
        onPress={handleLogout}
        accessibilityRole="button"
        accessibilityLabel={t.logout_btn}
      >
        <Ionicons name="power" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
        <Text style={styles.primaryActActionText}>{t.logout_btn}</Text>
      </TouchableOpacity>
    </DashboardScrollView>
  );
}

/** Settings tab. React renders suspend while another dashboard tab is focused. */
export function SettingsTab(): React.JSX.Element {
  return (
    <FrozenDashboardTab>
      <SettingsTabContent />
    </FrozenDashboardTab>
  );
}
