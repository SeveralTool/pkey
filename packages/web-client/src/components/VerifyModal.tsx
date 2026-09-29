import { Show, createSignal, onMount } from 'solid-js';
import {
  state,
  lang,
  t,
  confirmVerify,
  cancelVerify,
  usePasswordInsteadOfPhoneConfirm,
  cancelPhoneUnlock,
} from '../state/appStore';
import { SENSITIVE_INPUT_ATTRS } from '../util/secureInput';

/** Mounted only while open — fresh password state every time. */
function VerifyModalBody() {
  const [password, setPassword] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  let inputRef: HTMLInputElement | undefined;

  onMount(() => {
    setPassword('');
    queueMicrotask(() => inputRef?.focus());
  });

  const handleClose = () => {
    if (busy()) return;
    setPassword('');
    cancelVerify();
  };

  const handleConfirm = async () => {
    if (busy()) return;
    const pw = password();
    if (!pw) return;
    setBusy(true);
    setPassword('');
    // Paint spinner before sync PBKDF2 blocks the main thread.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      await confirmVerify(pw);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="modal-backdrop open" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div class="modal centered" role="dialog" style={{ 'max-width': '380px' }}>
        <h2>{t('verify_password', lang())}</h2>
        <p class="modal-desc">{t('verify_unlock_edit_desc', lang())}</p>
        <div class="form-row">
          <input
            ref={inputRef}
            type="password"
            {...SENSITIVE_INPUT_ATTRS}
            placeholder="••••••••"
            value={password()}
            disabled={busy()}
            onInput={(e) => setPassword(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleConfirm()}
            data-testid="verify-password-input"
          />
        </div>
        <Show when={state.verifyError}>
          <div class="error">{state.verifyError}</div>
        </Show>
        <div class="actions" style={{ 'margin-top': '12px' }}>
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            disabled={busy()}
            onClick={handleClose}
          >
            {t('cancel', lang())}
          </button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            disabled={busy()}
            aria-busy={busy()}
            onClick={() => void handleConfirm()}
          >
            <Show when={busy()}>
              <span class="btn-spinner" aria-hidden="true" />
            </Show>
            {busy() ? t('auth_busy_verify', lang()) : t('confirm', lang())}
          </button>
        </div>
      </div>
    </div>
  );
}

function PhoneConfirmBody() {
  const handleCancel = () => {
    cancelVerify();
  };

  return (
    <div
      class="modal-backdrop open"
      onClick={(e) => e.target === e.currentTarget && handleCancel()}
    >
      <div class="modal centered" role="dialog" style={{ 'max-width': '380px' }}>
        <h2>{t('phone_confirm_title', lang())}</h2>
        <p class="modal-desc">{t('phone_confirm_desc', lang())}</p>
        <div class="actions" style={{ 'margin-top': '12px' }}>
          <button type="button" class="btn btn-ghost btn-sm" onClick={handleCancel}>
            {t('cancel', lang())}
          </button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            onClick={() => usePasswordInsteadOfPhoneConfirm()}
          >
            {t('phone_confirm_use_password', lang())}
          </button>
        </div>
      </div>
    </div>
  );
}

function UnlockWaitBody() {
  return (
    <div
      class="modal-backdrop open"
      onClick={(e) => e.target === e.currentTarget && cancelPhoneUnlock()}
    >
      <div class="modal centered" role="dialog" style={{ 'max-width': '380px' }}>
        <h2>{t('unlock_sas_title', lang())}</h2>
        <p class="modal-desc">{t('unlock_sas_desc', lang())}</p>
        <Show when={state.unlockSas}>
          <div class="unlock-sas-digits" aria-live="polite">
            {state.unlockSas}
          </div>
        </Show>
        <div class="actions" style={{ 'margin-top': '12px' }}>
          <button type="button" class="btn btn-ghost btn-sm" onClick={() => cancelPhoneUnlock()}>
            {t('cancel', lang())}
          </button>
          <button type="button" class="btn btn-primary btn-sm" onClick={() => cancelPhoneUnlock()}>
            {t('unlock_sas_use_password', lang())}
          </button>
        </div>
      </div>
    </div>
  );
}

export function VerifyModal() {
  return (
    <>
      <Show when={state.showUnlockWait}>
        <UnlockWaitBody />
      </Show>
      <Show when={state.showPhoneConfirm}>
        <PhoneConfirmBody />
      </Show>
      <Show when={state.showVerify}>
        <VerifyModalBody />
      </Show>
    </>
  );
}
