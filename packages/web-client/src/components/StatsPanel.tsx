import { Show } from 'solid-js';
import { getVaultStatistics, lang, t, state } from '../state/appStore';

interface Props {
  compact?: boolean;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

function webAutoLogoutLabel(): string {
  const v = state.settings?.webAutoLogout ?? '15M';
  if (v === '5M') return t('stats_web_auto_logout_5m', lang());
  if (v === '15M') return t('stats_web_auto_logout_15m', lang());
  if (v === '1H') return t('stats_web_auto_logout_1h', lang());
  if (v === 'NEVER') return t('stats_web_auto_logout_never', lang());
  return v;
}

function StatsLoading(props: Props) {
  return (
    <div class={`stats-panel ${props.compact ? 'compact' : ''}`} data-testid="stats-loading">
      {!props.compact && <h2>{t('stats_title', lang())}</h2>}
      <div class="stats-section">
        <h3 class="stats-section-title">{t('stats_health_hdr', lang())}</h3>
        <p class="stats-hint">{t('stats_loading', lang())}</p>
        <div class="vault-skeleton" aria-hidden="true">
          <div class="vault-skeleton-row" />
          <div class="vault-skeleton-row" />
          <div class="vault-skeleton-row" />
        </div>
      </div>
    </div>
  );
}

function StatsReady(props: Props) {
  // Depend on cards + pendingOps so offline creates/deletes refresh stats.
  const stats = () => {
    void state.cards;
    void state.pendingOps;
    void state.settings;
    void state.connState;
    void state.offlineVaultAvailable;
    return getVaultStatistics();
  };

  const n = (v: number | undefined | null) => v ?? 0;

  const box = (label: string, value: string | number) => (
    <div class="stat-box">
      <div class="stat-value">{value}</div>
      <div class="stat-label">{label}</div>
    </div>
  );

  const meta = (label: string, value: string) => (
    <div class="stat-meta-row">
      <span class="stat-meta-label">{label}</span>
      <span class="stat-meta-value">{value}</span>
    </div>
  );

  const s = () => stats();

  const connMode = () => {
    if (state.connState === 'authenticated') return t('stats_conn_live', lang());
    if (state.connState === 'offline' || state.connState === 'relogin') {
      return t('stats_conn_offline', lang());
    }
    return t('stats_conn_other', lang());
  };

  const oldestLine = () => {
    const ref = s().oldestUpdated;
    if (!ref) return '—';
    return `${ref.title} · ${formatDate(ref.last_update)}`;
  };

  const newestLine = () => {
    const ref = s().newestUpdated;
    if (!ref) return '—';
    return `${ref.title} · ${formatDate(ref.last_update)}`;
  };

  return (
    <div class={`stats-panel ${props.compact ? 'compact' : ''}`}>
      {!props.compact && <h2>{t('stats_title', lang())}</h2>}

      <div class="stats-section">
        <h3 class="stats-section-title">{t('stats_health_hdr', lang())}</h3>
        <div class="stats-grid">{box(t('stats_health_score', lang()), n(s().healthScore))}</div>
        <p class="stats-hint">{t('stats_health_hint', lang())}</p>
      </div>

      <div class="stats-section">
        <h3 class="stats-section-title">{t('stats_password_report', lang())}</h3>
        <div class="stats-grid">
          {box(t('stats_total', lang()), n(s().totalCards))}
          {box(t('stats_duplicates', lang()), n(s().duplicatedCount))}
          {box(t('stats_weak', lang()), n(s().weakCount))}
          {box(t('stats_stale', lang()), n(s().staleCount))}
          {box(t('stats_hibp_checked', lang()), n(s().hibpCheckedCount))}
          {box(t('stats_hibp_breached', lang()), n(s().hibpBreachedCount))}
          {box(t('stats_users', lang()), n(s().uniqueUsers))}
          {box(t('stats_type_password', lang()), n(s().passwordCount))}
          {box(t('stats_type_secret', lang()), n(s().secretPhraseCount))}
          {box(t('stats_type_note', lang()), n(s().noteCount))}
          {box(t('stats_tombstones', lang()), n(s().tombstoneCount))}
        </div>
      </div>

      <div class="stats-section">
        <h3 class="stats-section-title">{t('stats_coverage_hdr', lang())}</h3>
        <div class="stats-grid">
          {box(t('stats_otp_with', lang()), n(s().withOtpCount))}
          {box(t('stats_otp_without', lang()), n(s().withoutOtpCount))}
          {box(t('stats_otp_coverage', lang()), `${n(s().otpCoveragePercent)}%`)}
          {box(t('stats_reused_username', lang()), n(s().reusedUsernameCount))}
          {box(t('stats_empty_username', lang()), n(s().emptyUsernameCount))}
          {box(t('stats_empty_password', lang()), n(s().emptyPasswordCount))}
          {box(t('stats_empty_link', lang()), n(s().emptyLinkCount))}
          {box(t('stats_unique_tags', lang()), n(s().uniqueTagCount))}
          {box(t('stats_untagged', lang()), n(s().untaggedCount))}
        </div>
      </div>

      <div class="stats-section">
        <h3 class="stats-section-title">{t('stats_activity_hdr', lang())}</h3>
        <div class="stats-meta">
          {meta(t('stats_oldest_card', lang()), oldestLine())}
          {meta(t('stats_newest_card', lang()), newestLine())}
        </div>
      </div>

      <div class="stats-section">
        <h3 class="stats-section-title">{t('stats_session_hdr', lang())}</h3>
        <div class="stats-grid">{box(t('stats_pending_ops', lang()), n(state.pendingOps))}</div>
        <div class="stats-meta">
          {meta(t('stats_conn_mode', lang()), connMode())}
          {meta(t('stats_web_auto_logout', lang()), webAutoLogoutLabel())}
          {meta(
            t('stats_web_confirm_on_phone', lang()),
            state.settings?.webConfirmOnPhone ? t('stats_yes', lang()) : t('stats_no', lang())
          )}
          {meta(
            t('stats_web_login_on_phone', lang()),
            state.settings?.webLoginOnPhone ? t('stats_yes', lang()) : t('stats_no', lang())
          )}
          {meta(
            t('stats_offline_vault', lang()),
            state.offlineVaultAvailable ? t('stats_yes', lang()) : t('stats_no', lang())
          )}
        </div>
      </div>
    </div>
  );
}

export function StatsPanel(props: Props) {
  return (
    <Show when={!state.vaultHydrating} fallback={<StatsLoading compact={props.compact} />}>
      <StatsReady compact={props.compact} />
    </Show>
  );
}

export function statsSummary(): string {
  void state.vaultHydrating;
  void state.cards;
  void state.pendingOps;
  if (state.vaultHydrating) return t('stats_loading', lang());
  const total = getVaultStatistics().totalCards ?? 0;
  return `${t('stats_title', lang())}: ${total}`;
}
