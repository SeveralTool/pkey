import { describe, it, expect } from 'vitest';
import { render } from '@solidjs/testing-library';
import { VaultCard } from './VaultCard';
import { getSecretStore } from '../state/appStore';
import type { DisplayCard } from '@pkey/core';

const mockCard: DisplayCard = {
  id: 'test-1',
  type: 'PASSWORD',
  title: 'Test',
  icon: { type: 'icon', value: 'key-outline' },
  username: 'user',
  passwordList: [],
  link: '',
  notes: '',
  creation_date: '',
  last_update: '',
  _hasSecret: true,
};

const noteCard: DisplayCard = {
  ...mockCard,
  id: 'note-1',
  type: 'NOTE',
  notes: 'private memo',
  _hasSecret: false,
};

describe('VaultCard', () => {
  it('never puts password in rendered HTML', () => {
    getSecretStore().set('test-1', ['hunter2']);
    const { container } = render(() => (
      <VaultCard card={mockCard} expanded={true} onToggle={() => {}} />
    ));
    expect(container.innerHTML).not.toContain('hunter2');
    expect(container.innerHTML).toContain('••••••••');
  });

  it('labels NOTE cards as notes and hides the password row', () => {
    const { container } = render(() => (
      <VaultCard card={noteCard} expanded={true} onToggle={() => {}} />
    ));
    const chip = container.querySelector('[data-testid="card-type-chip"]');
    expect(chip?.textContent).toBe('note');
    expect(chip?.className).toContain('badge');
    expect(container.innerHTML).not.toContain('••••••••');
    expect(container.textContent).toContain('private memo');
    expect(container.querySelector('[data-testid="copy-notes"]')).toBeTruthy();
  });

  it('renders user tags as outlined chips', () => {
    const { container } = render(() => (
      <VaultCard card={{ ...mockCard, tags: ['work'] }} expanded={false} onToggle={() => {}} />
    ));
    const chip = container.querySelector('.tag-chip');
    expect(chip?.textContent).toBe('work');
  });
});
