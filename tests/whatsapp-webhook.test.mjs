import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const appSecret = "test-meta-secret";
const verifyToken = "test-verify-token";

function load(file, mocks, env) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, require: name => mocks[name] || require(name),
    process: { env }, Buffer, URL, AbortSignal, fetch: mocks.fetch
  });
  return exports;
}

const helper = load("../lib/whatsapp-cloud.ts", {}, {});
class MockResponse {
  constructor(body, options = {}) { this.body = body; this.status = options.status || 200; }
  static json(body, options = {}) { return new MockResponse(body, options); }
}
function route(env = { WHATSAPP_VERIFY_TOKEN: verifyToken, WHATSAPP_APP_SECRET: appSecret }) {
  return load("../app/api/whatsapp/webhook/route.ts", {
    "next/server": { NextResponse: MockResponse },
    "@/lib/whatsapp-cloud": helper
  }, env);
}
function getReq(token, challenge = "13579") {
  const url = new URL("https://example.org/api/whatsapp/webhook");
  url.searchParams.set("hub.mode", "subscribe");
  url.searchParams.set("hub.verify_token", token);
  url.searchParams.set("hub.challenge", challenge);
  return { nextUrl: url };
}
function postReq(body, secret = appSecret) {
  const signature = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  return { headers: { get: () => signature }, text: async () => body };
}

test("GET handshake accepts exact token only", () => {
  const r = route();
  assert.equal(r.GET(getReq(verifyToken)).body, "13579");
  assert.equal(r.GET(getReq("wrong")).status, 403);
  assert.equal(r.GET(getReq(verifyToken, "invalid")).status, 400);
  assert.equal(route({}).GET(getReq(verifyToken)).status, 503);
});

test("POST requires authentic signature, correct shape and enabled config", async () => {
  const r = route();
  const event = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
  assert.equal((await r.POST(postReq(event))).body.processing, "disabled");
  assert.equal((await r.POST(postReq(event, "forged-secret"))).status, 401);
  assert.equal((await r.POST(postReq("not-json"))).status, 400);
  assert.equal((await r.POST(postReq('{"object":"not-whatsapp"}'))).status, 400);
  assert.equal((await route({}).POST(postReq(event))).status, 503);
});

test("signature is over raw body, not parsed and reserialized JSON", () => {
  const body = '{"object":"whatsapp_business_account"}';
  const sig = "sha256=" + createHmac("sha256", appSecret).update(body).digest("hex");
  assert.equal(helper.verifyWhatsAppSignature(body, sig, appSecret), true);
  assert.equal(helper.verifyWhatsAppSignature(body + " ", sig, appSecret), false);
  assert.equal(helper.verifyWhatsAppSignature(body, "bad", appSecret), false);
});
