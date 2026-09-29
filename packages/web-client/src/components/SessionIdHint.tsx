import { Show } from 'solid-js';
import { state, lang, t } from '../state/appStore';

function formatCreated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(lang() === 'ESP' ? 'es' : 'en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Small public vault-session label (phone Security / PWA login / vault).
 * Informational only — not a credential.
 */
export function SessionIdHint(props: { class?: string }) {
  const created = () => (state.sessionCreatedAt ? formatCreated(state.sessionCreatedAt) : '');
  const line = () => {
    if (!state.sessionRef) return '';
    const date = created();
    return date ? `${state.sessionRef} · ${date}` : state.sessionRef;
  };
  return (
    <Show when={state.sessionRef}>
      <p
        class={`session-id-hint ${props.class ?? ''}`.trim()}
        title={t('session_id_label', lang())}
      >
        {t('session_id_label', lang())} {line()}
      </p>
    </Show>
  );
}
