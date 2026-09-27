import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("botctl", Path(__file__).parents[1] / "scripts" / "botctl.py")
botctl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(botctl)
CONFIG = {"token": "123456:" + "a" * 30, "backend": "https://appmrmobiles.vercel.app", "webhook_secret": ""}

class ControlTests(unittest.TestCase):
    def test_only_https_origins(self):
        self.assertEqual(botctl.origin("https://mrmobiles.in/"), "https://mrmobiles.in")
        for bad in ["http://mrmobiles.in", "https://user:secret@example.com", "https://mrmobiles.in/path", "https://mrmobiles.in?token=secret"]:
            with self.assertRaises(botctl.BotError):
                botctl.origin(bad)

    def test_private_config_is_not_world_readable(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "private" / "bot.json"
            botctl.save_private(path, CONFIG)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(path.parent.stat().st_mode & 0o777, 0o700)
            self.assertEqual(botctl.load_config(path)["token"], CONFIG["token"])

    def test_server_identity_mismatch_refuses_activation(self):
        with patch.object(botctl, "telegram", return_value={"id": 123456, "username": "test_bot"}) as api:
            with patch.object(botctl, "metadata", return_value={"botConfigured": True, "botId": 999}):
                with self.assertRaises(botctl.BotError):
                    botctl.activate(CONFIG)
        self.assertEqual([call.args[1] for call in api.call_args_list], ["getMe"])

    def test_activation_preserves_updates_and_never_polls_or_sends_messages(self):
        info = {"workflowVersion": botctl.WORKFLOW_VERSION, "botConfigured": True, "botId": 123456,
                "databaseConfigured": True, "supportConfigured": True,
                "miniAppUrl": "https://appmrmobiles.vercel.app/",
                "commands": [{"command": "start", "description": "Start"}]}
        calls = []
        def api(config, method, payload=None):
            calls.append((method, payload))
            return {"getMe": {"id": 123456, "username": "test_bot"}, "getWebhookInfo": {"url": "https://old.example.com/webhook", "pending_update_count": 2}, "getMyCommands": [], "getChatMenuButton": {"type": "default"}}.get(method, True)
        with tempfile.TemporaryDirectory() as temp:
            with patch.object(botctl, "telegram", side_effect=api), patch.object(botctl, "metadata", return_value=info), patch.object(botctl, "request_json", return_value=info), patch.object(botctl, "print_status"):
                botctl.activate(CONFIG, Path(temp) / "bot.json")
        methods = [method for method, _ in calls]
        self.assertNotIn("getUpdates", methods)
        self.assertNotIn("deleteWebhook", methods)
        self.assertNotIn("sendMessage", methods)
        payload = next(payload for method, payload in calls if method == "setWebhook")
        self.assertFalse(payload["drop_pending_updates"])
        self.assertEqual(payload["url"], CONFIG["backend"] + "/api/telegram/webhook")
        self.assertEqual(methods[-1], "setWebhook")

    def test_old_deployment_does_not_pass_health_check(self):
        with patch.object(botctl, "request_json", return_value={"ok": True}):
            with self.assertRaises(botctl.BotError):
                botctl.metadata(CONFIG)

    def test_http_errors_do_not_print_token_urls(self):
        error = botctl.urllib.error.HTTPError("https://api.telegram.org/bot" + CONFIG["token"] + "/getMe", 401, "Unauthorized", {}, None)
        with patch.object(botctl.urllib.request.OpenerDirector, "open", side_effect=error):
            with self.assertRaises(botctl.BotError) as caught:
                botctl.telegram(CONFIG, "getMe")
        self.assertNotIn(CONFIG["token"], str(caught.exception))

    def test_custom_secret_required_does_not_attempt_activation(self):
        info = {"botConfigured": True, "botId": 123456, "webhookAuthMode": "custom_secret"}
        with patch.object(botctl, "telegram", return_value={"id": 123456}) as api, patch.object(botctl, "metadata", return_value=info) as metadata:
            with self.assertRaisesRegex(botctl.BotError, "do not leave it blank"):
                botctl.activate(CONFIG)
        self.assertEqual([call.args[1] for call in api.call_args_list], ["getMe"])
        self.assertEqual(metadata.call_count, 1)

    def test_derived_token_mismatch_identifies_server_not_local_token(self):
        info = {"botConfigured": True, "botId": 123456, "webhookAuthMode": "derived_token"}
        with patch.object(botctl, "metadata", side_effect=[info, botctl.HttpError(401)]):
            with self.assertRaisesRegex(botctl.BotError, "SAME token is deployed") as caught:
                botctl.verified_metadata(CONFIG, {"id": 123456})
        self.assertNotIn(CONFIG["token"], str(caught.exception))

    def test_custom_secret_mismatch_does_not_recommend_changing_token(self):
        info = {"botConfigured": True, "botId": 123456, "webhookAuthMode": "custom_secret"}
        config = {**CONFIG, "webhook_secret": "private-test-secret"}
        with patch.object(botctl, "metadata", side_effect=[info, botctl.HttpError(401)]):
            with self.assertRaisesRegex(botctl.BotError, "rejects the custom webhook secret") as caught:
                botctl.verified_metadata(config, {"id": 123456})
        self.assertNotIn(config["webhook_secret"], str(caught.exception))

    def test_network_errors_are_not_misreported_as_secret_mismatch(self):
        info = {"botConfigured": True, "botId": 123456, "webhookAuthMode": "derived_token"}
        with patch.object(botctl, "metadata", side_effect=[info, botctl.HttpError(503)]):
            with self.assertRaises(botctl.HttpError) as caught:
                botctl.verified_metadata(CONFIG, {"id": 123456})
        self.assertEqual(caught.exception.status, 503)

    def test_server_whitespace_is_reported_before_signed_request(self):
        info = {"botConfigured": True, "botId": 123456, "webhookAuthMode": "derived_token", "botTokenHasWhitespace": True}
        with patch.object(botctl, "metadata", return_value=info) as metadata:
            with self.assertRaisesRegex(botctl.BotError, "surrounding spaces/newlines"):
                botctl.verified_metadata(CONFIG, {"id": 123456})
        self.assertEqual(metadata.call_count, 1)

if __name__ == "__main__":
    unittest.main()
