# Mr Mobiles — New Telegram Mini App

Clean-slate rebuild for **https://app.mrmobiles.in**.

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

## Production target

Mini App: `https://app.mrmobiles.in`

Razorpay webhook:
`https://app.mrmobiles.in/api/razorpay/webhook`

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
5. Configure the Telegram Mini App/menu button with `https://app.mrmobiles.in`.
6. Configure the Razorpay webhook.
7. Test in Razorpay Test Mode.
8. Switch to Live keys only after successful end-to-end testing.

The catalog currently contains demo items in `lib/catalog.ts`; replace those with the real Mr Mobiles inventory before launch.


## Razorpay launch gate
Razorpay credentials can be present without exposing checkout. Keep:

`RAZORPAY_PAYMENTS_ENABLED=false`

until the real Mr Mobiles catalog is loaded and `RAZORPAY_WEBHOOK_SECRET` is configured.

When ready to launch:
1. Configure Razorpay webhook to `https://app.mrmobiles.in/api/razorpay/webhook`.
2. Subscribe to `order.paid`, `payment.captured`, and `payment.failed`.
3. Add the generated webhook secret as `RAZORPAY_WEBHOOK_SECRET` in Vercel.
4. Complete an end-to-end test from Telegram.
5. Set `RAZORPAY_PAYMENTS_ENABLED=true` and redeploy.
