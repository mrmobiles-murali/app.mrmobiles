import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const website = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const repair = readFileSync(new URL("../app/upgrade/page.tsx", import.meta.url), "utf8");

test("storefront contact points to support bot without publishing a phone number", () => {
  assert.match(website, /t\.me\/MrMobileDoctor_bot\?start=support/);
  assert.doesNotMatch(website, /wa\.me\/|api\.whatsapp\.com\/send|href=["']tel:/i);
});

test("repair enquiry is previewed locally and only submitted on explicit bot action", () => {
  const previewStart = repair.indexOf("function prepare()");
  const botStart = repair.indexOf("async function askBot()");
  assert.ok(previewStart >= 0 && botStart > previewStart);
  assert.doesNotMatch(repair.slice(previewStart, botStart), /fetch\(|sendBeacon\(/);
  assert.match(repair, /onClick=\{\(\)=>void askBot\(\)\}/);
  assert.match(repair, /fetch\("\/api\/ai\/chat"/);
  assert.match(repair, /visitorToken: token/);
  assert.match(repair, /t\.botPrivacy/);
  assert.match(repair, /t\.botReply|t\.botAnswer/);
});

test("repair support never exposes direct WhatsApp or telephone links", () => {
  assert.doesNotMatch(repair, /wa\.me\/|api\.whatsapp\.com\/send|href=["']tel:/i);
  assert.match(repair, /t\.me\/MrMobileDoctor_bot\?start=support/);
});
