import { existsSync } from 'fs';

import { autoLogin, getCredentialStatus } from '../continente-auto-login.js';

export function cookieFileForStateDir(stateDir) {
  return `${stateDir}/cookies.json`;
}

export function canAutoLogin(env = process.env) {
  return getCredentialStatus(env).ready;
}

export async function refreshAuthCookies({
  stateDir,
  closeBrowser,
  log = console.error,
  env = process.env,
} = {}) {
  if (!canAutoLogin(env)) {
    log('Automatic login skipped: CONTINENTE_EMAIL and CONTINENTE_PASSWORD are not both set.');
    return false;
  }

  const loginEnv = {
    CONTINENTE_COOKIES_PATH: cookieFileForStateDir(stateDir),
    ...env,
  };

  if (closeBrowser) {
    await closeBrowser();
  }

  const result = await autoLogin({
    env: loginEnv,
    log: (message) => log(`[auth] ${message}`),
  });

  return Boolean(result.success && existsSync(cookieFileForStateDir(stateDir)));
}
