/**
 * @fileoverview Solid error boundary for the LAN PWA (mirrors mobile AppErrorBoundary).
 */
import { ErrorBoundary, Show, createSignal, type JSX } from 'solid-js';
import { languageFromLocaleTag, t, type WebLang } from '@pkey/core';

function uiLang(): WebLang {
  return languageFromLocaleTag(typeof navigator !== 'undefined' ? navigator.language : 'en');
}

function Fallback(props: { err: unknown }) {
  const [copied, setCopied] = createSignal(false);
  const lang = uiLang();
  const error = () => (props.err instanceof Error ? props.err : new Error(String(props.err)));
  const details = () =>
    [`class: ${error().name}`, `message: ${error().message}`, `stack: ${error().stack ?? ''}`].join(
      '\n'
    );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(details());
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div style={{ padding: '24px', 'max-width': '40rem', margin: '10vh auto', color: '#e5e7eb' }}>
      <h1 style={{ color: '#f87171', 'font-size': '1.25rem' }}>{t('crash_title', lang)}</h1>
      <p style={{ 'line-height': '1.5' }}>{t('crash_body', lang)}</p>
      <p style={{ color: '#9ca3af', 'font-family': 'monospace', 'font-size': '0.85rem' }}>
        error class: {error().name}
      </p>
      <button type="button" onClick={() => void copy()}>
        {copied() ? t('crash_copied', lang) : t('crash_copy_details', lang)}
      </button>
      <Show when={copied()}>
        <pre style={{ 'white-space': 'pre-wrap', color: '#9ca3af', 'font-size': '0.75rem' }}>
          {error().message}
        </pre>
      </Show>
    </div>
  );
}

/** Catches render errors in the PWA tree without leaking vault fields in the default UI. */
export function AppErrorBoundary(props: { children: JSX.Element }) {
  return <ErrorBoundary fallback={(err) => <Fallback err={err} />}>{props.children}</ErrorBoundary>;
}
