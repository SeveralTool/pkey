import { Show, type JSX } from 'solid-js';
import { state, lang, t, startPhoneUnlock, requestSync } from '../state/appStore';
import { SvgIcon } from './SvgIcon';

interface Props {
  unlocking: boolean;
  unlockLabel: string;
  onUnlock: () => void;
  isRelogin?: boolean;
  /** When true, show a 48px Sync control next to Unlock (login / relogin). */
  showSync?: boolean;
}

/** Unlock button plus optional 48px Sync and fingerprint controls. */
export function UnlockWithBio(props: Props): JSX.Element {
  const showBio = () => state.settings.webLoginOnPhone === true && !!state.challenge;

  return (
    <div class="login-unlock-row">
      <button
        type="button"
        class="btn btn-primary login-unlock-btn"
        disabled={props.unlocking}
        aria-busy={props.unlocking}
        onClick={() => props.onUnlock()}
      >
        <Show when={props.unlocking}>
          <span class="btn-spinner" aria-hidden="true" />
        </Show>
        {props.unlockLabel}
      </button>
      <Show when={props.showSync}>
        <button
          type="button"
          class="login-square-btn"
          disabled={props.unlocking}
          aria-label={t('sync', lang())}
          title={t('sync', lang())}
          onClick={() => requestSync()}
        >
          <SvgIcon name="sync" size={22} />
        </button>
      </Show>
      <Show when={showBio()}>
        <button
          type="button"
          class="login-square-btn"
          disabled={props.unlocking}
          aria-label={t('login_bio_btn', lang())}
          title={t('login_bio_btn', lang())}
          onClick={() => startPhoneUnlock(!!props.isRelogin)}
        >
          <SvgIcon name="fingerprint" size={22} />
        </button>
      </Show>
    </div>
  );
}
