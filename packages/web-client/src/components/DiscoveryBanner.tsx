import { Show } from 'solid-js';
import { state, lang, t, retryDiscovery } from '../state/appStore';
import { discoveryUiMode } from '../state/discoveryUi';
import { Banner } from './Banner';
import { Notice } from './Notice';
import { StatusDot } from './StatusDot';

interface Props {
  /** Vault uses a full-bleed strip; login uses an inset notice inside the card. */
  variant?: 'banner' | 'notice';
}

/**
 * Surfaces the search for a phone that changed address: a progress line while
 * probing, and simple guidance once the search gives up.
 * The vault stays editable throughout — this is informational only.
 */
export function DiscoveryBanner(props: Props) {
  const mode = () => discoveryUiMode(state.discovery, state.discoveryExhausted, state.connState);
  const quiet = () => state.wasAuthenticated;
  const variant = () => props.variant ?? 'banner';
  const searchingText = () => t(quiet() ? 'conn_recovering' : 'conn_discovering', lang());

  const searchingBody = () => (
    <>
      <StatusDot tone="syncing" />
      {searchingText()}
    </>
  );

  const guidanceBody = () => (
    <>
      <strong>{t('discovery_help_title', lang())}</strong>
      <span>{t('discovery_help_body', lang())}</span>
      <button type="button" class="btn btn-primary btn-sm discovery-retry" onClick={() => retryDiscovery()}>
        {t('discovery_retry', lang())}
      </button>
    </>
  );

  return (
    <>
      <Show when={mode() === 'searching'}>
        <Show
          when={variant() === 'notice'}
          fallback={
            <Banner role="status">{searchingBody()}</Banner>
          }
        >
          <Notice layout="row" role="status">
            {searchingBody()}
          </Notice>
        </Show>
      </Show>
      <Show when={mode() === 'guidance'}>
        <Show
          when={variant() === 'notice'}
          fallback={
            <Banner tone="danger" stacked role="status">
              {guidanceBody()}
            </Banner>
          }
        >
          <Notice tone="danger" layout="stack" role="status">
            {guidanceBody()}
          </Notice>
        </Show>
      </Show>
    </>
  );
}
