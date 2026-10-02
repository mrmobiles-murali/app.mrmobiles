import contextlib
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from scripts import sync_telegram_token as repair

CONFIG = {"token": "8788229847:" + "a" * 35, "backend": repair.botctl.DEFAULT_BACKEND, "webhook_secret": ""}
PUBLIC = {"botId": repair.BOT_ID, "webhookAuthMode": "derived_token"}


class TokenRepairTests(unittest.TestCase):
    def test_saved_token_is_only_sent_on_stdin_to_the_exact_production_project(self):
        calls = []
        def cli(arguments, directory, environment, step, value=None, timeout=120):
            calls.append((arguments, environment, value))
            linked = json.loads((Path(directory) / ".vercel" / "project.json").read_text())
            self.assertEqual(linked["projectId"], repair.PROJECT_ID)
            self.assertEqual(linked["orgId"], repair.TEAM_ID)
        with patch.object(repair.botctl, "telegram", return_value={"id": repair.BOT_ID}), patch.object(repair.botctl, "metadata", return_value=PUBLIC), patch.object(repair.shutil, "which", return_value="/usr/bin/vercel"), patch.object(repair, "run_cli", side_effect=cli), patch.object(repair.botctl, "print_status") as status:
            repair.sync_token(CONFIG)
        self.assertEqual(calls[1][0], ["env", "update", "TELEGRAM_BOT_TOKEN", "production", "--yes"])
        self.assertEqual(calls[1][2], CONFIG["token"])
        self.assertEqual(calls[2][0], ["redeploy", repair.botctl.DEFAULT_BACKEND, "--target", "production"])
        for arguments, environment, _ in calls:
            self.assertNotIn(CONFIG["token"], " ".join(arguments))
            self.assertNotIn(CONFIG["token"], environment.values())
            self.assertEqual(environment["VERCEL_PROJECT_ID"], repair.PROJECT_ID)
        status.assert_called_once_with(CONFIG)

    def test_other_bot_cannot_update_this_project(self):
        with patch.object(repair.botctl, "telegram", return_value={"id": 999}), patch.object(repair.botctl, "metadata", return_value=PUBLIC), patch.object(repair, "run_cli") as cli:
            with self.assertRaises(repair.botctl.BotError):
                repair.sync_token(CONFIG)
        cli.assert_not_called()

    def test_custom_secret_server_is_not_overridden(self):
        with patch.object(repair.botctl, "telegram", return_value={"id": repair.BOT_ID}), patch.object(repair.botctl, "metadata", return_value={**PUBLIC, "webhookAuthMode": "custom_secret"}), patch.object(repair, "run_cli") as cli:
            with self.assertRaises(repair.botctl.BotError):
                repair.sync_token(CONFIG)
        cli.assert_not_called()

    def test_failed_update_stops_before_redeploy(self):
        with patch.object(repair.botctl, "telegram", return_value={"id": repair.BOT_ID}), patch.object(repair.botctl, "metadata", return_value=PUBLIC), patch.object(repair.shutil, "which", return_value="/usr/bin/vercel"), patch.object(repair, "run_cli", side_effect=[None, repair.botctl.BotError("update failed")]) as cli, patch.object(repair.botctl, "print_status") as status:
            with self.assertRaises(repair.botctl.BotError):
                repair.sync_token(CONFIG)
        self.assertEqual(cli.call_count, 2)
        status.assert_not_called()

    def test_cli_errors_cannot_print_the_token(self):
        result = repair.subprocess.CompletedProcess([], 1, CONFIG["token"], CONFIG["token"])
        output = io.StringIO()
        with patch.object(repair.subprocess, "run", return_value=result) as run, contextlib.redirect_stdout(output):
            with self.assertRaises(repair.botctl.BotError) as caught:
                repair.run_cli(["env", "update", "TELEGRAM_BOT_TOKEN", "production", "--yes"], "/tmp", {}, "Token update", CONFIG["token"])
        self.assertEqual(run.call_args.kwargs["input"], CONFIG["token"])
        self.assertNotIn(CONFIG["token"], str(caught.exception) + output.getvalue())


if __name__ == "__main__":
    unittest.main()
