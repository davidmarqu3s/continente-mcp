#!/usr/bin/env python3
"""
Continente Cookie Reader for MacBook
Reads Chrome cookies for continente.pt and saves to Obsidian vault.

Run manually or via launchd (Login Item) for automation.
Vault path must match your Obsidian vault location.
"""
import json
import os
import sqlite3
import subprocess
from pathlib import Path

# ─── CONFIG ────────────────────────────────────────────────────────────────
VAULT_PATH = Path.home / "vault" / "_claude" / "continente" / "cookies.json"
COOKIE_DB = Path.home / "Library" / "Application Support" / "Google" / "Chrome" / "Default" / "Network" / "Cookies"
DOMAIN = ".continente.pt"
# ───────────────────────────────────────────────────────────────────────────

def read_chrome_cookies() -> list[dict]:
    """Read continente.pt cookies from Chrome's SQLite cookie jar."""
    # Chrome encrypts cookies on macOS — must access via copy
    temp_db = f"/tmp/continente_cookies_{os.getpid()}.db"
    subprocess.run(["cp", str(COOKIE_DB), temp_db], check=True)
    conn = sqlite3.connect(temp_db)
    cur = conn.cursor()
    cur.execute("""
        SELECT host_key, name, value, path, secure, same_party, expires_utc, is_secure, is_httponly, same_site
        FROM cookies
        WHERE host_key LIKE ?
        ORDER BY creation_utc DESC
    """, (f"%{DOMAIN}",))
    rows = cur.fetchall()
    conn.close()
    os.remove(temp_db)

    cookies = []
    for row in rows:
        (host, name, value, path, secure, same_party, expires_utc, is_secure, is_httponly, same_site) = row
        cookies.append({
            "domain": host,
            "name": name,
            "value": value,
            "path": path,
            "secure": bool(secure),
            "httpOnly": bool(is_httponly),
            "sameSite": _normalize_samesite(same_site),
            "expires": expires_utc,
        })
    return cookies

def _normalize_samesite(samesite: int) -> str:
    """Convert Chrome's same_site int to string."""
    return {0: "no_restriction", 1: "lax", 2: "strict"}.get(samesite, "lax")

def save_cookies(cookies: list[dict]) -> bool:
    """Save cookies to vault if changed."""
    VAULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    existing = []
    if VAULT_PATH.exists():
        try:
            existing = json.loads(VAULT_PATH.read_text())
        except Exception:
            pass
    if cookies == existing:
        print("Cookies unchanged — no sync needed.")
        return False
    VAULT_PATH.write_text(json.dumps(cookies, indent=2, ensure_ascii=False))
    print(f"Saved {len(cookies)} cookies → {VAULT_PATH}")
    return True

if __name__ == "__main__":
    print(f"Reading cookies from Chrome for {DOMAIN}...")
    cookies = read_chrome_cookies()
    print(f"Found {len(cookies)} cookies")
    if cookies:
        saved = save_cookies(cookies)
        if saved:
            print("Done — vault updated, will sync to Optiplex.")
        else:
            print("No changes detected.")
    else:
        print("WARNING: No cookies found — is Chrome logged into Continente?")
