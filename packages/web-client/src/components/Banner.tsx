import type { JSX } from 'solid-js';

export type AlertTone = 'warning' | 'danger' | 'info';

interface Props {
  tone?: AlertTone;
  stacked?: boolean;
  class?: string;
  role?: 'status';
  children: JSX.Element;
}

/** Full-bleed vault strip (12px). Do not use inside `.login-box`. */
export function Banner(props: Props) {
  const classes = () =>
    [
      'banner',
      `tone-${props.tone ?? 'warning'}`,
      props.stacked ? 'stack' : '',
      props.class ?? '',
    ]
      .filter(Boolean)
      .join(' ');

  return (
    <div class={classes()} role={props.role ?? 'status'}>
      {props.children}
    </div>
  );
}
