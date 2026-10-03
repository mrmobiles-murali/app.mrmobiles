import test from "node:test";
import assert from "node:assert/strict";
import {
  encodeMiniAppWebsiteCart,
  parseMiniAppWebsiteCart,
  parseWebsiteCartStartPayload,
  websiteProductSearchName
} from "../lib/website-cart.ts";
import { handleBotUpdate } from "../lib/telegram-workflow.ts";

test("website cart start payload stays compact and validates quantities", () => {
  assert.deepEqual(parseWebsiteCartStartPayload("cart_1x1_2x2_8x5"), [
    { websiteId: 1, qty: 1 },
    { websiteId: 2, qty: 2 },
    { websiteId: 8, qty: 5 }
  ]);
  assert.deepEqual(parseWebsiteCartStartPayload("cart_1x9_bad_99x1"), []);
  assert.equal(websiteProductSearchName(1), "iPhone 13 Pro 128GB");
});

test("mini app website cart codec preserves product IDs and quantities", () => {
  const encoded = encodeMiniAppWebsiteCart([
    { productId: "iphone-13-pro-128", qty: 1 },
    { productId: "iphone-12-64", qty: 2 }
  ]);
  assert.equal(encoded, "iphone-13-pro-128~1,iphone-12-64~2");
  assert.deepEqual(parseMiniAppWebsiteCart(encoded), [
    { productId: "iphone-13-pro-128", qty: 1 },
    { productId: "iphone-12-64", qty: 2 }
  ]);
});

test("Telegram start receives website cart and returns Mini App checkout", async () => {
  const calls = [];
  const products = {
    "iPhone 13 Pro 128GB": {
      id: "iphone-13-pro-128",
      name: "iPhone 13 Pro 128GB",
      subtitle: "Pre-owned",
      pricePaise: 5299900,
      category: "phone",
      emoji: "📱",
      stockQty: 2
    },
    "iPhone 12 64GB": {
      id: "iphone-12-64",
      name: "iPhone 12 64GB",
      subtitle: "Pre-owned",
      pricePaise: 2849900,
      category: "phone",
      emoji: "📱",
      stockQty: 3
    }
  };
  const context = {
    appUrl: "https://appmrmobiles.vercel.app/",
    admins: [],
    botUsername: "MrMobileDoctor_bot",
    call: async (method, body) => { calls.push({ method, body }); return {}; },
    orders: async () => [],
    searchProducts: async (query) => products[query] ? [products[query]] : [],
    productsByIds: async () => []
  };

  await handleBotUpdate({
    update_id: 500,
    message: {
      chat: { id: 42, type: "private" },
      from: { id: 42, first_name: "Customer" },
      text: "/start cart_1x1_2x2"
    }
  }, context);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "sendMessage");
  assert.match(calls[0].body.text, /Website cart received/);
  assert.match(calls[0].body.text, /iPhone 13 Pro 128GB ×1/);
  assert.match(calls[0].body.text, /iPhone 12 64GB ×2/);
  const url = calls[0].body.reply_markup.inline_keyboard[0][0].web_app.url;
  assert.match(url, /^https:\/\/appmrmobiles\.vercel\.app\//);
  assert.match(url, /website_cart=iphone-13-pro-128%7E1%2Ciphone-12-64%7E2/);
});

test("website repair deep link routes to Telegram diagnosis", async () => {
  const calls = [];
  const context = {
    appUrl: "https://appmrmobiles.vercel.app/",
    admins: [],
    botUsername: "MrMobileDoctor_bot",
    call: async (method, body) => { calls.push({ method, body }); return {}; },
    orders: async () => [],
    searchProducts: async () => []
  };
  await handleBotUpdate({
    update_id: 501,
    message: {
      chat: { id: 42, type: "private" },
      from: { id: 42, first_name: "Customer" },
      text: "/start repair_hardware"
    }
  }, context);

  assert.equal(calls[0].method, "sendMessage");
  assert.match(calls[0].body.text, /Hardware Repair/);
  assert.equal(calls[0].body.reply_markup.inline_keyboard[0][0].callback_data, "repair_start");
});
