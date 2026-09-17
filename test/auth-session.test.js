import test from 'node:test';
import assert from 'node:assert/strict';

import { canAutoLogin } from '../src/auth-session.js';

test('auto login requires env-provided email and password', () => {
  assert.equal(canAutoLogin({}), false);
  assert.equal(canAutoLogin({ CONTINENTE_EMAIL: 'user@example.com' }), false);
  assert.equal(canAutoLogin({ CONTINENTE_PASSWORD: 'secret' }), false);
  assert.equal(canAutoLogin({
    CONTINENTE_EMAIL: 'user@example.com',
    CONTINENTE_PASSWORD: 'secret'
  }), true);
});

test('refresh verifies the same custom cookie file that automatic login writes', async (t) => {
  const { mkdtempSync, existsSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { chromium } = await import('playwright');
  const { refreshAuthCookies } = await import('../src/auth-session.js');
  const dir = mkdtempSync(join(tmpdir(), 'continente-auth-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const cookieFile = join(dir, 'custom', 'session.json');
  const frame = {
    url: () => 'https://login.continente.pt/user-register',
    waitForSelector: async () => ({ fill: async () => {} }),
    $: async () => ({ click: async () => {} }),
  };
  const context = {
    cookies: async () => [],
    request: { get: async () => ({ ok: () => true, json: async () => ({ resources: { customerAuthenticated: true } }) }) },
    newPage: async () => ({
      goto: async () => ({ ok: () => true }),
      url: () => 'https://www.continente.pt/conta/encomendas/',
      getByRole: () => ({ click: async () => {} }),
      frames: () => [frame],
      waitForTimeout: async () => {},
      waitForLoadState: async () => {},
      context: () => context,
    }),
  };
  t.mock.method(chromium, 'launch', async () => ({ newContext: async () => context, close: async () => {} }));
  const result = await refreshAuthCookies({
    stateDir: join(dir, 'state'),
    env: { CONTINENTE_EMAIL: 'user@example.com', CONTINENTE_PASSWORD: 'secret', CONTINENTE_COOKIES_PATH: cookieFile },
    log: () => {},
  });
  assert.equal(result, true);
  assert.equal(existsSync(cookieFile), true);
  assert.equal(existsSync(join(dir, 'state', 'cookies.json')), false);
});
