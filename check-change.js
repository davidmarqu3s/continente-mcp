#!/usr/bin/env node
/**
 * Continente Change Detector — runs as a daily cron job
 * Checks if the website structure has changed and alerts via Hermes
 */

import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { spawn } from 'child_process';
import { chromium } from 'playwright';
import * as cheerio from 'cheerio';

const CONTINENTE_SEARCH = 'https://www.continente.pt/pesquisa/?q=leite';
const STATE_DIR = `${process.env.HOME}/.continente`;
const CHANGE_ALERT_FILE = `${STATE_DIR}/last_change_alert.txt`;

function extractFingerprint(html) {
  const $ = cheerio.load(html);
  $('script, style, noscript, iframe, svg').remove();

  const counts = {
    produtoLinks: $('a[href*="/produto/"]').length,
    priceElements: $('[class*="price"]').filter((i, el) => $(el).text().includes('€')).length,
    forms: $('form').length,
    buttons: $('button').length,
    productCards: $('[class*="product"], [class*="card"]').filter(
      (i, el) => $(el).find('a[href*="/produto/"]').length > 0
    ).length,
  };

  return {
    ...counts,
    hash: createHash('sha256').update(JSON.stringify(counts)).digest('hex').substring(0, 12),
    timestamp: new Date().toISOString()
  };
}

async function fetchHtml() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
  });

  // Load existing session cookies if available
  const cookieFile = `${STATE_DIR}/session.json`;
  if (existsSync(cookieFile)) {
    try {
      const cookies = JSON.parse(readFileSync(cookieFile, 'utf8'));
      if (cookies.length > 0) await context.addCookies(cookies);
    } catch (e) {}
  }

  const page = await context.newPage();
  await page.goto(CONTINENTE_SEARCH, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);

  const html = await page.content();
  await browser.close();
  return html;
}

function sendAlert(message) {
  return new Promise((resolve, reject) => {
    const proc = spawn('hermes', ['chat', '-q', message], { stdio: 'inherit' });
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`hermes exited ${code}`)));
  });
}

async function main() {
  try {
    mkdirSync(STATE_DIR, { recursive: true });

    console.error(`[ChangeDetector] Checking ${CONTINENTE_SEARCH}`);
    const html = await fetchHtml();
    const current = extractFingerprint(html);

    const fingerprintFile = `${STATE_DIR}/fingerprint.json`;

    if (!existsSync(fingerprintFile)) {
      // First run — save baseline silently
      writeFileSync(fingerprintFile, JSON.stringify({ baseline: current, savedAt: current.timestamp }, null, 2));
      console.error(`[ChangeDetector] Baseline saved (${current.hash}). No alert sent.`);
      return;
    }

    const saved = JSON.parse(readFileSync(fingerprintFile, 'utf8'));
    const baseline = saved.baseline;

    if (baseline.hash === current.hash) {
      console.error(`[ChangeDetector] Unchanged (${current.hash}). No alert.`);
      return;
    }

    // Something changed
    const diffs = {};
    for (const key of Object.keys(baseline)) {
      if (key === 'hash' || key === 'timestamp') continue;
      if (JSON.stringify(baseline[key]) !== JSON.stringify(current[key])) {
        diffs[key] = { before: baseline[key], after: current[key] };
      }
    }

    const diffSummary = Object.entries(diffs).map(([k, v]) => `${k}: ${v.before} → ${v.after}`).join(', ');
    console.error(`[ChangeDetector] CHANGE DETECTED: ${diffSummary}`);

    // Rate limit: only alert once per 24h
    if (existsSync(CHANGE_ALERT_FILE)) {
      const lastAlert = readFileSync(CHANGE_ALERT_FILE, 'utf8').trim();
      const hoursSinceAlert = (Date.now() - new Date(lastAlert).getTime()) / (1000 * 60 * 60);
      if (hoursSinceAlert < 24) {
        console.error(`[ChangeDetector] Alert suppressed (last alert ${hoursSinceAlert.toFixed(1)}h ago).`);
        return;
      }
    }

    const alertMsg = `⚠️ Continente website structure changed!\n\nBaseline: ${baseline.hash}\nCurrent: ${current.hash}\nChanges: ${diffSummary}\n\nThe scraper may need updating.`;

    try {
      await sendAlert(alertMsg);
      writeFileSync(CHANGE_ALERT_FILE, new Date().toISOString());
      console.error(`[ChangeDetector] Alert sent!`);
    } catch (e) {
      console.error(`[ChangeDetector] Failed to send alert: ${e.message}`);
    }

  } catch (error) {
    console.error(`[ChangeDetector] Error: ${error.message}`);
    process.exit(1);
  }
}

main();
