import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'patchright';

import { headlessUserAgent, launchBrowser, newContext } from '../continente-auto-login.js';

test('headless user agent keeps the real major version without the headless marker', () => {
  assert.equal(
    headlessUserAgent('156.0.8078.80', 'darwin'),
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
  );
  assert.match(headlessUserAgent('156.0.1.2', 'win32'), /Windows NT 10\.0; Win64; x64/);
  assert.match(headlessUserAgent('156.0.1.2', 'linux'), /X11; Linux x86_64/);
  assert.equal(headlessUserAgent(undefined), null);
});

function fakeBrowser() {
  return {
    contextOptions: null,
    version: () => '156.0.8078.80',
    async newContext(options) { this.contextOptions = options; return {}; },
  };
}

test('prefers the installed Chrome and falls back to the bundled Chromium', async (t) => {
  const calls = [];
  t.mock.method(chromium, 'launch', async (options) => {
    calls.push(options);
    if (options.channel) throw new Error('Chromium distribution \'chrome\' is not found');
    return fakeBrowser();
  });
  t.mock.method(console, 'error', () => {});
  await launchBrowser({ headless: true, env: {} });
  assert.deepEqual(calls, [{ headless: true, channel: 'chrome' }, { headless: true }]);
});

test('chromium channel skips the Chrome attempt', async (t) => {
  const calls = [];
  t.mock.method(chromium, 'launch', async (options) => { calls.push(options); return fakeBrowser(); });
  await launchBrowser({ headless: true, env: { CONTINENTE_BROWSER_CHANNEL: 'chromium' } });
  assert.deepEqual(calls, [{ headless: true }]);
});

test('contexts only override the user agent in headless mode', async (t) => {
  t.mock.method(chromium, 'launch', async () => fakeBrowser());
  const headless = await launchBrowser({ headless: true, env: {} });
  await newContext(headless);
  assert.match(headless.contextOptions.userAgent, /Chrome\/156\.0\.0\.0/);
  assert.equal(headless.contextOptions.locale, 'pt-PT');

  const headed = await launchBrowser({ headless: false, env: {} });
  await newContext(headed);
  assert.equal(headed.contextOptions.userAgent, undefined);
});
