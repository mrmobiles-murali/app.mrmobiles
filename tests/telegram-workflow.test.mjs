import test from "node:test";
import assert from "node:assert/strict";
import { handleBotUpdate, derivedWebhookSecret, matchesSecret, miniAppUrl, adminIds, businessCompatibleMessageBody } from "../lib/telegram-workflow.ts";

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
function adminCallback(data, chat = { id: -99, type: "group" }) {
  return {
    update_id: 126,
    callback_query: {
      id: "cb-admin",
      from: { id: 99, first_name: "Admin" },
      data,
      message: { chat }
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
  assert.match(calls[1].body.text, /brand/i);
  assert.match(calls[1].body.text, /exact model/i);
});

test("guided repair reply bypasses generic AI and forwards the exact details", async () => {
  let forwarded;
  let aiCalled = false;
  const { ctx, calls } = context({
    repairIntake: async (userId, name, details) => {
      forwarded = { userId, name, details };
      return { referenceCode: "MRR-ABCDEF1234" };
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
  assert.match(calls[0].body.text, /Repair request received/);
  assert.match(calls[0].body.text, /MRR-ABCDEF1234/);
  assert.doesNotMatch(calls[0].body.text, /Samsung S23/);
  assert.match(calls[0].body.text, /technician review/i);
  assert.equal(calls[0].body.reply_markup.inline_keyboard.length, 3);
  assert.equal(calls[0].body.reply_markup.inline_keyboard[0][0].callback_data, "repair_status:MRR-ABCDEF1234");
  assert.equal(calls[0].body.reply_markup.inline_keyboard[1][0].callback_data, "repair_cancel_prompt:MRR-ABCDEF1234");
});

test("guided repair reply asks for more detail when input is too short", async () => {
  let forwarded = false;
  const { ctx, calls } = context({
    repairIntake: async () => {
      forwarded = true;
      return { referenceCode: "MRR-ABCDEF1234" };
    }
  });
  await handleBotUpdate(message("S23", {
    reply_to_message: { text: "🛠️ Repair Diagnosis\n\nReply with:" }
  }), ctx);
  assert.equal(forwarded, false);
  assert.equal(calls[0].body.reply_markup.force_reply, true);
  assert.match(calls[0].body.text, /brand, exact model and the problem/i);
});

test("repairs command lists only customer repair tickets", async () => {
  let queried;
  const { ctx, calls } = context({
    repairs: async userId => {
      queried = userId;
      return [{
        reference_code: "MRR-ABCDEF1234",
        device_brand: "Samsung",
        device_model: "A17 5G",
        issue_or_condition: "Touch not working",
        status: "diagnosing",
        quoted_amount_paise: null,
        status_note: "Inspection started"
      }];
    }
  });
  await handleBotUpdate(message("/repairs"), ctx);
  assert.equal(queried, 42);
  assert.match(calls[0].body.text, /MRR-ABCDEF1234/);
  assert.match(calls[0].body.text, /diagnosing/);
});

test("repair status command is scoped to the Telegram user", async () => {
  let queried;
  const { ctx, calls } = context({
    repairStatus: async (userId, referenceCode) => {
      queried = { userId, referenceCode };
      return {
        reference_code: referenceCode,
        device_brand: "Samsung",
        device_model: "A17 5G",
        issue_or_condition: "Touch not working",
        status: "awaiting_approval",
        quoted_amount_paise: 250000,
        status_note: "Touch panel replacement"
      };
    }
  });
  await handleBotUpdate(message("/repairstatus MRR-ABCDEF1234"), ctx);
  assert.deepEqual(queried, { userId: 42, referenceCode: "MRR-ABCDEF1234" });
  assert.match(calls[0].body.text, /₹2,500/);
  assert.match(calls[0].body.text, /awaiting_approval/);
});

test("repair quote approval callback is tied to authenticated customer", async () => {
  let approved;
  const { ctx, calls } = context({
    approveRepair: async (userId, referenceCode) => {
      approved = { userId, referenceCode };
      return true;
    }
  });
  await handleBotUpdate(callback("repair_approve:MRR-ABCDEF1234"), ctx);
  assert.deepEqual(approved, { userId: 42, referenceCode: "MRR-ABCDEF1234" });
  assert.equal(calls[0].method, "answerCallbackQuery");
  assert.match(calls[1].body.text, /quote approved/i);
});

test("admin can update repair status and non-admin cannot", async () => {
  let update;
  const admin = message("/repairupdate MRR-ABCDEF1234 repairing Work started", { from: { id: 99, first_name: "Admin" } });
  const { ctx, calls } = context({
    repairUpdate: async (referenceCode, status, note) => {
      update = { referenceCode, status, note };
      return true;
    }
  });
  await handleBotUpdate(admin, ctx);
  assert.deepEqual(update, {
    referenceCode: "MRR-ABCDEF1234",
    status: "repairing",
    note: "Work started"
  });
  assert.match(calls[0].body.text, /updated to repairing/);

  let unauthorized = false;
  const second = context({
    repairUpdate: async () => {
      unauthorized = true;
      return true;
    }
  });
  await handleBotUpdate(message("/repairupdate MRR-ABCDEF1234 ready Done"), second.ctx);
  assert.equal(unauthorized, false);
  assert.match(second.calls[0].body.text, /support team/);
});

test("admin repair quote sends rupee amount to lifecycle handler", async () => {
  let quote;
  const { ctx, calls } = context({
    repairQuote: async (referenceCode, amountPaise, note) => {
      quote = { referenceCode, amountPaise, note };
      return true;
    }
  });
  await handleBotUpdate(message("/repairquote MRR-ABCDEF1234 2500 Touch panel replacement", {
    from: { id: 99, first_name: "Admin" }
  }), ctx);
  assert.deepEqual(quote, {
    referenceCode: "MRR-ABCDEF1234",
    amountPaise: 250000,
    note: "Touch panel replacement"
  });
  assert.match(calls[0].body.text, /2,500/);
});

test("admin repair status buttons update the bound ticket without typing a command", async () => {
  let update;
  const { ctx, calls } = context({
    repairUpdate: async (referenceCode, status, note) => {
      update = { referenceCode, status, note };
      return true;
    }
  });
  await handleBotUpdate(adminCallback("repair_admin:MRR-ABCDEF1234:diagnosing"), ctx);
  assert.deepEqual(update, {
    referenceCode: "MRR-ABCDEF1234",
    status: "diagnosing",
    note: "Device inspection started."
  });
  assert.equal(calls[0].method, "answerCallbackQuery");
  assert.match(calls[0].body.text, /diagnosing/i);
  assert.equal(calls[1].body.chat_id, -99);
  assert.match(calls[1].body.text, /Customer notification sent/);
});

test("non-admin cannot use repair lifecycle buttons", async () => {
  let updated = false;
  const { ctx, calls } = context({
    repairUpdate: async () => {
      updated = true;
      return true;
    }
  });
  await handleBotUpdate(callback("repair_admin:MRR-ABCDEF1234:ready"), ctx);
  assert.equal(updated, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "answerCallbackQuery");
  assert.match(calls[0].body.text, /support team/i);
});

test("admin quote button binds repair reference and opens amount-only force reply", async () => {
  const { ctx, calls } = context();
  await handleBotUpdate(adminCallback("repair_quote_prompt:MRR-ABCDEF1234"), ctx);
  const prompt = calls.find(call => call.method === "sendMessage" && call.body.chat_id === -99);
  assert.ok(prompt);
  assert.match(prompt.body.text, /Reference: MRR-ABCDEF1234/);
  assert.match(prompt.body.text, /AMOUNT optional note/);
  assert.equal(prompt.body.reply_markup.force_reply, true);
});

test("replying to bound quote prompt sends quote without retyping repair reference", async () => {
  let quote;
  const { ctx, calls } = context({
    repairQuote: async (referenceCode, amountPaise, note) => {
      quote = { referenceCode, amountPaise, note };
      return true;
    }
  });
  await handleBotUpdate({
    update_id: 128,
    message: {
      chat: { id: -99, type: "group" },
      from: { id: 99, first_name: "Admin" },
      text: "2500 Display replacement",
      reply_to_message: {
        text: "💰 MR MOBILES quote\nReference: MRR-ABCDEF1234\n\nReply with: AMOUNT optional note"
      }
    }
  }, ctx);
  assert.deepEqual(quote, {
    referenceCode: "MRR-ABCDEF1234",
    amountPaise: 250000,
    note: "Display replacement"
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.chat_id, -99);
  assert.match(calls[0].body.text, /₹2,500/);
});

test("photo repair ticket shows grounded AI visual pre-check when available", async () => {
  const { ctx, calls } = context({
    repairIntake: async () => ({
      referenceCode: "MRR-ABCDEF1234",
      aiTriage: "Visible screen glass damage. Technician should verify touch and display output. Technician inspection confirms diagnosis and price."
    })
  });
  await handleBotUpdate({
    update_id: 131,
    message: {
      chat: { id: 42, type: "private" },
      from: { id: 42, first_name: "Customer" },
      caption: "Samsung A17 5G screen cracked",
      photo: [{ file_id: "photo-id" }],
      reply_to_message: { text: "🛠️ Repair Diagnosis\n\nReply with:" }
    }
  }, ctx);
  assert.match(calls[0].body.text, /AI pre-check/);
  assert.match(calls[0].body.text, /Technician inspection confirms diagnosis and price/);
});

test("admin technician and SLA buttons bind the repair reference", async () => {
  const first = context();
  await handleBotUpdate(adminCallback("repair_assign_prompt:MRR-ABCDEF1234"), first.ctx);
  const assignPrompt = first.calls.find(call => call.method === "sendMessage" && call.body.chat_id === -99);
  assert.ok(assignPrompt);
  assert.match(assignPrompt.body.text, /technician/i);
  assert.match(assignPrompt.body.text, /MRR-ABCDEF1234/);
  assert.equal(assignPrompt.body.reply_markup.force_reply, true);

  const second = context();
  await handleBotUpdate(adminCallback("repair_sla_prompt:MRR-ABCDEF1234"), second.ctx);
  const slaPrompt = second.calls.find(call => call.method === "sendMessage" && call.body.chat_id === -99);
  assert.ok(slaPrompt);
  assert.match(slaPrompt.body.text, /SLA/);
  assert.equal(slaPrompt.body.reply_markup.force_reply, true);
});

test("replying to technician and SLA prompts updates the bound repair", async () => {
  let assigned;
  const a = context({
    repairAssign: async (referenceCode, technicianName) => {
      assigned = { referenceCode, technicianName };
      return true;
    }
  });
  await handleBotUpdate({
    update_id: 132,
    message: {
      chat: { id: -99, type: "group" },
      from: { id: 99, first_name: "Admin" },
      text: "Arun Tech",
      reply_to_message: {
        text: "👨‍🔧 MR MOBILES technician\nReference: MRR-ABCDEF1234\n\nReply with technician name."
      }
    }
  }, a.ctx);
  assert.deepEqual(assigned, { referenceCode: "MRR-ABCDEF1234", technicianName: "Arun Tech" });

  let sla;
  const b = context({
    repairSetSla: async (referenceCode, hours) => {
      sla = { referenceCode, hours };
      return true;
    }
  });
  await handleBotUpdate({
    update_id: 133,
    message: {
      chat: { id: -99, type: "group" },
      from: { id: 99, first_name: "Admin" },
      text: "24",
      reply_to_message: {
        text: "⏱ MR MOBILES SLA\nReference: MRR-ABCDEF1234\n\nReply with SLA hours (1-720)."
      }
    }
  }, b.ctx);
  assert.deepEqual(sla, { referenceCode: "MRR-ABCDEF1234", hours: 24 });
});

test("completed repair ticket offers warranty creation and routes warranty days", async () => {
  const opened = context({
    adminRepairTicket: async () => ({
      reference_code: "MRR-ABCDEF1234",
      customer_name: "Customer",
      telegram_user_id: 42,
      device_brand: "Samsung",
      device_model: "A17 5G",
      issue_or_condition: "Touch issue",
      status: "completed"
    })
  });
  await handleBotUpdate(callback("admin_ticket:MRR-ABCDEF1234"), {
    ...opened.ctx,
    admins: [42]
  });
  const ticketMessage = opened.calls.find(call => call.method === "sendMessage");
  assert.ok(ticketMessage);
  const buttons = ticketMessage.body.reply_markup.inline_keyboard.flat();
  assert.equal(buttons.some(button => button.callback_data === "warranty_prompt:MRR-ABCDEF1234"), true);

  let warranty;
  const prompted = context({
    createWarranty: async (referenceCode, days, note) => {
      warranty = { referenceCode, days, note };
      return true;
    }
  });
  await handleBotUpdate({
    update_id: 134,
    message: {
      chat: { id: -99, type: "group" },
      from: { id: 99, first_name: "Admin" },
      text: "90 Display replacement service warranty",
      reply_to_message: {
        text: "🛡 MR MOBILES warranty\nReference: MRR-ABCDEF1234\n\nReply with: DAYS optional note"
      }
    }
  }, prompted.ctx);
  assert.deepEqual(warranty, {
    referenceCode: "MRR-ABCDEF1234",
    days: 90,
    note: "Display replacement service warranty"
  });
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

test("account command shows orders repairs spend and loyalty points", async () => {
  const { ctx, calls } = context({
    accountSummary: async userId => {
      assert.equal(userId, 42);
      return {
        orderCount: 3,
        paidOrderCount: 2,
        paidSpendPaise: 450000,
        loyaltyPoints: 45,
        repairCount: 2,
        activeRepairs: 1,
        savedDevices: 2,
        activeWarranties: 1
      };
    }
  });
  await handleBotUpdate(message("/account"), ctx);
  assert.match(calls[0].body.text, /Mr Mobiles Account/);
  assert.match(calls[0].body.text, /MR Points: 45/);
  assert.match(calls[0].body.text, /₹4,500/);
});

test("refer command generates a deep link bound to the authenticated Telegram user", async () => {
  const { ctx, calls } = context();
  await handleBotUpdate(message("/refer"), ctx);
  assert.match(calls[0].body.text, /t\.me\/MrMobilesTestBot\?start=ref_42/);
});

test("referral start records first touch without allowing self referral", async () => {
  let recorded;
  const { ctx, calls } = context({
    recordReferral: async (referredUserId, referrerUserId, source) => {
      recorded = { referredUserId, referrerUserId, source };
      return true;
    }
  });
  await handleBotUpdate(message("/start ref_99"), ctx);
  assert.deepEqual(recorded, { referredUserId: 42, referrerUserId: 99, source: "bot_start" });
  assert.match(calls[0].body.text, /Referral connected/i);

  recorded = undefined;
  const self = context({
    recordReferral: async (...args) => {
      recorded = args;
      return true;
    }
  });
  await handleBotUpdate(message("/start ref_42"), self.ctx);
  assert.equal(recorded, undefined);
});

test("admin command returns KPI dashboard and actionable repair tickets", async () => {
  const { ctx, calls } = context({
    adminDashboard: async () => ({
      orderCount: 7,
      paidOrderCount: 4,
      revenuePaise: 1200000,
      paymentIssues: 1,
      openRepairs: 3,
      awaitingApproval: 1,
      readyRepairs: 1,
      lowStock: 2,
      referralCount: 5,
      positiveFeedback: 8,
      negativeFeedback: 1,
      overdueSla: 1,
      unknownStock: 4,
      recentRepairs: [{
        reference_code: "MRR-ABCDEF1234",
        customer_name: "Customer",
        telegram_user_id: 42,
        device_brand: "Samsung",
        device_model: "A17 5G",
        issue_or_condition: "Touch not working",
        status: "diagnosing"
      }]
    })
  });
  await handleBotUpdate(message("/admin", { from: { id: 99, first_name: "Admin" } }), ctx);
  assert.match(calls[0].body.text, /Mr Mobiles Admin/);
  assert.match(calls[0].body.text, /Revenue/);
  assert.equal(calls[0].body.reply_markup.inline_keyboard[0][0].callback_data, "admin_ticket:MRR-ABCDEF1234");
});

test("photo repair intake routes the Telegram photo file id with caption details", async () => {
  let intake;
  const { ctx, calls } = context({
    repairIntake: async (userId, name, details, photoFileId) => {
      intake = { userId, name, details, photoFileId };
      return { referenceCode: "MRR-ABCDEF1234" };
    }
  });
  await handleBotUpdate({
    update_id: 130,
    message: {
      chat: { id: 42, type: "private" },
      from: { id: 42, first_name: "Customer" },
      caption: "Samsung A17 5G touch not working after fall",
      photo: [{ file_id: "small" }, { file_id: "large-photo-id" }],
      reply_to_message: { text: "🛠️ Repair Diagnosis\n\nReply with:" }
    }
  }, ctx);
  assert.deepEqual(intake, {
    userId: 42,
    name: "Customer",
    details: "Samsung A17 5G touch not working after fall",
    photoFileId: "large-photo-id"
  });
  assert.match(calls[0].body.text, /Repair request received/);
});

test("admin inventory command lists product IDs and stock truth", async () => {
  const { ctx, calls } = context({
    inventoryAdmin: async () => [
      { id: "iphone-12-64", name: "iPhone 12 64GB", stockQty: 3 },
      { id: "pixel-7-128", name: "Pixel 7 128GB", stockQty: null }
    ]
  });
  await handleBotUpdate(message("/inventory", { from: { id: 99, first_name: "Admin" } }), ctx);
  assert.match(calls[0].body.text, /iphone-12-64/);
  assert.match(calls[0].body.text, /Stock: 3/);
  assert.match(calls[0].body.text, /Stock: confirm/);
});

test("admin stock command updates live stock and warns when low", async () => {
  let updated;
  const { ctx, calls } = context({
    updateStock: async (productId, qty) => {
      updated = { productId, qty };
      return true;
    }
  });
  await handleBotUpdate(message("/stock iphone-12-64 2", { from: { id: 99, first_name: "Admin" } }), ctx);
  assert.deepEqual(updated, { productId: "iphone-12-64", qty: 2 });
  assert.match(calls[0].body.text, /Low stock alert/);
});

test("privacy command warns against sensitive credentials", async () => {
  const { ctx, calls } = context();
  await handleBotUpdate(message("/privacy"), ctx);
  assert.equal(calls.length, 1);
  assert.match(calls[0].body.text, /OTP/);
  assert.match(calls[0].body.text, /privately/);
});

test("repair command keeps the customer flow focused", async () => {
  const { ctx, calls } = context();
  await handleBotUpdate(message("/repair"), ctx);
  const rows = calls[0].body.reply_markup.inline_keyboard;
  assert.equal(rows.length, 1);
  assert.equal(rows[0][0].callback_data, "repair_start");
  assert.match(calls[0].body.text, /one message/i);
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

test("admin can send the default repair reply with one tap and no manual customer ID", async () => {
  const { ctx, calls } = context();
  await handleBotUpdate(adminCallback("reply_default:8624638243"), ctx);
  const delivered = calls.find(call => call.method === "sendMessage" && call.body.chat_id === 8624638243);
  assert.ok(delivered);
  assert.match(delivered.body.text, /repair request has been received/i);
  assert.match(delivered.body.text, /MR MOBILES/);
  assert.equal(calls.some(call => call.method === "answerCallbackQuery"), true);
});

test("custom reply button binds the customer ID and opens an editable force-reply prompt", async () => {
  const { ctx, calls } = context();
  await handleBotUpdate(adminCallback("reply_customer:8624638243"), ctx);
  const prompt = calls.find(call => call.method === "sendMessage" && call.body.chat_id === -99);
  assert.ok(prompt);
  assert.match(prompt.body.text, /Customer ID: 8624638243/);
  assert.match(prompt.body.text, /Suggested reply:/);
  assert.equal(prompt.body.reply_markup.force_reply, true);
});

test("replying to the admin prompt routes the message to the bound customer without slash reply", async () => {
  const { ctx, calls } = context();
  await handleBotUpdate({
    update_id: 127,
    message: {
      chat: { id: -99, type: "group" },
      from: { id: 99, first_name: "Admin" },
      text: "Your repair is being checked now.",
      reply_to_message: {
        text: "↩️ MR MOBILES reply\nCustomer ID: 8624638243\n\nSuggested reply:\nYour repair request has been received ✅"
      }
    }
  }, ctx);
  assert.equal(calls[0].method, "sendMessage");
  assert.equal(calls[0].body.chat_id, 8624638243);
  assert.match(calls[0].body.text, /being checked now/);
  assert.equal(calls[1].body.chat_id, -99);
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
  const buttons = calls[0].body.reply_markup.inline_keyboard[0];
  assert.equal(buttons[0].callback_data, "reply_default:42");
  assert.equal(buttons[1].callback_data, "reply_customer:42");
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


test("admin repair ticket opens from the configured support group", async () => {
  const { ctx, calls } = context({
    adminRepairTicket: async referenceCode => ({
      reference_code: referenceCode,
      customer_name: "Customer",
      telegram_user_id: 42,
      device_brand: "Samsung",
      device_model: "S23",
      issue_or_condition: "Display issue",
      status: "diagnosing",
      quoted_amount_paise: null,
      status_note: null,
      technician_name: null,
      sla_due_at: null,
      created_at: "2026-10-04T00:00:00Z",
      updated_at: "2026-10-04T00:00:00Z"
    })
  });
  await handleBotUpdate(adminCallback("admin_ticket:MRR-ABCDEF1234"), ctx);
  const opened = calls.find(call => call.method === "sendMessage" && call.body.chat_id === -99);
  assert.ok(opened);
  assert.match(opened.body.text, /MRR-ABCDEF1234/);
  assert.equal(opened.body.reply_markup.inline_keyboard[0][0].callback_data, "repair_quote_prompt:MRR-ABCDEF1234");
});

test("stale repair quote callbacks cannot roll an active repair backward", async () => {
  const { ctx, calls } = context({
    adminRepairTicket: async referenceCode => ({
      reference_code: referenceCode,
      telegram_user_id: 42,
      device_model: "S23",
      status: "repairing"
    })
  });
  await handleBotUpdate(adminCallback("repair_quote_prompt:MRR-ABCDEF1234"), ctx);
  assert.equal(calls.some(call => call.body?.reply_markup?.force_reply === true), false);
  assert.equal(calls.some(call => /cannot be quoted from repairing/i.test(String(call.body?.text || ""))), true);
});

test("repairupdate cannot manually bypass confirmed quote payment", async () => {
  let updated = false;
  const { ctx, calls } = context({
    adminRepairTicket: async referenceCode => ({
      reference_code: referenceCode,
      telegram_user_id: 42,
      device_model: "S23",
      status: "approved"
    }),
    repairUpdate: async () => {
      updated = true;
      return true;
    }
  });
  await handleBotUpdate(message(
    "/repairupdate MRR-ABCDEF1234 repairing manual",
    { from: { id: 99, first_name: "Admin" } }
  ), ctx);
  assert.equal(updated, false);
  assert.equal(calls.some(call => /only after the approved quote payment/i.test(String(call.body?.text || ""))), true);
});


test("repairupdate cannot roll a paid repair backward", async () => {
  let updated = false;
  const { ctx, calls } = context({
    adminRepairTicket: async referenceCode => ({
      reference_code: referenceCode,
      telegram_user_id: 42,
      device_model: "S23",
      status: "repairing"
    }),
    repairUpdate: async () => {
      updated = true;
      return true;
    }
  });
  await handleBotUpdate(message(
    "/repairupdate MRR-ABCDEF1234 awaiting_approval stale",
    { from: { id: 99, first_name: "Admin" } }
  ), ctx);
  assert.equal(updated, false);
  assert.equal(calls.some(call => /cannot move from repairing to awaiting_approval/i.test(String(call.body?.text || ""))), true);
});


test("admin repair quote accepts a one-rupee test amount", async () => {
  let quote;
  const { ctx, calls } = context({
    repairQuote: async (referenceCode, amountPaise, note) => {
      quote = { referenceCode, amountPaise, note };
      return true;
    }
  });
  await handleBotUpdate(message("/repairquote MRR-ABCDEF1234 1 Test quote", {
    from: { id: 99, first_name: "Admin" }
  }), ctx);
  assert.deepEqual(quote, {
    referenceCode: "MRR-ABCDEF1234",
    amountPaise: 100,
    note: "Test quote"
  });
  assert.match(calls[0].body.text, /₹1/);
});

test("bound quote prompt accepts a one-rupee test amount", async () => {
  let quote;
  const { ctx } = context({
    repairQuote: async (referenceCode, amountPaise, note) => {
      quote = { referenceCode, amountPaise, note };
      return true;
    }
  });
  await handleBotUpdate({
    update_id: 129,
    message: {
      chat: { id: -99, type: "group" },
      from: { id: 99, first_name: "Admin" },
      text: "1 Test quote",
      reply_to_message: {
        text: "💰 MR MOBILES quote\nReference: MRR-ABCDEF1234\n\nReply with: AMOUNT optional note"
      }
    }
  }, ctx);
  assert.deepEqual(quote, {
    referenceCode: "MRR-ABCDEF1234",
    amountPaise: 100,
    note: "Test quote"
  });
});


test("customer can cancel an eligible repair with confirmation", async () => {
  let cancelled;
  const repair = {
    reference_code: "MRR-ABCDEF1234",
    device_brand: "Samsung",
    device_model: "S23",
    issue_or_condition: "Display issue",
    status: "received"
  };
  const { ctx, calls } = context({
    repairStatus: async (userId, referenceCode) => ({
      ...repair,
      reference_code: referenceCode
    }),
    cancelRepair: async (userId, referenceCode) => {
      cancelled = { userId, referenceCode };
      repair.status = "cancelled";
      return true;
    }
  });

  await handleBotUpdate(callback("repair_cancel_prompt:MRR-ABCDEF1234"), ctx);
  const prompt = calls.find(call => /Cancel repair request/.test(String(call.body?.text || "")));
  assert.ok(prompt);
  assert.equal(prompt.body.reply_markup.inline_keyboard[0][0].callback_data, "repair_cancel_confirm:MRR-ABCDEF1234");

  calls.length = 0;
  await handleBotUpdate(callback("repair_cancel_confirm:MRR-ABCDEF1234"), ctx);
  assert.deepEqual(cancelled, { userId: 42, referenceCode: "MRR-ABCDEF1234" });
  assert.match(calls.find(call => call.method === "sendMessage").body.text, /cancelled/i);
});

test("customer cancel is blocked once repair work has started", async () => {
  let cancelled = false;
  const { ctx, calls } = context({
    repairStatus: async referenceCode => ({
      reference_code: "MRR-ABCDEF1234",
      device_model: "S23",
      issue_or_condition: "Display issue",
      status: "repairing"
    }),
    cancelRepair: async () => {
      cancelled = true;
      return true;
    }
  });

  await handleBotUpdate(callback("repair_cancel_prompt:MRR-ABCDEF1234"), ctx);
  assert.equal(cancelled, false);
  assert.equal(calls.some(call => /already moved into work\/payment processing/i.test(String(call.body?.text || ""))), true);
});

test("admin can accept a new repair from the ticket controls", async () => {
  let updated;
  const { ctx, calls } = context({
    adminRepairTicket: async referenceCode => ({
      reference_code: referenceCode,
      telegram_user_id: 42,
      device_model: "S23",
      issue_or_condition: "Display issue",
      status: updated?.status || "received"
    }),
    repairUpdate: async (referenceCode, status, note) => {
      updated = { referenceCode, status, note };
      return true;
    }
  });

  await handleBotUpdate(adminCallback("repair_admin:MRR-ABCDEF1234:reviewing"), ctx);
  assert.deepEqual(updated, {
    referenceCode: "MRR-ABCDEF1234",
    status: "reviewing",
    note: "Repair request accepted by Mr Mobiles."
  });
  assert.equal(calls.some(call => /updated to reviewing/i.test(String(call.body?.text || ""))), true);
});

test("admin can decline a new repair from the ticket controls", async () => {
  let updated;
  const { ctx, calls } = context({
    adminRepairTicket: async referenceCode => ({
      reference_code: referenceCode,
      telegram_user_id: 42,
      device_model: "S23",
      issue_or_condition: "Display issue",
      status: updated?.status || "received"
    }),
    repairUpdate: async (referenceCode, status, note) => {
      updated = { referenceCode, status, note };
      return true;
    }
  });

  await handleBotUpdate(adminCallback("repair_admin:MRR-ABCDEF1234:rejected"), ctx);
  assert.deepEqual(updated, {
    referenceCode: "MRR-ABCDEF1234",
    status: "rejected",
    note: "Mr Mobiles declined this repair request."
  });
  assert.equal(calls.some(call => /updated to rejected/i.test(String(call.body?.text || ""))), true);
});


test("Business messages convert Web App buttons to URL buttons", () => {
  const original = {
    chat_id: 42,
    text: "Open Mr Mobiles",
    reply_markup: {
      inline_keyboard: [[
        { text: "Shop", web_app: { url: "https://app.mrmobiles.in/" } },
        { text: "Support", callback_data: "human_support" }
      ]]
    }
  };
  const compatible = businessCompatibleMessageBody(original);
  assert.deepEqual(compatible.reply_markup.inline_keyboard[0][0], {
    text: "Shop",
    url: "https://app.mrmobiles.in/"
  });
  assert.deepEqual(compatible.reply_markup.inline_keyboard[0][1], {
    text: "Support",
    callback_data: "human_support"
  });
  assert.equal(original.reply_markup.inline_keyboard[0][0].web_app.url, "https://app.mrmobiles.in/");
});
