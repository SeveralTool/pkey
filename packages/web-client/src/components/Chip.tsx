import { Show, type JSX } from 'solid-js';

interface Props {
  children: JSX.Element;
  editable?: boolean;
  onRemove?: () => void;
  removeLabel?: string;
}

/** Outlined user-tag chip. Keep `.tag-chip` for e2e selectors. */
export function Chip(props: Props) {
  return (
    <span class={`chip tag-chip${props.editable ? ' chip-editable tag-chip-editable' : ''}`}>
      {props.children}
      <Show when={props.editable && props.onRemove}>
        <button
          type="button"
          class="chip-remove tag-chip-remove"
          aria-label={props.removeLabel}
          onClick={() => props.onRemove?.()}
        >
          ×
        </button>
      </Show>
    </span>
  );
}
