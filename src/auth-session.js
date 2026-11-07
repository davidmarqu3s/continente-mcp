import { existsSync } from 'fs';

import { autoLogin, getCredentialStatus, loadCredentialEnv, resolveStatePaths } from '../continente-auto-login.js';

export { resolveStatePaths };

export function canAutoLogin(env = process.env) {
  return getCredentialStatus(env).ready;
}

// Runs the automatic login. Returns { success, error }; login exceptions propagate.
async function runAutoLogin({
  stateDir,
  closeBrowser,
  log = console.error,
  env = process.env,
  runLogin = autoLogin,
} = {}) {
  const loginEnv = loadCredentialEnv(env);
  if (stateDir) loginEnv.CONTINENTE_STATE_DIR = stateDir;
  const { cookieFile } = resolveStatePaths(loginEnv);
  loginEnv.CONTINENTE_COOKIES_PATH = cookieFile;

  if (closeBrowser) {
    await closeBrowser();
  }

  const result = await runLogin({
    env: loginEnv,
    log: (message) => log(`[auth] ${message}`),
  });
  if (!result?.success) return { success: false, error: result?.error || 'login_failed' };
  if (!existsSync(cookieFile)) return { success: false, error: 'cookies_not_saved' };
  return { success: true };
}

export async function refreshAuthCookies(options = {}) {
  const { log = console.error, env = process.env } = options;
  if (!canAutoLogin(env)) {
    log('Automatic login skipped: CONTINENTE_EMAIL and CONTINENTE_PASSWORD are not both set.');
    return false;
  }
  const result = await runAutoLogin(options);
  return result.success;
}

// Login on request (the `login` tool): never throws, always explains failures.
export async function loginNow(options = {}) {
  if (!canAutoLogin(options.env ?? process.env)) {
    return { success: false, error: 'missing_credentials' };
  }
  try {
    return await runAutoLogin(options);
  } catch (error) {
    return { success: false, error: error.message };
  }
}
