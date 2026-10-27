# MR MOBILES — WhatsApp Cloud API (draft integration)

**Status: NOT PRODUCTION READY.** The WhatsApp webhook currently validates signatures and acknowledges delivery only. It does not persist messages or send automated replies. **Do not subscribe a live customer number** to this endpoint until durable processing, deduplication, safe automation and customer handoff have been validated. The website AI chat is separate from the WhatsApp channel.

## Meta onboarding

1. At https://developers.facebook.com/apps/ create or select a Meta app for the WhatsApp use case and associate MR MOBILES business portfolio.
2. For a **new dedicated number**, test with Meta's sandbox number before normal production onboarding. For an **existing number already used in the Android WhatsApp Business app**, do **not** use the standard add/register migration flow: use a provider-supported **WhatsApp Business app Coexistence** Embedded Signup flow instead. Eligibility and owner confirmation inside the Business app are required. Never delete or deregister the existing mobile account to make an API connection.
3. Set business name **MR MOBILES**, website https://mrmobiles.in, and follow the specific onboarding route for the chosen number. New-number onboarding requires ownership verification and a six-digit two-step registration PIN; existing-app Coexistence uses the supported embedded flow and in-app confirmation. Do not store PINs or verification codes in Git.
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


## Bot-first public privacy and staged activation (27 Oct 2026)

- Public customer contact: website AI chatbot, repair enquiry's explicit **Ask the private AI bot** button, and `https://t.me/MrMobileDoctor_bot?start=support` for human handoff. **Never publish the direct shop WhatsApp number** in site headers, footer or social profile buttons. Do not generate `wa.me`, `tel:` or click-to-WhatsApp links with that number.
- The repair form's **Prepare enquiry** is local-only. The user reviews the preview and must explicitly select **Ask the private AI bot** before transmitting details to `/api/ai/chat`. Existing website chat history is server-side; do not tell users that submitting to the bot stores nothing. Do not solicit OTPs, passwords or payment secrets.
- Telegram messages stay on Telegram; the website bot uses an anonymous visitor token. Neither is a WhatsApp message and neither requires publishing the WhatsApp number.
- WhatsApp still shows the business phone number inside WhatsApp business chat/profile. Customers who already know the number may message it directly; once fully activated, bot replies on WhatsApp need an approved 24-hour service window or templates and consent where applicable.
- Selected verified Meta portfolio: business `902181499250891`; connected live Meta app `2125483118343787`. As checked on 27 Oct 2026, app-level callback is configured, but **no production API phone number or WhatsApp-account webhook subscription** exists; WhatsApp billing method is also pending. These state checks can change; re-read Meta before activation.
- Vercel project `app.mrmobiles` was inspected for variable names only on 27 Oct 2026: WhatsApp API token, phone number ID, verify token and app secret were not present in the listed production configuration. Do not copy secrets into source or chat. Set server-side variables in the *actual project serving Meta's callback URL* after confirming deployment routing.
- **Coexistence requirement:** preserve the existing Android WhatsApp Business app; use a Meta-approved Embedded Signup flow that specifically supports *WhatsApp Business App onboarding*. Standard phone add/register is not a substitute, and it could disrupt an existing app number. The business owner must approve the connection and any chat/history permissions in the app.
- Release gate: implement and test durable inbound queue + idempotency + retries + safe automation + independent WhatsApp identity mapping + opt-out and human handoff; then complete coexistence, token setup, phone assignment, WhatsApp-account subscription and billing; test end-to-end before production rollout. An app-level configured webhook is **not** an active customer chatbot.

References: https://support2.chatarchitect.com/books/meta-whatsapp/page/onboarding-whatsapp-business-app-users-aka-coexistence-developer-documentation and https://docs.360dialog.com/docs/resources/phone-numbers/coexistence
