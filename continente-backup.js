#!/usr/bin/env node
/**
 * Continente Order Backup — incremental
 *
 * Checks for orders not yet in the backup, fetches their details,
 * and appends them. Run daily via cron.
 *
 * Usage:
 *   node continente-backup.js
 *
 * Output:
 *   ~/.continente/orders-backup.json
 */
import { chromium } from 'playwright';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { normalizeCookies } from './src/utils.js';
import os from 'os';

const CONTINENTE_BASE = 'https://www.continente.pt';
const STATE_DIR       = `${os.homedir()}/.continente`;
const BACKUP_FILE     = `${STATE_DIR}/orders-backup.json`;
const COOKIE_FILE     = `${STATE_DIR}/cookies.json`;

const log = (...args) => console.error('[backup]', ...args);

// ─── Cookie helpers ───────────────────────────────────────────────────────────

function loadCookies() {
  if (!existsSync(COOKIE_FILE)) {
    log(`No cookies found at ${COOKIE_FILE}`);
    log('Run: python3 continente-cookie-reader.py');
    return null;
  }
  try {
    return JSON.parse(readFileSync(COOKIE_FILE, 'utf8'));
  } catch (e) {
    log('Failed to parse cookies:', e.message);
    return null;
  }
}

// ─── Scraping helpers ─────────────────────────────────────────────────────────

async function getOrderLinks(page) {
  await page.goto(`${CONTINENTE_BASE}/conta/encomendas/`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  if (page.url().includes('/login')) throw new Error('Not authenticated — cookies may have expired');

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
  const cookies = loadCookies();
  if (!cookies) process.exit(1);

  // Load existing backup
  let backup = { backedUpAt: null, orderCount: 0, orders: [] };
  if (existsSync(BACKUP_FILE)) {
    try { backup = JSON.parse(readFileSync(BACKUP_FILE, 'utf8')); } catch {}
  }
  const knownUrls = new Set(backup.orders.map(o => o.url).filter(Boolean));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: getPlatformUserAgent(),
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
    log('Nothing new to backup.');
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

  backup.orders    = [...newOrders, ...backup.orders];
  backup.orderCount = backup.orders.filter(o => !o.error).length;
  backup.backedUpAt = new Date().toISOString();

  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(BACKUP_FILE, JSON.stringify(backup, null, 2));
  log(`Done — added ${newOrders.length} orders. Total: ${backup.orderCount} → ${BACKUP_FILE}`);

  await browser.close();
}

function getPlatformUserAgent() {
  if (process.platform === 'win32') {
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
  } else if (process.platform === 'linux') {
    return 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
  }
  return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
}

main().catch(e => { log('Fatal:', e.message); process.exit(1); });
