import importlib.util
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location(
    "continente_keepalive",
    Path(__file__).resolve().parent.parent / "continente-keepalive.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class KeepaliveTests(unittest.TestCase):
    def test_has_login_credentials_requires_email_and_password(self):
        missing_env = str(Path(tempfile.gettempdir()) / "continente-missing-credentials.env")

        with patch.dict(os.environ, {"CONTINENTE_ENV_PATH": missing_env}, clear=True):
            self.assertFalse(MODULE.has_login_credentials())

        with patch.dict(
            os.environ,
            {"CONTINENTE_ENV_PATH": missing_env, "CONTINENTE_EMAIL": "user@example.com"},
            clear=True,
        ):
            self.assertFalse(MODULE.has_login_credentials())

        with patch.dict(
            os.environ,
            {
                "CONTINENTE_ENV_PATH": missing_env,
                "CONTINENTE_EMAIL": "user@example.com",
                "CONTINENTE_PASSWORD": "secret",
            },
            clear=True,
        ):
            self.assertTrue(MODULE.has_login_credentials())

    def test_has_login_credentials_reads_private_env_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            env_path = Path(tmp) / "credentials.env"
            env_path.write_text(
                "\n".join(
                    [
                        'CONTINENTE_EMAIL="user@example.com"',
                        "CONTINENTE_PASSWORD='secret'",
                    ]
                )
            )

            with patch.dict(os.environ, {"CONTINENTE_ENV_PATH": str(env_path)}, clear=True):
                self.assertTrue(MODULE.has_login_credentials())

    def test_login_from_credentials_runs_login_script_and_loads_cookies(self):
        expected_cookies = [{"name": "sid", "value": "cookie-value"}]

        with patch.dict(
            os.environ,
            {
                "CONTINENTE_EMAIL": "user@example.com",
                "CONTINENTE_PASSWORD": "secret",
            },
            clear=True,
        ), patch.object(MODULE, "load_cookies", return_value=expected_cookies), patch(
            "subprocess.run"
        ) as run:
            run.return_value.returncode = 0
            run.return_value.stdout = "Saved cookies."
            run.return_value.stderr = ""
            cookies = MODULE.login_from_credentials()

        self.assertEqual(cookies, expected_cookies)
        args = run.call_args.args[0]
        self.assertEqual(args[0], "node")
        self.assertTrue(args[1].endswith("continente-auto-login.js"))
        self.assertNotIn("secret", " ".join(args))
        self.assertNotIn("user@example.com", " ".join(args))

    def test_restore_session_prefers_env_login_before_browser_cookie_refresh(self):
        login_cookies = [{"name": "sid", "value": "fresh"}]

        with patch.object(MODULE, "login_from_credentials", return_value=login_cookies) as login, patch.object(
            MODULE, "refresh_from_browser"
        ) as refresh, patch.object(MODULE, "ping", return_value=True), patch.object(
            MODULE, "save_cookies"
        ) as save:
            restored = MODULE.restore_session()

        self.assertTrue(restored)
        login.assert_called_once()
        refresh.assert_not_called()
        save.assert_called_once_with(login_cookies)


if __name__ == "__main__":
    unittest.main()
