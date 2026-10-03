import test from "node:test";
import assert from "node:assert/strict";
import {
  answerOfflineBusinessQuestion,
  classifyOfflineIntent,
  rankOfflineProducts
} from "../lib/offline-business-intelligence.ts";

const products = [
  {
    id: "iphone-11-128",
    name: "iPhone 11 128GB",
    subtitle: "Pre-owned",
    pricePaise: 1999900,
    category: "phone",
    stockQty: 2
  },
  {
    id: "galaxy-s22-ultra-256",
    name: "Galaxy S22 Ultra 5G",
    subtitle: "Pre-owned 256GB",
    pricePaise: 4499900,
    category: "phone",
    stockQty: 1
  },
  {
    id: "repair-inspection",
    name: "Repair Inspection Booking",
    subtitle: "Device inspection booking",
    pricePaise: 49900,
    category: "service"
  }
];

test("generic capability question never becomes a product match", () => {
  const answer = answerOfflineBusinessQuestion(
    "What can Mr Mobiles help me with?",
    products,
    "website"
  );
  assert.equal(answer.intent, "capabilities");
  assert.equal(answer.handled, true);
  assert.deepEqual(answer.products, []);
  assert.match(answer.text, /local business assistant/i);
});

test("repair wording wins over the word mobile", () => {
  const intent = classifyOfflineIntent("Samsung A17 5G touch not working, repair venum");
  assert.equal(intent.intent, "repair");

  const answer = answerOfflineBusinessQuestion(
    "Samsung A17 5G touch not working",
    products,
    "website"
  );
  assert.equal(answer.intent, "repair");
  assert.deepEqual(answer.products, []);
  assert.match(answer.text, /Display\/touch issue/i);
});

test("budget request returns only phones inside budget", () => {
  const ranked = rankOfflineProducts("show phones under 20k", products);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].id, "iphone-11-128");
});

test("payment failure is routed to payment guidance", () => {
  const answer = answerOfflineBusinessQuestion(
    "payment processing then failed",
    products,
    "website"
  );
  assert.equal(answer.intent, "payment");
  assert.match(answer.text, /OTP\/card PIN\/CVV/i);
});

test("unrelated vague question stays unknown for model fallback", () => {
  const answer = answerOfflineBusinessQuestion(
    "Explain this in a simple way",
    products,
    "website"
  );
  assert.equal(answer.intent, "unknown");
  assert.equal(answer.handled, false);
  assert.deepEqual(answer.products, []);
});
