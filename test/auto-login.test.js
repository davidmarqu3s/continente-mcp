import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
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
