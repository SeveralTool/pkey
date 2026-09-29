import { createSignal, createEffect, Show } from 'solid-js';
import type { CardIcon } from '@pkey/core';
import { guessEmoji, resolveCardIcon } from '@pkey/core';
import { presetIconDataUri } from './presetIconDataUris';

interface Props {
  icon?: CardIcon;
  title: string;
  link?: string;
}

export function CardIconView(props: Props) {
  const [failed, setFailed] = createSignal(false);

  const resolved = () => resolveCardIcon(props.icon, props.link);

  createEffect(() => {
    const icon = resolved();
    const identity = icon.type === 'image' ? icon.uri : icon.value;
    void identity;
    setFailed(false);
  });

  const presetSrc = () => {
    const icon = resolved();
    if (icon.type === 'icon' && icon.value) return presetIconDataUri(icon.value);
    return undefined;
  };

  const imageSrc = () => {
    const icon = resolved();
    return icon.type === 'image' && icon.uri ? icon.uri : '';
  };

  return (
    <Show
      when={!failed() && imageSrc()}
      fallback={
        <Show
          when={!failed() && presetSrc()}
          fallback={<span class="card-icon-emoji">{guessEmoji(props.title, props.link)}</span>}
        >
          <img
            class="card-icon-img"
            src={presetSrc()!}
            alt=""
            loading="lazy"
            onError={() => setFailed(true)}
          />
        </Show>
      }
    >
      <img
        class="card-icon-img"
        src={imageSrc()}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </Show>
  );
}
