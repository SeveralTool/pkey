import type { JSX } from 'solid-js';
import type { AlertTone } from './Banner';

interface Props {
  tone?: AlertTone;
  layout?: 'block' | 'row' | 'stack';
  class?: string;
  role?: 'status';
  children: JSX.Element;
}

/** Inset callout for login (11px, radius-lg). Mirror of `.lan-warning`. */
export function Notice(props: Props) {
  const layout = () => props.layout ?? 'block';
  const classes = () =>
    ['notice', `tone-${props.tone ?? 'warning'}`, layout() === 'block' ? '' : layout(), props.class ?? '']
      .filter(Boolean)
      .join(' ');

  return (
    <div class={classes()} role={props.role}>
      {props.children}
    </div>
  );
}
