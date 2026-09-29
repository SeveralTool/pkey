/**
 * @fileoverview Tab for displaying security metrics and session analytics.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatVaultSessionRef } from '@pkey/core';
import { useCoreState, type CardsListFilterKind } from '../context/CoreStateContext';
import { useUI, useUISearch } from '../context/UIContext';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { useSync } from '../context/SyncContext';
import { useStatistics } from '../hooks/useStatistics';
import { peekUnlockBundle } from '../services/biometrics';
import {
  getStatsSnapshots,
  maybeRecordStatsSnapshot,
  type StatsSnapshot,
} from '../services/statsSnapshots';
import type { UnlockEvent, UnlockMethod } from '../services/unlockHistory';
import { globalStyles as styles } from '../styles/globalStyles';
import { estimateTabBarScrollPadding } from '../navigation/tabBarInset';
import { HelpInfoButton, HelpProcedureModal } from '../components/help';
import { SettingsSectionCard } from '../components/common';
import type { ProcedureId } from '../constants/procedures';

function daysSince(iso: string, now = Date.now()): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / (24 * 60 * 60 * 1000)));
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

type MetricBoxProps = {
  value: string | number;
  label: string;
  color?: string;
  onPress?: () => void;
  fullWidth?: boolean;
};

function MetricBox({ value, label, color, onPress, fullWidth }: MetricBoxProps) {
  const { c } = useSettings();
  const fill = fullWidth ? '100%' : '46%';
  const valueNode = (
    <Text
      style={[
        styles.metricHighlightOutputMainValue,
        { color: color ?? c.text, padding: 0, margin: 0 },
      ]}
    >
      {value}
    </Text>
  );

  if (!onPress) {
    return (
      <View
        style={[
          styles.singleMetricOutputBox,
          {
            borderColor: c.border,
            width: 'auto',
            flexGrow: 1,
            flexBasis: fill,
            marginBottom: 0,
          },
        ]}
      >
        {valueNode}
        <Text style={[styles.metricLabelMutedDesc, { color: c.textMuted }]}>{label}</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{ flexGrow: 1, flexBasis: fill }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View
        style={[
          styles.singleMetricOutputBox,
          { borderColor: c.border, width: '100%', marginBottom: 0 },
        ]}
      >
        {valueNode}
        <Text style={[styles.metricLabelMutedDesc, { color: c.textMuted }]}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

type MetaRowProps = {
  label: string;
  value: string;
  hint?: string;
  onPress?: () => void;
};

function MetaRow({ label, value, hint, onPress }: MetaRowProps) {
  const { c } = useSettings();
  const row = (
    <View
      style={[
        styles.spacedTextMetaRow,
        { borderBottomColor: c.border, flexDirection: 'column', alignItems: 'stretch' },
      ]}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[styles.metaStaticTxt, { color: c.textMuted, flex: 1, paddingRight: 8 }]}>
          {label}
        </Text>
        <Text
          style={[
            styles.metaDynamicTxt,
            { color: onPress ? c.accent : c.text, flexShrink: 1, textAlign: 'right' },
          ]}
          numberOfLines={2}
        >
          {value}
        </Text>
      </View>
      {hint ? <Text style={[styles.metaRowHintTxt, { color: c.textMuted }]}>{hint}</Text> : null}
    </View>
  );
  if (!onPress) return row;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {row}
    </TouchableOpacity>
  );
}

type StatsSectionProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  children: React.ReactNode;
  first?: boolean;
  procedureId?: ProcedureId;
  onOpenProcedure?: (id: ProcedureId) => void;
};

function StatsSection({
  icon,
  title,
  children,
  first,
  procedureId,
  onOpenProcedure,
}: StatsSectionProps) {
  return (
    <SettingsSectionCard
      icon={icon}
      title={title}
      first={first}
      headerRight={
        procedureId && onOpenProcedure ? (
          <HelpInfoButton onPress={() => onOpenProcedure(procedureId)} />
        ) : undefined
      }
    >
      {children}
    </SettingsSectionCard>
  );
}

/**
 * Renders statistical data like password strength, duplications, and local backup options.
 * Uses the `useStatistics` hook to generate metrics.
 *
 * @returns {JSX.Element} The Stats Tab component.
 */
export const StatsTab = () => {
  const { db, biometricsAvailable } = useCoreState();
  const { setCurrentTab, setExpandedCardId, setCardsFilter } = useUI();
  const { setSearchQuery } = useUISearch();
  const { c, t } = useSettings();
  const insets = useSafeAreaInsets();
  const { unlockedAt, unlockMethod, lastUnlock, unlockHistory } = useAuth();
  const { webServerEnabled, connectedWebClients } = useSync();
  const statistics = useStatistics(db.cards, db.tombstones);

  const [unlockBundleSaved, setUnlockBundleSaved] = useState<boolean | null>(null);
  const [snapshots, setSnapshots] = useState<StatsSnapshot[]>([]);
  const [helpProcedureId, setHelpProcedureId] = useState<ProcedureId | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const bundle = await peekUnlockBundle();
      if (!cancelled) setUnlockBundleSaved(!!bundle);
    })();
    return () => {
      cancelled = true;
    };
  }, [biometricsAvailable, unlockedAt]);

  useEffect(() => {
    if (!statistics.statsReady) return;
    let cancelled = false;
    void (async () => {
      const next = await maybeRecordStatsSnapshot({
        healthScore: statistics.healthScore,
        weakCount: statistics.weakCount,
        staleCount: statistics.staleCount,
        duplicatedCount: statistics.duplicatedCount,
      });
      if (!cancelled) setSnapshots(next.length ? next : await getStatsSnapshots());
    })();
    return () => {
      cancelled = true;
    };
  }, [
    statistics.statsReady,
    statistics.healthScore,
    statistics.weakCount,
    statistics.staleCount,
    statistics.duplicatedCount,
  ]);

  const sessionAgeDays = useMemo(() => daysSince(db.creation_date), [db.creation_date]);

  const autoLogoutLabel = useMemo(() => {
    const opts = t.settings_buttons_options?.auto_logout as
      { label: string; value: string }[] | undefined;
    const opt = opts?.find((o) => o.value === db.settings?.autoLogout);
    return opt?.label ?? db.settings?.autoLogout ?? '—';
  }, [db.settings?.autoLogout, t]);

  const authenticatedClients = useMemo(
    () => connectedWebClients.filter((client) => client.authenticated).length,
    [connectedWebClients]
  );

  const openFilter = useCallback(
    (kind: CardsListFilterKind, cardIds?: string[]) => {
      setSearchQuery('');
      setExpandedCardId(null);
      setCardsFilter({ kind, cardIds });
      setCurrentTab('cards');
    },
    [setCardsFilter, setCurrentTab, setExpandedCardId, setSearchQuery]
  );

  const openCard = useCallback(
    (cardId: string) => {
      setSearchQuery('');
      setCardsFilter(null);
      setExpandedCardId(cardId);
      setCurrentTab('cards');
    },
    [setCardsFilter, setCurrentTab, setExpandedCardId, setSearchQuery]
  );

  const methodLabel = (method: UnlockMethod | null | undefined) => {
    if (method === 'biometrics') return t.stat_unlock_method_biometrics;
    if (method === 'password') return t.stat_unlock_method_password;
    return '—';
  };

  const statsReady = statistics.statsReady;
  const metricValue = (value: number): string | number => (statsReady ? value : '—');
  const metricPress = (count: number, onPress: () => void) =>
    statsReady && count > 0 ? onPress : undefined;

  const healthColor = !statsReady
    ? c.textMuted
    : statistics.healthScore >= 80
      ? c.success
      : statistics.healthScore >= 50
        ? c.warning
        : c.danger;

  const formatUnlockLine = (event: UnlockEvent | null | undefined) => {
    if (!event) return '—';
    const status = event.ok ? t.stat_unlock_ok : t.stat_unlock_fail;
    return `${formatDateTime(event.at)} · ${methodLabel(event.method)} · ${status}`;
  };

  return (
    <ScrollView
      contentContainerStyle={[
        styles.statsPanelContainerScrollBody,
        { paddingBottom: estimateTabBarScrollPadding(insets.bottom) },
      ]}
    >
      <HelpProcedureModal procedureId={helpProcedureId} onClose={() => setHelpProcedureId(null)} />
      <StatsSection
        icon="pulse-outline"
        title={t.stats_health_hdr}
        first
        procedureId="vault_health"
        onOpenProcedure={setHelpProcedureId}
      >
        <View
          style={[styles.singleMetricOutputBox, { borderColor: c.border, width: '100%' }]}
          accessibilityLabel={statsReady ? undefined : t.stats_loading}
        >
          {statsReady ? (
            <Text style={[styles.metricHighlightOutputMainValue, { color: healthColor }]}>
              {statistics.healthScore}
            </Text>
          ) : (
            <ActivityIndicator size="small" color={c.accent} style={{ marginVertical: 8 }} />
          )}
          <Text style={[styles.metricLabelMutedDesc, { color: c.textMuted }]}>
            {t.stats_health_score}
          </Text>
        </View>
        <Text style={{ color: c.textMuted, fontSize: 11, marginTop: 8, lineHeight: 16 }}>
          {t.stats_health_hint}
        </Text>
        <Text style={{ color: c.textMuted, fontSize: 11, marginTop: 4, lineHeight: 16 }}>
          {t.stats_tap_hint}
        </Text>
      </StatsSection>

      <StatsSection icon="shield-half-outline" title={t.stats_security_hdr}>
        <View style={styles.statsMultiMetricsFlexRows}>
          <MetricBox
            value={metricValue(statistics.duplicatedCount)}
            label={t.stat_duplicated_pass}
            color={c.warning}
            onPress={metricPress(statistics.duplicatedCount, () =>
              openFilter('duplicates', statistics.duplicatedCardIds)
            )}
          />
          <MetricBox
            value={metricValue(statistics.weakCount)}
            label={t.stat_weak_pass}
            color={c.warning}
            onPress={metricPress(statistics.weakCount, () =>
              openFilter('weak', statistics.weakCardIds)
            )}
          />
          <MetricBox
            value={metricValue(statistics.staleCount)}
            label={t.stat_stale_pass}
            color={c.warning}
            onPress={metricPress(statistics.staleCount, () =>
              openFilter('stale', statistics.staleCardIds)
            )}
          />
          <MetricBox
            value={metricValue(statistics.hibpBreachedCount)}
            label={t.stat_hibp_breached}
            color={c.danger}
            onPress={metricPress(statistics.hibpBreachedCount, () =>
              openFilter('hibp_breached', statistics.hibpBreachedCardIds)
            )}
          />
          <MetricBox
            value={metricValue(statistics.hibpCheckedCount)}
            label={t.stat_hibp_checked}
            color={!statsReady || statistics.hibpCheckedCount === 0 ? c.text : c.success}
            onPress={metricPress(statistics.hibpCheckedCount, () =>
              openFilter('hibp_checked', statistics.hibpCheckedCardIds)
            )}
          />
        </View>
      </StatsSection>

      <StatsSection icon="key-outline" title={t.stats_coverage_hdr}>
        <View style={styles.statsMultiMetricsFlexRows}>
          <MetricBox
            value={metricValue(statistics.withOtpCount)}
            label={t.stat_otp_with}
            color={c.success}
          />
          <MetricBox
            value={metricValue(statistics.withoutOtpCount)}
            label={t.stat_otp_without}
            color={c.warning}
            onPress={metricPress(statistics.withoutOtpCount, () =>
              openFilter('no_otp', statistics.withoutOtpCardIds)
            )}
          />
          <MetricBox
            value={statsReady ? `${statistics.otpCoveragePercent}%` : '—'}
            label={t.stat_otp_coverage}
            color={c.accent}
          />
          <MetricBox
            value={metricValue(statistics.reusedUsernameCount)}
            label={t.stat_reused_username}
            color={c.warning}
            onPress={metricPress(statistics.reusedUsernameCount, () =>
              openFilter('reused_username', statistics.reusedUsernameCardIds)
            )}
          />
          <MetricBox
            value={metricValue(statistics.emptyUsernameCount)}
            label={t.stat_empty_username}
            color={c.warning}
            onPress={metricPress(statistics.emptyUsernameCount, () =>
              openFilter('empty_username', statistics.emptyUsernameCardIds)
            )}
          />
          <MetricBox
            value={metricValue(statistics.emptyPasswordCount)}
            label={t.stat_empty_password}
            color={c.danger}
            onPress={metricPress(statistics.emptyPasswordCount, () =>
              openFilter('empty_password', statistics.emptyPasswordCardIds)
            )}
          />
          <MetricBox
            value={metricValue(statistics.emptyLinkCount)}
            label={t.stat_empty_link}
            color={c.warning}
            onPress={metricPress(statistics.emptyLinkCount, () =>
              openFilter('empty_link', statistics.emptyLinkCardIds)
            )}
          />
          <MetricBox
            value={metricValue(statistics.untaggedCount)}
            label={t.stat_untagged}
            color={c.warning}
            onPress={metricPress(statistics.untaggedCount, () =>
              openFilter('untagged', statistics.untaggedCardIds)
            )}
          />
        </View>
      </StatsSection>

      <StatsSection icon="layers-outline" title={t.stats_content_hdr}>
        <View style={styles.statsMultiMetricsFlexRows}>
          <MetricBox
            value={metricValue(statistics.passwordCount)}
            label={t.stat_type_password}
            onPress={metricPress(statistics.passwordCount, () => openFilter('password'))}
          />
          <MetricBox
            value={metricValue(statistics.secretPhraseCount)}
            label={t.stat_type_secret}
            onPress={metricPress(statistics.secretPhraseCount, () => openFilter('secret_phrase'))}
          />
          <MetricBox
            value={metricValue(statistics.noteCount)}
            label={t.stat_type_note}
            onPress={metricPress(statistics.noteCount, () => openFilter('note'))}
          />
          <MetricBox value={metricValue(statistics.uniqueUsers)} label={t.stat_unique_users} />
          <MetricBox
            value={metricValue(statistics.totalCards)}
            label={t.stat_total_cards}
            color={c.accent}
            fullWidth
          />
        </View>
      </StatsSection>

      <StatsSection icon="time-outline" title={t.stats_activity_hdr}>
        <View style={[styles.textStackLoggerGroupLines, { marginTop: 0 }]}>
          <MetaRow
            label={t.stat_oldest_card}
            value={
              !statsReady
                ? '—'
                : statistics.oldestUpdated
                  ? `${statistics.oldestUpdated.title} · ${formatDate(statistics.oldestUpdated.last_update)}`
                  : '—'
            }
            onPress={
              statsReady && statistics.oldestUpdated
                ? () => openCard(statistics.oldestUpdated!.id)
                : undefined
            }
          />
          <MetaRow
            label={t.stat_newest_card}
            value={
              !statsReady
                ? '—'
                : statistics.newestUpdated
                  ? `${statistics.newestUpdated.title} · ${formatDate(statistics.newestUpdated.last_update)}`
                  : '—'
            }
            onPress={
              statsReady && statistics.newestUpdated
                ? () => openCard(statistics.newestUpdated!.id)
                : undefined
            }
          />
        </View>
      </StatsSection>

      <StatsSection icon="server-outline" title={t.session_details_hdr}>
        <View style={[styles.textStackLoggerGroupLines, { marginTop: 0 }]}>
          <MetaRow label={t.session_id} value={formatVaultSessionRef(db.sessionId || '') || '—'} />
          <MetaRow label={t.session_created} value={`${formatDateTime(db.creation_date)}`} />
          <MetaRow
            label={t.session_age}
            value={
              sessionAgeDays == null
                ? '—'
                : sessionAgeDays === 0
                  ? t.session_age_today
                  : t.session_age_days.replace('{n}', String(sessionAgeDays))
            }
          />
          <MetaRow
            label={t.session_modified}
            value={formatDate(db.last_update)}
            hint={t.session_modified_hint}
          />
          <MetaRow
            label={t.stat_current_unlock}
            value={
              unlockedAt ? `${formatDateTime(unlockedAt)} · ${methodLabel(unlockMethod)}` : '—'
            }
          />
          <MetaRow label={t.stat_last_unlock} value={formatUnlockLine(lastUnlock)} />
        </View>
      </StatsSection>

      <StatsSection icon="phone-portrait-outline" title={t.stats_device_hdr}>
        <View style={[styles.textStackLoggerGroupLines, { marginTop: 0 }]}>
          <MetaRow
            label={t.stat_biometrics}
            value={
              biometricsAvailable === null ? '—' : biometricsAvailable ? t.stat_yes : t.stat_no
            }
          />
          <MetaRow
            label={t.stat_unlock_bundle}
            value={unlockBundleSaved === null ? '—' : unlockBundleSaved ? t.stat_yes : t.stat_no}
          />
          <MetaRow label={t.stat_auto_logout} value={autoLogoutLabel} />
          <MetaRow
            label={t.stat_screenshots}
            value={db.settings?.allowScreenshots ? t.stat_allowed : t.stat_blocked}
          />
        </View>
      </StatsSection>

      <StatsSection icon="lock-open-outline" title={t.stats_unlock_hdr}>
        <View style={[styles.textStackLoggerGroupLines, { marginTop: 0 }]}>
          {unlockHistory.length === 0 ? (
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{t.stat_unlock_history_empty}</Text>
          ) : (
            unlockHistory.slice(0, 10).map((event) => (
              <View
                key={`${event.at}-${event.method}-${event.ok}`}
                style={[styles.spacedTextMetaRow, { borderBottomColor: c.border }]}
              >
                <Text style={[styles.metaStaticTxt, { color: c.textMuted }]}>
                  {formatDateTime(event.at)}
                </Text>
                <Text style={[styles.metaDynamicTxt, { color: event.ok ? c.success : c.danger }]}>
                  {methodLabel(event.method)} · {event.ok ? t.stat_unlock_ok : t.stat_unlock_fail}
                </Text>
              </View>
            ))
          )}
        </View>
      </StatsSection>

      <StatsSection icon="trending-up-outline" title={t.stats_trend_hdr}>
        <View style={[styles.textStackLoggerGroupLines, { marginTop: 0 }]}>
          {snapshots.length < 2 ? (
            <Text style={{ color: c.textMuted, fontSize: 12 }}>{t.stats_trend_empty}</Text>
          ) : (
            snapshots.slice(0, 8).map((snap) => (
              <View
                key={snap.at}
                style={[styles.spacedTextMetaRow, { borderBottomColor: c.border }]}
              >
                <Text
                  style={[styles.metaStaticTxt, { color: c.textMuted, flex: 1, paddingRight: 8 }]}
                  numberOfLines={2}
                >
                  {t.stats_trend_point
                    .replace('{date}', formatDate(snap.at))
                    .replace('{score}', String(snap.healthScore))
                    .replace('{weak}', String(snap.weakCount))
                    .replace('{stale}', String(snap.staleCount))}
                </Text>
              </View>
            ))
          )}
        </View>
      </StatsSection>

      <StatsSection icon="globe-outline" title={t.stats_web_sync_hdr}>
        <View style={[styles.textStackLoggerGroupLines, { marginTop: 0 }]}>
          <MetaRow
            label={t.stats_web_sync_hdr}
            value={webServerEnabled ? t.stat_web_sync_on : t.stat_web_sync_off}
          />
          <MetaRow
            label={t.stat_web_clients}
            value={webServerEnabled ? String(authenticatedClients) : '—'}
          />
        </View>
      </StatsSection>
    </ScrollView>
  );
};
