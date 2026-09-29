import type { JSX } from 'solid-js';

export type BadgeTone = 'password' | 'secret' | 'note' | 'clean' | 'breached' | 'error' | 'count';

interface Props {
  tone: BadgeTone;
  children: JSX.Element;
  class?: string;
  testId?: string;
  title?: string;
}

/** Filled pill for card type, HIBP, and link-group counts. */
export function Badge(props: Props) {
  return (
    <span
      class={`badge ${props.tone}${props.class ? ` ${props.class}` : ''}`}
      data-testid={props.testId}
      title={props.title}
    >
      {props.children}
    </span>
  );
}
