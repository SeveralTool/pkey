import { Show, createSignal, createEffect, Index, onCleanup } from 'solid-js';
import type { CardIcon, DisplayCard, OtpAlgorithm } from '@pkey/core';
import {
  normalizeTags,
  detectPresetFromLink,
  faviconIconFromLink,
  generateSecureId,
  CARD_TITLE_MAX,
  CARD_USERNAME_MAX,
  CARD_LINK_MAX,
  CARD_PASSWORD_MAX,
  CARD_NOTES_MAX,
  applyCardTypeChange,
  processOtpInput,
  collectIdentities,
  androidPackagesOf,
  packageToDisplayLabel,
  displayUrl,
  resolveOpenableUrl,
} from '@pkey/core';
import {
  state,
  lang,
  t,
  closeCardModal,
  saveCard,
  unlockEditSecrets,
  generatePassword,
  getSecretStore,
  isWriteAllowed,
  showToast,
} from '../state/appStore';
import { CardIconView } from './CardIconView';
import { IconPickerModal } from './IconPickerModal';
import { TagsEditor } from './TagsEditor';
import { SvgIcon } from './SvgIcon';
import { SENSITIVE_INPUT_ATTRS } from '../util/secureInput';

function newId(): string {
  return generateSecureId('web');
}

function scrollActionsIntoView(el: HTMLElement | null) {
  queueMicrotask(() => {
    const actions = el?.closest('.modal')?.querySelector('.actions');
    if (typeof actions?.scrollIntoView === 'function') {
      actions.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
}

function CardModalBody() {
  const editing = () => state.editingId;
  const card = (): DisplayCard | undefined =>
    state.editingId ? state.cards.find((c) => c.id === state.editingId) : undefined;

  const [title, setTitle] = createSignal('');
  const [username, setUsername] = createSignal('');
  const [link, setLink] = createSignal('');
  const [notes, setNotes] = createSignal('');
  const [type, setType] = createSignal<'PASSWORD' | 'SECRET_PHRASE' | 'NOTE'>('PASSWORD');
  const [secret, setSecret] = createSignal('');
  const [seedWords, setSeedWords] = createSignal<string[]>(['']);
  const [unlocked, setUnlocked] = createSignal(!state.editingId || state.editSecretsUnlocked);
  const [icon, setIcon] = createSignal<CardIcon>({ type: 'icon', value: 'key-outline' });
  const [iconPickerOpen, setIconPickerOpen] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [otpSecret, setOtpSecret] = createSignal('');
  const [otpAlgorithm, setOtpAlgorithm] = createSignal<OtpAlgorithm | undefined>();
  const [otpDigits, setOtpDigits] = createSignal<6 | 8 | undefined>();
  const [otpPeriod, setOtpPeriod] = createSignal<number | undefined>();
  const [tags, setTags] = createSignal<string[]>([]);
  const [userPickedIcon, setUserPickedIcon] = createSignal(false);
  const [sourceLink, setSourceLink] = createSignal('');
  let flushPendingTag: (() => void) | undefined;
  let hydratedFor: string | null = null;

  const applyLinkIcon = (url: string) => {
    if (userPickedIcon()) return;
    const trimmed = url.trim();
    const lookupOn =
      state.settings?.enableFaviconLookup === true && state.settings?.strictOffline !== true;
    if (lookupOn) {
      const quick = trimmed ? faviconIconFromLink(trimmed) : null;
      if (quick) {
        setIcon(quick);
        return;
      }
    }
    const hostBrand = trimmed ? detectPresetFromLink(trimmed) : null;
    if (hostBrand) setIcon(hostBrand);
  };

  const typeLocked = () => Boolean(editing() && card());

  const resetOtpParams = () => {
    setOtpAlgorithm(undefined);
    setOtpDigits(undefined);
    setOtpPeriod(undefined);
  };

  createEffect(() => {
    if (!state.showCardModal) {
      hydratedFor = null;
      return;
    }
    const id = editing() ?? '__new__';
    if (hydratedFor === id) return;
    hydratedFor = id;
    const c = card();
    if (c) {
      setTitle(c.title);
      setUsername(c.username);
      setSourceLink(c.link);
      setLink(displayUrl(collectIdentities(c.link, c.uris), c.link));
      setNotes(c.notes);
      setType(c.type);
      setIcon(c.icon ?? { type: 'icon', value: 'key-outline' });
      setUserPickedIcon(false);
      setTags(c.tags ?? []);
      setOtpAlgorithm(c.otpAlgorithm);
      setOtpDigits(c.otpDigits);
      setOtpPeriod(c.otpPeriod);
      setUnlocked(state.editSecretsUnlocked);
      if (state.editSecretsUnlocked) {
        const store = getSecretStore();
        if (c.type === 'SECRET_PHRASE') {
          const words = store.getSeed(c.id).split(/\s+/).filter(Boolean);
          setSeedWords(words.length ? words : ['']);
          setSecret('');
          setOtpSecret('');
        } else {
          setSecret(store.getPassword(c.id));
          setOtpSecret(store.getOtpSecret(c.id));
          setSeedWords(['']);
        }
      } else {
        setSecret('');
        setSeedWords(['']);
        setOtpSecret('');
      }
    } else {
      setTitle('');
      setUsername('');
      setSourceLink('');
      setLink('');
      setNotes('');
      setType('PASSWORD');
      setSecret('');
      setSeedWords(['']);
      setOtpSecret('');
      resetOtpParams();
      setTags([]);
      setIcon({ type: 'icon', value: 'key-outline' });
      setUserPickedIcon(false);
      setUnlocked(true);
    }
  });

  onCleanup(() => {
    setSecret('');
    setSeedWords(['']);
    setOtpSecret('');
    setIconPickerOpen(false);
  });

  const handleTypeChange = (next: 'PASSWORD' | 'SECRET_PHRASE' | 'NOTE') => {
    if (needsUnlock()) return;
    if (next === type()) return;
    if (editing() && card()) {
      showToast(t('card_type_change_blocked', lang()), 'error');
      return;
    }
    const applied = applyCardTypeChange(
      {
        type: type(),
        passwordList:
          type() === 'SECRET_PHRASE' ? seedWords() : type() === 'NOTE' ? [''] : [secret()],
        otpSecret: otpSecret(),
      },
      next
    );
    if (!applied) {
      showToast(t('card_type_change_blocked', lang()), 'error');
      return;
    }
    setType(applied.type);
    if (applied.type === 'SECRET_PHRASE') {
      setSeedWords(applied.passwordList.length ? applied.passwordList : ['']);
      setSecret('');
    } else if (applied.type === 'PASSWORD') {
      setSecret(applied.passwordList[0] || '');
      setSeedWords(['']);
    } else {
      setSecret('');
      setSeedWords(['']);
    }
    setOtpSecret(applied.otpSecret);
    if (!applied.otpSecret) resetOtpParams();
  };

  const handleSave = async () => {
    if (saving() || !isWriteAllowed()) return;
    if (needsUnlock()) {
      requestUnlockThenSave();
      return;
    }
    await persistCard();
  };

  const persistCard = async () => {
    if (saving() || !isWriteAllowed()) return;
    setSaving(true);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const capturedSecret = secret();
    const capturedSeeds = [...seedWords()];
    const capturedOtp = otpSecret();
    setSecret('');
    setSeedWords(['']);
    try {
      flushPendingTag?.();
      const existing = card();
      const rawLink = link().trim();
      const originalLink = sourceLink();
      const displayed = existing
        ? displayUrl(collectIdentities(originalLink, existing.uris), originalLink)
        : '';
      const linkToSave =
        !editing() || (rawLink !== displayed && rawLink !== originalLink) ? rawLink : originalLink;
      const runIconDetection = !userPickedIcon();
      const id = editing() ?? newId();
      const passwordList =
        type() === 'SECRET_PHRASE'
          ? capturedSeeds.map((w) => w.trim()).filter(Boolean)
          : type() === 'NOTE'
            ? ['']
            : capturedSecret
              ? [capturedSecret]
              : [''];
      await saveCard({
        id,
        type: type(),
        title: title(),
        username: username(),
        link: linkToSave,
        notes: notes(),
        passwordList,
        icon: icon(),
        runIconDetection,
        otpSecret: type() === 'PASSWORD' ? capturedOtp : '',
        otpAlgorithm: type() === 'PASSWORD' ? otpAlgorithm() : undefined,
        otpDigits: type() === 'PASSWORD' ? otpDigits() : undefined,
        otpPeriod: type() === 'PASSWORD' ? otpPeriod() : undefined,
        tags: normalizeTags(tags()),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleGen = () => {
    if (secret().trim() && !confirm(t('generate_replace', lang()))) return;
    const pw = generatePassword();
    if (pw) setSecret(pw);
  };

  const handleOtpInput = (raw: string) => {
    const result = processOtpInput(raw);
    if (result.kind === 'invalid_uri') {
      showToast(t('otp_invalid_uri', lang()), 'error');
      return;
    }
    if (result.kind === 'invalid_secret') {
      showToast(t('otp_invalid_secret', lang()), 'error');
      return;
    }
    if (result.kind === 'uri') {
      setOtpSecret(result.secret);
      setOtpAlgorithm(result.algorithm);
      setOtpDigits(result.digits);
      setOtpPeriod(result.period);
      return;
    }
    setOtpSecret(result.secret);
    if (!result.secret) resetOtpParams();
  };

  const needsUnlock = () => Boolean(editing() && !unlocked());

  const hydrateSecrets = () => {
    const c = card();
    if (c) {
      const store = getSecretStore();
      if (c.type === 'SECRET_PHRASE') {
        const words = store.getSeed(c.id).split(/\s+/).filter(Boolean);
        setSeedWords(words.length ? words : ['']);
      } else {
        setSecret(store.getPassword(c.id));
        setOtpSecret(store.getOtpSecret(c.id));
      }
    }
    setUnlocked(true);
  };

  const requestUnlock = () => {
    unlockEditSecrets(() => {
      hydrateSecrets();
    });
  };

  const requestUnlockThenSave = () => {
    unlockEditSecrets(() => {
      hydrateSecrets();
      void persistCard();
    });
  };

  const openCardLink = () => {
    const editingCard = state.cards.find((c) => c.id === state.editingId);
    const url = resolveOpenableUrl(link(), editingCard?.uris);
    if (!url) {
      showToast(t('link_blocked', lang()), 'error');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const secretLockedField = () => (
    <div class="secret-locked" data-testid="card-modal-secret-locked">
      <span class="secret-locked-mask" aria-hidden="true">
        ••••••••
      </span>
      <span class="secret-locked-label">{t('secret_locked', lang())}</span>
      <button
        type="button"
        class="icon-btn"
        title={t('show', lang())}
        aria-label={t('show', lang())}
        data-testid="card-modal-reveal"
        onClick={requestUnlock}
      >
        <SvgIcon name="eye" />
      </button>
    </div>
  );

  const appHintName = () => {
    const editing = state.cards.find((c) => c.id === state.editingId);
    const pkgs = androidPackagesOf(collectIdentities(link(), editing?.uris));
    const pkg = pkgs[0];
    return pkg ? packageToDisplayLabel(pkg) : '';
  };

  const saveDisabled = () => saving() || !isWriteAllowed();
  const saveTitle = () =>
    !isWriteAllowed()
      ? t('write_blocked', lang())
      : needsUnlock()
        ? t('unlock_to_save', lang())
        : undefined;

  const typePillDisabled = (pill: 'PASSWORD' | 'SECRET_PHRASE' | 'NOTE') =>
    needsUnlock() || (typeLocked() && pill !== type());

  return (
    <>
      <Show when={state.showCardModal}>
        <div
          class={`modal-backdrop open`}
          onClick={(e) => e.target === e.currentTarget && closeCardModal()}
        >
          <div class="modal sheet" role="dialog">
            <h2>{editing() ? t('edit_card', lang()) : t('new_card', lang())}</h2>

            <div
              class="form-row"
              style={{ 'flex-direction': 'row', 'align-items': 'center', gap: '12px' }}
            >
              <button
                type="button"
                class="icon-preview-btn"
                onClick={() => setIconPickerOpen(true)}
                title={t('icon_picker_title', lang())}
              >
                <CardIconView icon={icon()} title={title()} link={link()} />
              </button>
              <div style={{ flex: 1 }}>
                <div class="type-picker">
                  <button
                    type="button"
                    class={`type-pill ${type() === 'PASSWORD' ? 'active' : ''}`}
                    disabled={typePillDisabled('PASSWORD')}
                    data-testid="type-pill-password"
                    onClick={() => handleTypeChange('PASSWORD')}
                  >
                    {t('type_password', lang())}
                  </button>
                  <button
                    type="button"
                    class={`type-pill ${type() === 'SECRET_PHRASE' ? 'active' : ''}`}
                    disabled={typePillDisabled('SECRET_PHRASE')}
                    data-testid="type-pill-seed"
                    onClick={() => handleTypeChange('SECRET_PHRASE')}
                  >
                    {t('type_seed', lang())}
                  </button>
                  <button
                    type="button"
                    class={`type-pill ${type() === 'NOTE' ? 'active' : ''}`}
                    disabled={typePillDisabled('NOTE')}
                    data-testid="type-pill-note"
                    onClick={() => handleTypeChange('NOTE')}
                  >
                    {t('type_note', lang())}
                  </button>
                </div>
              </div>
            </div>

            <div class="form-row">
              <label>{t('title', lang())}</label>
              <input
                type="text"
                maxlength={CARD_TITLE_MAX}
                value={title()}
                onInput={(e) => setTitle(e.currentTarget.value)}
              />
            </div>

            <div class="row2">
              <div class="form-row">
                <label>{t('username', lang())}</label>
                <input
                  maxlength={CARD_USERNAME_MAX}
                  value={username()}
                  onInput={(e) => setUsername(e.currentTarget.value)}
                />
              </div>
              <div class="form-row">
                <label>{t('url', lang())}</label>
                <div class="gen-row">
                  <input
                    maxlength={CARD_LINK_MAX}
                    value={link()}
                    onInput={(e) => {
                      setLink(e.currentTarget.value);
                      applyLinkIcon(e.currentTarget.value);
                    }}
                    placeholder="https://…"
                  />
                  <button
                    type="button"
                    class="icon-btn"
                    title={t('open_link', lang())}
                    aria-label={t('open_link', lang())}
                    data-testid="card-modal-open-link"
                    disabled={!link().trim()}
                    onClick={openCardLink}
                  >
                    <SvgIcon name="link" />
                  </button>
                </div>
                <Show when={appHintName()}>
                  <p class="form-helper">{t('app_link_hint', lang(), { name: appHintName() })}</p>
                </Show>
              </div>
            </div>

            <Show when={type() === 'PASSWORD'}>
              <div class="form-row" id="f-pass-row">
                <label>{t('password', lang())}</label>
                <Show when={!needsUnlock()} fallback={secretLockedField()}>
                  <div class="gen-row">
                    <input
                      type="password"
                      maxlength={CARD_PASSWORD_MAX}
                      {...SENSITIVE_INPUT_ATTRS}
                      value={secret()}
                      onInput={(e) => setSecret(e.currentTarget.value)}
                      onFocus={(e) => scrollActionsIntoView(e.currentTarget)}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      class="icon-btn"
                      disabled={!isWriteAllowed()}
                      onClick={handleGen}
                      title={t('generate', lang())}
                    >
                      <SvgIcon name="key" />
                    </button>
                  </div>
                </Show>
              </div>
            </Show>

            <Show when={type() === 'SECRET_PHRASE'}>
              <div class="form-row">
                <label>{t('seed_phrase', lang())}</label>
                <Show when={!needsUnlock()} fallback={secretLockedField()}>
                  <Index each={seedWords()}>
                    {(word, i) => (
                      <div class="gen-row" style={{ 'margin-bottom': '6px' }}>
                        <span
                          style={{
                            width: '28px',
                            'font-size': '11px',
                            'font-weight': '800',
                            color: 'var(--muted)',
                          }}
                        >
                          #{i + 1}
                        </span>
                        <input
                          data-testid="seed-word-input"
                          maxlength={CARD_PASSWORD_MAX}
                          {...SENSITIVE_INPUT_ATTRS}
                          value={word()}
                          onInput={(e) => {
                            const next = [...seedWords()];
                            next[i] = e.currentTarget.value;
                            setSeedWords(next);
                          }}
                          onFocus={(e) => scrollActionsIntoView(e.currentTarget)}
                        />
                      </div>
                    )}
                  </Index>
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm"
                    data-testid="add-seed-word"
                    onClick={() => setSeedWords([...seedWords(), ''])}
                  >
                    {t('add_phrase_word', lang())}
                  </button>
                </Show>
              </div>
            </Show>

            <Show when={type() === 'PASSWORD'}>
              <div class="form-row">
                <label>{t('otp_secret', lang())}</label>
                <Show when={!needsUnlock()} fallback={secretLockedField()}>
                  <input
                    {...SENSITIVE_INPUT_ATTRS}
                    value={otpSecret()}
                    onInput={(e) => handleOtpInput(e.currentTarget.value)}
                    onFocus={(e) => scrollActionsIntoView(e.currentTarget)}
                    placeholder="Base32 or otpauth://"
                  />
                </Show>
              </div>
            </Show>

            <div class="form-row">
              <label>{t('notes', lang())}</label>
              <textarea
                maxlength={CARD_NOTES_MAX}
                value={notes()}
                onInput={(e) => setNotes(e.currentTarget.value)}
                placeholder={t('notes', lang())}
                onFocus={(e) => scrollActionsIntoView(e.currentTarget)}
              />
            </div>

            <TagsEditor
              tags={tags}
              onChange={setTags}
              registerFlush={(flush) => {
                flushPendingTag = flush;
              }}
            />

            <Show when={needsUnlock()}>
              <p class="form-helper" data-testid="card-modal-save-helper">
                {t('unlock_to_save', lang())}
              </p>
            </Show>

            <div class="actions">
              <button type="button" class="btn btn-ghost btn-sm" onClick={closeCardModal}>
                {t('cancel', lang())}
              </button>
              <button
                type="button"
                class={`btn btn-primary btn-sm ${needsUnlock() ? 'save-btn-locked' : ''}`}
                disabled={saveDisabled()}
                onClick={handleSave}
                title={saveTitle()}
                aria-busy={saving()}
                data-testid="card-modal-save"
              >
                <Show when={saving()}>
                  <span class="btn-spinner" aria-hidden="true" />
                </Show>
                <Show when={needsUnlock() && !saving()}>
                  <SvgIcon name="lock" size={13} />
                </Show>
                {saving()
                  ? t('auth_busy_save', lang())
                  : needsUnlock()
                    ? t('unlock_to_save', lang())
                    : t('save', lang())}
              </button>
            </div>
          </div>
        </div>
      </Show>

      <IconPickerModal
        open={iconPickerOpen()}
        onSelect={(ic) => {
          setUserPickedIcon(true);
          setIcon(ic);
        }}
        onClose={() => setIconPickerOpen(false)}
      />
    </>
  );
}

export function CardModal() {
  return (
    <Show when={state.showCardModal}>
      <CardModalBody />
    </Show>
  );
}
