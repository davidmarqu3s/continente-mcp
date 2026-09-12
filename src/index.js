#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import { pathToFileURL } from 'node:url';
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'fs';
import { normalizeCookies } from './utils.js';
import { normalizeCartProductId, quantityForCartUpdate, summarizeCartState } from './cart-utils.js';
import { refreshAuthCookies, resolveStatePaths } from './auth-session.js';

const CONTINENTE_BASE = 'https://www.continente.pt';
const { stateDir: STATE_DIR, cookieFile: COOKIE_FILE } = resolveStatePaths();
const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

function getPlatformUserAgent() {
  if (process.platform === 'win32') {
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
  } else if (process.platform === 'linux') {
    return 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
  }
  return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
}

// ─── Browser / Session ───────────────────────────────────────────────────────

let browser = null;
let context = null;
let page = null;
let loadedCookieMtimeMs = null;

async function refreshAuthSession() {
  const refreshed = await refreshAuthCookies({
    stateDir: STATE_DIR,
    closeBrowser,
    log: (message) => console.error(message),
  });
  return refreshed;
}

async function ensureBrowser() {
  const cookieFile = COOKIE_FILE;
  if (!existsSync(cookieFile)) {
    await refreshAuthSession();
  }
  const nextCookieMtimeMs = existsSync(cookieFile) ? statSync(cookieFile).mtimeMs : null;

  if (context && loadedCookieMtimeMs !== nextCookieMtimeMs) {
    if (page) { try { await page.close(); } catch (e) {} page = null; }
    if (context) { try { await context.close(); } catch (e) {} context = null; }
  }

  if (!browser) {
    browser = await chromium.launch({ headless: true });
  }

  if (!context) {
    context = await browser.newContext({
      userAgent: getPlatformUserAgent(),
      locale: 'pt-PT'
    });

    // Load cookies from file
    if (existsSync(cookieFile)) {
      try {
        const cookies = JSON.parse(readFileSync(cookieFile, 'utf8'));
        const normalized = normalizeCookies(cookies);
        await context.addCookies(normalized);
        loadedCookieMtimeMs = nextCookieMtimeMs;
      } catch (e) {
        console.error('Could not read the cookie cache; refresh login or replace the cache.');
      }
    }
  }

  if (!page) {
    page = await context.newPage();
  }
  return browser;
}

async function goto(url, wait = 'networkidle') {
  await ensureBrowser();
  const response = await page.goto(url, { waitUntil: wait, timeout: 20000 });
  if (!response?.ok()) throw new Error(`Continente page returned HTTP ${response?.status() ?? 'unknown'}`);
  await page.waitForTimeout(1500);
  return page;
}

async function retryAfterAutoLogin(operation) {
  const first = await operation();
  if (first?.error !== 'not_authenticated') {
    return first;
  }

  if (!(await refreshAuthSession())) {
    return first;
  }

  return operation();
}

async function closeBrowser() {
  if (page) { try { await page.close(); } catch(e) {} page = null; }
  if (context) { try { await context.close(); } catch(e) {} context = null; }
  if (browser) { try { await browser.close(); } catch(e) {} browser = null; }
  loadedCookieMtimeMs = null;
}

// ─── Favorites / Preferences ───────────────────────────────────────────────────

async function fetchFavorites() {
  await goto(`${CONTINENTE_BASE}/conta/lista-produtos/?list=favorites`);
  if (page.url().includes('/login')) return { error: 'not_authenticated' };
  const html = await page.content();
  const $ = cheerio.load(html);
  const products = [];

  $('a[href*="/produto/"]').each((i, el) => {
    const $el = $(el);
    const text = $el.text().replace(/\s+/g, ' ').trim();
    const href = $el.attr('href') || '';
    if (text.length > 5 && href) {
      const idMatch = href.match(/\/produto\/([^\/\?]+)/);
      const productId = idMatch ? idMatch[1] : null;
      const priceMatch = text.match(/(\d+[,.]\d+€)/);
      const name = text.replace(/\d+[,.]\d+€/g, '').trim().substring(0, 120);
      if (name && name.length > 3 && productId) {
        products.push({ name, productId, price: priceMatch ? priceMatch[1] : null, url: href });
      }
    }
  });

  // Deduplicate
  const seen = new Set();
  return products.filter(p => {
    if (seen.has(p.productId)) return false;
    seen.add(p.productId);
    return true;
  });
}

// ─── Product Search ────────────────────────────────────────────────────────────

async function searchProducts(query, limit = 10) {
  await goto(`${CONTINENTE_BASE}/pesquisa/?q=${encodeURIComponent(query)}`);
  const html = await page.content();
  return parseProducts(html, limit);
}

function parseProducts(html, limit = 30) {
  const $ = cheerio.load(html);
  const products = [];

  // Prices live in the card container (.ct-inner-tile-wrap), not in the <a> tag itself
  $('.ct-inner-tile-wrap').each((i, el) => {
    if (products.length >= limit) return;
    const $el = $(el);
    const link = $el.find('a[href*="/produto/"]').first();
    const href = link.attr('href') || '';
    if (!href) return;

    const idMatch = href.match(/\/produto\/([^\/\?]+?)(?:\.html)?(?:\?|$)/);
    const productId = idMatch ? idMatch[1] : null;
    if (!productId) return;

    const primaryText = $el.find('.pwc-tile--price-primary').first().text().replace(/\s+/g, ' ').trim();
    const priceMatch = primaryText.match(/(\d+[,.]\d+)€/);
    if (!priceMatch) return;

    const price = parseFloat(priceMatch[1].replace(',', '.'));
    const secondaryText = $el.find('.pwc-tile--price-secondary').first().text().replace(/\s+/g, ' ').trim();
    const unitMatch = secondaryText.match(/(\d+[,.]\d+€)\/([a-zA-Z]+)/);

    const nameLink = $el.find('a[href*="/produto/"]').filter((_, a) => $(a).text().trim().length > 0).first();
    let name = nameLink.text().replace(/\s+/g, ' ').trim().substring(0, 100);
    if (name.length < 3) return;

    products.push({
      name,
      price,
      currency: '€',
      product_id: productId,
      url: href.startsWith('http') ? href : CONTINENTE_BASE + href,
      unit: unitMatch ? `${unitMatch[1]}/${unitMatch[2]}` : null
    });
  });

  const seen = new Set();
  return products.filter(p => {
    if (seen.has(p.product_id)) return false;
    seen.add(p.product_id);
    return true;
  });
}

// ─── Cart ─────────────────────────────────────────────────────────────────────

async function getCart() {
  await ensureBrowser();

  try {
    const res = await context.request.get(
      `${CONTINENTE_BASE}/on/demandware.store/Sites-continente-Site/default/Cart-MiniCartShow`,
      {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        timeout: 10000
      }
    );

    if (!res.ok()) return { error: `http_${res.status()}` };

    const payload = await res.json();
    const cart = summarizeCartState(payload);
    if (!cart.customerAuthenticated) return { error: 'not_authenticated' };
    return cart;
  } catch (e) {
    return { error: e.message };
  }
}

async function updateCartItem(productId, quantity) {
  const before = await getCart();
  if (before.error) return { success: false, error: before.error };
  await goto(`${CONTINENTE_BASE}/checkout/carrinho/`);

  if (page.url().includes('/login')) return { error: 'not_authenticated' };

  const cartPid = normalizeCartProductId(productId);
  const updateData = await page.evaluate(({ cartPid }) => {
    const item = Array.from(document.querySelectorAll('[data-pid][data-product-name]'))
      .find(el => el.dataset.pid === cartPid || el.querySelector(`input.add-to-cart-quantity[data-pid="${cartPid}-master"]`));

    if (!item) return { error: 'not_found' };

    const removeEl = item.querySelector('button.remove-product');
    const updateEl = item.querySelector('.ct-tile-quantity-update');
    const qtyInput = item.querySelector('input.add-to-cart-quantity');
    if ((!updateEl || !qtyInput) && !removeEl) return { error: 'missing_quantity_controls' };

    let measureOptions = {};
    try {
      measureOptions = updateEl?.dataset.measureOptions ? JSON.parse(updateEl.dataset.measureOptions) : {};
    } catch {
      measureOptions = {};
    }

    const updateUrl = updateEl?.dataset.action;
    const uuid = updateEl?.dataset.uuid || item.dataset.uuid;

    return {
      updateUrl,
      uuid,
      measureOptions,
      gtmIndex: item.dataset.idx || '1',
      removeUrl: removeEl?.dataset.action,
      removeUuid: removeEl?.dataset.uuid || item.dataset.uuid
    };
  }, { cartPid });

  if (updateData.error) return { success: false, error: updateData.error };

  if (quantity === 0) {
    if (!updateData.removeUrl || !updateData.removeUuid) {
      return { success: false, error: 'missing_remove_data' };
    }

    const params = new URLSearchParams({ pid: cartPid, uuid: updateData.removeUuid });
    const result = await requestCartChange(updateData.removeUrl, params);
    if (result.error) return { success: false, error: result.error };
    return verifyCartQuantity(cartPid, 0);
  }

  if (!updateData.updateUrl || !updateData.uuid) return { success: false, error: 'missing_update_data' };

  const formattedQuantity = quantityForCartUpdate(quantity, updateData.measureOptions);
  const conversion = Number(updateData.measureOptions.primaryToSecondary || updateData.measureOptions.unitConversionRate);
  const step = Number(updateData.measureOptions.stepQuantity || conversion || 1).toString();
  const dimension = updateData.measureOptions.secondaryunit || updateData.measureOptions.primaryunit || 'un';

  const params = new URLSearchParams({
    pid: cartPid,
    quantity: formattedQuantity,
    step,
    uuid: updateData.uuid,
    dimension,
    isCart: 'true',
    gtmList: 'Checkout',
    gtmIndex: updateData.gtmIndex,
    promotionData: 'null',
    taggstarPromotionData: ''
  });

  const result = await requestCartChange(updateData.updateUrl, params);
  if (result.error) return { success: false, error: result.error };
  return verifyCartQuantity(cartPid, quantity);
}

async function requestCartChange(action, params) {
  const url = new URL(action, CONTINENTE_BASE);
  if (url.origin !== CONTINENTE_BASE) return { error: 'invalid_cart_action' };
  for (const [key, value] of params) url.searchParams.set(key, value);
  const res = await context.request.get(url.href, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' }, timeout: 10000
  });
  if (!res.ok()) return { error: `http_${res.status()}` };
  const payload = await res.json();
  if (payload?.error || payload?.success === false) return { error: 'cart_update_rejected' };
  return { success: true };
}

async function verifyCartQuantity(productId, expectedQuantity) {
  const cart = await getCart();
  const actual = cart.items?.find(item => item.id === productId)?.qty ?? 0;
  if (cart.error || Math.abs(actual - expectedQuantity) > 0.0005) {
    // A write may have happened. Never automatically repeat it after this point.
    return { success: false, error: 'cart_quantity_not_confirmed' };
  }
  return { success: true, product_id: productId, cart_quantity: actual };
}

async function addToCart(productId, quantity = 1) {
  const before = await getCart();
  if (before.error) return { success: false, error: before.error };
  const slug = productId.endsWith('.html') ? productId : `${productId}.html`;
  await goto(`${CONTINENTE_BASE}/produto/${slug}`);

  // Extract numeric PID and Cart-AddProduct URL from page
  const result = await page.evaluate(async (qty) => {
    const pidInput = document.querySelector('input[name="productID"]');
    const urlInput = document.querySelector('input.add-to-cart-url');
    const csrfInput = document.querySelector('input[name="csrf_token"]');

    if (!pidInput || !urlInput) return { success: false, message: 'Could not find product form data' };

    const pid = pidInput.value;
    const cartUrl = urlInput.value;
    const csrf = csrfInput ? csrfInput.value : '';

    const body = new URLSearchParams({ pid, quantity: String(qty), options: '[]' });
    if (csrf) body.append('csrf_token', csrf);

    try {
      const res = await fetch(cartUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
        body: body.toString(),
        credentials: 'include',
        signal: AbortSignal.timeout(10000)
      });
      const json = await res.json();
      return { success: res.ok, status: res.status, payload: json, error: json?.message };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }, quantity);

  if (!result.success || result.payload?.error || result.payload?.resources?.customerAuthenticated === false) {
    return { success: false, error: 'cart_add_not_confirmed' };
  }
  const numericPid = normalizeCartProductId(productId);
  const previousQuantity = before.items.find(item => item.id === numericPid)?.qty ?? 0;
  return verifyCartQuantity(numericPid, previousQuantity + quantity);
}

// ─── Order History ────────────────────────────────────────────────────────────

async function getOrderHistory(limit = 5) {
  await goto(`${CONTINENTE_BASE}/conta/encomendas/`);

  if (page.url().includes('/login')) return { error: 'not_authenticated' };

  const text = await page.evaluate(() => document.body.innerText);
  const rawLines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const orders = [];
  const orderNumRe = /^\d{9}_\d{3}$/;
  const dateRe = /^\d{1,2} [A-Za-zÀ-ÿ]+ \d{2,4}/;

  for (let i = 0; i < rawLines.length; i++) {
    if (orderNumRe.test(rawLines[i])) {
      const date = rawLines[i + 1] && dateRe.test(rawLines[i + 1]) ? rawLines[i + 1] : null;
      orders.push({ orderNumber: rawLines[i], date });
    }
  }

  // Collect order detail links
  const orderLinks = await page.evaluate(() => {
    const seen = new Set();
    return Array.from(document.querySelectorAll('a[href*="detalhe-encomenda"]'))
      .map(a => a.href)
      .filter(h => { if (seen.has(h)) return false; seen.add(h); return true; });
  });

  // Fetch product lines for each order up to limit
  const detailLinks = orderLinks.slice(0, limit);
  for (let idx = 0; idx < detailLinks.length; idx++) {
    try {
      const products = await getOrderProducts(detailLinks[idx]);
      if (orders[idx]) orders[idx].lines = products.map(p => `${p.qty}x ${p.name}`);
    } catch (e) {
      // skip failed pages
    }
  }

  return orders;
}

async function getOrderProducts(orderDetailUrl) {
  await page.goto(orderDetailUrl, { waitUntil: 'networkidle', timeout: 20000 });

  return page.evaluate(() => {
    const products = [];
    document.querySelectorAll('[class*="product-line"]').forEach(el => {
      const qtyEl = el.querySelector('[class*="qty"], [class*="quantity"], [class*="amount"]');
      if (!qtyEl) return; // skip category headers

      const nameEl = el.querySelector('[class*="product-name"], [class*="name"], a[href*="produto"]');
      const rawName = (nameEl || el).textContent.trim();
      // Take only first line — rest is brand/subcopy
      const name = rawName.split('\n')[0].trim();

      const qtyMatch = qtyEl.textContent.trim().match(/^(\d+)/);
      const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

      if (name && name.length > 3) products.push({ name, qty });
    });
    return products;
  });
}

async function getMostBought(limit = 10) {
  await goto(`${CONTINENTE_BASE}/conta/encomendas/`);

  if (page.url().includes('/login')) return { error: 'not_authenticated' };

  // Collect all unique order detail links
  const orderLinks = await page.evaluate(() => {
    const seen = new Set();
    return Array.from(document.querySelectorAll('a[href*="detalhe-encomenda"]'))
      .map(a => a.href)
      .filter(h => { if (seen.has(h)) return false; seen.add(h); return true; });
  });

  if (orderLinks.length === 0) return { error: 'no_orders' };

  // Tally products across recent orders
  const tally = new Map(); // name -> { qty, orders }

  for (const link of orderLinks.slice(0, limit)) {
    try {
      const products = await getOrderProducts(link);
      for (const { name, qty } of products) {
        const existing = tally.get(name);
        if (existing) {
          existing.qty += qty;
          existing.orders += 1;
        } else {
          tally.set(name, { qty, orders: 1 });
        }
      }
    } catch (e) {
      // skip failed order pages
    }
  }

  return Array.from(tally.entries())
    .map(([name, { qty, orders }]) => ({ name, qty, orders }))
    .sort((a, b) => b.qty - a.qty);
}

// ─── Preferences ───────────────────────────────────────────────────────────────

async function getPreferences() {
  const prefsFile = `${STATE_DIR}/preferences.json`;
  if (!existsSync(prefsFile)) return null;
  try {
    return JSON.parse(readFileSync(prefsFile, 'utf8'));
  } catch (e) {
    return null;
  }
}

async function savePreferences(prefs) {
  try { mkdirSync(STATE_DIR, { recursive: true }); } catch (e) {}
  const prefsFile = `${STATE_DIR}/preferences.json`;
  writeFileSync(prefsFile, JSON.stringify(prefs, null, 2));
}

async function updatePreferencesFromFavorites() {
  const favorites = await retryAfterAutoLogin(() => fetchFavorites());
  if (favorites?.error) throw new Error(favorites.error);
  const prefs = {
    favorites,
    lastUpdated: new Date().toISOString()
  };
  await savePreferences(prefs);
  return prefs;
}

export function rankByPreference(products, preferences) {
  if (!preferences || !preferences.favorites) return products;

  const favIds = new Set(preferences.favorites.map(f => normalizeCartProductId(f.productId)));
  const favNames = new Map(preferences.favorites.map(f => [f.name.toLowerCase(), f]));

  return products.map(p => {
    let score = 0;
    if (favIds.has(normalizeCartProductId(p.product_id))) score += 100;
    const nameLower = p.name.toLowerCase();
    for (const favName of favNames.keys()) {
      if (nameLower.includes(favName) || favName.includes(nameLower)) score += 50;
    }
    return { ...p, score };
  }).sort((a, b) => b.score - a.score);
}

// ─── MCP Server ───────────────────────────────────────────────────────────────

export class ContinenteServer {
  constructor() {
    this.server = new Server(
      { name: 'continente-mcp', version: VERSION },
      { capabilities: { tools: {} } }
    );
    this.server.onclose = () => { void closeBrowser(); };
    this.pending = Promise.resolve();
    this.setupTools();
  }

  setupTools() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'search_products',
          description: 'Search Continente products. Results ranked by your favorites if available.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search term (e.g., "leite", "pao")' },
              limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Max results (default: 10)' }
            },
            required: ['query']
          }
        },
        {
          name: 'get_favorites',
          description: 'Get your Continente favorites list (from your account).',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'refresh_favorites',
          description: 'Refresh your favorites from the website. Run this if your favorites have changed.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'get_cart',
          description: 'View your current shopping cart.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'add_to_cart',
          description: 'Add a product to cart by product ID.',
          inputSchema: {
            type: 'object',
            properties: {
              product_id: { type: 'string', description: 'Product ID from search results' },
              quantity: { type: 'number', exclusiveMinimum: 0, description: 'Quantity (default: 1)' }
            },
            required: ['product_id']
          }
        },
        {
          name: 'update_cart_item',
          description: 'Set the quantity for a product already in the cart by product ID. Use quantity 0 to remove the line if the site supports it.',
          inputSchema: {
            type: 'object',
            properties: {
              product_id: { type: 'string', description: 'Product ID from search results or cart item' },
              quantity: { type: 'number', minimum: 0, description: 'Desired cart quantity' }
            },
            required: ['product_id', 'quantity']
          }
        },
        {
          name: 'get_order_history',
          description: 'Get your recent order history from your account.',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Number of orders (default: 5)' }
            }
          }
        },
        {
          name: 'get_most_bought',
          description: 'Get the products you buy most often, tallied across recent orders.',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Number of recent orders to scan (default: 10)' }
            }
          }
        },
        {
          name: 'close_session',
          description: 'Close the browser session. Call when done to free resources.',
          inputSchema: { type: 'object', properties: {} }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, request =>
      this.callTool(request.params.name, request.params.arguments ?? {}));
  }

  callTool(name, args = {}) {
    // All tools share one browser page, including close_session.
    const result = this.pending.then(() => this.executeTool(name, args));
    this.pending = result.catch(() => {});
    return result;
  }

  async executeTool(name, args) {
      try {
        if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Arguments must be an object');
        if (['search_products', 'get_order_history', 'get_most_bought'].includes(name) && args.limit !== undefined &&
          (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 50)) throw new Error('limit must be an integer from 1 to 50');
        if (name === 'search_products' && (typeof args.query !== 'string' || !args.query.trim())) throw new Error('query must be a non-empty string');
        if (['add_to_cart', 'update_cart_item'].includes(name)) {
          if (typeof args.product_id !== 'string' || !/^[a-zA-Z0-9_-]+(?:\.html)?$/.test(args.product_id)) throw new Error('Invalid product_id');
          const quantity = args.quantity ?? (name === 'add_to_cart' ? 1 : undefined);
          if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0 || (name === 'add_to_cart' && quantity === 0)) throw new Error('Invalid quantity');
        }
        switch (name) {
          case 'search_products':
            return await this.handle_search(args.query, args.limit || 10);
          case 'get_favorites':
            return await this.handle_favorites();
          case 'refresh_favorites':
            return await this.handle_refresh_favorites();
          case 'get_cart':
            return await this.handle_get_cart();
          case 'add_to_cart':
            return await this.handle_add_to_cart(args.product_id, args.quantity ?? 1);
          case 'update_cart_item':
            return await this.handle_update_cart_item(args.product_id, args.quantity);
          case 'get_order_history':
            return await this.handle_order_history(args.limit || 5);
          case 'get_most_bought':
            return await this.handle_most_bought(args.limit || 10);
          case 'close_session':
            await closeBrowser();
            return { content: [{ type: 'text', text: 'Session closed.' }] };
          default:
            return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
        }
      } catch (error) {
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
      }
  }

  formatProducts(products, preferences = null) {
    return products.map((p, i) => {
      const fav = preferences?.favorites?.find(f => normalizeCartProductId(f.productId) === normalizeCartProductId(p.product_id));
      const favBadge = fav ? ' ⭐ (favorite)' : '';
      const unitStr = p.unit ? ` (${p.unit})` : '';
      return `${i + 1}. ${p.name}${favBadge}\n   💰 ${p.price?.toFixed(2) || '?'}€${unitStr}\n   🆔 ${p.product_id}`;
    }).join('\n\n');
  }

  async handle_search(query, limit) {
    const prefs = await getPreferences();
    const products = await searchProducts(query, limit * 2);
    const ranked = rankByPreference(products, prefs);
    const top = ranked.slice(0, limit);

    const favCount = prefs?.favorites?.length || 0;
    return {
      content: [{
        type: 'text',
        text: `Found ${products.length} products for "${query}" (${favCount} favorites loaded)${top.some(p => p.score > 0) ? ' — ⭐ = in your favorites' : ''}:\n\n${this.formatProducts(top, prefs)}\n\nUse add_to_cart with the product_id.`
      }]
    };
  }

  async handle_favorites() {
    let prefs = await getPreferences();
    if (!prefs?.favorites?.length) {
      prefs = await updatePreferencesFromFavorites();
    }

    const list = prefs.favorites.map((f, i) =>
      `${i + 1}. ${f.name}${f.price ? ` — ${f.price}` : ''}`
    ).join('\n');

    return {
      content: [{
        type: 'text',
        text: `Your ${prefs.favorites.length} favorites:\n\n${list}`
      }]
    };
  }

  async handle_refresh_favorites() {
    const prefs = await updatePreferencesFromFavorites();
    return {
      content: [{
        type: 'text',
        text: `✅ Refreshed! ${prefs.favorites.length} favorites saved.\n\nTop 5:\n${prefs.favorites.slice(0, 5).map((f, i) => `${i+1}. ${f.name}`).join('\n')}`
      }]
    };
  }

  async handle_get_cart() {
    const cart = await retryAfterAutoLogin(() => getCart());
    if (cart?.error === 'not_authenticated') {
      return { content: [{ type: 'text', text: 'Not logged in. Set CONTINENTE_EMAIL and CONTINENTE_PASSWORD in the MCP server environment, or refresh cookies manually.' }], isError: true };
    }
    if (cart?.error) {
      return { content: [{ type: 'text', text: `Could not load cart. (${cart.error})` }], isError: true };
    }
    if (!Array.isArray(cart.items) || cart.items.length === 0) {
      return { content: [{ type: 'text', text: '🛒 Cart is empty.' }] };
    }
    const total = cart.total;
    const totalText = total === null ? 'Unavailable' : `${total.toFixed(2)}€`;
    const list = cart.items.map((item, i) =>
      `${i + 1}. ${item.name}\n   Qtd: ${item.qty} × ${item.price?.toFixed(2) || '?'}€\n   🆔 ${item.id}`
    ).join('\n');
    return {
      content: [{
        type: 'text',
        text: `🛒 Cart (${cart.items.length} items):\n\n${list}\n\n💶 Total: ${totalText}\n\nGo to https://www.continente.pt/checkout/carrinho/ to checkout.`
      }]
    };
  }

  async handle_add_to_cart(productId, quantity) {
    const result = await retryAfterAutoLogin(() => addToCart(productId, quantity));
    if (result.success) {
      return { content: [{ type: 'text', text: `✅ Added to cart! (${quantity}x)\n\nUse get_cart to review.` }] };
    }
    return { content: [{ type: 'text', text: `⚠️ ${result.error || result.message || 'Could not add to cart.'}` }], isError: true };
  }

  async handle_update_cart_item(productId, quantity) {
    const result = await retryAfterAutoLogin(() => updateCartItem(productId, quantity));
    if (result?.error === 'not_authenticated') {
      return { content: [{ type: 'text', text: 'Not logged in. Set CONTINENTE_EMAIL and CONTINENTE_PASSWORD in the MCP server environment, or refresh cookies manually.' }], isError: true };
    }
    if (result?.error === 'not_found') {
      return { content: [{ type: 'text', text: `Product ${productId} is not in the cart.` }], isError: true };
    }
    if (result.success) {
      return { content: [{ type: 'text', text: `✅ Updated cart item ${productId} to ${quantity}.\n\nUse get_cart to review.` }] };
    }
    return { content: [{ type: 'text', text: `⚠️ ${result.error || 'Could not update cart item.'}` }], isError: true };
  }

  async handle_order_history(limit) {
    const orders = await retryAfterAutoLogin(() => getOrderHistory(limit));
    if (orders?.error === 'not_authenticated') {
      return { content: [{ type: 'text', text: 'Not logged in. Set CONTINENTE_EMAIL and CONTINENTE_PASSWORD in the MCP server environment, or refresh cookies manually.' }], isError: true };
    }
    if (!Array.isArray(orders) || orders.length === 0) {
      return { content: [{ type: 'text', text: 'Could not load order history. Check https://www.continente.pt/conta/encomendas/' }] };
    }
    const list = orders.slice(0, limit).map((o, i) => {
      if (o.raw) return `${i + 1}. ${o.raw}`;
      const date = o.date ? `📅 ${o.date}` : '';
      const total = o.total ? ` — ${o.total}` : '';
      const lines = o.lines ? o.lines.join(' · ') : '';
      return `${i + 1}. ${date}${total}\n   ${lines}`;
    }).join('\n\n');
    return {
      content: [{
        type: 'text',
        text: `Recent orders:\n\n${list}\n\nView full history at https://www.continente.pt/conta/encomendas/`
      }]
    };
  }

  async handle_most_bought(limit) {
    const result = await retryAfterAutoLogin(() => getMostBought(limit));
    if (result.error) {
      return { content: [{ type: 'text', text: result.error === 'not_authenticated' ? 'Not logged in. Set CONTINENTE_EMAIL and CONTINENTE_PASSWORD in the MCP server environment, or refresh cookies manually.' : `Error: ${result.error}` }], isError: true };
    }
    if (!Array.isArray(result) || result.length === 0) {
      return { content: [{ type: 'text', text: 'Could not calculate most bought items from order history.' }] };
    }
    const top = result.slice(0, 25);
    const list = top.map((item, i) =>
      `${i + 1}. ${item.name} — ${item.qty} units across ${item.orders} order${item.orders > 1 ? 's' : ''}`
    ).join('\n');
    return {
      content: [{
        type: 'text',
        text: `Most bought products (calculated from your order history):\n\n${list}`
      }]
    };
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`Continente MCP v${VERSION} started`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = new ContinenteServer();
  server.start().catch(error => { console.error(error.message); process.exitCode = 1; });
}
