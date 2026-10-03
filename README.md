# Mr Mobiles — New Telegram Mini App

Clean-slate rebuild for **https://mrmobiles.in**.

## Included

- Telegram Mini App session validation
- Server-trusted catalog pricing
- Razorpay Orders API
- Razorpay Standard Checkout
- Server-side payment signature verification
- Razorpay webhook verification
- Supabase order persistence
- Telegram payment confirmation
- Vercel-ready Next.js app
- Repair Rush HTML5 game and launch integration ([setup](docs/REPAIR_RUSH.md))

## Customer-facing domain architecture

Mini App: `https://app.mrmobiles.in`

Secure Razorpay bridge: `https://mrmobiles.in/pay`

Razorpay webhook:
`https://mrmobiles.in/api/razorpay/webhook`

Cloudflare keeps customer-facing traffic on Mr Mobiles domains while Vercel remains the application origin behind the scenes.

## Environment variables

- `TELEGRAM_BOT_TOKEN`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Keep all secrets server-side.

## Database

Run `database/schema.sql` in a new Supabase project.

## Launch sequence

1. Deploy this repository to Vercel.
2. Add the environment variables.
3. Route `app.mrmobiles.in` to the Mini App through Cloudflare.
4. Route `mrmobiles.in/pay*` to the dedicated payment bridge Worker.
5. Set `TELEGRAM_MINI_APP_URL=https://app.mrmobiles.in`.
6. Keep Razorpay checkout on the approved `mrmobiles.in` origin through the payment bridge.
7. Configure the Razorpay webhook.
8. Run a ₹1 end-to-end payment test before higher-value transactions.

The catalog currently contains demo items in `lib/catalog.ts`; replace those with the real Mr Mobiles inventory before launch.


## Razorpay payment flow

Production checkout is enabled whenever `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are present, unless the emergency kill-switch is set:

`RAZORPAY_PAYMENTS_ENABLED=false`

Payment confirmation is protected by:
1. Telegram initData validation before an order can be created.
2. Trusted server-side catalog or custom amount validation.
3. A short-lived HMAC-signed bridge token bound to one internal order, one Razorpay order and one Telegram user.
4. Razorpay checkout signature verification.
5. Server-side Razorpay Payment API verification for order id, amount, currency and captured status.
6. Supabase idempotent paid-state updates.
7. Automatic reconciliation of recent unpaid Razorpay orders whenever the Mini App is reopened.
8. Telegram confirmation after the order transitions to paid.

A Razorpay webhook remains recommended for asynchronous event delivery and can use:
`https://mrmobiles.in/api/razorpay/webhook`

When configured, set `RAZORPAY_WEBHOOK_SECRET` in Vercel and subscribe to `order.paid`, `payment.captured` and `payment.failed`.

## Manage this bot from Termux

The complete phone setup, deployment, support and verification workflow is in [docs/TERMUX_WORKFLOW.md](docs/TERMUX_WORKFLOW.md). Start the interactive control menu with:

```bash
python3 scripts/botctl.py
```

The tool keeps credentials outside Git, checks the deployed bot identity, preserves pending Telegram updates and provides setup/status monitoring. The bot now supports `/help`, `/id`, private customer support forwarding and administrator-only replies. Set `TELEGRAM_ADMIN_IDS` in the hosting environment to enable support forwarding. The Mini App URL uses `TELEGRAM_MINI_APP_URL` when set, otherwise the request origin.
