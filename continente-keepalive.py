#!/usr/bin/env python3
"""
Continente Session Keepalive

Pings continente.pt every run to reset the idle session timeout.
Saves any updated cookies back to ~/.continente/cookies.json and the vault.
If the session has expired, re-reads cookies from Arc and re-pings.

Run via LaunchAgent every 20 minutes.
"""
import json
import platform
import subprocess
import sys
from pathlib import Path

import requests

IS_MAC = platform.system() == "Darwin"

LOCAL_COOKIE = Path.home() / ".continente" / "cookies.json"
VAULT_COOKIE = (
    Path.home()
    / "Library/Mobile Documents/iCloud~md~obsidian/Documents/vault"
    / "_claude/continente-cookies/cookies.json"
) if IS_MAC else (
    Path.home() / "vault" / "_claude" / "continente-cookies" / "cookies.json"
)
PING_URL = "https://www.continente.pt/on/demandware.store/Sites-continente-Site/default/Account-Show"
CHECK_URL = "https://www.continente.pt/conta/encomendas/"
LOG_PREFIX = "[continente-keepalive]"


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


def cookies_to_jar(cookies: list[dict]) -> dict:
    return {c["name"]: c["value"] for c in cookies if c.get("name") and c["name"] != "undefined"}


def save_cookies(cookies: list[dict]) -> None:
    LOCAL_COOKIE.parent.mkdir(parents=True, exist_ok=True)
    LOCAL_COOKIE.write_text(json.dumps(cookies, indent=2, ensure_ascii=False))
    VAULT_COOKIE.parent.mkdir(parents=True, exist_ok=True)
    VAULT_COOKIE.write_text(json.dumps(cookies, indent=2, ensure_ascii=False))


def is_logged_in(session: requests.Session) -> bool:
    try:
        r = session.get(CHECK_URL, timeout=10, allow_redirects=True)
        return "login" not in r.url and r.status_code == 200
    except Exception:
        return False


def refresh_from_arc() -> list[dict] | None:
    """Re-run the cookie reader script to pull fresh cookies from Arc."""
    script = Path(__file__).parent / "continente-cookie-reader.py"
    if not script.exists():
        return None
    try:
        result = subprocess.run(
            [sys.executable, str(script)],
            capture_output=True, text=True, timeout=30
        )
        log(f"Cookie reader: {result.stdout.strip() or result.stderr.strip()}")
        return load_cookies(VAULT_COOKIE)
    except Exception as e:
        log(f"Cookie reader failed: {e}")
        return None


def ping(cookies: list[dict]) -> tuple[bool, requests.Session]:
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept-Language": "pt-PT,pt;q=0.9",
    })
    for c in cookies:
        if c.get("name") and c["name"] != "undefined":
            session.cookies.set(c["name"], c["value"], domain=c.get("domain", ".continente.pt"))

    logged_in = is_logged_in(session)
    if logged_in:
        # Touch the account page to reset idle timeout
        try:
            session.get(PING_URL, timeout=10)
        except Exception:
            pass
    return logged_in, session


def main() -> None:
    cookies = load_cookies(LOCAL_COOKIE) or load_cookies(VAULT_COOKIE)

    if not cookies:
        if IS_MAC:
            log("No cookies found — trying Arc...")
            cookies = refresh_from_arc()
        if not cookies:
            log("ERROR: No cookies found. Log into Continente in Arc (MacBook).")
            sys.exit(1)

    logged_in, _ = ping(cookies)

    if logged_in:
        log("Session alive — ping successful.")
        save_cookies(cookies)
        return

    if IS_MAC:
        log("Session expired — refreshing from Arc...")
        cookies = refresh_from_arc()
        if not cookies:
            log("ERROR: Could not refresh cookies from Arc.")
            sys.exit(1)
        logged_in, _ = ping(cookies)
        if logged_in:
            save_cookies(cookies)
            log("Session restored from Arc.")
            return
        log("ERROR: Still not logged in after refresh. Log into Continente in Arc manually.")
    else:
        log("ERROR: Session expired. Log into Continente on MacBook — cookies will sync within 20 min.")

    sys.exit(1)


if __name__ == "__main__":
    main()
