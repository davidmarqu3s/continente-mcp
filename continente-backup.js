#!/usr/bin/env node
/**
 * Continente Order Backup — incremental
 *
 * Checks for orders not yet in the backup, fetches their details,
 * and appends them. Saves to ~/.continente/orders-backup.json and vault.
 *
 * Run daily via cron.
 */
import { chromium } from 'playwright';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

const CONTINENTE_BASE  = 'https://www.continente.pt';
const STATE_DIR        = `${process.env.HOME}/.continente`;
const BACKUP_FILE      = `${STATE_DIR}/orders-backup.json`;

// Platform-aware vault path
const IS_MAC   = process.platform === 'darwin';
const VAULT_BACKUP = IS_MAC
  ? `${process.env.HOME}/Library/Mobile Documents/iCloud~md~obsidian/Documents/vault/_claude/continente/orders-backup.json`
  : `${process.env.HOME}/vault/_claude/continente/orders-backup.json`;

const log = (...args) => console.error('[backup]', ...args);

// ─── Cookie helpers ───────────────────────────────────────────────────────────

function normalizeCookies(cookies) {
  return cookies
    .filter(c => c.name && c.name !== 'undefined')
    .map(c => {
      const n = {
        name: c.name, value: c.value, domain: c.domain, path: c.path || '/',
        httpOnly: Boolean(c.httpOnly), secure: Boolean(c.secure),
        sameSite: (!c.sameSite || c.sameSite === 'unspecified') ? 'Lax'
          : c.sameSite === 'no_restriction' ? 'None'
          : c.sameSite.charAt(0).toUpperCase() + c.sameSite.slice(1).toLowerCase()
      };
      if (c.expires != null) n.expires = Number(c.expires);
      return n;
    });
}

function loadCookies() {
  const paths = [
    `${STATE_DIR}/cookies.json`,
    VAULT_BACKUP.replace('orders-backup.json', 'cookies.json'),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      try { return JSON.parse(readFileSync(p, 'utf8')); } catch {}
    }
  }
  return null;
}

// ─── Scraping helpers ─────────────────────────────────────────────────────────

async function getOrderLinks(page) {
  await page.goto(`${CONTINENTE_BASE}/conta/encomendas/`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  if (page.url().includes('/login')) throw new Error('Not authenticated');

  return page.evaluate(() => {
    const seen = new Set();
    return Array.from(document.querySelectorAll('a[href*="detalhe-encomenda"]'))
      .map(a => a.href)
      .filter(h => { if (seen.has(h)) return false; seen.add(h); return true; });
  });
}

async function getOrderDetail(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);

  return page.evaluate(() => {
    const bodyText = document.body.innerText;
    const orderNumMatch = bodyText.match(/Encomenda (\d{9}_\d{3})/);
    const totalMatch    = bodyText.match(/Total Encomendado\s+([\d,.]+€)/);
    const slotMatch     = bodyText.match(/(\d{1,2}:\d{2} - \d{1,2}:\d{2})/);
    const dateMatch     = bodyText.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}/i);

    const products = [];
    document.querySelectorAll('[class*="product-line"]').forEach(el => {
      const qtyEl = el.querySelector('[class*="qty"], [class*="quantity"], [class*="amount"]');
      if (!qtyEl) return;
      const nameEl  = el.querySelector('[class*="product-name"], [class*="name"], a[href*="produto"]');
      const rawName = (nameEl || el).textContent.trim();
      const name    = rawName.split('\n')[0].trim();
      const qtyMatch = qtyEl.textContent.trim().match(/^(\d+)/);
      const qty     = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
      const priceEl = el.querySelector('[class*="price"]');
      const price   = priceEl ? priceEl.textContent.trim().split('\n')[0].trim() : null;
      if (name && name.length > 3) products.push({ name, qty, price });
    });

    return {
      orderNumber:  orderNumMatch ? orderNumMatch[1] : null,
      date:         dateMatch     ? dateMatch[0]     : null,
      total:        totalMatch    ? totalMatch[1]    : null,
      deliverySlot: slotMatch     ? slotMatch[1]     : null,
      productCount: products.length,
      products,
    };
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Load existing backup
  let backup = { backedUpAt: null, orderCount: 0, orders: [] };
  if (existsSync(BACKUP_FILE)) {
    try { backup = JSON.parse(readFileSync(BACKUP_FILE, 'utf8')); } catch {}
  }
  const knownUrls = new Set(backup.orders.map(o => o.url).filter(Boolean));

  const cookies = loadCookies();
  if (!cookies) { log('No cookies found — aborting'); process.exit(1); }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    locale: 'pt-PT',
  });
  await context.addCookies(normalizeCookies(cookies));
  const page = await context.newPage();

  let orderLinks;
  try {
    orderLinks = await getOrderLinks(page);
  } catch (e) {
    log('Failed to load orders page:', e.message);
    await browser.close();
    process.exit(1);
  }

  const newLinks = orderLinks.filter(l => !knownUrls.has(l));
  log(`${orderLinks.length} orders on site, ${knownUrls.size} already backed up, ${newLinks.length} new`);

  if (newLinks.length === 0) {
    log('Nothing to do.');
    await browser.close();
    return;
  }

  const newOrders = [];
  for (let i = 0; i < newLinks.length; i++) {
    try {
      const detail = await getOrderDetail(page, newLinks[i]);
      detail.url = newLinks[i];
      newOrders.push(detail);
      log(`${i + 1}/${newLinks.length} — ${detail.orderNumber || '?'} (${detail.productCount} products)`);
    } catch (e) {
      log(`${i + 1}/${newLinks.length} FAILED: ${e.message}`);
      newOrders.push({ url: newLinks[i], error: e.message });
    }
  }

  // Prepend new orders (most recent first) and save
  backup.orders = [...newOrders, ...backup.orders];
  backup.orderCount = backup.orders.filter(o => !o.error).length;
  backup.backedUpAt = new Date().toISOString();

  mkdirSync(STATE_DIR, { recursive: true });
  const json = JSON.stringify(backup, null, 2);
  writeFileSync(BACKUP_FILE, json);

  // Sync to vault
  try {
    mkdirSync(VAULT_BACKUP.replace(/\/[^/]+$/, ''), { recursive: true });
    writeFileSync(VAULT_BACKUP, json);
    log(`Vault updated: ${VAULT_BACKUP}`);
  } catch (e) {
    log(`Vault sync failed (ok if on Optiplex without iCloud): ${e.message}`);
  }

  log(`Done — added ${newOrders.length} orders. Total: ${backup.orderCount}`);
  await browser.close();
}

main().catch(e => { log('Fatal:', e.message); process.exit(1); });
