#!/usr/bin/env node
/**
 * Continente Change Detector
 *
 * Checks whether the website structure has changed in a way that might break
 * the MCP server's scrapers. Run daily via cron.
 *
 * Usage:
 *   node check-change.js
 *
 * On first run it saves a baseline fingerprint. Subsequent runs compare against
 * it and log a warning if the structure changed significantly.
 *
 * To receive a webhook notification on change, set:
 *   CONTINENTE_ALERT_WEBHOOK=https://hooks.slack.com/...
 */

import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import os from 'os';

const CONTINENTE_SEARCH  = 'https://www.continente.pt/pesquisa/?q=leite';
const STATE_DIR          = `${os.homedir()}/.continente`;
const FINGERPRINT_FILE   = `${STATE_DIR}/fingerprint.json`;
const LAST_ALERT_FILE    = `${STATE_DIR}/last_change_alert.txt`;
const COOKIE_FILE        = `${STATE_DIR}/cookies.json`;
const WEBHOOK_URL        = process.env.CONTINENTE_ALERT_WEBHOOK || null;

function getPlatformUserAgent() {
  if (process.platform === 'win32') {
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
  } else if (process.platform === 'linux') {
    return 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
  }
  return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
}

function extractFingerprint(html) {
  const $ = cheerio.load(html);
  $('script, style, noscript, iframe, svg').remove();

  const counts = {
    produtoLinks:  $('a[href*="/produto/"]').length,
    priceElements: $('[class*="price"]').filter((i, el) => $(el).text().includes('€')).length,
    forms:         $('form').length,
    buttons:       $('button').length,
    productCards:  $('[class*="product"], [class*="card"]').filter(
      (i, el) => $(el).find('a[href*="/produto/"]').length > 0
    ).length,
  };

  return {
    ...counts,
    hash:      createHash('sha256').update(JSON.stringify(counts)).digest('hex').substring(0, 12),
    timestamp: new Date().toISOString(),
  };
}

async function fetchHtml() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: getPlatformUserAgent() });

  if (existsSync(COOKIE_FILE)) {
    try {
      const cookies = JSON.parse(readFileSync(COOKIE_FILE, 'utf8'));
      if (cookies.length > 0) await context.addCookies(cookies);
    } catch {}
  }

  const page = await context.newPage();
  await page.goto(CONTINENTE_SEARCH, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);

  const html = await page.content();
  await browser.close();
  return html;
}

async function sendAlert(message) {
  if (WEBHOOK_URL) {
    // POST to webhook (works with Slack, Discord, n8n, etc.)
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      console.error('[ChangeDetector] Webhook notified.');
    } catch (e) {
      console.error(`[ChangeDetector] Webhook failed: ${e.message}`);
    }
  } else {
    // No webhook configured — log prominently to stdout so cron picks it up
    console.log('\n' + '='.repeat(60));
    console.log('CONTINENTE STRUCTURE CHANGE DETECTED');
    console.log('='.repeat(60));
    console.log(message);
    console.log('='.repeat(60) + '\n');
  }
}

async function main() {
  mkdirSync(STATE_DIR, { recursive: true });

  console.error(`[ChangeDetector] Checking ${CONTINENTE_SEARCH}`);
  const html    = await fetchHtml();
  const current = extractFingerprint(html);

  if (!existsSync(FINGERPRINT_FILE)) {
    writeFileSync(FINGERPRINT_FILE, JSON.stringify({ baseline: current, savedAt: current.timestamp }, null, 2));
    console.error(`[ChangeDetector] Baseline saved (${current.hash}). Run again tomorrow to start detecting changes.`);
    return;
  }

  const { baseline } = JSON.parse(readFileSync(FINGERPRINT_FILE, 'utf8'));

  if (baseline.hash === current.hash) {
    console.error(`[ChangeDetector] Unchanged (${current.hash}). All good.`);
    return;
  }

  const diffs = {};
  for (const key of Object.keys(baseline)) {
    if (key === 'hash' || key === 'timestamp') continue;
    if (JSON.stringify(baseline[key]) !== JSON.stringify(current[key])) {
      diffs[key] = { before: baseline[key], after: current[key] };
    }
  }

  const diffSummary = Object.entries(diffs).map(([k, v]) => `${k}: ${v.before} → ${v.after}`).join(', ');
  console.error(`[ChangeDetector] CHANGE DETECTED: ${diffSummary}`);

  // Rate-limit: only alert once per 24 h
  if (existsSync(LAST_ALERT_FILE)) {
    const lastAlert = readFileSync(LAST_ALERT_FILE, 'utf8').trim();
    const hoursSince = (Date.now() - new Date(lastAlert).getTime()) / 3_600_000;
    if (hoursSince < 24) {
      console.error(`[ChangeDetector] Alert suppressed (last sent ${hoursSince.toFixed(1)}h ago).`);
      return;
    }
  }

  const alertMsg =
    `⚠️ Continente website structure changed — the MCP scraper may need updating.\n\n` +
    `Baseline: ${baseline.hash}\n` +
    `Current:  ${current.hash}\n` +
    `Changes:  ${diffSummary}\n\n` +
    `Check https://github.com/davidmarqu3s/continente-mcp for updates.`;

  await sendAlert(alertMsg);
  writeFileSync(LAST_ALERT_FILE, new Date().toISOString());
}

main().catch(e => { console.error('[ChangeDetector] Fatal:', e.message); process.exit(1); });
