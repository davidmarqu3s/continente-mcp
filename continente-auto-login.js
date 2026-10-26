#!/usr/bin/env node
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const CONTINENTE_LOGIN_URL = 'https://www.continente.pt/login/';
const CONTINENTE_CHECK_URL = 'https://www.continente.pt/conta/encomendas/';
const DEFAULT_ENV = process.env;

function log(message) {
  console.error(`[continente-auto-login] ${message}`);
}

export function writeCookies(path, cookies) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  // Create owner-only; chmod also tightens files created by older versions.
  writeFileSync(path, JSON.stringify(cookies, null, 2), { mode: 0o600 });
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
  const home = env.HOME || env.USERPROFILE || (env === DEFAULT_ENV ? homedir() : null);
  const stateDir = env.CONTINENTE_STATE_DIR || (home ? join(home, '.continente') : null);
  return env.CONTINENTE_ENV_PATH || (stateDir ? join(stateDir, 'credentials.env') : null);
}

export function loadCredentialEnv(env = DEFAULT_ENV) {
  const file = credentialEnvPath(env);
  if (!file || !existsSync(file)) {
    return { ...env };
  }
  return { ...parseEnvFile(readFileSync(file, 'utf8')), ...env, CONTINENTE_ENV_PATH: file };
}

export function resolveStatePaths(env = DEFAULT_ENV) {
  const settings = loadCredentialEnv(env);
  const stateDir = settings.CONTINENTE_STATE_DIR || join(settings.HOME || settings.USERPROFILE || homedir(), '.continente');
  return { stateDir, cookieFile: settings.CONTINENTE_COOKIES_PATH || join(stateDir, 'cookies.json') };
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

export async function isLoggedIn(page) {
  const response = await page.goto(CONTINENTE_CHECK_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  if (!response?.ok() || page.url().includes('/login')) return false;
  const session = await page.context().request.get(
    'https://www.continente.pt/on/demandware.store/Sites-continente-Site/default/Cart-MiniCartShow',
    { headers: { 'X-Requested-With': 'XMLHttpRequest' }, timeout: 10000 }
  );
  if (!session.ok()) return false;
  const payload = await session.json().catch(() => null);
  return payload?.resources?.customerAuthenticated === true;
}

const EMAIL_INPUTS = '#userNameCC:visible, input[name="userNameCC"]:visible, input[type="email"]:visible, input[name="email"]:visible, input[name="username"]:visible, input[type="text"]:visible';
const PASSWORD_INPUTS = '#password_input:visible, input[name="password_input"]:visible, input[type="password"]:visible, input[name="password"]:visible';
const VERIFICATION_INPUT = 'input[id^="altcha_checkbox_"]:visible';

async function submitLoginStep(frame) {
  await frame.getByRole('button', { name: /^(Avançar|Continuar|Entrar|Login)$/i })
    .click({ timeout: 15000 });
}

export async function completeLoginForm(frame, { email, password, log: logger = log }) {
  logger('Entering email.');
  await frame.locator(EMAIL_INPUTS).first().fill(email, { timeout: 15000 });
  await submitLoginStep(frame);

  // Continente may ask for its native verification before showing the password.
  // Wait for either stage: the verification widget is inserted asynchronously.
  await frame.locator(`${PASSWORD_INPUTS}, ${VERIFICATION_INPUT}`).first()
    .waitFor({ state: 'visible', timeout: 15000 });
  const verification = frame.locator(VERIFICATION_INPUT);
  if (await verification.count()) {
    logger('Completing login verification.');
    await verification.click({ timeout: 10000 });
    await frame.getByText(/^(Verificado|Verified)$/i)
      .waitFor({ state: 'visible', timeout: 60000 });
    await submitLoginStep(frame);
  }

  logger('Entering password.');
  await frame.locator(PASSWORD_INPUTS).first().fill(password, { timeout: 15000 });
  await submitLoginStep(frame);
}

export async function acceptCookies(page) {
  const button = page.getByRole('button', { name: /PERMITIR TODOS|Permitir todos/i });
  if (!await button.isVisible()) {
    await button.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    if (!await button.isVisible()) return;
  }
  // The banner can render before its click handler is ready. Confirm dismissal
  // before interacting with the iframe, which the banner otherwise covers.
  for (let attempt = 0; attempt < 3; attempt++) {
    await button.click({ timeout: 5000 });
    try {
      await button.waitFor({ state: 'hidden', timeout: 5000 });
      return;
    } catch (error) {
      if (attempt === 2) throw new Error('Could not dismiss the Continente cookie banner');
    }
  }
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

    await completeLoginForm(loginFrame, { email, password, log: logger });

    await page.waitForTimeout(4000);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});

    if (!(await isLoggedIn(page))) {
      throw new Error('Login did not reach an authenticated Continente page');
    }

    const cookies = await context.cookies();
    writeCookies(resolveStatePaths(mergedEnv).cookieFile, cookies);
    syncVault(cookies, mergedEnv.CONTINENTE_VAULT_COOKIE_PATH, logger);
    logger(`Saved ${cookies.length} cookies.`);
    return { success: true, cookies: cookies.length };
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  autoLogin().then((result) => {
    if (!result.success) {
      process.exit(1);
    }
  }).catch((error) => {
    log(error.message);
    process.exit(1);
  });
}
