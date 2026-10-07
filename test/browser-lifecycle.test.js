import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';

test('a crashed browser is replaced on the next call', async (t) => {
  const stateDir = mkdtempSync(join(tmpdir(), 'continente-lifecycle-test-'));
  Object.assign(process.env, {
    HOME: stateDir, CONTINENTE_STATE_DIR: stateDir, CONTINENTE_ENV_PATH: join(stateDir, 'absent.env'),
    CONTINENTE_COOKIES_PATH: join(stateDir, 'cookies.json'), CONTINENTE_EMAIL: '', CONTINENTE_PASSWORD: '',
  });
  writeFileSync(join(stateDir, 'cookies.json'), '[]');
  let launches = 0;
  let disconnect;
  const page = {
    async goto() { return { ok: () => true, status: () => 200 }; },
    async waitForTimeout() {},
    async content() { return ''; },
    url() { return 'https://www.continente.pt/'; },
    isClosed() { return false; },
    async close() {},
  };
  t.mock.method(chromium, 'launch', async () => {
    launches++;
    return {
      on(event, handler) { if (event === 'disconnected') disconnect = handler; },
      async newContext() { return { async addCookies() {}, async newPage() { return page; }, async close() {} }; },
      async close() {},
    };
  });
  try {
    const { ContinenteServer } = await import('../src/index.js');
    const server = new ContinenteServer();
    await server.callTool('search_products', { query: 'leite' });
    assert.equal(launches, 1);
    disconnect();
    await server.callTool('search_products', { query: 'leite' });
    assert.equal(launches, 2);
    await server.callTool('close_session', {});
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});
