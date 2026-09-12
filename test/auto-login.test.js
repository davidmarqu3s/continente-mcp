import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getCredentialStatus, loadCredentialEnv } from '../continente-auto-login.js';

test('credential status requires both email and password', () => {
  assert.equal(getCredentialStatus({}).ready, false);
  assert.equal(getCredentialStatus({ CONTINENTE_EMAIL: 'user@example.com' }).ready, false);
  assert.equal(getCredentialStatus({ CONTINENTE_PASSWORD: 'secret' }).ready, false);
  assert.equal(
    getCredentialStatus({
      CONTINENTE_EMAIL: 'user@example.com',
      CONTINENTE_PASSWORD: 'secret'
    }).ready,
    true
  );
});

test('credential status never exposes credential values', () => {
  const status = getCredentialStatus({
    CONTINENTE_EMAIL: 'user@example.com',
    CONTINENTE_PASSWORD: 'secret'
  });

  assert.deepEqual(status, { hasEmail: true, hasPassword: true, ready: true });
  assert.equal(JSON.stringify(status).includes('user@example.com'), false);
  assert.equal(JSON.stringify(status).includes('secret'), false);
});

test('credentials can be loaded from a private env file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'continente-env-'));
  const envPath = join(dir, 'credentials.env');
  writeFileSync(envPath, [
    'CONTINENTE_EMAIL="user@example.com"',
    "CONTINENTE_PASSWORD='secret'",
    'CONTINENTE_LOGIN_HEADLESS=false',
  ].join('\n'));

  const env = loadCredentialEnv({ HOME: dir, CONTINENTE_ENV_PATH: envPath });

  assert.equal(env.CONTINENTE_EMAIL, 'user@example.com');
  assert.equal(env.CONTINENTE_PASSWORD, 'secret');
  assert.equal(env.CONTINENTE_LOGIN_HEADLESS, 'false');
  assert.equal(getCredentialStatus({ HOME: dir, CONTINENTE_ENV_PATH: envPath }).ready, true);
});

// These checks use synthetic paths and never read the real account credentials.
test('private credentials follow custom state directory and Windows user profile', async (t) => {
  const { credentialEnvPath } = await import('../continente-auto-login.js');
  const root = mkdtempSync(join(tmpdir(), 'continente-credential-paths-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const state = join(root, 'custom-state');
  const profile = join(root, 'windows-user');
  assert.equal(credentialEnvPath({ CONTINENTE_STATE_DIR: state }), join(state, 'credentials.env'));
  assert.equal(credentialEnvPath({ USERPROFILE: profile }), join(profile, '.continente', 'credentials.env'));
});

test('cookie and state paths have one consistent precedence', async (t) => {
  const { resolveStatePaths } = await import('../continente-auto-login.js');
  const root = mkdtempSync(join(tmpdir(), 'continente-state-paths-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const profile = join(root, 'windows-user');
  const state = join(root, 'state');
  const cookieFile = join(root, 'custom', 'cookies.json');
  assert.equal(typeof resolveStatePaths, 'function');
  assert.deepEqual(resolveStatePaths({ USERPROFILE: profile }), {
    stateDir: join(profile, '.continente'), cookieFile: join(profile, '.continente', 'cookies.json')
  });
  assert.deepEqual(resolveStatePaths({ HOME: join(root, 'home'), CONTINENTE_STATE_DIR: state, CONTINENTE_COOKIES_PATH: cookieFile }), {
    stateDir: state, cookieFile
  });
});

test('login verification rejects an error page and guest cart response', async () => {
  const { isLoggedIn } = await import('../continente-auto-login.js');
  assert.equal(typeof isLoggedIn, 'function');
  const page = {
    goto: async () => ({ ok: () => true }),
    waitForTimeout: async () => {},
    url: () => 'https://www.continente.pt/conta/encomendas/',
    context: () => ({ request: { get: async () => ({ ok: () => true, json: async () => ({ resources: { customerAuthenticated: false } }) }) } })
  };
  assert.equal(await isLoggedIn(page), false);
  page.context = () => ({ request: { get: async () => ({ ok: () => true, json: async () => ({ resources: { customerAuthenticated: true } }) }) } });
  assert.equal(await isLoggedIn(page), true);
  page.goto = async () => ({ ok: () => false });
  assert.equal(await isLoggedIn(page), false);
});

test('reusing loaded settings keeps the original private credentials file', async (t) => {
  const { mkdirSync, rmSync } = await import('node:fs');
  const { resolveStatePaths } = await import('../continente-auto-login.js');
  const home = mkdtempSync(join(tmpdir(), 'continente-env-selection-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const original = join(home, '.continente');
  const state = join(home, 'custom-state');
  mkdirSync(original);
  mkdirSync(state);
  writeFileSync(join(original, 'credentials.env'), `CONTINENTE_STATE_DIR=${state}\n`);
  writeFileSync(join(state, 'credentials.env'), `CONTINENTE_COOKIES_PATH=${join(home, 'wrong-cookies.json')}\n`);
  const env = { HOME: home };
  assert.deepEqual(resolveStatePaths(loadCredentialEnv(env)), resolveStatePaths(env));
});

test('standalone login runs from a path containing spaces', async (t) => {
  const { copyFileSync, rmSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { spawnSync } = await import('node:child_process');
  const repo = fileURLToPath(new URL('../', import.meta.url));
  const dir = mkdtempSync(join(repo, '.login test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const script = join(dir, 'login copy.js');
  copyFileSync(join(repo, 'continente-auto-login.js'), script);
  const systemEnv = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => /^(PATH|SYSTEMROOT|WINDIR)$/i.test(key)));
  const result = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: {
      ...systemEnv, HOME: dir, USERPROFILE: dir,
      CONTINENTE_ENV_PATH: join(dir, 'missing.env'),
      CONTINENTE_EMAIL: '', CONTINENTE_PASSWORD: '',
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing CONTINENTE_EMAIL or CONTINENTE_PASSWORD/);
});
