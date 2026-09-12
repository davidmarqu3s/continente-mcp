import { existsSync } from 'fs';

import { autoLogin, getCredentialStatus, loadCredentialEnv, resolveStatePaths } from '../continente-auto-login.js';

export { resolveStatePaths };

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

  const loginEnv = loadCredentialEnv(env);
  if (stateDir) loginEnv.CONTINENTE_STATE_DIR = stateDir;
  const { cookieFile } = resolveStatePaths(loginEnv);
  loginEnv.CONTINENTE_COOKIES_PATH = cookieFile;

  if (closeBrowser) {
    await closeBrowser();
  }

  const result = await autoLogin({
    env: loginEnv,
    log: (message) => log(`[auth] ${message}`),
  });

  return Boolean(result.success && existsSync(cookieFile));
}
