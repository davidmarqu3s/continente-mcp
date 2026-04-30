#!/usr/bin/env python3
"""
Continente Cookie Reader for MacBook
Reads Chrome cookies for continente.pt and saves to Obsidian vault.

Run manually or via launchd (Login Item) for automation.
"""
import json
import os
import sys
from pathlib import Path

# ─── CONFIG ────────────────────────────────────────────────────────────────
# iCloud vault path (MacBook)
VAULT_PATH = Path.home() / "Library" / "Mobile Documents" / "iCloud~md~obsidian" / "Documents" / "vault" / "_claude" / "continente" / "cookies.json"
DOMAIN = "continente.pt"
# ───────────────────────────────────────────────────────────────────────────

def read_chrome_cookies() -> list[dict]:
    """Read continente.pt cookies from Arc (handles macOS keychain encryption)."""
    try:
        import browser_cookie3
        # Arc stores cookies per-profile; find the one with continente cookies
        arc_base = Path.home() / "Library" / "Application Support" / "Arc" / "User Data"
        profiles = ["Default", "Profile 1", "Profile 2", "Profile 3"]
        jar = None
        for profile in profiles:
            cookie_file = arc_base / profile / "Cookies"
            if not cookie_file.exists():
                continue
            try:
                candidate = browser_cookie3.arc(domain_name=DOMAIN, cookie_file=str(cookie_file))
                cookies_list = list(candidate)
                if cookies_list:
                    jar = cookies_list
                    print(f"Found cookies in Arc profile: {profile}")
                    break
            except Exception:
                continue
        if jar is None:
            print("No continente cookies found in any Arc profile.", file=sys.stderr)
            return []
        cookies = []
        for c in (jar if isinstance(jar, list) else jar):
            cookies.append({
                "domain": c.domain,
                "name": c.name,
                "value": c.value,
                "path": c.path,
                "secure": c.secure,
                "httpOnly": c.has_nonstandard_attr("HttpOnly"),
                "sameSite": "Lax",
                "expires": c.expires,
            })
        return cookies
    except Exception as e:
        print(f"Error reading cookies: {e}", file=sys.stderr)
        return []

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
