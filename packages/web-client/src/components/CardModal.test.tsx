import { describe, it, expect, afterEach } from 'vitest';
import { fireEvent, render, waitFor } from '@solidjs/testing-library';
import { createRoot } from 'solid-js';
import { CardModal } from './CardModal';
import {
  closeCardModal,
  getSecretStore,
  openEditModal,
  state,
  __setStateForTests,
} from '../state/appStore';
import type { DisplayCard } from '@pkey/core';

const cardA: DisplayCard = {
  id: 'edit-1',
  type: 'PASSWORD',
  title: 'Locked Card',
  icon: { type: 'icon', value: 'key-outline' },
  username: 'user',
  passwordList: [],
  link: '',
  notes: '',
  creation_date: '',
  last_update: '',
  _hasSecret: true,
};

const cardB: DisplayCard = {
  ...cardA,
  id: 'edit-2',
  title: 'Second Card',
};

/** Writable offline session (no live WebSocket required). */
function writableOffline(patch: Record<string, unknown> = {}) {
  __setStateForTests({
    authenticated: false,
    connState: 'offline',
    passwordHash: 'local-hash',
    ...patch,
  });
}

describe('CardModal locked edit', () => {
  afterEach(() => {
    closeCardModal();
    getSecretStore().clear();
    __setStateForTests({
      showCardModal: false,
      editingId: null,
      editSecretsUnlocked: false,
      cards: [],
      authenticated: false,
      connState: 'disconnected',
      passwordHash: null,
    });
  });

  it('keeps Save enabled with locked secret fields and no field unlock CTAs', async () => {
    getSecretStore().set('edit-1', ['real-password'], 'JBSWY3DPEHPK3PXP');

    await new Promise<void>((resolve) => {
      createRoot((dispose) => {
        writableOffline({
          cards: [cardA],
          showCardModal: true,
          editingId: 'edit-1',
          editSecretsUnlocked: false,
        });

        const { container, unmount } = render(() => <CardModal />);
        const save = container.querySelector(
          '[data-testid="card-modal-save"]'
        ) as HTMLButtonElement;
        expect(save).toBeTruthy();
        expect(save.disabled).toBe(false);
        expect(save.textContent).toContain('Unlock to save');

        expect(container.querySelector('[data-testid="card-modal-unlock"]')).toBeNull();
        expect(container.querySelectorAll('[data-testid="card-modal-secret-locked"]').length).toBeGreaterThan(
          0
        );
        expect(container.querySelector('[data-testid="card-modal-save-helper"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="card-modal-open-link"]')).toBeTruthy();

        const otpInput = container.querySelector(
          'input[placeholder="Base32 or otpauth://"]'
        ) as HTMLInputElement | null;
        expect(otpInput).toBeNull();

        expect(container.innerHTML).not.toContain('real-password');
        expect(container.innerHTML).not.toContain('JBSWY3DPEHPK3PXP');

        unmount();
        dispose();
        resolve();
      });
    });
  });

  it('enables Save after secrets are unlocked', async () => {
    getSecretStore().set('edit-1', ['real-password'], '');

    await new Promise<void>((resolve) => {
      createRoot((dispose) => {
        writableOffline({
          cards: [cardA],
          showCardModal: true,
          editingId: 'edit-1',
          editSecretsUnlocked: true,
        });

        const { container, unmount } = render(() => <CardModal />);
        const save = container.querySelector(
          '[data-testid="card-modal-save"]'
        ) as HTMLButtonElement;
        expect(save.disabled).toBe(false);
        expect(container.querySelector('[data-testid="card-modal-secret-locked"]')).toBeNull();
        expect(container.querySelector('[data-testid="card-modal-unlock"]')).toBeNull();

        unmount();
        dispose();
        resolve();
      });
    });
  });

  it('disables type pills when a PASSWORD card already has a secret', async () => {
    getSecretStore().set('edit-1', ['real-password'], '');

    await new Promise<void>((resolve) => {
      createRoot((dispose) => {
        writableOffline({
          cards: [cardA],
          showCardModal: true,
          editingId: 'edit-1',
          editSecretsUnlocked: true,
        });

        const { container, unmount } = render(() => <CardModal />);
        const seed = container.querySelector(
          '[data-testid="type-pill-seed"]'
        ) as HTMLButtonElement;
        const note = container.querySelector(
          '[data-testid="type-pill-note"]'
        ) as HTMLButtonElement;
        expect(seed.disabled).toBe(true);
        expect(note.disabled).toBe(true);

        unmount();
        dispose();
        resolve();
      });
    });
  });

  it('disables type pills for any existing card, even without a secret', async () => {
    getSecretStore().set('edit-1', [''], '');

    await new Promise<void>((resolve) => {
      createRoot((dispose) => {
        writableOffline({
          cards: [{ ...cardA, _hasSecret: false }],
          showCardModal: true,
          editingId: 'edit-1',
          editSecretsUnlocked: true,
        });

        const { container, unmount } = render(() => <CardModal />);
        const seed = container.querySelector(
          '[data-testid="type-pill-seed"]'
        ) as HTMLButtonElement;
        const note = container.querySelector(
          '[data-testid="type-pill-note"]'
        ) as HTMLButtonElement;
        expect(seed.disabled).toBe(true);
        expect(note.disabled).toBe(true);

        unmount();
        dispose();
        resolve();
      });
    });
  });

  it('disables type pills for an existing SECRET_PHRASE card', async () => {
    getSecretStore().set('edit-1', ['abandon', 'ability'], '');
    writableOffline({
      cards: [{ ...cardA, type: 'SECRET_PHRASE', _hasSecret: true }],
      showCardModal: true,
      editingId: 'edit-1',
      editSecretsUnlocked: true,
    });

    const { container, unmount } = render(() => <CardModal />);
    const pass = (await waitFor(() => {
      const el = container.querySelector('[data-testid="type-pill-password"]');
      expect(el).toBeTruthy();
      expect((el as HTMLButtonElement).disabled).toBe(true);
      return el as HTMLButtonElement;
    })) as HTMLButtonElement;
    const note = container.querySelector('[data-testid="type-pill-note"]') as HTMLButtonElement;
    expect(pass.disabled).toBe(true);
    expect(note.disabled).toBe(true);
    unmount();
  });

  it('resets unlock on close so the next edit modal starts locked', async () => {
    getSecretStore().set('edit-1', ['pw-a'], '');
    getSecretStore().set('edit-2', ['pw-b'], '');

    writableOffline({
      cards: [cardA, cardB],
      showCardModal: true,
      editingId: 'edit-1',
      editSecretsUnlocked: true,
    });
    expect(state.editSecretsUnlocked).toBe(true);

    closeCardModal();
    expect(state.showCardModal).toBe(false);
    expect(state.editSecretsUnlocked).toBe(false);

    openEditModal('edit-2');
    expect(state.showCardModal).toBe(true);
    expect(state.editingId).toBe('edit-2');
    expect(state.editSecretsUnlocked).toBe(false);

    await new Promise<void>((resolve) => {
      createRoot((dispose) => {
        const { container, unmount } = render(() => <CardModal />);
        const save = container.querySelector(
          '[data-testid="card-modal-save"]'
        ) as HTMLButtonElement;
        expect(save.disabled).toBe(false);
        expect(container.querySelector('[data-testid="card-modal-unlock"]')).toBeNull();
        expect(container.querySelector('[data-testid="card-modal-secret-locked"]')).toBeTruthy();
        expect(container.innerHTML).not.toContain('pw-b');
        unmount();
        dispose();
        resolve();
      });
    });
  });

  it('keeps focus on a seed-word input while typing', async () => {
    getSecretStore().set('edit-1', ['abandon'], '');
    writableOffline({
      cards: [{ ...cardA, type: 'SECRET_PHRASE' }],
      showCardModal: true,
      editingId: 'edit-1',
      editSecretsUnlocked: true,
    });

    const { container, unmount } = render(() => <CardModal />);
    const input = (await waitFor(() => {
      const el = container.querySelector('[data-testid="seed-word-input"]');
      expect(el).toBeTruthy();
      return el as HTMLInputElement;
    })) as HTMLInputElement;

    fireEvent.input(input, { target: { value: 'ability' } });

    expect(container.querySelector('[data-testid="seed-word-input"]')).toBe(input);
    expect(input.value).toBe('ability');
    unmount();
  });
});
