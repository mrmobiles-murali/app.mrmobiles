import test from "node:test";
import assert from "node:assert/strict";
import { handleBotUpdate, derivedWebhookSecret, matchesSecret, miniAppUrl, adminIds } from "../lib/telegram-workflow.ts";

function message(text, extra = {}) {
  return { update_id: 123, message: { chat: { id: 42, type: "private" }, from: { id: 42, first_name: "Customer" }, text, ...extra } };
}
function context(overrides = {}) {
  const calls = [];
  const ctx = { appUrl: "https://mrmobiles.in/", admins: [99], supportChatId: 99,
    call: async (method, body) => { calls.push({ method, body }); return {}; },
    orders: async () => [], ...overrides };
  return { ctx, calls };
}
test("webhook credentials reject missing, wrong and different-length values", () => {
  const expected = derivedWebhookSecret("123456:fake-test-token-only");
  assert.equal(expected.length, 32);
  assert.equal(matchesSecret(null, expected), false);
  assert.equal(matchesSecret("x", expected), false);
  assert.equal(matchesSecret(expected, expected), true);
});
test("URL selection uses configured domain and rejects plaintext/credential URLs", () => {
  assert.equal(miniAppUrl("https://appmrmobiles.vercel.app/api/telegram/webhook"), "https://appmrmobiles.vercel.app/");
  assert.equal(miniAppUrl("https://example.com", "https://mrmobiles.in"), "https://mrmobiles.in/");
  assert.throws(() => miniAppUrl("https://example.com", "http://mrmobiles.in"));
  assert.throws(() => miniAppUrl("https://example.com", "https://secret@example.com"));
});
test("group updates never retrieve or publish customer orders", async () => {
  let queried = false;
  const { ctx, calls } = context({ orders: async () => { queried = true; return []; } });
  await handleBotUpdate(message("/orders", { chat: { id: -10, type: "group" } }), ctx);
  assert.equal(queried, false);
  assert.equal(calls.length, 0);
});
test("orders are scoped to sender identity, never a user-supplied argument", async () => {
  let queried;
  const { ctx, calls } = context({ orders: async id => { queried = id; return [{ id: "abc12345more", amount_paise: 12345, status: "paid" }]; } });
  await handleBotUpdate(message("/orders 999"), ctx);
  assert.equal(queried, 42);
  assert.match(calls[0].body.text, /123\.45/);
});
test("non-admin cannot send customer replies", async () => {
  const { ctx, calls } = context();
  await handleBotUpdate(message("/reply 123 Hi"), ctx);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.chat_id, 42);
  assert.match(calls[0].body.text, /support team/);
});
test("admin replies use the authenticated sender and preserve plain text", async () => {
  const { ctx, calls } = context();
  await handleBotUpdate(message("/reply 123 <b>Ready</b>", { from: { id: 99 } }), ctx);
  assert.equal(calls[0].body.chat_id, 123);
  assert.equal(calls[0].body.parse_mode, undefined);
  assert.match(calls[0].body.text, /<b>Ready<\/b>/);
});
test("support message reaches admin before customer acknowledgement", async () => {
  const { ctx, calls } = context();
  await handleBotUpdate(message("/support <script>screen problem</script>"), ctx);
  assert.equal(calls[0].body.chat_id, 99);
  assert.equal(calls[0].body.parse_mode, undefined);
  assert.match(calls[0].body.text, /\/reply 42/);
  assert.equal(calls[1].body.chat_id, 42);
});
test("support is honest when an admin has not been configured", async () => {
  const { ctx, calls } = context({ supportChatId: undefined });
  await handleBotUpdate(message("/support Help"), ctx);
  assert.equal(calls.length, 1);
  assert.match(calls[0].body.text, /contact@mrmobiles\.in/);
  assert.doesNotMatch(calls[0].body.text, /has been sent/);
});
test("repair link opens the service category", async () => {
  const { ctx, calls } = context();
  await handleBotUpdate(message("/repair"), ctx);
  assert.equal(calls[0].body.reply_markup.inline_keyboard[0][0].web_app.url, "https://mrmobiles.in/?category=service");
});
test("failed support delivery never claims the message was sent", async () => {
  const calls = [];
  const { ctx } = context({ call: async (method, body) => {
    if (body.chat_id === 99) throw new Error("Delivery failed");
    calls.push(body);
  }});
  await handleBotUpdate(message("/support My screen is broken"), ctx);
  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /could not forward/);
  assert.doesNotMatch(calls[0].text, /has been sent/);
});
test("admin IDs discard invalid entries and cannot grant wildcard access", () => {
  assert.deepEqual(adminIds("99,99,42,bad,-1,*,9007199254740992"), [99,42]);
});
