#!/usr/bin/env python3
"""
continente-cookie-reader — export Continente.pt cookies from your browser.

Reads browser cookies for continente.pt and writes them to ~/.continente/cookies.json
so the MCP server can use them. Auto-detects your browser or let you specify one.

Usage:
  python3 continente-cookie-reader.py                    # auto-detect
  python3 continente-cookie-reader.py --browser chrome
  python3 continente-cookie-reader.py --browser firefox
  python3 continente-cookie-reader.py --output /path/to/cookies.json
  python3 continente-cookie-reader.py --list-browsers

Requirements:
  pip install browser-cookie3

Environment variables:
  CONTINENTE_COOKIES_PATH      Override the default output path (~/.continente/cookies.json)
  CONTINENTE_VAULT_COOKIE_PATH If set, also write cookies to this path (useful for syncing
                               to a second machine via a shared folder, e.g. Obsidian vault)
"""
import argparse
import json
import os
import stat
import sys
from pathlib import Path

DOMAIN = "continente.pt"
DEFAULT_OUTPUT = Path(
    os.environ.get("CONTINENTE_COOKIES_PATH", str(Path.home() / ".continente" / "cookies.json"))
)

# If set, cookies are also written here (e.g. for syncing to a remote machine)
VAULT_PATH = Path(os.environ["CONTINENTE_VAULT_COOKIE_PATH"]) if "CONTINENTE_VAULT_COOKIE_PATH" in os.environ else None

# Tried in this order when auto-detecting
BROWSERS = ["arc", "chrome", "edge", "brave", "firefox", "chromium", "vivaldi", "opera", "safari"]


def get_browser_cookies(browser_name: str) -> list[dict]:
    """Read continente.pt cookies from the given browser."""
    import browser_cookie3

    getter = getattr(browser_cookie3, browser_name, None)
    if getter is None:
        raise ValueError(f"Browser '{browser_name}' not supported by browser-cookie3.")

    jar = getter(domain_name=DOMAIN)
    cookies = []
    for c in jar:
        cookies.append({
            "domain": c.domain,
            "name": c.name,
            "value": c.value,
            "path": getattr(c, "path", "/"),
            "secure": bool(getattr(c, "secure", False)),
            "httpOnly": c.has_nonstandard_attr("HttpOnly") if hasattr(c, "has_nonstandard_attr") else False,
            "sameSite": "Lax",
            "expires": getattr(c, "expires", None),
        })
    return cookies


def find_cookies(browser: str | None) -> tuple[list[dict], str]:
    """Return (cookies, browser_name). Tries specified browser or auto-detects."""
    if browser:
        try:
            cookies = get_browser_cookies(browser)
        except Exception as e:
            print(f"Error reading {browser}: {e}", file=sys.stderr)
            sys.exit(1)
        if not cookies:
            print(f"No Continente cookies found in {browser}. Are you logged in?", file=sys.stderr)
            sys.exit(1)
        return cookies, browser

    print("Auto-detecting browser with Continente cookies...", file=sys.stderr)
    for name in BROWSERS:
        try:
            cookies = get_browser_cookies(name)
            if cookies:
                return cookies, name
        except Exception as e:
            print(f"  {name}: {e}", file=sys.stderr)
            continue

    print(
        "\nNo Continente cookies found in any supported browser.\n"
        "Make sure you are logged into continente.pt, then try again.\n"
        f"Supported browsers: {', '.join(BROWSERS)}",
        file=sys.stderr,
    )
    sys.exit(1)


def write_cookie_file(cookies: list[dict], path: Path) -> None:
    """Write cookies JSON and set owner-only permissions."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cookies, indent=2, ensure_ascii=False))
    os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)  # 600 — cookies = full account access


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export Continente.pt browser cookies for use with continente-mcp.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--browser", "-b",
        choices=BROWSERS,
        metavar="BROWSER",
        help=f"Browser to read from (default: auto-detect). One of: {', '.join(BROWSERS)}",
    )
    parser.add_argument(
        "--output", "-o",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Output path (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--list-browsers",
        action="store_true",
        help="List supported browsers and exit",
    )
    args = parser.parse_args()

    if args.list_browsers:
        print("Supported browsers: " + ", ".join(BROWSERS))
        sys.exit(0)

    try:
        import browser_cookie3  # noqa: F401
    except ImportError:
        print(
            "browser-cookie3 is not installed.\n"
            "Run: pip install browser-cookie3",
            file=sys.stderr,
        )
        sys.exit(1)

    cookies, browser_name = find_cookies(args.browser)

    write_cookie_file(cookies, args.output)
    print(f"Saved {len(cookies)} cookies → {args.output}  (browser: {browser_name})")

    # Optional: also write to a secondary path (e.g. for syncing to a remote machine)
    if VAULT_PATH:
        existing = []
        if VAULT_PATH.exists():
            try:
                existing = json.loads(VAULT_PATH.read_text())
            except Exception:
                pass
        if cookies != existing:
            write_cookie_file(cookies, VAULT_PATH)
            print(f"Saved {len(cookies)} cookies → {VAULT_PATH}  (vault sync)")
        else:
            print(f"Vault unchanged — skipping write to {VAULT_PATH}")


if __name__ == "__main__":
    main()
