#!/usr/bin/env python3
"""
Continente Cookie Watcher — runs on Optiplex (cron)
Watches the Obsidian vault for updated continente cookies,
and copies them to ~/.continente/cookies.json when changed.
"""
import json
import os
import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path

VAULT_COOKIE = Path.home() / "vault" / "_claude" / "continente-cookies" / "cookies.json"
LOCAL_COOKIE = Path.home() / ".continente" / "cookies.json"
LAST_MARKER = Path.home() / ".continente" / ".last_cookie_hash"

def get_file_hash(path: Path) -> str:
    import hashlib
    return hashlib.md5(path.read_bytes()).hexdigest()

def load_vault_cookies() -> list | None:
    if not VAULT_COOKIE.exists():
        return None
    try:
        data = json.loads(VAULT_COOKIE.read_text())
        if isinstance(data, list):
            return data
        # Handle {cookies: [...]} format
        if isinstance(data, dict) and "cookies" in data:
            return data["cookies"]
        return None
    except Exception as e:
        print(f"[cookie-watcher] Failed to read vault cookies: {e}", file=sys.stderr)
        return None

def save_to_local(cookies: list) -> None:
    LOCAL_COOKIE.parent.mkdir(parents=True, exist_ok=True)
    LOCAL_COOKIE.write_text(json.dumps(cookies, indent=2, ensure_ascii=False))
    # Normalize sameSite values for compatibility
    for c in cookies:
        if c.get("sameSite") == "no_restriction":
            c["sameSite"] = "none"
    LOCAL_COOKIE.write_text(json.dumps(cookies, indent=2, ensure_ascii=False))
    print(f"[cookie-watcher] Updated {LOCAL_COOKIE} ({len(cookies)} cookies)")

def notify_mcp_server() -> None:
    """Tell the MCP server to reload its session by touching the cookie file."""
    if LOCAL_COOKIE.exists():
        # Update mtime so MCP knows to re-read
        LOCAL_COOKIE.touch()
        print("[cookie-watcher] Notified MCP server to reload cookies")

def main():
    cookies = load_vault_cookies()
    if cookies is None:
        print("[cookie-watcher] No cookies in vault yet (run cookie reader on MacBook first)")
        return

    current_hash = get_file_hash(VAULT_COOKIE)
    last_hash = LAST_MARKER.read_text().strip() if LAST_MARKER.exists() else ""

    if current_hash != last_hash:
        save_to_local(cookies)
        notify_mcp_server()
        LAST_MARKER.write_text(current_hash)
        print(f"[cookie-watcher] Cookie sync triggered — {len(cookies)} cookies")
    else:
        print("[cookie-watcher] Cookies unchanged — skipping")

if __name__ == "__main__":
    main()
