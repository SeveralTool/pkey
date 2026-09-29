import { Show, createSignal, createMemo, For, Switch, Match } from 'solid-js';
import {
  groupCardsByLinkKey,
  resolveWebThemeMode,
  sortCardLinkListRows,
  type CardLinkListRow,
  type DisplayCard,
} from '@pkey/core';
import {
  state,
  lang,
  t,
  filteredCards,
  setSearch,
  requestSync,
  logout,
  openAddModal,
  isWriteAllowed,
  toggleTheme,
  toggleLanguage,
} from '../state/appStore';
import { resolveIsDark } from '../theme/tokens';
import { VaultCard } from './VaultCard';
import { VaultLinkGroup } from './VaultLinkGroup';
import { StatsPanel, statsSummary } from './StatsPanel';
import { DiscoveryBanner } from './DiscoveryBanner';
import { StayOpenBanner } from './StayOpenBanner';
import { VaultForkBanner } from './VaultForkBanner';
import { SessionIdHint } from './SessionIdHint';
import { Banner } from './Banner';
import { StatusLine } from './StatusLine';
import { SvgIcon } from './SvgIcon';
import type { StatusTone } from './StatusDot';

function VaultListRow(props: {
  row: CardLinkListRow<DisplayCard>;
  expandedIds: ReadonlySet<string>;
  expandedGroupKey: string | null;
  onToggleCard: (id: string) => void;
  onToggleGroup: (key: string) => void;
}) {
  return (
    <Switch>
      <Match when={props.row.kind === 'group' ? props.row : false}>
        {(group) => (
          <VaultLinkGroup
            label={group().label}
            cards={group().cards}
            expanded={props.expandedGroupKey === group().key}
            onToggle={() => props.onToggleGroup(group().key)}
            expandedIds={props.expandedIds}
            onToggleCard={props.onToggleCard}
          />
        )}
      </Match>
      <Match when={props.row.kind === 'single' ? props.row : false}>
        {(single) => (
          <VaultCard
            card={single().card}
            expanded={props.expandedIds.has(single().card.id)}
            onToggle={() => props.onToggleCard(single().card.id)}
          />
        )}
      </Match>
    </Switch>
  );
}

export function VaultScreen() {
  const [expandedIds, setExpandedIds] = createSignal<Set<string>>(new Set());
  const [expandedGroupKey, setExpandedGroupKey] = createSignal<string | null>(null);

  const toggle = (id: string) => {
    const collapseOthers = state.settings.autoCollapse !== false;
    setExpandedIds((prev) => {
      if (collapseOthers) {
        return prev.has(id) ? new Set() : new Set([id]);
      }
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroup = (key: string) => {
    setExpandedGroupKey((prev) => (prev === key ? null : key));
  };

  const syncTone = (): StatusTone => {
    const s = state.syncStatus;
    if (s === 'synced') return 'synced';
    if (s === 'syncing') return 'syncing';
    if (s === 'readonly') return 'readonly';
    if (s === 'offline') return 'offline';
    return 'idle';
  };

  const listRows = createMemo((): CardLinkListRow<DisplayCard>[] => {
    const list = filteredCards();
    void state.settings.groupCardsByLink;
    if (!state.settings.groupCardsByLink) {
      return list.map((card) => ({ kind: 'single' as const, card }));
    }
    return sortCardLinkListRows(groupCardsByLinkKey(list), 'title');
  });

  const isDarkTheme = () => resolveIsDark(resolveWebThemeMode(state.settings));
  const langLabel = () => (lang() === 'ESP' ? 'ES' : 'EN');

  return (
    <div id="vault-screen">
      <Show when={state.connState === 'readonly'}>
        <Banner>{t('readonly_banner', lang())}</Banner>
      </Show>

      <Show when={state.connState === 'offline'}>
        <Banner>
          {t('offline_banner', lang())}
          <Show when={state.pendingOps > 0}>
            {' '}
            · {t('pending_changes', lang(), { n: state.pendingOps })}
          </Show>
        </Banner>
      </Show>

      <VaultForkBanner />
      <DiscoveryBanner />
      <StayOpenBanner />

      <Show when={typeof window !== 'undefined' && window.location.protocol === 'http:'}>
        <Banner>{t('lan_warning', lang())}</Banner>
      </Show>

      <div class="vault-header">
        <img class="vault-header-logo" src="/brand-logo.png" alt="PKEY" />
        <div class="vault-header-spacer" />
        <button
          type="button"
          class="vault-header-btn ghost-icon"
          onClick={toggleTheme}
          aria-label={t(isDarkTheme() ? 'theme_light' : 'theme_dark', lang())}
          title={t(isDarkTheme() ? 'theme_light' : 'theme_dark', lang())}
        >
          <SvgIcon name={isDarkTheme() ? 'sun' : 'moon'} size={14} />
        </button>
        <button
          type="button"
          class="vault-header-btn ghost-icon lang-btn"
          onClick={toggleLanguage}
          aria-label={t('lang_title', lang())}
          title={t('lang_title', lang())}
        >
          {langLabel()}
        </button>
        <StatusLine tone={syncTone()} labelClass="vault-header-sync-label">
          {t(state.syncStatus as 'idle' | 'syncing' | 'synced' | 'offline' | 'readonly', lang())}
        </StatusLine>
        <button
          type="button"
          class="vault-header-btn"
          onClick={requestSync}
          aria-label={t('sync', lang())}
        >
          <SvgIcon name="sync" size={13} />
          <span class="label">{t('sync', lang())}</span>
        </button>
        <button
          type="button"
          class="vault-header-btn danger"
          onClick={logout}
          aria-label={t('logout', lang())}
        >
          <SvgIcon name="logout" size={13} />
          <span class="label">{t('logout', lang())}</span>
        </button>
      </div>

      <main class="vault-main">
        <div class="vault-columns">
          <div class="vault-primary">
            <details class="stats-accordion">
              <summary>
                <span>{statsSummary()}</span>
                <SvgIcon name="chevron" size={14} class="stats-accordion-chevron" />
              </summary>
              <StatsPanel compact />
            </details>

            <Show when={state.cards.length > 0}>
              <div class="search-row">
                <input
                  type="search"
                  placeholder={t('search_placeholder', lang())}
                  value={state.search}
                  onInput={(e) => setSearch(e.currentTarget.value)}
                  aria-label={t('search_placeholder', lang())}
                />
              </div>
            </Show>

            <SessionIdHint class="vault-session-id" />

            <div class="card-list">
              <Show
                when={!(state.vaultHydrating && listRows().length === 0)}
                fallback={
                  <div class="empty" data-testid="vault-loading">
                    <p>{t('vault_loading', lang())}</p>
                    <div class="vault-skeleton" aria-hidden="true">
                      <div class="vault-skeleton-row" />
                      <div class="vault-skeleton-row" />
                      <div class="vault-skeleton-row" />
                    </div>
                  </div>
                }
              >
                <Show
                  when={listRows().length > 0}
                  fallback={
                    <div class="empty">
                      <div class="big">🔒</div>
                      <p>{state.search ? t('no_results', lang()) : t('no_cards', lang())}</p>
                      <Show when={!state.search && isWriteAllowed()}>
                        <button
                          type="button"
                          class="btn btn-primary btn-sm"
                          style={{ 'margin-top': '14px' }}
                          onClick={openAddModal}
                        >
                          {t('add_first_card', lang())}
                        </button>
                      </Show>
                    </div>
                  }
                >
                  <For each={listRows()}>
                    {(row) => (
                      <VaultListRow
                        row={row}
                        expandedIds={expandedIds()}
                        expandedGroupKey={expandedGroupKey()}
                        onToggleCard={toggle}
                        onToggleGroup={toggleGroup}
                      />
                    )}
                  </For>
                </Show>
              </Show>
            </div>
          </div>

          <aside class="stats-sidebar" aria-label={t('stats_title', lang())}>
            <StatsPanel compact />
          </aside>
        </div>

        <button
          type="button"
          class={`fab ${state.cards.length === 0 || !isWriteAllowed() ? 'hidden' : ''}`}
          onClick={openAddModal}
          title={t('new_card', lang())}
          aria-label={t('new_card', lang())}
        >
          ＋
        </button>
      </main>
    </div>
  );
}
