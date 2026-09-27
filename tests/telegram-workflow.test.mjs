import test from "node:test";
import assert from "node:assert/strict";
import { handleBotUpdate, derivedWebhookSecret, matchesSecret, miniAppUrl, adminIds } from "../lib/telegram-workflow.ts";

function message(text, extra = {}) {
  return { update_id: 123, message: { chat: { id: 42, type: "private" }, from: { id: 42, first_name: "Customer" }, text, ...extra } };
}
function inlineQuery(query = "iphone") {
  return { update_id: 124, inline_query: { id: "inline-1", from: { id: 42, first_name: "Customer" }, query, offset: "" } };
}
function callback(data) {
  return {
    update_id: 125,
    callback_query: {
      id: "cb-1",
      from: { id: 42, first_name: "Customer" },
      data,
      message: { chat: { id: 42, type: "private" } }
    }
  };
}
function sampleProduct(overrides = {}) {
  return {
    id: "iphone-13-pro-128",
    name: "iPhone 13 Pro 128GB",
    subtitle: "Pre-owned",
    pricePaise: 5299900,
    category: "phone",
    emoji: "📱",
    brand: "Apple",
    model: "iPhone 13 Pro",
    stockQty: 2,
    ...overrides
  };
}
function context(overrides = {}) {
  const calls = [];
  const ctx = {
    appUrl: "https://mrmobiles.in/",
    admins: [99],
    supportChatId: 99,
    botUsername: "MrMobilesTestBot",
    call: async (method, body) => { calls.push({ method, body }); return {}; },
    orders: async () => [],
    searchProducts: async () => [],
    productsByIds: async () => [],
    feedback: async () => true,
    ...overrides
  };
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

test("inline queries return premium personal product results", async () => {
  let searched;
  const { ctx, calls } = context({
    searchProducts: async query => {
      searched = query;
      return [sampleProduct()];
    }
  });
  await handleBotUpdate(inlineQuery("  iPhone  "), ctx);
  assert.equal(searched, "iPhone");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "answerInlineQuery");
  const result = calls[0].body.results[0];
  assert.match(result.thumbnail_url, /^https:\/\/mrmobiles\.in\/api\/product-card/);
  assert.match(result.description, /2 in stock/);
  assert.match(result.reply_markup.inline_keyboard[0][0].url, /^https:\/\/t\.me\/MrMobilesTestBot\?startapp=view_/);
  assert.match(result.reply_markup.inline_keyboard[0][1].url, /^https:\/\/t\.me\/MrMobilesTestBot\?startapp=buy_/);
});

test("inline queries cap results at ten", async () => {
  const products = Array.from({ length: 15 }, (_, i) => sampleProduct({ id: `p-${i}`, name: `Phone ${i}` }));
  const { ctx, calls } = context({ searchProducts: async () => products });
  await handleBotUpdate(inlineQuery("phone"), ctx);
  assert.equal(calls[0].body.results.length, 10);
});

test("ordinary text streams a Telegram draft then persists the AI answer with smart actions", async () => {
  let asked;
  const { ctx, calls } = context({
    aiReply: async (userId, text, onDraft) => {
      asked = { userId, text };
      await onDraft?.("I found a live");
      await onDraft?.("I found a live product match.");
      return {
        text: "I found a live product match.",
        usedModel: true,
        responseId: 77,
        products: [sampleProduct()]
      };
    }
  });
  await handleBotUpdate(message("iphone under 60k"), ctx);
  assert.deepEqual(asked, { userId: 42, text: "iphone under 60k" });
  assert.equal(calls[0].method, "sendMessageDraft");
  assert.equal(calls[0].body.text, "");
  assert.equal(calls[1].method, "sendMessageDraft");
  assert.match(calls[1].body.text, /I found a live/);
  const final = calls.at(-1);
  assert.equal(final.method, "sendMessage");
  assert.match(final.body.text, /Mr Mobiles AI/);
  const rows = final.body.reply_markup.inline_keyboard;
  assert.equal(rows.some(row => row.some(button => button.callback_data === "stock:iphone-13-pro-128")), true);
  assert.equal(rows.some(row => row.some(button => button.callback_data === "feedback:1:77")), true);
});

test("AI falls back to typing indicator if live drafts are unavailable", async () => {
  const calls = [];
  const { ctx } = context({
    call: async (method, body) => {
      if (method === "sendMessageDraft") throw new Error("unsupported");
      calls.push({ method, body });
      return {};
    },
    aiReply: async () => ({ text: "Fallback answer", usedModel: true, products: [] })
  });
  await handleBotUpdate(message("hello"), ctx);
  assert.equal(calls[0].method, "sendChatAction");
  assert.equal(calls.at(-1).method, "sendMessage");
});

test("live stock callback rechecks current inventory", async () => {
  const { ctx, calls } = context({ productsByIds: async ids => [sampleProduct({ id: ids[0], stockQty: 1 })] });
  await handleBotUpdate(callback("stock:iphone-13-pro-128"), ctx);
  assert.equal(calls[0].method, "answerCallbackQuery");
  assert.equal(calls[1].method, "sendMessage");
  assert.match(calls[1].body.text, /1 in stock/);
});

test("compare callback returns factual comparison for two products", async () => {
  const p1 = sampleProduct();
  const p2 = sampleProduct({ id: "pixel-7-128", name: "Google Pixel 7 128GB", brand: "Google", model: "Pixel 7", pricePaise: 2649900, stockQty: null });
  const { ctx, calls } = context({ productsByIds: async () => [p2, p1] });
  await handleBotUpdate(callback("compare:iphone-13-pro-128~pixel-7-128"), ctx);
  assert.equal(calls[0].method, "answerCallbackQuery");
  assert.match(calls[1].body.text, /Product Comparison/);
  assert.match(calls[1].body.text, /iPhone 13 Pro/);
  assert.match(calls[1].body.text, /Pixel 7/);
});

test("repair callback starts a guided force-reply flow", async () => {
  const { ctx, calls } = context();
  await handleBotUpdate(callback("repair_start"), ctx);
  assert.equal(calls[0].method, "answerCallbackQuery");
  assert.equal(calls[1].body.reply_markup.force_reply, true);
  assert.match(calls[1].body.text, /Brand/);
  assert.match(calls[1].body.text, /Exact model/);
});

test("guided repair reply bypasses generic AI and forwards the exact details", async () => {
  let forwarded;
  let aiCalled = false;
  const { ctx, calls } = context({
    repairIntake: async (userId, name, details) => {
      forwarded = { userId, name, details };
      return true;
    },
    aiReply: async () => {
      aiCalled = true;
      return { text: "wrong route", usedModel: true, products: [] };
    }
  });
  await handleBotUpdate(message(
    "Samsung S23 - display cracked and touch not working",
    { reply_to_message: { text: "🛠️ Repair Diagnosis\n\nReply with:\n• Brand\n• Exact model\n• Problem / damage" } }
  ), ctx);
  assert.equal(aiCalled, false);
  assert.deepEqual(forwarded, {
    userId: 42,
    name: "Customer",
    details: "Samsung S23 - display cracked and touch not working"
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "sendMessage");
  assert.match(calls[0].body.text, /Repair details received/);
  assert.match(calls[0].body.text, /Samsung S23/);
});

test("guided repair reply asks for more detail when input is too short", async () => {
  let forwarded = false;
  const { ctx, calls } = context({
    repairIntake: async () => {
      forwarded = true;
      return true;
    }
  });
  await handleBotUpdate(message("S23", {
    reply_to_message: { text: "🛠️ Repair Diagnosis\n\nReply with:" }
  }), ctx);
  assert.equal(forwarded, false);
  assert.equal(calls[0].body.reply_markup.force_reply, true);
  assert.match(calls[0].body.text, /brand, exact model and the problem/i);
});

test("feedback callback saves rating for authenticated Telegram user", async () => {
  let saved;
  const { ctx, calls } = context({
    feedback: async (userId, responseId, rating) => {
      saved = { userId, responseId, rating };
      return true;
    }
  });
  await handleBotUpdate(callback("feedback:-1:77"), ctx);
  assert.deepEqual(saved, { userId: 42, responseId: 77, rating: -1 });
  assert.equal(calls[0].method, "answerCallbackQuery");
  assert.match(calls[0].body.text, /feedback saved/i);
});

test("human support callback performs a one-tap handoff", async () => {
  let handoff;
  const { ctx, calls } = context({
    handoff: async (userId, name) => {
      handoff = { userId, name };
      return true;
    }
  });
  await handleBotUpdate(callback("human_support"), ctx);
  assert.deepEqual(handoff, { userId: 42, name: "Customer" });
  assert.equal(calls[0].method, "answerCallbackQuery");
  assert.equal(calls[1].method, "sendMessage");
});

test("privacy command warns against sensitive credentials", async () => {
  const { ctx, calls } = context();
  await handleBotUpdate(message("/privacy"), ctx);
  assert.equal(calls.length, 1);
  assert.match(calls[0].body.text, /OTP/);
  assert.match(calls[0].body.text, /privately/);
});

test("repair command offers guided diagnosis and Mini App services", async () => {
  const { ctx, calls } = context();
  await handleBotUpdate(message("/repair"), ctx);
  const rows = calls[0].body.reply_markup.inline_keyboard;
  assert.equal(rows[0][0].callback_data, "repair_start");
  assert.equal(rows[1][0].web_app.url, "https://mrmobiles.in/?category=service");
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
