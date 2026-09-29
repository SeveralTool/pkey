import { For, Show } from 'solid-js';
import { Chip } from './Chip';

interface Props {
  tags: readonly string[];
  ariaLabel?: string;
}

export function TagChips(props: Props) {
  return (
    <Show when={props.tags.length > 0}>
      <div class="card-tags-row" aria-label={props.ariaLabel}>
        <For each={props.tags}>{(tag) => <Chip>{tag}</Chip>}</For>
      </div>
    </Show>
  );
}
