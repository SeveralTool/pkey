import { For, Show, type JSX } from 'solid-js';
import type { DisplayCard } from '@pkey/core';
import { lang, t } from '../state/appStore';
import { Badge } from './Badge';
import { CardIconView } from './CardIconView';
import { SvgIcon } from './SvgIcon';
import { VaultCard } from './VaultCard';

interface Props {
  label: string;
  cards: DisplayCard[];
  expanded: boolean;
  onToggle: () => void;
  expandedIds: ReadonlySet<string>;
  onToggleCard: (id: string) => void;
}

export function VaultLinkGroup(props: Props): JSX.Element {
  const count = () => props.cards.length;
  const accountsLabel = () => t('group_by_link_accounts', lang(), { n: count() });
  const lead = () => props.cards[0];

  return (
    <div class={`card link-group ${props.expanded ? 'expanded' : ''}`}>
      <div class="card-header" onClick={props.onToggle} role="button">
        <div class="card-icon">
          <Show when={lead()}>
            {(card) => (
              <CardIconView icon={card().icon} title={props.label} link={card().link} />
            )}
          </Show>
        </div>
        <div class="card-info">
          <div class="card-title">{props.label}</div>
          <div class="card-sub">{accountsLabel()}</div>
        </div>
        <Badge tone="count">{count()}</Badge>
        <span class="card-chevron">
          <SvgIcon name="chevron" size={16} />
        </span>
      </div>

      <Show when={props.expanded}>
        <div class="link-group-body">
          <For each={props.cards}>
            {(card) => (
              <VaultCard
                card={card}
                expanded={props.expandedIds.has(card.id)}
                onToggle={() => props.onToggleCard(card.id)}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
