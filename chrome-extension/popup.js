const statusEl = document.getElementById('status');
const countBlock = document.getElementById('count-block');
const cookieCountEl = document.getElementById('cookie-count');
const refreshBtn = document.getElementById('refreshBtn');
const copyBtn = document.getElementById('copyBtn');

function formatAge(ts) {
  if (!ts) return 'never';
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function render(data) {
  if (!data.cookies || data.cookies.length === 0) {
    statusEl.textContent = 'No cookies found — are you logged into Continente?';
    statusEl.className = 'status empty';
    countBlock.style.display = 'none';
  } else {
    const age = formatAge(data.last_updated);
    statusEl.textContent = `Last updated ${age}`;
    statusEl.className = 'status ready';
    cookieCountEl.textContent = data.cookies.length;
    countBlock.style.display = 'block';
  }
}

function load() {
  chrome.runtime.sendMessage('get_cookies', render);
}

refreshBtn.addEventListener('click', () => {
  refreshBtn.textContent = '⏳ Refreshing...';
  refreshBtn.disabled = true;
  chrome.runtime.sendMessage('refresh', () => {
    refreshBtn.textContent = '✅ Done!';
    setTimeout(() => {
      refreshBtn.textContent = '🔄 Refresh Cookies';
      refreshBtn.disabled = false;
    }, 1500);
    load();
  });
});

copyBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage('get_cookies', (data) => {
    const json = JSON.stringify(data.cookies || [], null, 2);
    navigator.clipboard.writeText(json).then(() => {
      copyBtn.textContent = '✅ Copied!';
      setTimeout(() => { copyBtn.textContent = '📋 Copy as JSON'; }, 1500);
    });
  });
});

load();
