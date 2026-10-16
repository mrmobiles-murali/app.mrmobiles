# MR MOBILES — WhatsApp Cloud API (draft integration)

**Status: NOT PRODUCTION READY.** This branch provides a signature-validating webhook and a server-only sending helper. It deliberately does not persist messages, send automatic replies, modify Telegram, or touch Razorpay. Do not subscribe a live customer number to this endpoint until durable processing and customer handoff exist.

## Meta onboarding

1. At https://developers.facebook.com/apps/ create or select a Meta app for the WhatsApp use case and associate MR MOBILES business portfolio.
2. Start with Meta's test number. Add a new dedicated +91 phone number only after testing. Keep it out of the standard WhatsApp app.
3. Set business name **MR MOBILES**, website https://mrmobiles.in, verify number ownership by SMS or voice, and set a mandatory six-digit two-step registration PIN. Do not store PIN in Git.
4. Record WhatsApp Business Account ID (WABA ID), Phone Number ID, and Meta App ID. Generate a secure System User access token with WhatsApp messaging and management permissions and WABA asset access. Never paste credentials in chat.
5. Retrieve Meta App Secret from App Settings > Basic. It is **different** from the webhook verification token.

## Vercel server-only variables

- WHATSAPP_VERIFY_TOKEN — strong random secret you choose; paste same value into Meta's webhook configuration
- WHATSAPP_APP_SECRET — Meta App Secret; required to verify POST signatures
- WHATSAPP_ACCESS_TOKEN — Meta System User bearer token
- WHATSAPP_PHONE_NUMBER_ID — Meta Phone Number ID (not the +91 telephone number)
- WHATSAPP_WABA_ID — WABA ID, needed for subscribed_apps
- WHATSAPP_GRAPH_VERSION — currently supported Meta Graph API version in vNN.N form, confirmed from Meta documentation

Never use NEXT_PUBLIC_ for secrets. Add to Vercel project environment settings and redeploy only a reviewed branch.

Use **https://mrmobiles.in/api/whatsapp/webhook** ONLY after checking the domain routes to the reviewed deployment. Otherwise use the actual configured deployment origin. In Meta WhatsApp > Configuration, set callback URL and matching verify token, then subscribe to the messages webhook field. For WABA subscription use Meta's official POST /{WABA_ID}/subscribed_apps with an authorized token or the corresponding dashboard flow. Complete production requirements and business verification if prompted.

## What still blocks real customer activation

- Durable inbound message persistence, idempotency and worker retries
- WhatsApp-specific identity keys: do not reuse Telegram user IDs or surface Telegram orders in WhatsApp chat
- Customer opt-in and opt-out handling, 24-hour customer service window, approved outbound templates
- Repair/order routing, admin escalation, safe human handoff and message-quality monitoring
- Verified end-to-end testing with Meta test phone, valid/forged signatures, duplicate deliveries, replies and receipts
- Review current Meta pricing and billing requirements

## Official references

- https://developers.facebook.com/docs/whatsapp/cloud-api/overview/
- https://www.postman.com/meta/whatsapp-business-platform/overview

