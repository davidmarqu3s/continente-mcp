import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

const CONTINENTE_BASE = 'https://www.continente.pt';
const STATE_DIR = `${process.env.HOME}/.continente`;

// ─── Browser / Session ───────────────────────────────────────────────────────

let browser = null;
let context = null;
let page = null;

function normalizeCookies(cookies) {
  return cookies
    .filter(c => c.name && c.name !== 'undefined')
    .map(c => ({
      ...c,
      sameSite: (!c.sameSite || c.sameSite === 'unspecified') ? 'Lax'
        : c.sameSite === 'no_restriction' ? 'None'
        : c.sameSite.charAt(0).toUpperCase() + c.sameSite.slice(1).toLowerCase()
    }));
}

async function ensureBrowser() {
  if (browser) return browser;
  
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    locale: 'pt-PT'
  });

  // Load cookies from file
  const cookieFile = `${STATE_DIR}/cookies.json`;
  if (existsSync(cookieFile)) {
    try {
      const cookies = JSON.parse(readFileSync(cookieFile, 'utf8'));
      const normalized = normalizeCookies(cookies);
      await context.addCookies(normalized);
    } catch (e) {
      console.error('Failed to load cookies:', e.message);
    }
  }

  page = await context.newPage();
  return browser;
}

async function goto(url, wait = 'networkidle') {
  await ensureBrowser();
  await page.goto(url, { waitUntil: wait, timeout: 20000 });
  await page.waitForTimeout(1500);
  return page;
}

async function closeBrowser() {
  if (page) { try { await page.close(); } catch(e) {} page = null; }
  if (context) { try { await context.close(); } catch(e) {} context = null; }
  if (browser) { try { await browser.close(); } catch(e) {} browser = null; }
}

// ─── Favorites / Preferences ───────────────────────────────────────────────────

async function fetchFavorites() {
  await goto(`${CONTINENTE_BASE}/conta/lista-produtos/?list=favorites`);
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

async function getFavoritesWithPrices() {
  await goto(`${CONTINENTE_BASE}/conta/lista-produtos/?list=favorites`);
  const html = await page.content();
  const $ = cheerio.load(html);
  const products = [];

  $('a[href*="/produto/"]').each((i, el) => {
    const $el = $(el);
    const text = $el.text().replace(/\s+/g, ' ').trim();
    const href = $el.attr('href') || '';
    const idMatch = href.match(/\/produto\/([^\/\?]+)/);
    const productId = idMatch ? idMatch[1] : null;
    const priceMatch = text.match(/(\d+[,.]\d+€)/);
    const name = text.replace(/\d+[,.]\d+€/g, '').trim().substring(0, 120);
    if (name && name.length > 3 && productId) {
      products.push({ name, productId, price: priceMatch ? priceMatch[1] : null, url: href });
    }
  });

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

  $('a[href*="/produto/"]').each((i, el) => {
    if (products.length >= limit) return;
    const $el = $(el);
    const text = $el.text().replace(/\s+/g, ' ').trim();
    const href = $el.attr('href') || '';

    if (!text || text.length < 5 || text.length > 2000) return;
    if (!text.includes('€')) return;

    const idMatch = href.match(/\/produto\/([^\/\?]+)/);
    const productId = idMatch ? idMatch[1] : href;
    const priceMatch = text.match(/(\d+[,.]\d+)€/);
    if (!priceMatch) return;

    const price = parseFloat(priceMatch[1].replace(',', '.'));
    const name = text.replace(/(\d+[,.]\d+)€/g, '').replace(/\s+/g, ' ').trim().substring(0, 100);
    const unitMatch = text.match(/(\d+[,.]\d+€)\/([a-zA-Z]+)/);

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
  await goto(`${CONTINENTE_BASE}/carrinho/`);
  const html = await page.content();
  const $ = cheerio.load(html);
  const items = [];

  $('[class*="cart-item"], [class*="basket-item"], .item, [class*="product-row"]').each((i, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text.includes('€')) {
      const priceMatch = text.match(/(\d+[,.]\d+)€/);
      const qtyMatch = text.match(/(\d+)\s*(?:x|un)/);
      const name = text.split('€')[0].trim().substring(0, 80);
      if (name) {
        items.push({
          name,
          price: priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : null,
          qty: qtyMatch ? parseInt(qtyMatch[1]) : 1
        });
      }
    }
  });

  return items;
}

async function addToCart(productId, quantity = 1) {
  await goto(`${CONTINENTE_BASE}/produto/${productId}`);
  
  // Find add to cart button and click
  const buttons = await page.locator('button').all();
  for (const btn of buttons) {
    const text = await btn.textContent();
    if (text && (text.includes('Adicionar') || text.includes('Carrinho'))) {
      await btn.click();
      await page.waitForTimeout(1500);
      return { success: true };
    }
  }

  // Try clicking the first add button
  const addBtn = page.locator('[class*="add-to-cart"], button[class*="add"]').first();
  if (await addBtn.count() > 0) {
    await addBtn.click();
    await page.waitForTimeout(1500);
    return { success: true };
  }

  return { success: false, message: 'Could not find add to cart button' };
}

// ─── Order History ────────────────────────────────────────────────────────────

async function getOrderHistory() {
  await goto(`${CONTINENTE_BASE}/conta/encomendas/`);
  const html = await page.content();
  const $ = cheerio.load(html);
  const orders = [];

  // Try to find order entries - look for date + product patterns
  const text = $.text();
  const orderSections = text.split(/(?:Encomenda|Order|Pedido)/i);

  for (const section of orderSections.slice(1, 6)) {
    const dateMatch = section.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/);
    const date = dateMatch ? dateMatch[0] : 'Unknown date';
    const products = [];

    // Find product names in section
    const productMatches = section.match(/[A-Z][a-zÀ-ÿ\d\s]+?(?:\s+\d+[,.]\d+€)/g);
    if (productMatches) {
      for (const m of productMatches.slice(0, 5)) {
        const cleaned = m.trim().substring(0, 80);
        if (cleaned.length > 3) products.push(cleaned);
      }
    }

    if (products.length > 0) {
      orders.push({ date, products });
    }
  }

  return orders;
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
  const favorites = await fetchFavorites();
  const prefs = {
    favorites,
    lastUpdated: new Date().toISOString()
  };
  await savePreferences(prefs);
  return prefs;
}

function rankByPreference(products, preferences) {
  if (!preferences || !preferences.favorites) return products;

  const favIds = new Set(preferences.favorites.map(f => f.productId));
  const favNames = new Map(preferences.favorites.map(f => [f.name.toLowerCase(), f]));

  return products.map(p => {
    let score = 0;
    if (favIds.has(p.product_id)) score += 100;
    const nameLower = p.name.toLowerCase();
    for (const [favName, fav] of favNames) {
      if (nameLower.includes(favName) || favName.includes(nameLower)) score += 50;
    }
    return { ...p, score };
  }).sort((a, b) => b.score - a.score);
}

// ─── MCP Server ───────────────────────────────────────────────────────────────

class ContinenteServer {
  constructor() {
    this.server = new Server(
      { name: 'continente-mcp', version: '3.0.0' },
      { capabilities: { tools: {} } }
    );
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
              limit: { type: 'number', description: 'Max results (default: 10)' }
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
              quantity: { type: 'number', description: 'Quantity (default: 1)' }
            },
            required: ['product_id']
          }
        },
        {
          name: 'get_order_history',
          description: 'Get your recent order history from your account.',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'number', description: 'Number of orders (default: 5)' }
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

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      try {
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
            return await this.handle_add_to_cart(args.product_id, args.quantity || 1);
          case 'get_order_history':
            return await this.handle_order_history(args.limit || 5);
          case 'close_session':
            await closeBrowser();
            return { content: [{ type: 'text', text: 'Session closed.' }] };
          default:
            return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
        }
      } catch (error) {
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
      }
    });
  }

  formatProducts(products, preferences = null) {
    return products.map((p, i) => {
      const fav = preferences?.favorites?.find(f => f.productId === p.product_id);
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
    const prefs = await getPreferences();
    if (!prefs?.favorites?.length) {
      return { content: [{ type: 'text', text: 'No favorites loaded. Run refresh_favorites first.' }] };
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
    const items = await getCart();
    if (items.length === 0) {
      return { content: [{ type: 'text', text: '🛒 Cart is empty.' }] };
    }
    const total = items.reduce((s, i) => s + (i.price || 0) * i.qty, 0);
    const list = items.map((item, i) =>
      `${i + 1}. ${item.name}\n   Qtd: ${item.qty} × ${item.price?.toFixed(2) || '?'}€`
    ).join('\n');
    return {
      content: [{
        type: 'text',
        text: `🛒 Cart (${items.length} items):\n\n${list}\n\n💶 Total: ${total.toFixed(2)}€\n\nGo to https://www.continente.pt/carrinho/ to checkout.`
      }]
    };
  }

  async handle_add_to_cart(productId, quantity) {
    const result = await addToCart(productId, quantity);
    if (result.success) {
      return { content: [{ type: 'text', text: `✅ Added to cart! (${quantity}x)\n\nUse get_cart to review.` }] };
    }
    return { content: [{ type: 'text', text: `⚠️ ${result.message || 'Could not add to cart.'}` }], isError: true };
  }

  async handle_order_history(limit) {
    const orders = await getOrderHistory();
    if (orders.length === 0) {
      return { content: [{ type: 'text', text: 'Could not load order history — orders may be loaded dynamically. Try refreshing or checking manually at https://www.continente.pt/conta/encomendas/' }] };
    }
    const list = orders.slice(0, limit).map((o, i) =>
      `${i + 1}. 📦 ${o.date}\n   ${o.products.slice(0, 3).join(', ')}${o.products.length > 3 ? '...' : ''}`
    ).join('\n\n');
    return {
      content: [{
        type: 'text',
        text: `Recent orders:\n\n${list}\n\nView full history at https://www.continente.pt/conta/encomendas/`
      }]
    };
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Continente MCP v3 started');
  }
}

const server = new ContinenteServer();
server.start().catch(console.error);
