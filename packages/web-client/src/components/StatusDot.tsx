/**
 * Connection / sync status disc shared by login, vault header, and discovery.
 */
export type StatusTone =
  | 'idle'
  | 'pending'
  | 'ok'
  | 'err'
  | 'synced'
  | 'syncing'
  | 'offline'
  | 'readonly';

interface Props {
  tone?: StatusTone;
  class?: string;
}

export function StatusDot(props: Props) {
  const tone = () => props.tone ?? 'idle';
  return <span class={`status-dot ${tone()}${props.class ? ` ${props.class}` : ''}`} />;
}
