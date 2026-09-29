import { For, Show, createSignal, onMount } from 'solid-js';
import { normalizeTags } from '@pkey/core';
import { lang, t } from '../state/appStore';
import { Chip } from './Chip';

interface Props {
  tags: () => string[];
  onChange: (tags: string[]) => void;
  /** Lets the parent commit typed-but-unconfirmed input (e.g. on Save). */
  registerFlush?: (flush: () => void) => void;
}

export function TagsEditor(props: Props) {
  let inputEl!: HTMLInputElement;
  const [input, setInput] = createSignal('');

  const addTag = () => {
    const trimmed = input().trim();
    if (!trimmed) return;
    const current = props.tags();
    const next = normalizeTags([...current, trimmed]);
    props.onChange(next);
    setInput('');
    inputEl?.focus();
  };

  onMount(() => {
    props.registerFlush?.(addTag);
  });

  const removeTag = (tag: string) => {
    props.onChange(props.tags().filter((t) => t !== tag));
  };

  return (
    <div class="form-row">
      <label>{t('card_tags_label', lang())}</label>
      <div class="tags-editor-input-row">
        <input
          ref={inputEl}
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
          placeholder={t('card_tags_placeholder', lang())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag();
            }
          }}
        />
        <button
          type="button"
          class="icon-btn"
          aria-label={t('card_tags_add_hint', lang())}
          onClick={addTag}
        >
          +
        </button>
      </div>
      <span class="tags-editor-hint">{t('card_tags_add_hint', lang())}</span>
      <Show when={props.tags().length > 0}>
        <div class="tags-editor-list" aria-live="polite">
          <For each={props.tags()}>
            {(tag) => (
              <Chip
                editable
                removeLabel={t('card_tags_remove', lang(), { name: tag })}
                onRemove={() => removeTag(tag)}
              >
                {tag}
              </Chip>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
