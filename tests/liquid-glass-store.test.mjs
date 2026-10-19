import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";

const html = readFileSync(new URL("../public/liquid-store.html", import.meta.url), "utf8");

test("Liquid Glass inline scripts parse without syntax errors", () => {
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter((script) => script.trim());
  assert.ok(scripts.length >= 3, "Expected config, storefront and API bridge scripts");
  scripts.forEach((script, index) => {
    assert.doesNotThrow(() => new Script(script, { filename: `liquid-store-inline-${index + 1}.js` }));
  });
});

test("Liquid Glass connects visible products and editorial picks to the live catalogue", () => {
  for (const required of [
    'id="productGrid"',
    'id="dailyHeroSection"',
    'id="offerStripHeadline"',
    'fetch("/api/catalog"',
    'catalog.splice(0,catalog.length,...normalized)',
    'dailyOffers.splice(0,dailyOffers.length,...normalized.slice(0,3)',
    'grid.style.opacity="1"'
  ]) assert.ok(html.includes(required), `Missing storefront safeguard: ${required}`);
  assert.ok(!html.includes("Flat ₹4,000 Exchange Bonus"), "Do not publish unverified promotions");
});

test("Preserve existing verified checkout and repair-tracking routes", () => {
  assert.ok(html.includes('"/classic?website_cart="'));
  assert.ok(html.includes('"/api/web/service"'));
  assert.ok(html.includes('"/api/web/track?code="'));
  assert.ok(html.includes('id="repairForm"'));
  assert.ok(html.includes('id="exchangeForm"'));
  assert.ok(html.includes('id="trackForm"'));
});
