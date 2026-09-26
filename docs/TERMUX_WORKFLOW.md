# Mr Mobiles Telegram workflow from Termux

This is the current rebuilt `mrmobiles-murali/app.mrmobiles` project. The customer-facing bot receives Telegram webhooks on Vercel; your phone configures, checks and updates it. Closing Termux does not turn off the hosted bot. You do not need to start a second polling bot.

## 1. Open Ubuntu and download the correct project

If the prompt is `root@localhost:~#`, you are already in Ubuntu. Otherwise run `proot-distro login ubuntu` in Termux.

```bash
apt-get update && apt-get install -y python3 git ca-certificates
git clone https://github.com/mrmobiles-murali/app.mrmobiles.git ~/mr-mobiles-app
cd ~/mr-mobiles-app
python3 scripts/botctl.py
```

If the folder already exists, do not delete it. Enter it, inspect `git status`, and run `git pull --ff-only` when your changes are committed or saved. The control tool uses Python's standard library; no pip packages are required.

## 2. Configure the existing bot

Choose **1. Configure token and backend**. In Telegram, use the verified @BotFather account, `/mybots`, select your existing Mr Mobiles bot and retrieve its token. Enter that token at the hidden terminal prompt. Do not paste it into chat, commands, GitHub, or screenshots.

The currently verified working API origin is `https://appmrmobiles.vercel.app` (no hyphen). The intended custom domain is `https://mrmobiles.in`. On 26 September 2026, a read of `mrmobiles.in/api/config` returned 404, so do not move the bot to that domain until it serves this application.

Leave the custom webhook secret blank unless you explicitly configured `TELEGRAM_WEBHOOK_SECRET` in Vercel. The existing project's default is derived from the bot token.

The token is stored outside the repository in `~/.config/mr-mobiles/bot.json`, with directory permissions 700 and file permissions 600. Protect your phone and do not share this file. Configure validates the token with Telegram but does not change the bot's webhook.

## 3. Deploy the workflow update and set support access

Skip deployment if `python3 scripts/botctl.py status` already reports a passing signed diagnostic for version `2026-09-26.1`.

For deployment from the Ubuntu shell, install Node.js/npm using Ubuntu's packages. Use Node.js 22 or newer:

```bash
apt-get install -y nodejs npm
node --version
npm install -g vercel
vercel login
vercel link
```

In `vercel link`, select the existing team **mrmobilesofficialbot** and existing project **app.mrmobiles**, which corresponds to the verified app origin. Do not create another project. If your account cannot see it, sign in to the Vercel account that owns it. The repository currently has two Vercel integrations, so check the team and project carefully.

Check existing environment variables:

```bash
vercel env ls
```

Required server-side variables already used by the project: `TELEGRAM_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Keep their existing correct values. Razorpay uses its existing variables; the control tool does not change payment configuration.

Deploy the updated code:

```bash
vercel --prod
```

Then activate the bot, send `/start` and `/id` to it from your own Telegram account, and copy your numeric user ID. Add it to the **same Vercel project**:

```bash
vercel env add TELEGRAM_ADMIN_IDS production
```

Paste your numeric Telegram user ID when prompted. Several administrators can be comma-separated. Use `vercel env update TELEGRAM_ADMIN_IDS production` if that variable already exists. An administrator must first open the bot and press Start, so the bot can message them.

Optional `TELEGRAM_SUPPORT_CHAT_ID` routes support notifications to a private support group instead of the first administrator's chat. Add the bot to that group and ensure it can post. Administrators send `/reply` in their **private chat with the bot**, not in the group.

Optional `TELEGRAM_MINI_APP_URL` overrides the app URL. Otherwise it uses the deployment origin. Only set `https://mrmobiles.in` once its `/api/telegram/webhook` endpoint identifies the same bot successfully. Redeploy after any environment-variable changes:

```bash
vercel --prod
```

## 4. Activate menus, profile and webhook

```bash
python3 scripts/botctl.py activate
python3 scripts/botctl.py status
```

Activation checks that the token and hosted app belong to the same bot, sends a message-free signed diagnostic, verifies the Mini App origin, then sets the Mr Mobiles name/description, command menu, Mini App button and webhook. Existing pending updates are preserved. It never calls `deleteWebhook` or `getUpdates`, and does not send test messages to customers.

A snapshot of the previous menu and webhook metadata is saved locally as `before-activation.json`. It is a reference, not a complete rollback: Telegram never returns the old webhook secret.

If using a Main Mini App profile launch button or a named Mini App, also set its URL in BotFather to the same verified HTTPS origin. A command-menu web_app button alone does not configure every BotFather Mini App setting.

## 5. Customer and support workflow

| Trigger | Result |
| --- | --- |
| `/start` | Welcome and an Open Mr Mobiles button |
| `/shop` | Phone and accessory catalog |
| `/repair` | Mini App opens the repair/service category |
| `/orders` | Only that customer's five recent orders |
| `/support` | Instructions for sending a support question |
| `/support question` or ordinary text | Sends the question and Telegram ID to the configured support chat, then acknowledges the customer |
| Admin `/reply CUSTOMER_ID message` | Sends the support reply to that customer |
| `/help` | Lists available commands; admins also see reply instructions |
| `/id` | Shows the sender's Telegram user ID |

If support administrators are not configured, the bot directs customers to `contact@mrmobiles.in` and does not claim their message was forwarded. Support messages live in Telegram; this update does not create a separate ticket database. Incoming updates can be retried by Telegram during transient failures, so a support notification may appear more than once. Group messages are ignored to keep personal orders and admin commands private.

The existing Mini App handles order creation, Supabase persistence, Razorpay verification/reconciliation and payment notifications. This control tool does not itself validate a live payment transaction. Repair browsing is not an automatic repair diagnosis or a complete repair job-management system.

## 6. Acceptance check before advertising the bot

1. `/start`, `/shop`, `/repair`: each opens the intended app and the repair tab is selected correctly.
2. `/orders`: shows only the signed-in customer's records; group use reveals no order data.
3. `/id`: use your own ID for admin access, then redeploy.
4. From a separate customer account, send `/support Test support request`. Confirm the administrator receives it and can answer with `/reply`.
5. Run `python3 scripts/botctl.py status`. Verify the webhook URL, signed diagnostic, support configuration and pending update count. A last_error_date may be historical; use a new `/start` to confirm current delivery.
6. Replace/confirm the catalog stock, product condition and prices before selling. README still identifies the catalog as demo data.
7. Test checkout with Razorpay Test Mode in an isolated preview/test environment, including success, failure and repeated webhook delivery. Do not switch production payment settings or create a real charge merely to test this update.
8. Confirm domain assignment, BotFather Main Mini App URL and Razorpay webhook delivery separately before claiming the entire shop is production ready.

## 7. Daily control and updates

```bash
python3 scripts/botctl.py status
python3 scripts/botctl.py watch --interval 300
```

Press Ctrl+C to stop local monitoring. It only checks health; it does not stop the hosted bot. Android may stop a long-running Termux process, so phone monitoring is not an uptime guarantee.

For code updates:

```bash
git pull --ff-only
npm ci
npm test
npm run build
vercel --prod
python3 scripts/botctl.py status
```

Keep tokens and `.env` files out of commits. Use `vercel env add` / `vercel env update` for secrets instead of typing secret values into command arguments.

## Common problems

| Result | Next action |
| --- | --- |
| `scripts/botctl.py` is missing | Pull the updated repository; the unrelated `awesome` clone does not contain this bot |
| Workflow version missing / GET 405 | The old app is still deployed; deploy this update to the correct Vercel project |
| Signed diagnostic 401 | Local bot token or custom webhook secret differs from the server |
| Different bot ID | Correct the selected bot/project/token combination before activation |
| Mini App domain returns HTML/404 | Fix the domain mapping; continue using the verified Vercel origin in the meantime |
| Support NOT CONFIGURED | Set TELEGRAM_ADMIN_IDS to your numeric ID, press Start with that account, redeploy |
| Vercel 401 / project absent | Authenticate the account/team that owns the app |
| Cannot receive updates in local polling | This bot uses a webhook; use the hosted workflow and avoid starting a second polling process |

Reference documentation: https://core.telegram.org/bots/api and https://vercel.com/docs/cli.
