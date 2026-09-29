/**
 * Hot-reconnect after the master moves. The PWA is served from master A so the
 * page origin never changes (IndexedDB / localStorage stay). Master B stands
 * in for the new address — a second port on 127.0.0.1, not 127.0.0.2 (that
 * address needs an lo0 alias on macOS).
 *
 * Sweep coverage uses 127.0.0.2:7392 when the OS lets us bind it; otherwise
 * that spec is skipped (unit tests already cover the /24 walker).
 */
import { test, expect, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import { createMockMaster, type MockMaster } from '../dev/mockMasterReconnect';

const A_PORT = 7392;
const B_PORT = 7393;
const PASSWORD = 'test';
const CARD_TITLE = 'reconnect-keep';

async function login(page: Page) {
  await page.goto('/');
  const password = page.locator('#login-screen input[type="password"]');
  await expect(password).toBeVisible({ timeout: 15_000 });
  await password.fill(PASSWORD);
  await page.locator('#login-screen .btn-primary').click();
  await expect(page.locator('#vault-screen')).toBeVisible({ timeout: 15_000 });
}

async function addCard(page: Page, title: string) {
  await page.getByRole('button', { name: /add first key|agregar primera/i }).click();
  await page.locator('.form-row', { hasText: /title|título/i }).locator('input').fill(title);
  await page.locator('#f-pass-row input[type="password"]').fill('secret');
  await page.getByRole('button', { name: /save|guardar/i }).click();
  await expect(page.locator('.card-title', { hasText: title })).toBeVisible({ timeout: 10_000 });
}

async function waitForAuth(master: MockMaster, timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (master.authSessions > 0) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`master on :${master.port} never authenticated a session`);
}

async function canBind(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createServer();
    s.once('error', () => resolve(false));
    s.listen(port, host, () => {
      s.close(() => resolve(true));
    });
  });
}

test.describe.configure({ mode: 'serial' });

test('mDNS path: rotates the socket to the other port without changing origin', async ({
  page,
}) => {
  const a = await createMockMaster({
    port: A_PORT,
    mdnsHost: `127.0.0.1:${B_PORT}`,
    ip: '127.0.0.1',
  });
  const b = await createMockMaster({
    port: B_PORT,
    mdnsHost: `127.0.0.1:${B_PORT}`,
    ip: '127.0.0.1',
  });
  try {
    await login(page);
    await addCard(page, CARD_TITLE);
    expect(page.url()).toMatch(new RegExp(`127\\.0\\.0\\.1:${A_PORT}`));

    const probesBefore = b.probeHits;
    await a.close();
    await waitForAuth(b);
    expect(b.probeHits).toBeGreaterThan(probesBefore);
    expect(page.url()).toMatch(new RegExp(`127\\.0\\.0\\.1:${A_PORT}`));
    await expect(page.locator('.card-title', { hasText: CARD_TITLE })).toBeVisible();
    await expect(page.locator('#vault-screen')).toBeVisible();
  } finally {
    await b.close();
    await a.close().catch(() => {});
  }
});

test('sweep path: finds the master on 127.0.0.2 when the OS allows that bind', async ({
  page,
}) => {
  test.skip(
    !(await canBind('127.0.0.2', A_PORT)),
    '127.0.0.2 is not bindable on this OS (macOS needs `ifconfig lo0 alias`)'
  );

  const a = await createMockMaster({
    port: A_PORT,
    mdnsHost: 'pkey-test.local',
    ip: '127.0.0.1',
  });
  const b = await createMockMaster({
    host: '127.0.0.2',
    port: A_PORT,
    mdnsHost: 'pkey-test.local',
    ip: '127.0.0.2',
  });
  try {
    await login(page);
    await addCard(page, CARD_TITLE);
    const probesBefore = b.probeHits;
    await a.close();
    await waitForAuth(b, 40_000);
    expect(b.probeHits).toBeGreaterThan(probesBefore);
    expect(page.url()).toMatch(new RegExp(`127\\.0\\.0\\.1:${A_PORT}`));
    await expect(page.locator('.card-title', { hasText: CARD_TITLE })).toBeVisible();
  } finally {
    await b.close();
    await a.close().catch(() => {});
  }
});

test('microcut: reconnects to the same host with zero discovery probes', async ({ page }) => {
  const a = await createMockMaster({
    port: A_PORT,
    mdnsHost: 'pkey-test.local',
    ip: '127.0.0.1',
  });
  try {
    await login(page);
    await addCard(page, CARD_TITLE);
    expect(a.probeHits).toBe(0);
    a.closeAllSockets();
    await waitForAuth(a);
    expect(a.probeHits).toBe(0);
    expect(page.url()).toMatch(new RegExp(`127\\.0\\.0\\.1:${A_PORT}`));
    await expect(page.locator('.card-title', { hasText: CARD_TITLE })).toBeVisible();
  } finally {
    await a.close();
  }
});
