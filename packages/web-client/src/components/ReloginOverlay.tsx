import { Show, createSignal, onMount } from 'solid-js';
import { state, lang, t, submitLogin, continueOffline } from '../state/appStore';
import { SENSITIVE_INPUT_ATTRS } from '../util/secureInput';
import { UnlockWithBio } from './UnlockWithBio';

function ReloginForm() {
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
      await submitLogin(pw, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div class="form-row">
        <input
          ref={inputRef}
          type="password"
          {...SENSITIVE_INPUT_ATTRS}
          placeholder="••••••••"
          value={password()}
          disabled={unlocking()}
          onInput={(e) => setPassword(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && void handleSubmit()}
        />
      </div>
      <Show when={state.reloginError}>
        <div class="error" role="alert">
          {state.reloginError}
        </div>
      </Show>
      <UnlockWithBio
        unlocking={unlocking()}
        unlockLabel={unlocking() ? t('auth_busy_unlock', lang()) : t('unlock', lang())}
        onUnlock={() => void handleSubmit()}
        isRelogin
        showSync
      />
      <button
        type="button"
        class="btn btn-ghost"
        style={{ width: '100%', 'margin-top': '8px' }}
        disabled={unlocking()}
        onClick={() => continueOffline()}
      >
        {t('continue_offline', lang())}
      </button>
    </>
  );
}

export function ReloginOverlay() {
  return (
    <Show when={state.showRelogin}>
      <div class="modal-backdrop open">
        <div class="modal centered" role="dialog" style={{ 'max-width': '380px' }}>
          <h2>{t('relogin_title', lang())}</h2>
          <p class="modal-desc">{t('relogin_desc', lang())}</p>
          <ReloginForm />
        </div>
      </div>
    </Show>
  );
}
