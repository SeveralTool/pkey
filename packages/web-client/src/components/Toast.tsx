import { Show } from 'solid-js';
import { state } from '../state/appStore';

export function Toast() {
  return (
    <Show when={state.toast}>
      {(toast) => (
        <div class={`toast show ${toast().type === 'error' ? 'error' : 'success'}`}>
          {toast().msg}
        </div>
      )}
    </Show>
  );
}
