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

## Custom domain target (verify routing before switching)

Mini App: `https://mrmobiles.in`

Razorpay webhook:
`https://mrmobiles.in/api/razorpay/webhook`

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
3. Attach `app.mrmobiles.in`.
4. Add the Vercel DNS record at the DNS provider if requested.
5. Configure the Telegram Mini App/menu button with `https://mrmobiles.in`.
6. Configure the Razorpay webhook.
7. Test in Razorpay Test Mode.
8. Switch to Live keys only after successful end-to-end testing.

The catalog currently contains demo items in `lib/catalog.ts`; replace those with the real Mr Mobiles inventory before launch.


## Razorpay payment flow

Production checkout is enabled whenever `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are present, unless the emergency kill-switch is set:

`RAZORPAY_PAYMENTS_ENABLED=false`

Payment confirmation is protected by:
1. Telegram initData validation.
2. Trusted server-side catalog pricing.
3. Razorpay checkout signature verification.
4. Server-side Razorpay Payment API verification for order id, amount, currency and captured status.
5. Supabase idempotent paid-state updates.
6. Automatic reconciliation of recent unpaid Razorpay orders whenever the Mini App is reopened.
7. Telegram confirmation after the order transitions to paid.

A Razorpay webhook remains recommended for asynchronous event delivery and can use:
`https://mrmobiles.in/api/razorpay/webhook`

When configured, set `RAZORPAY_WEBHOOK_SECRET` in Vercel and subscribe to `order.paid`, `payment.captured` and `payment.failed`.

## Manage this bot from Termux

The complete phone setup, deployment, support and verification workflow is in [docs/TERMUX_WORKFLOW.md](docs/TERMUX_WORKFLOW.md). Start the interactive control menu with:

```bash
python3 scripts/botctl.py
```

The tool keeps credentials outside Git, checks the deployed bot identity, preserves pending Telegram updates and provides setup/status monitoring. The bot now supports `/help`, `/id`, private customer support forwarding and administrator-only replies. Set `TELEGRAM_ADMIN_IDS` in the hosting environment to enable support forwarding. The Mini App URL uses `TELEGRAM_MINI_APP_URL` when set, otherwise the request origin.
