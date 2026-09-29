import { Show, createSignal, onCleanup } from 'solid-js';
import type { DisplayCard } from '@pkey/core';
import {
  collectIdentities,
  displayLabel,
  displayUrl,
  resolveOpenableUrl,
} from '@pkey/core';
import {
  state,
  lang,
  t,
  isRevealed,
  revealSecret,
  hideSecret,
  copySecret,
  copyUsername,
  copyNotes,
  copyOtp,
  getOtpCode,
  revealOtp,
  hideOtp,
  isOtpRevealed,
  getOtpRemaining,
  deleteCard,
  openEditModal,
  isWriteAllowed,
  getSecretValue,
  showToast,
} from '../state/appStore';
import { CardIconView } from './CardIconView';
import { SvgIcon } from './SvgIcon';
import { TagChips } from './TagChips';
import { Badge, type BadgeTone } from './Badge';

interface Props {
  card: DisplayCard;
  expanded: boolean;
  onToggle: () => void;
}

function openLink(link: string, uris?: string[]) {
  const url = resolveOpenableUrl(link, uris);
  if (!url) {
    showToast(t('link_blocked', lang()), 'error');
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function VaultCard(props: Props) {
  const isSeed = () => props.card.type === 'SECRET_PHRASE';
  const isNote = () => props.card.type === 'NOTE';
  const revealed = () => isRevealed(props.card.id);
  const otpRevealed = () => isOtpRevealed(props.card.id);
  const [otpSec, setOtpSec] = createSignal(getOtpRemaining(props.card.id));
  const otpTimer = setInterval(() => setOtpSec(getOtpRemaining(props.card.id)), 1000);
  onCleanup(() => clearInterval(otpTimer));
  const typeTone = (): BadgeTone => (isSeed() ? 'secret' : isNote() ? 'note' : 'password');
  const tagLabel = () =>
    isSeed() ? t('tag_seed', lang()) : isNote() ? t('tag_note', lang()) : t('tag_pass', lang());

  const hibpEnabled = () =>
    state.settings.enableHibpCheck === true && props.card.type === 'PASSWORD';
  const hibpKind = () => {
    if (!hibpEnabled()) return null;
    return props.card.hibp?.status ?? null;
  };
  const hibpLabel = () => {
    if (!hibpEnabled()) return null;
    const hibp = props.card.hibp;
    if (!hibp) return null;
    switch (hibp.status) {
      case 'breached':
        return t('hibp_breached', lang(), { n: hibp.count ?? 0 });
      case 'clean':
        return t('hibp_verified', lang());
      case 'error':
        return t('hibp_unavailable', lang());
      default:
        return null;
    }
  };
  const hibpTone = (): BadgeTone | null => {
    const kind = hibpKind();
    if (kind === 'clean' || kind === 'breached' || kind === 'error') return kind;
    return null;
  };

  return (
    <div class={`card ${props.expanded ? 'expanded' : ''}`} data-id={props.card.id}>
      <div class="card-header" onClick={props.onToggle}>
        <div class="card-icon">
          <CardIconView icon={props.card.icon} title={props.card.title} link={props.card.link} />
        </div>
        <div class="card-info">
          <div class="card-title">{props.card.title}</div>
          <div class="card-sub">{props.card.username || '—'}</div>
          <TagChips tags={props.card.tags ?? []} ariaLabel={t('card_tags_label', lang())} />
        </div>
        <Badge tone={typeTone()} testId="card-type-chip">
          {tagLabel()}
        </Badge>
        <Show when={hibpLabel()}>
          {(label) => {
            const tone = hibpTone();
            return tone ? (
              <Badge tone={tone} title={label()}>
                {label()}
              </Badge>
            ) : null;
          }}
        </Show>
        <span class="card-chevron">
          <SvgIcon name="chevron" size={16} />
        </span>
      </div>

      <Show when={props.expanded}>
        <div class="card-body">
          <Show when={props.card.username}>
            <div class="field">
              <label>{t('username', lang())}</label>
              <div class="field-value">
                <span>{props.card.username}</span>
                <button
                  type="button"
                  class="icon-btn"
                  title={t('copied', lang())}
                  onClick={(e) => {
                    e.stopPropagation();
                    copyUsername(props.card.id);
                  }}
                >
                  <SvgIcon name="copy" />
                </button>
              </div>
            </div>
          </Show>

          <Show when={!isNote()}>
            <div class="field">
              <label>{isSeed() ? t('seed_phrase', lang()) : t('password', lang())}</label>
              <div class={`field-value password ${revealed() ? '' : 'hidden'}`}>
                <Show when={revealed()} fallback={<span class="secret-mask">••••••••••••</span>}>
                  <span>{getSecretValue(props.card.id, isSeed())}</span>
                </Show>
                <button
                  type="button"
                  class="icon-btn"
                  title={revealed() ? t('hide', lang()) : t('show', lang())}
                  onClick={(e) => {
                    e.stopPropagation();
                    revealed() ? hideSecret(props.card.id) : revealSecret(props.card.id, isSeed());
                  }}
                >
                  <SvgIcon name={revealed() ? 'hide' : 'eye'} />
                </button>
                <button
                  type="button"
                  class="icon-btn"
                  title={t('copied', lang())}
                  onClick={(e) => {
                    e.stopPropagation();
                    copySecret(props.card.id, isSeed());
                  }}
                >
                  <SvgIcon name="copy" />
                </button>
              </div>
            </div>
          </Show>

          <Show when={!isNote() && props.card._hasOtp}>
            <div class="field">
              <label>{t('otp_code', lang())}</label>
              <div class={`field-value password ${otpRevealed() ? '' : 'hidden'}`}>
                <Show
                  when={otpRevealed()}
                  fallback={
                    <span class="secret-mask">{'•'.repeat(props.card.otpDigits ?? 6)}</span>
                  }
                >
                  <span class="otp-code">{getOtpCode(props.card.id)}</span>
                </Show>
                <button
                  type="button"
                  class="icon-btn"
                  title={otpRevealed() ? t('hide', lang()) : t('show', lang())}
                  onClick={(e) => {
                    e.stopPropagation();
                    otpRevealed() ? hideOtp(props.card.id) : revealOtp(props.card.id);
                  }}
                >
                  <SvgIcon name={otpRevealed() ? 'hide' : 'eye'} />
                </button>
                <button
                  type="button"
                  class="icon-btn"
                  aria-label={t('otp_copy', lang())}
                  onClick={(e) => {
                    e.stopPropagation();
                    copyOtp(props.card.id);
                  }}
                >
                  <SvgIcon name="copy" />
                </button>
              </div>
              <span class="otp-countdown">{t('otp_countdown', lang(), { n: otpSec() })}</span>
            </div>
          </Show>

          <Show when={props.card.link}>
            <div class="field">
              <label>{t('url', lang())}</label>
              <div class="field-value">
                <span>
                  {displayUrl(collectIdentities(props.card.link, props.card.uris), props.card.link) ||
                    displayLabel(collectIdentities(props.card.link, props.card.uris), props.card.link)}
                </span>
                <button
                  type="button"
                  class="icon-btn"
                  title={t('open_link', lang())}
                  onClick={(e) => {
                    e.stopPropagation();
                    openLink(props.card.link, props.card.uris);
                  }}
                >
                  <SvgIcon name="link" />
                </button>
              </div>
            </div>
          </Show>

          <Show when={props.card.notes}>
            <div class="field">
              <label>{t('notes', lang())}</label>
              <div class="field-value">
                <span style={{ 'white-space': 'pre-wrap', 'font-family': 'inherit' }}>
                  {props.card.notes}
                </span>
                <button
                  type="button"
                  class="icon-btn"
                  data-testid="copy-notes"
                  title={t('copied', lang())}
                  onClick={(e) => {
                    e.stopPropagation();
                    copyNotes(props.card.notes);
                  }}
                >
                  <SvgIcon name="copy" />
                </button>
              </div>
            </div>
          </Show>

          <div class="card-actions">
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              disabled={!isWriteAllowed()}
              onClick={(e) => {
                e.stopPropagation();
                openEditModal(props.card.id);
              }}
            >
              <SvgIcon name="edit" size={13} />
              {t('edit', lang())}
            </button>
            <button
              type="button"
              class="btn btn-danger-ghost btn-sm"
              disabled={!isWriteAllowed()}
              onClick={(e) => {
                e.stopPropagation();
                deleteCard(props.card.id);
              }}
            >
              <SvgIcon name="delete" size={13} />
              {t('delete', lang())}
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
