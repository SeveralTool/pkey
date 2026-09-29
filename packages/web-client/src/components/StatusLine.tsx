import type { JSX } from 'solid-js';
import { StatusDot, type StatusTone } from './StatusDot';

interface Props {
  tone?: StatusTone;
  children: JSX.Element;
  class?: string;
  labelClass?: string;
  role?: 'status';
}

/**
 * Dot + label row for connection and sync chrome (not a chip).
 */
export function StatusLine(props: Props) {
  return (
    <div class={`status-line${props.class ? ` ${props.class}` : ''}`} role={props.role}>
      <StatusDot tone={props.tone} />
      <span class={props.labelClass}>{props.children}</span>
    </div>
  );
}
