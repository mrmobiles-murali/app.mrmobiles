#!/usr/bin/env python3
"""Mr Mobiles bot control for Termux/Ubuntu. Python standard library only."""
import argparse
import datetime
import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_BACKEND = "https://appmrmobiles.vercel.app"
CONFIG_PATH = Path.home() / ".config" / "mr-mobiles" / "bot.json"
TOKEN_PATTERN = re.compile(r"^[0-9]{5,16}:[A-Za-z0-9_-]{20,}$")
WORKFLOW_VERSION = "2026-09-26.1"


class BotError(Exception):
    pass


class NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise BotError("The endpoint redirected. Configure its final HTTPS origin before continuing.")


def origin(value):
    parsed = urllib.parse.urlsplit(value.strip())
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
            or parsed.query or parsed.fragment or parsed.path not in ("", "/")):
        raise BotError("Enter an HTTPS origin, for example https://mrmobiles.in (no extra path).")
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, "", "", ""))


def secret(config):
    return config.get("webhook_secret") or hashlib.sha256(config["token"].encode()).hexdigest()[:32]


def request_json(url, payload=None, headers=None):
    data = None if payload is None else json.dumps(payload).encode()
    combined = {"User-Agent": "MrMobilesBotControl/1", "Accept": "application/json"}
    if data is not None:
        combined["Content-Type"] = "application/json"
    combined.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=combined)
    try:
        with urllib.request.build_opener(NoRedirects()).open(req, timeout=20) as response:
            raw = response.read(1024 * 1024)
            if "json" not in response.headers.get("Content-Type", ""):
                raise BotError("The endpoint returned a page instead of JSON. Check the deployment/domain.")
            return json.loads(raw)
    except urllib.error.HTTPError as exc:
        # Never include the request URL: Telegram URLs contain the bot token.
        raise BotError(f"HTTP {exc.code}. Check the token, project access, and deployed endpoint.") from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise BotError("Network connection failed or timed out. Check connectivity and retry.") from None
    except (ValueError, UnicodeError):
        raise BotError("The endpoint did not return valid JSON.") from None


def telegram(config, method, payload=None):
    result = request_json(f"https://api.telegram.org/bot{config['token']}/{method}", payload or {})
    if not isinstance(result, dict) or result.get("ok") is not True:
        code = result.get("error_code", "unknown") if isinstance(result, dict) else "unknown"
        raise BotError(f"Telegram rejected {method} (code {code}).")
    return result["result"]


def save_private(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(path.parent, 0o700)
    fd, temporary = tempfile.mkstemp(prefix=".bot-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as output:
            os.fchmod(output.fileno(), 0o600)
            json.dump(value, output, indent=2)
            output.write("\n")
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def load_config(path=CONFIG_PATH):
    try:
        config = json.loads(path.read_text())
    except (OSError, ValueError):
        raise BotError("Run: python3 scripts/botctl.py configure") from None
    if not TOKEN_PATTERN.fullmatch(config.get("token", "")):
        raise BotError("Saved token format is invalid. Run configure again.")
    config["backend"] = origin(config["backend"])
    if path.stat().st_mode & 0o077:
        os.chmod(path, 0o600)
    return config


def configure(path=CONFIG_PATH):
    print("Mr Mobiles setup. The token stays on this device and is not printed.")
    print("Get the existing bot's token from Telegram @BotFather; do not create a second bot.")
    token = getpass.getpass("Existing bot token (hidden): ").strip()
    if not TOKEN_PATTERN.fullmatch(token):
        raise BotError("That does not look like a bot token. Copy it again from @BotFather.")
    backend = origin(input(f"Backend URL [{DEFAULT_BACKEND}]: ").strip() or DEFAULT_BACKEND)
    custom_secret = getpass.getpass("Custom TELEGRAM_WEBHOOK_SECRET, if configured (otherwise Enter): ").strip()
    if custom_secret and not re.fullmatch(r"[A-Za-z0-9_-]{1,256}", custom_secret):
        raise BotError("The webhook secret must contain only letters, numbers, underscore or hyphen.")
    config = {"token": token, "backend": backend, "webhook_secret": custom_secret}
    me = telegram(config, "getMe")
    config["bot_id"] = me["id"]
    config["username"] = me["username"]
    save_private(path, config)
    print(f"Saved for @{me['username']}. No Telegram settings were changed.")
    print("Next: python3 scripts/botctl.py status")
    return config


def metadata(config, signed=False):
    url = config["backend"] + "/api/telegram/webhook"
    if signed:
        data = request_json(url, {"mr_mobiles_probe": True},
                            {"X-Telegram-Bot-Api-Secret-Token": secret(config)})
    else:
        data = request_json(url)
    if not isinstance(data, dict) or data.get("workflowVersion") != WORKFLOW_VERSION:
        raise BotError("This deployment does not have the Termux workflow update yet. Deploy the repository and retry.")
    return data


def print_status(config):
    me = telegram(config, "getMe")
    webhook = telegram(config, "getWebhookInfo")
    commands = telegram(config, "getMyCommands")
    menu = telegram(config, "getChatMenuButton")
    print(f"Bot: @{me['username']} (ID {me['id']})")
    print(f"Webhook: {webhook.get('url') or 'NOT SET'}")
    print(f"Pending incoming updates: {webhook.get('pending_update_count', 0)}")
    if webhook.get("last_error_date"):
        moment = datetime.datetime.fromtimestamp(webhook["last_error_date"], datetime.timezone.utc)
        print(f"Last delivery error at {moment.isoformat()}; may be historical. Send /start to test current delivery.")
    print("Commands: " + ", ".join("/" + c["command"] for c in commands))
    print("Mini App menu: " + str(menu.get("web_app", {}).get("url", menu.get("type", "unknown"))))
    info = metadata(config, signed=True)
    if info.get("botId") != me["id"]:
        raise BotError("The server token belongs to a different bot. Correct Vercel TELEGRAM_BOT_TOKEN first.")
    print("Signed webhook diagnostic: PASS (no message sent)")
    print("Database variables: " + ("present; database requests need a real /orders test" if info.get("databaseConfigured") else "MISSING"))
    print("Support forwarding: " + ("configured; test with a customer account" if info.get("supportConfigured") else "NOT CONFIGURED; set TELEGRAM_ADMIN_IDS"))
    print("App URL: " + info["miniAppUrl"])
    expected = config["backend"] + "/api/telegram/webhook"
    if webhook.get("url") != expected:
        print("Webhook is not pointed at this backend. Run activate only after reviewing the URL above.")
    return info


def activate(config, path=CONFIG_PATH):
    me = telegram(config, "getMe")
    info = metadata(config, signed=True)
    if not info.get("botConfigured") or info.get("botId") != me["id"]:
        raise BotError("The deployed server and this token do not refer to the same bot.")
    if not info.get("databaseConfigured"):
        raise BotError("The deployment is missing Supabase variables. Add them before activation.")
    app_origin = origin(info["miniAppUrl"])
    app_info = request_json(app_origin + "/api/telegram/webhook")
    if not isinstance(app_info, dict) or app_info.get("botId") != me["id"]:
        raise BotError("The Mini App domain does not point at this bot's application. Fix the domain before activation.")
    snapshot = {
        "saved_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "webhook": telegram(config, "getWebhookInfo"),
        "commands": telegram(config, "getMyCommands"),
        "menu": telegram(config, "getChatMenuButton"),
    }
    save_private(path.with_name("before-activation.json"), snapshot)
    print(f"Configuring @{me['username']} with {app_origin}")
    telegram(config, "setMyName", {"name": "Mr Mobiles"})
    telegram(config, "setMyDescription", {"description": "Shop phones and accessories, browse repair services, view your orders and contact Mr Mobiles support. Tap Open Mr Mobiles to get started."})
    telegram(config, "setMyShortDescription", {"short_description": "Mr Mobiles | Phones, accessories, repair services and order support."})
    telegram(config, "setMyCommands", {"commands": info["commands"]})
    telegram(config, "setChatMenuButton", {"menu_button": {"type": "web_app", "text": "Open Mr Mobiles", "web_app": {"url": info["miniAppUrl"]}}})
    telegram(config, "setWebhook", {
        "url": config["backend"] + "/api/telegram/webhook",
        "secret_token": secret(config), "allowed_updates": ["message"],
        "max_connections": 5, "drop_pending_updates": False
    })
    print("Command menu, profile, Mini App button and webhook configured.")
    print("Pending updates were preserved. No customer messages were sent by this tool.")
    print_status(config)
    print("Now send /start, /shop, /repair, /orders and /id to the bot in Telegram.")


def menu():
    while True:
        print("\nMr Mobiles bot control\n1. Configure token and backend\n2. Check status\n3. Activate menus and webhook\n4. Read complete workflow\n0. Exit")
        selected = input("Choose: ").strip()
        try:
            if selected == "0":
                return
            if selected == "1":
                configure()
            elif selected == "2":
                print_status(load_config())
            elif selected == "3":
                activate(load_config())
            elif selected == "4":
                print((Path(__file__).resolve().parents[1] / "docs" / "TERMUX_WORKFLOW.md").read_text())
        except BotError as exc:
            print("ACTION NEEDED: " + str(exc))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", nargs="?", default="menu", choices=["menu", "configure", "status", "activate", "watch"])
    parser.add_argument("--interval", type=int, default=300, help="watch interval in seconds (minimum 60)")
    args = parser.parse_args()
    try:
        if args.command == "menu":
            menu()
        elif args.command == "configure":
            configure()
        elif args.command == "status":
            print_status(load_config())
        elif args.command == "activate":
            activate(load_config())
        else:
            if args.interval < 60:
                raise BotError("Use an interval of 60 seconds or longer.")
            config = load_config()
            while True:
                print("\n" + datetime.datetime.now().astimezone().isoformat(), flush=True)
                try:
                    print_status(config)
                except BotError as exc:
                    print("ACTION NEEDED: " + str(exc), flush=True)
                time.sleep(args.interval)
        return 0
    except BotError as exc:
        print("ACTION NEEDED: " + str(exc), file=sys.stderr)
        return 1
    except (KeyboardInterrupt, EOFError):
        print("\nStopped. The hosted bot keeps running.")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
