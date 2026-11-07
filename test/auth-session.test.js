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
    locator: () => ({
      first() { return this; },
      fill: async () => {},
      waitFor: async () => {},
      count: async () => 0,
    }),
    getByRole: () => ({ click: async () => {} }),
  };
  const context = {
    cookies: async () => [],
    request: { get: async () => ({ ok: () => true, json: async () => ({ resources: { customerAuthenticated: true } }) }) },
    newPage: async () => ({
      goto: async () => ({ ok: () => true }),
      url: () => 'https://www.continente.pt/conta/encomendas/',
      getByRole: () => ({
        isVisible: async () => false,
        waitFor: async () => {},
      }),
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

test('login tool reports missing credentials without launching a browser', async () => {
  const { loginNow } = await import('../src/auth-session.js');
  let launched = false;
  const result = await loginNow({
    env: { CONTINENTE_ENV_PATH: '/nonexistent/credentials.env' },
    runLogin: async () => { launched = true; return { success: true }; },
  });
  assert.deepEqual(result, { success: false, error: 'missing_credentials' });
  assert.equal(launched, false);
});

test('login tool closes the browser, logs in and reports success', async (t) => {
  const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join, dirname } = await import('node:path');
  const { loginNow } = await import('../src/auth-session.js');
  const dir = mkdtempSync(join(tmpdir(), 'continente-login-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let closed = false;
  let loginEnv;
  const result = await loginNow({
    stateDir: dir,
    closeBrowser: async () => { closed = true; },
    log: () => {},
    env: { CONTINENTE_ENV_PATH: join(dir, 'absent.env'), CONTINENTE_EMAIL: 'user@example.com', CONTINENTE_PASSWORD: 'secret' },
    runLogin: async ({ env }) => {
      loginEnv = env;
      mkdirSync(dirname(env.CONTINENTE_COOKIES_PATH), { recursive: true });
      writeFileSync(env.CONTINENTE_COOKIES_PATH, '[]');
      return { success: true };
    },
  });
  assert.deepEqual(result, { success: true });
  assert.equal(closed, true);
  assert.equal(loginEnv.CONTINENTE_COOKIES_PATH, join(dir, 'cookies.json'));
});

test('login tool turns login errors into a result instead of throwing', async () => {
  const { loginNow } = await import('../src/auth-session.js');
  const env = { CONTINENTE_ENV_PATH: '/nonexistent/credentials.env', CONTINENTE_EMAIL: 'user@example.com', CONTINENTE_PASSWORD: 'secret' };
  assert.deepEqual(
    await loginNow({ env, log: () => {}, runLogin: async () => { throw new Error('Login page changed'); } }),
    { success: false, error: 'Login page changed' },
  );
  assert.deepEqual(
    await loginNow({ env, log: () => {}, runLogin: async () => ({ success: false, error: 'bad_password' }) }),
    { success: false, error: 'bad_password' },
  );
});
