export type WebsiteCartItem = {
  websiteId: number;
  qty: number;
};

const WEBSITE_PRODUCT_NAMES: Record<number, string> = {
  1: "iPhone 13 Pro 128GB",
  2: "iPhone 12 64GB",
  3: "iPhone 11 128GB",
  4: "Galaxy S22 Ultra",
  5: "OnePlus 11R 5G",
  6: "Pixel 7",
  7: "iPhone 14 Pro Deep Purple",
  8: "Galaxy Z Fold4 Limited"
};

export function parseWebsiteCartStartPayload(payload: string): WebsiteCartItem[] {
  const match = payload.match(/^cart_([0-9x_]{3,56})$/i);
  if (!match) return [];

  const seen = new Set<number>();
  const items: WebsiteCartItem[] = [];
  for (const part of match[1].split("_")) {
    const entry = part.match(/^(\d{1,2})x([1-5])$/);
    if (!entry) continue;
    const websiteId = Number(entry[1]);
    const qty = Number(entry[2]);
    if (!WEBSITE_PRODUCT_NAMES[websiteId] || seen.has(websiteId)) continue;
    seen.add(websiteId);
    items.push({ websiteId, qty });
  }
  return items.slice(0, 8);
}

export function websiteProductSearchName(websiteId: number): string | null {
  return WEBSITE_PRODUCT_NAMES[websiteId] || null;
}

export function encodeMiniAppWebsiteCart(items: Array<{ productId: string; qty: number }>): string {
  return items
    .filter((item) => /^[A-Za-z0-9_-]{1,64}$/.test(item.productId) && Number.isInteger(item.qty) && item.qty >= 1 && item.qty <= 5)
    .slice(0, 8)
    .map((item) => item.productId + "~" + item.qty)
    .join(",");
}

export function parseMiniAppWebsiteCart(value: string | null): Array<{ productId: string; qty: number }> {
  if (!value) return [];
  const seen = new Set<string>();
  const items: Array<{ productId: string; qty: number }> = [];
  for (const part of value.split(",")) {
    const entry = part.match(/^([A-Za-z0-9_-]{1,64})~([1-5])$/);
    if (!entry || seen.has(entry[1])) continue;
    seen.add(entry[1]);
    items.push({ productId: entry[1], qty: Number(entry[2]) });
  }
  return items.slice(0, 8);
}
