#!/usr/bin/env python3
"""Repair this project's Production token using the owner's authenticated Vercel CLI."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

try:
    from . import botctl
except ImportError:
    import botctl

PROJECT_ID = "prj_miZFJOU7UIYbgD73wi6MDwLWqoDd"
TEAM_ID = "team_RsZfTZHpl95DpTaRTY2QVyNU"
TEAM_SLUG = "mrmobilesofficialbot"
BOT_ID = 8788229847


def run_cli(arguments, directory, environment, step, value=None, timeout=120):
    # Secrets are passed through stdin only, never shell arguments or CLI logs.
    try:
        result = subprocess.run(
            ["vercel", *arguments, "--scope", TEAM_SLUG, "--no-color"],
            cwd=directory, env=environment, input=value or "", text=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired:
        raise botctl.BotError(f"{step} timed out. Check the Vercel deployment before retrying.") from None
    except OSError:
        raise botctl.BotError("Could not run Vercel CLI. Install it and run vercel login.") from None
    if result.returncode:
        # CLI failures may include request details: do not echo their raw output.
        raise botctl.BotError(
            f"{step} failed (exit {result.returncode}). Sign in with vercel login using an account "
            "that can manage mrmobilesofficialbot / app.mrmobiles. "
            "For a build failure, inspect that project's deployment in Vercel."
        )


def sync_token(config):
    if botctl.origin(config["backend"]) != botctl.DEFAULT_BACKEND:
        raise botctl.BotError("This repair is restricted to https://appmrmobiles.vercel.app.")
    if config.get("webhook_secret"):
        raise botctl.BotError("This repair expects token-derived authentication. Configure with a blank custom-secret field first.")
    me = botctl.telegram(config, "getMe")
    public = botctl.metadata(config)
    if me.get("id") != BOT_ID or public.get("botId") != BOT_ID:
        raise botctl.BotError("The saved token and backend must both identify the existing Mr Mobiles bot. No Vercel settings were changed.")
    if public.get("webhookAuthMode") != "derived_token":
        raise botctl.BotError("The server does not use token-derived authentication. Resolve its custom secret before using this repair.")
    if not shutil.which("vercel"):
        raise botctl.BotError("Vercel CLI is missing. Run: bash scripts/repair-telegram-token.sh")

    environment = os.environ.copy()
    environment.update({"VERCEL_ORG_ID": TEAM_ID, "VERCEL_PROJECT_ID": PROJECT_ID, "CI": "1", "NO_COLOR": "1"})
    # A temporary project link prevents the phone's current directory or another
    # project link from selecting a different project. No credentials are written here.
    with tempfile.TemporaryDirectory(prefix="mr-mobiles-vercel-") as directory:
        link = Path(directory) / ".vercel"
        link.mkdir(mode=0o700)
        (link / "project.json").write_text(json.dumps({"orgId": TEAM_ID, "projectId": PROJECT_ID, "projectName": "app.mrmobiles"}))
        print("Checking Vercel sign-in...", flush=True)
        run_cli(["whoami"], directory, environment, "Vercel authentication")
        print("Synchronizing the saved bot token to app.mrmobiles / Production...", flush=True)
        run_cli(["env", "update", "TELEGRAM_BOT_TOKEN", "production", "--yes"],
                directory, environment, "Production token update", value=config["token"])
        print("Token saved. Rebuilding the existing production deployment; this may take a few minutes...", flush=True)
        run_cli(["redeploy", botctl.DEFAULT_BACKEND, "--target", "production"],
                directory, environment, "Production redeployment", timeout=900)
    print("Checking the deployed token with a signed, message-free diagnostic...", flush=True)
    botctl.print_status(config)
    print("Repair verified. Next: python3 ~/mr-mobiles-app/scripts/botctl.py activate")


def main():
    try:
        sync_token(botctl.load_config())
        return 0
    except botctl.BotError as error:
        print("ACTION NEEDED: " + str(error), file=sys.stderr)
        return 1
    except (KeyboardInterrupt, EOFError):
        print("Stopped. If token synchronization had completed, check the deployment before retrying.")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
