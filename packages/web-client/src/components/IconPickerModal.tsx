import { For, Show } from 'solid-js';
import type { CardIcon } from '@pkey/core';
import { PRESET_ICONS } from '@pkey/core';
import { lang, t } from '../state/appStore';
import { CardIconView } from './CardIconView';

interface Props {
  open: boolean;
  onSelect: (icon: CardIcon) => void;
  onClose: () => void;
}

export function IconPickerModal(props: Props) {
  return (
    <Show when={props.open}>
      <div
        class="modal-backdrop open"
        onClick={(e) => e.target === e.currentTarget && props.onClose()}
      >
        <div class="modal sheet" role="dialog">
          <h2>{t('icon_picker_title', lang())}</h2>
          <div class="icon-grid">
            <For each={[...PRESET_ICONS]}>
              {(item) => (
                <button
                  type="button"
                  class="icon-grid-item"
                  onClick={() => {
                    props.onSelect({ type: 'icon', value: item.key });
                    props.onClose();
                  }}
                >
                  <CardIconView icon={{ type: 'icon', value: item.key }} title={item.label} />
                  <span>{item.label}</span>
                </button>
              )}
            </For>
          </div>
          <div class="actions">
            <button type="button" class="btn btn-ghost btn-sm" onClick={props.onClose}>
              {t('cancel', lang())}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
