/**
 * @fileoverview Banner while the phone decides which vault session to keep.
 */
import { Show } from 'solid-js';
import { state, lang, t } from '../state/appStore';
import { Banner } from './Banner';

export function VaultForkBanner() {
  return (
    <Show when={state.vaultForkPending}>
      <Banner>
        {t('vault_fork_banner', lang())}
        {' · '}
        {t('vault_fork_waiting', lang())}
        <Show when={state.vaultForkEncryptedOnly}>
          {' · '}
          {t('vault_fork_locked', lang())}
        </Show>
      </Banner>
    </Show>
  );
}
