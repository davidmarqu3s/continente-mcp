#!/usr/bin/env python3
"""
Continente Session Keepalive

Pings continente.pt to reset the idle session timeout.
If the session has expired, re-reads cookies from your browser automatically.

Run every 20 minutes via cron or launchd:
  */20 * * * * python3 /path/to/continente-keepalive.py >> ~/.continente/keepalive.log 2>&1
"""
import json
import os
import stat
import subprocess
import sys
from pathlib import Path

import requests

LOCAL_COOKIE = Path(
    os.environ.get("CONTINENTE_COOKIES_PATH", str(Path.home() / ".continente" / "cookies.json"))
)
PING_URL = "https://www.continente.pt/on/demandware.store/Sites-continente-Site/default/Account-Show"
CHECK_URL = "https://www.continente.pt/conta/encomendas/"
LOG_PREFIX = "[continente-keepalive]"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
)


def log(msg: str) -> None:
    print(f"{LOG_PREFIX} {msg}", flush=True)


def load_cookies(path: Path) -> list[dict] | None:
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text())
        return data if isinstance(data, list) else data.get("cookies")
    except Exception as e:
        log(f"Failed to read {path}: {e}")
        return None


def save_cookies(cookies: list[dict]) -> None:
    LOCAL_COOKIE.parent.mkdir(parents=True, exist_ok=True)
    LOCAL_COOKIE.write_text(json.dumps(cookies, indent=2, ensure_ascii=False))
    os.chmod(LOCAL_COOKIE, stat.S_IRUSR | stat.S_IWUSR)


def is_logged_in(session: requests.Session) -> bool:
    try:
        r = session.get(CHECK_URL, timeout=10, allow_redirects=True)
        return "login" not in r.url and r.status_code == 200
    except Exception:
        return False


def refresh_from_browser() -> list[dict] | None:
    """Re-run continente-cookie-reader.py to pull fresh cookies from the browser."""
    script = Path(__file__).parent / "continente-cookie-reader.py"
    if not script.exists():
        log("continente-cookie-reader.py not found next to this script.")
        return None
    try:
        result = subprocess.run(
            [sys.executable, str(script)],
            capture_output=True, text=True, timeout=30
        )
        output = (result.stdout + result.stderr).strip()
        if output:
            log(f"Cookie reader: {output}")
        return load_cookies(LOCAL_COOKIE)
    except Exception as e:
        log(f"Cookie reader failed: {e}")
        return None


def ping(cookies: list[dict]) -> bool:
    session = requests.Session()
    session.headers.update({
        "User-Agent": USER_AGENT,
        "Accept-Language": "pt-PT,pt;q=0.9",
    })
    for c in cookies:
        if c.get("name") and c["name"] != "undefined":
            session.cookies.set(c["name"], c["value"], domain=c.get("domain", ".continente.pt"))

    logged_in = is_logged_in(session)
    if logged_in:
        try:
            session.get(PING_URL, timeout=10)
        except Exception:
            pass
    return logged_in


def main() -> None:
    cookies = load_cookies(LOCAL_COOKIE)

    if not cookies:
        log("No cookies found — trying to refresh from browser...")
        cookies = refresh_from_browser()
        if not cookies:
            log("ERROR: No cookies found. Run continente-cookie-reader.py first.")
            sys.exit(1)

    if ping(cookies):
        log("Session alive.")
        save_cookies(cookies)
        return

    log("Session expired — refreshing from browser...")
    cookies = refresh_from_browser()
    if not cookies:
        log("ERROR: Could not refresh cookies. Run continente-cookie-reader.py manually.")
        sys.exit(1)

    if ping(cookies):
        save_cookies(cookies)
        log("Session restored.")
        return

    log(
        "ERROR: Still not logged in after refresh. "
        "Log into Continente in your browser and re-run continente-cookie-reader.py."
    )
    sys.exit(1)


if __name__ == "__main__":
    main()
