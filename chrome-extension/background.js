// Background service worker — polls Continente cookies and caches them
const DOMAIN = ".continente.pt";
const VAULT_PATH = "vault/_claude/continente/cookies.json"; // Relative to home, shown in popup

// Poll every 5 minutes
const POLL_INTERVAL_MS = 5 * 60 * 1000;

async function fetchCookies() {
  return new Promise((resolve, reject) => {
    chrome.cookies.getAll({ domain: DOMAIN }, (cookies) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(cookies);
      }
    });
  });
}

async function saveToStorage(cookies) {
  const serializable = cookies.map(c => ({
    domain: c.domain,
    name: c.name,
    value: c.value,
    path: c.path,
    secure: c.secure,
    httpOnly: c.httpOnly,
    sameSite: c.sameSite,
    expires: c.expiresDate,
  }));
  await chrome.storage.local.set({ continente_cookies: serializable, last_updated: Date.now() });
  return serializable;
}

async function pollAndCache() {
  try {
    const cookies = await fetchCookies();
    const saved = await saveToStorage(cookies);
    console.log(`[Continente Cookie Sync] Cached ${saved.length} cookies`);
  } catch (err) {
    console.error(`[Continente Cookie Sync] Error: ${err.message}`);
  }
}

// Initial fetch
pollAndCache();

// Periodic refresh
setInterval(pollAndCache, POLL_INTERVAL_MS);

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg === "get_cookies") {
    chrome.storage.local.get(["continente_cookies", "last_updated"], (data) => {
      sendResponse({
        cookies: data.continente_cookies || [],
        last_updated: data.last_updated || null,
      });
    });
    return true; // async response
  }
  if (msg === "refresh") {
    pollAndCache().then(() => sendResponse({ ok: true }));
    return true;
  }
});
