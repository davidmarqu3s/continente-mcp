#!/usr/bin/env node
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { chromium } from 'playwright';

const CONTINENTE_LOGIN_URL = 'https://www.continente.pt/login/';
const CONTINENTE_CHECK_URL = 'https://www.continente.pt/conta/encomendas/';
const DEFAULT_ENV = process.env;

function log(message) {
  console.error(`[continente-auto-login] ${message}`);
}

function writeCookies(path, cookies) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cookies, null, 2));
  chmodSync(path, 0o600);
}

function unquoteEnvValue(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseEnvFile(contents) {
  const parsed = {};
  for (const line of contents.split(/\r?\n/)) {
    let raw = line.trim();
    if (!raw || raw.startsWith('#')) continue;
    if (raw.startsWith('export ')) raw = raw.slice('export '.length).trim();
    const index = raw.indexOf('=');
    if (index === -1) continue;
    const key = raw.slice(0, index).trim();
    const value = raw.slice(index + 1);
    if (/^[A-Z_][A-Z0-9_]*$/.test(key)) {
      parsed[key] = unquoteEnvValue(value);
    }
  }
  return parsed;
}

export function credentialEnvPath(env = DEFAULT_ENV) {
  const home = env.HOME || (env === DEFAULT_ENV ? DEFAULT_ENV.HOME : undefined);
  return env.CONTINENTE_ENV_PATH || (home ? `${home}/.continente/credentials.env` : null);
}

export function loadCredentialEnv(env = DEFAULT_ENV) {
  const file = credentialEnvPath(env);
  if (!file || !existsSync(file)) {
    return { ...env };
  }
  return { ...parseEnvFile(readFileSync(file, 'utf8')), ...env };
}

function cookiePathForEnv(env) {
  return env.CONTINENTE_COOKIES_PATH || `${env.HOME || DEFAULT_ENV.HOME}/.continente/cookies.json`;
}

function syncVault(cookies, vaultCookiePath, logger) {
  if (!vaultCookiePath) return;
  const next = JSON.stringify(cookies, null, 2);
  if (existsSync(vaultCookiePath) && readFileSync(vaultCookiePath, 'utf8') === next) {
    logger('Vault unchanged.');
    return;
  }
  writeCookies(vaultCookiePath, cookies);
  logger('Vault cookies updated.');
}

export function getCredentialStatus(env = DEFAULT_ENV) {
  const mergedEnv = loadCredentialEnv(env);
  return {
    hasEmail: Boolean(mergedEnv.CONTINENTE_EMAIL),
    hasPassword: Boolean(mergedEnv.CONTINENTE_PASSWORD),
    ready: Boolean(mergedEnv.CONTINENTE_EMAIL && mergedEnv.CONTINENTE_PASSWORD),
  };
}

async function isLoggedIn(page) {
  await page.goto(CONTINENTE_CHECK_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(1000);
  return !page.url().includes('/login');
}

async function fillFirst(page, selectors, value, label) {
  for (const selector of selectors) {
    const input = await page.waitForSelector(selector, { timeout: 3000 }).catch(() => null);
    if (input) {
      await input.fill(value);
      return;
    }
  }
  throw new Error(`Could not find ${label} input`);
}

async function clickFirst(page, selectors) {
  for (const selector of selectors) {
    const button = await page.$(selector);
    if (button) {
      await button.click();
      return true;
    }
  }
  await page.keyboard.press('Enter');
  return false;
}

async function acceptCookies(page) {
  await page.getByRole('button', { name: /PERMITIR TODOS|Permitir todos/i })
    .click({ timeout: 5000 })
    .catch(() => {});
}

async function findLoginFrame(page) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const frame = page.frames().find((candidate) =>
      candidate.url().includes('login.continente.pt/user-register')
    );
    if (frame) {
      return frame;
    }
    await page.waitForTimeout(500);
  }
  throw new Error('Could not find Continente login frame');
}

export async function autoLogin({
  env = DEFAULT_ENV,
  log: logger = log,
} = {}) {
  const mergedEnv = loadCredentialEnv(env);
  const email = mergedEnv.CONTINENTE_EMAIL;
  const password = mergedEnv.CONTINENTE_PASSWORD;

  if (!getCredentialStatus(mergedEnv).ready) {
    logger('Missing CONTINENTE_EMAIL or CONTINENTE_PASSWORD.');
    return { success: false, error: 'missing_credentials' };
  }

  const browser = await chromium.launch({
    headless: mergedEnv.CONTINENTE_LOGIN_HEADLESS !== 'false',
  });

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      locale: 'pt-PT',
    });
    const page = await context.newPage();

    logger('Opening login page.');
    await page.goto(CONTINENTE_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await acceptCookies(page);
    const loginFrame = await findLoginFrame(page);

    logger('Entering email.');
    await fillFirst(loginFrame, [
      '#userNameCC',
      'input[name="userNameCC"]',
      'input[type="email"]',
      'input[name="email"]',
      'input[name="username"]',
      'input[type="text"]',
    ], email, 'email');

    await clickFirst(loginFrame, [
      'button[type="submit"]',
      'button:has-text("Avançar")',
      'button:has-text("Continuar")',
    ]);

    logger('Entering password.');
    await page.waitForTimeout(1500);
    await fillFirst(loginFrame, [
      '#password_input',
      'input[name="password_input"]',
      'input[type="password"]',
      'input[name="password"]',
    ], password, 'password');

    await clickFirst(loginFrame, [
      'button[type="submit"]',
      'button:has-text("Avançar")',
      'button:has-text("Entrar")',
      'button:has-text("Login")',
    ]);

    await page.waitForTimeout(4000);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});

    if (!(await isLoggedIn(page))) {
      throw new Error('Login did not reach an authenticated Continente page');
    }

    const cookies = await context.cookies();
    writeCookies(cookiePathForEnv(mergedEnv), cookies);
    syncVault(cookies, mergedEnv.CONTINENTE_VAULT_COOKIE_PATH, logger);
    logger(`Saved ${cookies.length} cookies.`);
    return { success: true, cookies: cookies.length };
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  autoLogin().then((result) => {
    if (!result.success) {
      process.exit(1);
    }
  }).catch((error) => {
    log(error.message);
    process.exit(1);
  });
}
