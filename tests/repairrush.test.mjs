import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as workflow from "../lib/telegram-workflow.ts";
const { handleBotUpdate, repairRushGameUrl, isRepairRushUpdate } = workflow;

const gameUrl = "https://games.example.com/games/repairrush/index.html";
function context(overrides = {}) {
  const calls = [];
  return { calls, ctx: {
    appUrl: "https://mrmobiles.in/", gameUrl, admins: [],
    call: async (method, body) => { calls.push({ method, body }); return {}; },
    orders: async () => { throw new Error("Game must not read orders"); },
    searchProducts: async () => { throw new Error("Game must not read inventory"); },
    ...overrides
  } };
}
const message = text => ({ message: { chat: { id: 42, type: "private" }, from: { id: 42 }, text } });
const gameCallback = extra => ({ callback_query: { id: "play-1", from: { id: 42 }, game_short_name: "repairrush", ...extra } });

function webhook(username = "MrMobileDoctor_bot", configured = gameUrl) {
  const token = "123456:fake-test-token-only";
  const calls = [];
  const module = { exports: {} };
  const route = fs.readFileSync(new URL("../app/api/telegram/webhook/route.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(route, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, {
    exports: module.exports,
    require(name) {
      if (name === "next/server") return { NextResponse: { json: (body, init) => ({ body, status: init?.status || 200 }) } };
      if (name === "@/lib/telegram-workflow") return workflow;
      if (name === "@/lib/business-ai") return { aiRuntimeConfigured: () => false };
      return {};
    },
    process: { env: { TELEGRAM_BOT_TOKEN: token, REPAIR_RUSH_GAME_URL: configured } },
    URL, AbortSignal, console,
    async fetch(url, options) {
      const method = url.split("/").at(-1);
      calls.push({ method, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ ok: true, result: method === "getMe" ? { username } : {} }) };
    }
  });
  return { calls, request: (update, authenticated = true) => ({
    url: "https://backend.example.com/api/telegram/webhook",
    headers: new Headers({ "x-telegram-bot-api-secret-token": authenticated ? workflow.derivedWebhookSecret(token) : "wrong" }),
    json: async () => update
  }), POST: module.exports.POST, GET: module.exports.GET };
}

test("webhook rejects unsigned game updates before Telegram calls", async () => {
  const route = webhook();
  const response = await route.POST(route.request(gameCallback(), false));
  assert.equal(response.status, 401);
  assert.equal(route.calls.length, 0);
});

test("webhook verifies the owning bot before returning a game URL", async () => {
  for (const username of ["MrMobileDoctor_bot", "another_bot"]) {
    const route = webhook(username);
    assert.equal((await route.POST(route.request(gameCallback()))).status, 200);
    assert.equal(route.calls[0].method, "getMe");
    assert.equal(route.calls[1].method, "answerCallbackQuery");
    assert.equal(route.calls[1].body.url, username === "MrMobileDoctor_bot" ? gameUrl : undefined);
  }
});

test("invalid optional game configuration does not break support commands", async () => {
  const route = webhook("MrMobileDoctor_bot", "http://invalid.example.com");
  const status = route.GET(route.request({}));
  assert.equal(status.body.gameConfigured, false);
  assert.equal(status.body.gameConfigurationInvalid, true);
  assert.equal((await route.POST(route.request(message("/id")))).status, 200);
  assert.equal(route.calls[0].method, "sendMessage");
  assert.match(route.calls[0].body.text, /Your Telegram user ID: 42/);
});

test("game URLs exclude credentials, query parameters and plaintext", () => {
  assert.equal(repairRushGameUrl(), undefined);
  assert.equal(repairRushGameUrl(gameUrl), gameUrl);
  for (const url of ["http://games.example.com", "https://secret@games.example.com", `${gameUrl}?user=42`, `${gameUrl}#token`]) {
    assert.throws(() => repairRushGameUrl(url));
  }
});

test("game identity lookup recognizes game requests without intercepting repairs", () => {
  for (const update of [message("/game@MrMobileDoctor_bot"), message("/start repairrush"), gameCallback(), { inline_query: { query: " Repair Rush " } }, { callback_query: { data: "repairrush_play" } }]) {
    assert.equal(isRepairRushUpdate(update), true);
  }
  for (const update of [message("/repair"), message("/gamemaker"), message("Samsung A17 touch broken"), { inline_query: { query: "Samsung" } }]) {
    assert.equal(isRepairRushUpdate(update), false);
  }
});

test("game command and deep link send the registered game without customer lookups", async () => {
  for (const text of ["/game", "/game@MrMobileDoctor_bot", "/start repairrush"]) {
    const { ctx, calls } = context();
    await handleBotUpdate(message(text), ctx);
    assert.deepEqual(calls, [{ method: "sendGame", body: { chat_id: 42, game_short_name: "repairrush" } }]);
  }
});

test("Play returns the same URL in private, group and inline game messages", async () => {
  for (const extra of [{ message: { chat: { id: 42, type: "private" } } }, { message: { chat: { id: -42, type: "supergroup" } } }, { inline_message_id: "inline-game-1" }]) {
    const { ctx, calls } = context();
    await handleBotUpdate(gameCallback(extra), ctx);
    assert.deepEqual(calls, [{ method: "answerCallbackQuery", body: { callback_query_id: "play-1", url: gameUrl, cache_time: 0 } }]);
  }
});

test("unknown or unconfigured games answer with an alert instead of a URL", async () => {
  for (const [update, overrides] of [[gameCallback({ game_short_name: "unknown" }), {}], [gameCallback(), { gameUrl: undefined }]]) {
    const { ctx, calls } = context(overrides);
    await handleBotUpdate(update, ctx);
    assert.equal(calls[0].method, "answerCallbackQuery");
    assert.equal(calls[0].body.show_alert, true);
    assert.equal(calls[0].body.url, undefined);
  }
  const { ctx, calls } = context({ gameUrl: undefined });
  await handleBotUpdate(message("/game"), ctx);
  assert.equal(calls[0].method, "sendMessage");
});

test("inline game search works independently of inventory", async () => {
  const { ctx, calls } = context();
  await handleBotUpdate({ inline_query: { id: "inline-1", from: { id: 42 }, query: "repairrush" } }, ctx);
  assert.deepEqual(calls[0].body.results, [{ type: "game", id: "repairrush", game_short_name: "repairrush" }]);
});

test("home game shortcut sends a game and robot callbacks are ignored", async () => {
  const { ctx, calls } = context();
  await handleBotUpdate({ callback_query: { id: "menu-1", from: { id: 42 }, data: "repairrush_play", message: { chat: { id: 42, type: "private" } } } }, ctx);
  assert.equal(calls[1].method, "sendGame");
  const blocked = context();
  await handleBotUpdate(gameCallback({ from: { id: 42, is_bot: true } }), blocked.ctx);
  assert.equal(blocked.calls.length, 0);
});

// Exercise the shipped engine at explicit times; no clock sleeps or network.
const html = fs.readFileSync(new URL("../public/games/repairrush/index.html", import.meta.url), "utf8");
const engine = html.match(/const PARTS = [\s\S]*?(?=const round=createRound\(\);)/)?.[0];
assert.ok(engine, "The playable engine must be present");
function round() { return vm.runInNewContext(`${engine}\ncreateRound(() => 0)`); }

test("correct repairs score, build a combo and end after 60 active seconds", () => {
  const game = round();
  game.start(0);
  for (let i = 0; i < 4; i++) {
    assert.equal(game.choose(game.snapshot().part.id, i * 250).kind, "correct");
  }
  assert.equal(game.snapshot().repaired, 4);
  assert.equal(game.snapshot().multiplier, 2);
  assert.ok(game.snapshot().score > 600);
  game.tick(60000);
  assert.equal(game.snapshot().mode, "ended");
  assert.equal(game.snapshot().reason, "60 seconds complete");
});

test("pause preserves active time, three misses end the round and replay resets", () => {
  const game = round();
  game.start(0);
  assert.equal(game.pause(1000), true);
  game.resume(11000);
  game.tick(12000);
  assert.equal(game.snapshot().remaining, 58000);
  for (let i = 0; i < 3; i++) {
    const wrong = game.snapshot().part.id === "screen" ? "battery" : "screen";
    game.choose(wrong, 12000 + i * 250);
  }
  assert.equal(game.snapshot().mode, "ended");
  assert.equal(game.snapshot().lives, 0);
  game.start(20000);
  assert.equal(game.snapshot().score, 0);
  assert.equal(game.snapshot().lives, 3);
});
