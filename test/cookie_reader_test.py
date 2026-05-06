import importlib.util
import unittest
from pathlib import Path


SPEC = importlib.util.spec_from_file_location(
    "continente_cookie_reader",
    Path(__file__).resolve().parent.parent / "continente-cookie-reader.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class CookieReaderTests(unittest.TestCase):
    def test_score_cookies_prefers_authenticated_session_markers(self):
        weak = [{"name": "sid"}, {"name": "dwsid"}]
        strong = [
            {"name": "sid"},
            {"name": "dwsid"},
            {"name": "__Host-col"},
            {"name": "CredentialsSignupScheme"},
        ]

        self.assertGreater(MODULE.score_cookies(strong), MODULE.score_cookies(weak))


if __name__ == "__main__":
    unittest.main()
