import test from 'node:test';
import assert from 'node:assert/strict';

import { canAutoLogin, cookieFileForStateDir } from '../src/auth-session.js';

test('auto login requires env-provided email and password', () => {
  assert.equal(canAutoLogin({}), false);
  assert.equal(canAutoLogin({ CONTINENTE_EMAIL: 'user@example.com' }), false);
  assert.equal(canAutoLogin({ CONTINENTE_PASSWORD: 'secret' }), false);
  assert.equal(canAutoLogin({
    CONTINENTE_EMAIL: 'user@example.com',
    CONTINENTE_PASSWORD: 'secret'
  }), true);
});

test('cookie cache path is derived from state directory', () => {
  assert.equal(cookieFileForStateDir('/tmp/continente-state'), '/tmp/continente-state/cookies.json');
});
