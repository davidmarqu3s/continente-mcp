import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { chromium } from 'playwright';

// Exercise actual handlers with browser I/O replaced, keeping all account state
// and credentials isolated from the machine running the tests.
test('server handler contracts', async (t) => {
  const stateDir = mkdtempSync(join(tmpdir(), 'continente-server-test-'));
  const isolatedEnv = {
    HOME: stateDir,
    CONTINENTE_STATE_DIR: stateDir,
    CONTINENTE_ENV_PATH: join(stateDir, 'absent-credentials.env'),
    CONTINENTE_COOKIES_PATH: join(stateDir, 'cookies.json'),
    CONTINENTE_EMAIL: '',
    CONTINENTE_PASSWORD: '',
  };
  const originalEnv = Object.fromEntries(Object.keys(isolatedEnv).map(key => [key, process.env[key]]));
  Object.assign(process.env, isolatedEnv);
  writeFileSync(join(stateDir, 'cookies.json'), '[]');

  let payload;
  let html = '';
  let currentUrl = '';
  let redirectToLogin = false;
  let httpStatus = 200;
  let contentFromUrl = false;
  let backgroundRequests = false;
  let browserOperations = 0;
  let navigations = 0;
  let mutations = 0;
  let mutationPayload = {};
  let postMutationCart;
  const updateData = {
    updateUrl: 'https://www.continente.pt/Cart-UpdateQuantity',
    uuid: 'test-line', measureOptions: {}, gtmIndex: '1',
    removeUrl: '/Cart-RemoveProductLineItem', removeUuid: 'test-line',
  };
  const cartWithQuantity = (quantity) => ({
    resources: { customerAuthenticated: true },
    basket: { itemsSortedByBrand: quantity === 0 ? [] : [{ items: [{
      id: '1234567', productName: 'Milk', quantity, price: { sales: { value: 1.3 } },
    }] }] },
  });
  const page = {
    async goto(url, options) {
      if (backgroundRequests && options?.waitUntil === 'networkidle') throw new Error('Background requests never became idle');
      browserOperations++;
      navigations++;
      currentUrl = redirectToLogin ? 'https://www.continente.pt/login/' : url;
      if (contentFromUrl) await setImmediate();
      return { ok: () => httpStatus < 400, status: () => httpStatus };
    },
    async waitForTimeout() {},
    async waitForSelector(selector) { assert.equal(selector, 'input.add-to-cart-url'); },
    async content() {
      if (!contentFromUrl) return html;
      const query = new URL(currentUrl).searchParams.get('q');
      return `<div class="ct-inner-tile-wrap"><a href="/produto/${query}-1234567.html">${query} item</a><span class="pwc-tile--price-primary">1,20€</span></div>`;
    },
    async evaluate(_fn, arg) {
      browserOperations++;
      if (typeof arg === 'number') {
        mutations++;
        payload = postMutationCart;
        return { success: true, status: 200, payload: mutationPayload };
      }
      return updateData;
    },
    url() { return currentUrl; },
    async close() {},
  };
  const context = {
    async addCookies(cookies) { assert.deepEqual(cookies, []); },
    async newPage() { return page; },
    async close() {},
    request: {
      async get(url) {
        browserOperations++;
        if (/\/Cart-MiniCartShow$/.test(url)) {
          return { ok: () => true, status: () => 200, json: async () => payload };
        }
        assert.match(url, /\/Cart-(UpdateQuantity|RemoveProductLineItem)\?/);
        mutations++;
        payload = postMutationCart;
        return { ok: () => true, status: () => 200, json: async () => mutationPayload };
      },
    },
  };
  t.mock.method(chromium, 'launch', async () => ({
    async newContext() { return context; },
    async close() {},
  }));

  let server;
  try {
    const { ContinenteServer } = await import('../src/index.js');
    server = new ContinenteServer();

    await t.test('unknown authenticated basket is an error, not an empty cart', async () => {
      payload = { resources: { customerAuthenticated: true }, basket: {} };
      const result = await server.handle_get_cart();
      assert.equal(result.isError, true);
      assert.doesNotMatch(result.content[0].text, /cart is empty/i);
    });

    await t.test('guest empty basket cannot be presented as the account cart', async () => {
      payload = { resources: { customerAuthenticated: false }, basket: { itemsSortedByBrand: [] } };
      const result = await server.handle_get_cart();
      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /not logged in|not authenticated/i);
    });

    await t.test('native no-basket response is empty only for an authenticated account', async () => {
      for (const authenticated of [true, false]) {
        payload = { action: 'Cart-MiniCartShow', resources: { customerAuthenticated: authenticated }, basket: {} };
        const result = await server.callTool('get_cart');
        assert.equal(Boolean(result.isError), !authenticated);
        if (authenticated) assert.match(result.content[0].text, /cart is empty/i);
      }
    });

    await t.test('explicit authenticated empty basket is a successful empty cart', async () => {
      payload = { resources: { customerAuthenticated: true }, basket: { itemsSortedByBrand: [] } };
      const result = await server.handle_get_cart();
      assert.notEqual(result.isError, true);
      assert.match(result.content[0].text, /cart is empty/i);
      assert.deepEqual(result.structuredContent, { customerAuthenticated: true, items: [], total: null });
    });

    await t.test('missing monetary fields remain unavailable instead of displaying zero', async () => {
      payload = cartWithQuantity(2);
      delete payload.basket.itemsSortedByBrand[0].items[0].price;
      const result = await server.callTool('get_cart', {});
      assert.notEqual(result.isError, true);
      assert.match(result.content[0].text, /\?€/);
      assert.match(result.content[0].text, /total:.*unavailable/i);
      assert.doesNotMatch(result.content[0].text, /0\.00/);
    });

    await t.test('malformed cookies never expose their contents in error logs', async (cookieTest) => {
      await server.callTool('close_session', {});
      const cookieFile = join(stateDir, 'cookies.json');
      const syntheticSecret = 'SECRET_CANARY';
      writeFileSync(cookieFile, syntheticSecret);
      payload = cartWithQuantity(0);
      const logs = [];
      const logger = cookieTest.mock.method(console, 'error', (...args) => logs.push(args.join(' ')));
      try {
        await server.callTool('get_cart', {});
        assert.ok(logs.length > 0, 'malformed cookie input should report a safe diagnostic');
        assert.doesNotMatch(logs.join('\n'), /SECRET|CANARY/);
      } finally {
        logger.mock.restore();
        writeFileSync(cookieFile, '[]');
        await server.callTool('close_session', {});
      }
    });

    await t.test('favorites saved with .html IDs retain ranking and badges in search', async () => {
      writeFileSync(join(stateDir, 'preferences.json'), JSON.stringify({
        favorites: [{ productId: 'favorite-milk-1234567.html', name: 'Previously named milk' }],
      }));
      html = `
        <div class="ct-inner-tile-wrap">
          <a href="/produto/other-milk-7654321.html">Other milk</a>
          <span class="pwc-tile--price-primary">1,20€</span>
        </div>
        <div class="ct-inner-tile-wrap">
          <a href="/produto/favorite-milk-1234567.html">Favorite milk</a>
          <span class="pwc-tile--price-primary">1,30€</span>
        </div>`;
      const result = await server.handle_search('milk', 2);
      assert.notEqual(result.isError, true);
      assert.match(result.content[0].text, /1\. Favorite milk ⭐ \(favorite\)/);
      assert.match(result.content[0].text, /2\. Other milk/);
    });

    await t.test('failed favorites refresh preserves the cached favorites', async () => {
      const prefsFile = join(stateDir, 'preferences.json');
      const original = readFileSync(prefsFile, 'utf8');
      for (const failure of ['login redirect', 'HTTP error']) {
        redirectToLogin = failure === 'login redirect';
        httpStatus = failure === 'HTTP error' ? 503 : 200;
        html = '';
        const result = await server.callTool('refresh_favorites', {});
        assert.equal(result.isError, true, failure);
        assert.equal(readFileSync(prefsFile, 'utf8'), original, failure);
      }
      redirectToLogin = false;
      httpStatus = 200;
    });

    await t.test('unknown pre-cart blocks add and update before navigation or mutation', async () => {
      for (const name of ['add_to_cart', 'update_cart_item']) {
        payload = { resources: { customerAuthenticated: true }, basket: {} };
        const before = { navigations, mutations };
        const result = await server.callTool(name, { product_id: 'milk-1234567', quantity: 2 });
        assert.equal(result.isError, true, name);
        assert.deepEqual({ navigations, mutations }, before, name);
      }
    });

    await t.test('update rejects application errors and unconfirmed quantities', async () => {
      for (const scenario of ['application error', 'unchanged quantity']) {
        payload = cartWithQuantity(1);
        postMutationCart = cartWithQuantity(scenario === 'application error' ? 2 : 1);
        mutationPayload = scenario === 'application error' ? { error: true, message: 'Out of stock' } : {};
        const before = mutations;
        const result = await server.callTool('update_cart_item', { product_id: 'milk-1234567', quantity: 2 });
        assert.equal(result.isError, true, scenario);
        assert.equal(mutations, before + 1, scenario);
      }
    });

    await t.test('update and remove succeed only with confirmed final quantities', async () => {
      for (const quantity of [2, 0]) {
        payload = cartWithQuantity(1);
        postMutationCart = cartWithQuantity(quantity);
        mutationPayload = {};
        const before = mutations;
        const result = await server.callTool('update_cart_item', { product_id: 'milk-1234567', quantity });
        assert.notEqual(result.isError, true, JSON.stringify(result));
        assert.equal(result.structuredContent.success, true);
        assert.equal(mutations, before + 1);
      }
    });

    await t.test('adding a product does not wait for background requests to become idle', async () => {
      payload = { action: 'Cart-MiniCartShow', basket: {}, resources: { customerAuthenticated: true } };
      postMutationCart = cartWithQuantity(1);
      mutationPayload = {};
      backgroundRequests = true;
      try {
        const result = await server.callTool('add_to_cart', { product_id: 'milk-1234567', quantity: 1 });
        assert.notEqual(result.isError, true, JSON.stringify(result));
      } finally { backgroundRequests = false; }
    });

    await t.test('add confirms the quantity increase instead of mere product presence', async () => {
      for (const finalQuantity of [1, 3]) {
        payload = cartWithQuantity(1);
        postMutationCart = cartWithQuantity(finalQuantity);
        mutationPayload = postMutationCart;
        const before = mutations;
        const result = await server.callTool('add_to_cart', { product_id: 'milk-1234567', quantity: 2 });
        assert.equal(result.isError === true, finalQuantity !== 3, JSON.stringify(result));
        assert.equal(mutations, before + 1);
      }
    });

    await t.test('missing authentication after a write fails without retrying the mutation', async (mutationTest) => {
      const logs = [];
      const logger = mutationTest.mock.method(console, 'error', (...args) => logs.push(args.join(' ')));
      try {
        for (const name of ['add_to_cart', 'update_cart_item']) {
          payload = cartWithQuantity(1);
          postMutationCart = cartWithQuantity(name === 'add_to_cart' ? 3 : 2);
          delete postMutationCart.resources;
          mutationPayload = {};
          const before = mutations;
          const result = await server.callTool(name, { product_id: 'milk-1234567', quantity: 2 });
          assert.equal(result.isError, true, name);
          assert.equal(mutations, before + 1, name);
        }
        assert.doesNotMatch(logs.join('\n'), /automatic login|\[auth\]/i,
          'uncertain completed writes must not enter the automatic login retry path');
      } finally {
        logger.mock.restore();
      }
    });

    await t.test('concurrent searches retain the correct page results for each request', async () => {
      contentFromUrl = true;
      try {
        const [first, second] = await Promise.all([
          server.callTool('search_products', { query: 'First', limit: 1 }),
          server.callTool('search_products', { query: 'Second', limit: 1 }),
        ]);
        assert.match(first.content[0].text, /1\. First item/);
        assert.match(second.content[0].text, /1\. Second item/);
      } finally {
        contentFromUrl = false;
      }
    });

    await t.test('invalid mutation quantities are rejected before browser I/O', async () => {
      const before = browserOperations;
      for (const [name, quantity] of [['add_to_cart', 0], ['add_to_cart', -1], ['update_cart_item', -1]]) {
        const result = await server.callTool(name, { product_id: 'milk-1234567', quantity });
        assert.equal(result.isError, true, `${name} quantity ${quantity}`);
      }
      assert.equal(browserOperations, before);
    });
  } finally {
    if (server) await server.server.close();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(stateDir, { recursive: true, force: true });
  }
});
