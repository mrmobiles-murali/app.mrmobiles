# Mr Mobiles readiness review — 1 November 2026

## Scope and safety

Read-only review of the current `main` code, the connected Mr Mobiles Supabase project, and the latest Vercel deployment. Work is staged on `dev/retail-security-ai-nov01`. No production source, deployment, DNS, Telegram configuration, payment settings, secrets, or database rows were changed.

## Verified baseline

- Vercel project `app.mrmobiles`: latest production deployment is `READY`, built from main commit `1c678d1a6ac50b3b4965a54260abe6cb1e00f217`.
- Vercel reports `app.mrmobiles.in` as a verified project domain.
- Supabase project `Mr Mobiles` (`xlhgryzztnkpoxzgvfva`) is `ACTIVE_HEALTHY`.
- Latest GitHub CI run for main (27 October 2026) completed successfully: dependency install, tests and production build all passed.
- Database tables inspected have RLS enabled. Four tables have no policies; this is currently deny-by-default, but grants should still be reviewed for least privilege.

## Launch blockers found

### 1. Product catalogue and inventory

The live products table contains only 9 active records: 6 phones, 2 accessories and 1 repair inspection service. All 9 have unknown stock (`stock_qty IS NULL`), no product image URL, and the active product-visuals table has 0 rows. These records are not a verified retail catalogue. Do not advertise them as confirmed stock or expand them with invented products/prices.

**Required:** import the real SKU list, selling prices, stock quantities, device condition/battery-health notes for used phones, and approved product photos. The import template is in `docs/inventory-import-template.csv`.

### 2. AI chat abuse controls

The website AI endpoint derives a user key from a browser-generated visitor token. The assistant has an 8-message-per-minute limit per derived key, but a visitor can rotate that token. This is useful conversational throttling, not a robust abuse-control boundary.

**Required:** add a shared, server-side rate limiter (for example, a managed atomic limiter) with conservative per-IP and per-visitor limits, a 429 response and `Retry-After`. Avoid trusting client tokens or adding an in-memory-only limiter on serverless instances.

### 3. Telegram webhook idempotency

The webhook stores Telegram update IDs in `telegram_webhook_updates` and rejects duplicate IDs. If the deduplication database insert fails, the current handler intentionally continues processing to keep support available; duplicate processing is therefore possible during a database outage.

**Required:** choose and test an explicit outage policy. For customer-created repair/order actions, prefer a safe retry response or durable idempotency key rather than silently processing without dedupe.

### 4. Payment and repair end-to-end validation

The code includes Razorpay signature verification, server-side payment lookup/capture, Supabase order persistence, webhook handling and repair advancement. The database currently has 13 orders (1 paid, 10 created, 1 payment_create_failed, 1 payment_failed) and 8 repair tickets (5 received, 1 diagnosing, 1 approved, 1 rejected).

These database counts do not prove that a new customer checkout, webhook delivery, Telegram confirmation and repair transition work end-to-end. No live payment was attempted during this review.

**Required:** use an isolated test environment and Razorpay test credentials to verify order creation, checkout, signature mismatch rejection, captured payment, duplicate webhook delivery, failed payment, reconciliation, Telegram confirmation and repair transition. Never test by charging a customer.

### 5. Database least privilege

Supabase security advisors reported four informational `rls_enabled_no_policy` findings: `customer_warranties`, `product_visuals`, `telegram_referrals`, and `telegram_webhook_updates`. RLS is enabled. The inspected grants show service-role-only access for three tables, but `product_visuals` still has table privileges granted to `anon` and `authenticated`. With no policies this currently remains row-denied, but the extra grants are unnecessary and should be revoked in a reviewed migration.

**Required:** add a migration to revoke public/authenticated privileges on `product_visuals`, keep service-role access, then verify the grants and RLS behavior in a staging database before release.

## Next release gates

1. Confirm the actual product and repair-service inventory; import only verified data and approved images.
2. Add durable website AI rate limiting and test token rotation, burst traffic and 429 behavior.
3. Define webhook behavior during Supabase outages and test duplicate/retry paths.
4. Apply the least-privilege migration only in staging and verify it with Supabase advisors.
5. Run the full CI suite and a staging browser flow.
6. Complete Razorpay test-mode and Telegram end-to-end tests.
7. Review the preview deployment and obtain explicit release approval before any production deployment.

## Explicitly not done

- No production deploy or merge.
- No live payment, Telegram message, customer notification or order was created.
- No production database mutation or migration was applied.
- No stock, price, product photo or customer record was fabricated.
