import { Show, createSignal, onMount } from 'solid-js';
import { state, lang, t, submitLogin, toggleLanguage, requestSync } from '../state/appStore';
import { discoveryUiMode } from '../state/discoveryUi';
import { LOGIN_INPUT_ATTRS } from '../util/secureInput';
import { DiscoveryBanner } from './DiscoveryBanner';
import { Notice } from './Notice';
import { SessionIdHint } from './SessionIdHint';
import { StatusLine } from './StatusLine';
import { SvgIcon } from './SvgIcon';
import { UnlockWithBio } from './UnlockWithBio';
import type { StatusTone } from './StatusDot';

function LoginForm() {
  const [password, setPassword] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  let inputRef: HTMLInputElement | undefined;

  onMount(() => {
    setPassword('');
    queueMicrotask(() => inputRef?.focus());
  });

  const unlocking = () => busy() || state.authBusy;

  const handleSubmit = async () => {
    if (unlocking()) return;
    const pw = password();
    if (!pw) return;
    setPassword('');
    setBusy(true);
    try {
      await submitLogin(pw);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div class="form-row" id="pass-row">
        <input
          ref={inputRef}
          type="password"
          {...LOGIN_INPUT_ATTRS}
          placeholder={t('login_password_placeholder', lang())}
          value={password()}
          disabled={unlocking()}
          onInput={(e) => setPassword(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && void handleSubmit()}
        />
      </div>
      <UnlockWithBio
        unlocking={unlocking()}
        unlockLabel={unlocking() ? t('auth_busy_unlock', lang()) : t('login_unlock', lang())}
        onUnlock={() => void handleSubmit()}
      />
      <Show when={state.loginError}>
        <div class="error" role="alert">
          {state.loginError}
        </div>
      </Show>
    </>
  );
}

export function LoginScreen() {
  const connTone = (): StatusTone => {
    if (state.connState === 'authenticated') return 'ok';
    if (state.connState === 'readonly' || state.connState === 'relogin') return 'err';
    return state.challenge ? 'ok' : 'pending';
  };
  const langLabel = () => (lang() === 'ESP' ? 'ES' : 'EN');
  const showPasswordForm = () =>
    state.authBusy ||
    !!state.challenge ||
    state.loginPasswordVisible ||
    (state.offlineVaultAvailable && state.discoveryExhausted);
  const discoveryChrome = () =>
    discoveryUiMode(state.discovery, state.discoveryExhausted, state.connState) !== 'hidden';

  return (
    <div id="login-screen">
      <div class="login-box">
        <div class="login-header-actions">
          <button
            type="button"
            class="vault-header-btn ghost-icon"
            onClick={() => requestSync()}
            aria-label={t('sync', lang())}
            title={t('sync', lang())}
          >
            <SvgIcon name="sync" size={14} />
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
        </div>
        <div class="login-branding">
          <div class="login-logo-ring">
            <img class="login-brand-img" src="/brand-logo.png" alt="PKEY" />
          </div>
          <span class="login-sub">{t('web_vault_sub', lang())}</span>
        </div>

        <Show when={!discoveryChrome()}>
          <StatusLine class="conn-status" tone={connTone()} role="status">
            {state.connLabel || t('login_looking', lang())}
          </StatusLine>
        </Show>

        <DiscoveryBanner variant="notice" />

        <Notice>{t('lan_warning', lang())}</Notice>
        <ul class="info login-onboarding">
          <li>{t('web_onboard_master', lang())}</li>
          <li>{t('web_onboard_keep_phone', lang())}</li>
        </ul>

        <Show when={showPasswordForm()}>
          <Show when={!state.challenge && state.offlineVaultAvailable && state.discoveryExhausted}>
            <div class="info">{t('offline_unlock_hint', lang())}</div>
          </Show>
          <LoginForm />
        </Show>

        <Show when={!showPasswordForm()}>
          <div class="info">{t('login_looking', lang())}</div>
        </Show>
      </div>
      <SessionIdHint class="login-session-id" />
    </div>
  );
}
