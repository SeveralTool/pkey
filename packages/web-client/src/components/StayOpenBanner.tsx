import { Show, createSignal } from 'solid-js';
import { lang, t } from '../state/appStore';
import { Banner } from './Banner';

const DISMISS_KEY = '@pkey/stay-open-hint-dismissed';

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function isLocalHostname(): boolean {
  if (typeof location === 'undefined') return false;
  return location.hostname.toLowerCase().endsWith('.local');
}

/**
 * One-shot hint after unlock: leave the tab open; come back via the phone.
 * Bookmark copy only when this origin is already a stable `.local` name.
 */
export function StayOpenBanner() {
  const [hidden, setHidden] = createSignal(readDismissed());

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setHidden(true);
  };

  return (
    <Show when={!hidden()}>
      <Banner tone="info" stacked>
        <span>{t('stay_open_banner', lang())}</span>
        <Show when={isLocalHostname()}>
          <span>{t('stay_open_bookmark', lang())}</span>
        </Show>
        <button type="button" class="btn btn-primary btn-sm" onClick={dismiss}>
          {t('stay_open_dismiss', lang())}
        </button>
      </Banner>
    </Show>
  );
}
