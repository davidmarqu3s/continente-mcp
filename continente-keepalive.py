#!/usr/bin/env python3
"""
Continente Session Keepalive

Pings continente.pt to reset the idle session timeout.
If the session has expired, refreshes cookies via automatic env-file login first.
Browser-cookie export is used only as an advanced fallback.

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
LOGIN_EMAIL_ENV = "CONTINENTE_EMAIL"
LOGIN_PASSWORD_ENV = "CONTINENTE_PASSWORD"
LOGIN_ENV_PATH_ENV = "CONTINENTE_ENV_PATH"

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


def credential_env_path() -> Path:
    return Path(os.environ.get(LOGIN_ENV_PATH_ENV, str(Path.home() / ".continente" / "credentials.env")))


def parse_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values = {}
    for line in path.read_text().splitlines():
        raw = line.strip()
        if not raw or raw.startswith("#"):
            continue
        if raw.startswith("export "):
            raw = raw[len("export "):].strip()
        if "=" not in raw:
            continue
        key, value = raw.split("=", 1)
        key = key.strip()
        value = value.strip()
        if (
            len(value) >= 2
            and ((value[0] == value[-1] == '"') or (value[0] == value[-1] == "'"))
        ):
            value = value[1:-1]
        if key:
            values[key] = value
    return values


def credential_env() -> dict[str, str]:
    return {**parse_env_file(credential_env_path()), **os.environ}


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
    """Run the advanced browser-cookie fallback."""
    script = Path(__file__).parent / "continente-cookie-reader.py"
    if not script.exists():
        log("continente-cookie-reader.py not found next to this script.")
        return None
    try:
        result = subprocess.run(
            [sys.executable, str(script)],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            log("Cookie reader failed.")
            return None
        log("Cookie reader refreshed cookies.")
        return load_cookies(LOCAL_COOKIE)
    except Exception as e:
        log(f"Cookie reader failed: {e}")
        return None


def has_login_credentials() -> bool:
    env = credential_env()
    return bool(env.get(LOGIN_EMAIL_ENV) and env.get(LOGIN_PASSWORD_ENV))


def login_from_credentials() -> list[dict] | None:
    """Run the optional Playwright login fallback using env-provided credentials."""
    script = Path(__file__).parent / "continente-auto-login.js"
    if not script.exists():
        log("Automatic login script not found next to this script.")
        return None
    if not has_login_credentials():
        log(
            f"Automatic login skipped — set {LOGIN_EMAIL_ENV} and "
            f"{LOGIN_PASSWORD_ENV} in the env file."
        )
        return None

    try:
        login_env = {**os.environ, **credential_env()}
        result = subprocess.run(
            ["node", str(script)],
            capture_output=True,
            text=True,
            timeout=60,
            env=login_env,
        )
        if result.returncode != 0:
            log("Automatic login failed.")
            return None
        log("Automatic login refreshed cookies.")
        return load_cookies(LOCAL_COOKIE)
    except Exception as e:
        log(f"Automatic login failed: {e}")
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


def restore_session() -> bool:
    """Restore authenticated cookies, preferring env login over browser-cookie export."""
    log("Session expired — trying automatic login...")
    cookies = login_from_credentials()
    if cookies and ping(cookies):
        save_cookies(cookies)
        log("Session restored with automatic login.")
        return True

    log("Automatic login did not restore the session — refreshing from browser cookies...")
    cookies = refresh_from_browser()
    if cookies and ping(cookies):
        save_cookies(cookies)
        log("Session restored from browser cookies.")
        return True

    return False


def main() -> None:
    cookies = load_cookies(LOCAL_COOKIE)

    if not cookies:
        log("No cookies found.")
        if restore_session():
            return
        log(
            "ERROR: No authenticated cookies found. Set CONTINENTE_EMAIL and "
            "CONTINENTE_PASSWORD, or run continente-cookie-reader.py after logging in."
        )
        sys.exit(1)

    if ping(cookies):
        log("Session alive.")
        save_cookies(cookies)
        return

    if restore_session():
        return

    log(
        "ERROR: Still not logged in after refresh. "
        f"Set {LOGIN_EMAIL_ENV} and {LOGIN_PASSWORD_ENV}, or log into Continente "
        "in your browser and re-run continente-cookie-reader.py."
    )
    sys.exit(1)


if __name__ == "__main__":
    main()
