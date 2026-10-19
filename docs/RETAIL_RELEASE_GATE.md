# MR MOBILES release gate — retail, repair, security and AI

This branch is for preview-only validation. Never merge or promote it automatically.

## Catalogue and pricing
- Keep unverified devices (including Galaxy F70 5G) out of the purchasable catalog until staff verifies official model/SKU, supplier cost, GST, inventory, photos, accessory compatibility and sale price.
- The /upgrade page is enquiry-only; it creates no order or booking.
- Server-side catalog pricing remains the only source for checkout amounts.

## Security and customer data
- Check Supabase RLS for every customer-facing table, verify Telegram initData signatures on privileged APIs, and confirm admin allowlists for support and repair ticket access.
- Confirm webhook signatures, idempotency, and replay behavior before production.
- Do not copy production tokens into test logs or GitHub. Review and rotate any leaked credentials.
- Verify that enquiries are not logged or transmitted without customer action.

## AI assistant
- Tamil/English enquiry capture is a deterministic workflow, not a deployed generative AI technician.
- Any future model-backed diagnosis must avoid unsupported repair guarantees and request consent before sending customer data to an AI provider.

## Checkout and deployment
- Run `npm ci && npm test && npm run build` with Node >=22.18.
- Exercise Telegram Android/iOS webview, desktop web, keyboard and Tamil input, enquiry preview/copy, existing catalog/cart, ₹1 test checkout and refund/cancel flows in a nonproduction test environment.
- Confirm the preview build belongs to this branch and SHA. Check 404s, security headers, response caching and accessibility.
- Only after all checks pass should a human approve merging to main and production promotion.

## Current implementation
- /upgrade: bilingual, local-only upgrade/repair/accessory enquiry with bounded inputs and copy.
- /liquid-store.html: link to /upgrade.
- No production data, payments or bot settings changed.
