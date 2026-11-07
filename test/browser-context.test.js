import assert from 'node:assert/strict';
import test from 'node:test';

import { browserUserAgent, newBrowserContext } from '../continente-auto-login.js';

test('user agent keeps the real major version without the headless marker', () => {
  assert.equal(
    browserUserAgent('147.0.7727.15', 'darwin'),
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
  );
  assert.match(browserUserAgent('147.0.1.2', 'win32'), /Windows NT 10\.0; Win64; x64/);
  assert.match(browserUserAgent('147.0.1.2', 'linux'), /X11; Linux x86_64/);
  assert.equal(browserUserAgent(undefined), null);
});

function fakeBrowser() {
  return {
    options: null,
    version: () => '147.0.7727.15',
    async newContext(options) { this.options = options; return {}; },
  };
}

test('headless contexts get the real user agent, Portuguese locale and Lisbon time', async () => {
  const browser = fakeBrowser();
  await newBrowserContext(browser);
  assert.match(browser.options.userAgent, /Chrome\/147\.0\.0\.0/);
  assert.doesNotMatch(browser.options.userAgent, /Headless/);
  assert.equal(browser.options.locale, 'pt-PT');
  assert.equal(browser.options.timezoneId, 'Europe/Lisbon');
});

test('headed contexts keep the browser own user agent', async () => {
  const browser = fakeBrowser();
  await newBrowserContext(browser, { headless: false });
  assert.equal(browser.options.userAgent, undefined);
  assert.equal(browser.options.timezoneId, 'Europe/Lisbon');
});
