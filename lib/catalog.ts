export type Product = {
  id: string;
  name: string;
  subtitle: string;
  pricePaise: number;
  category: "phone" | "accessory" | "service";
  emoji: string;
};

export const catalog: Product[] = [
  {
    id: "iphone-13-pro-128",
    name: "iPhone 13 Pro 128GB",
    subtitle: "Pre-owned • Confirm live stock, condition & battery health",
    pricePaise: 5299900,
    category: "phone",
    emoji: "📱"
  },
  {
    id: "iphone-12-64",
    name: "iPhone 12 64GB",
    subtitle: "Pre-owned • Confirm live stock, condition & battery health",
    pricePaise: 2849900,
    category: "phone",
    emoji: "📱"
  },
  {
    id: "iphone-11-128",
    name: "iPhone 11 128GB",
    subtitle: "Pre-owned • Confirm live stock, condition & battery health",
    pricePaise: 1999900,
    category: "phone",
    emoji: "📱"
  },
  {
    id: "galaxy-s22-ultra-256",
    name: "Galaxy S22 Ultra 5G",
    subtitle: "Pre-owned • 256GB • Confirm live stock & condition",
    pricePaise: 4499900,
    category: "phone",
    emoji: "📱"
  },
  {
    id: "oneplus-11r-128",
    name: "OnePlus 11R 5G",
    subtitle: "Pre-owned • 128GB • Confirm live stock & condition",
    pricePaise: 2199900,
    category: "phone",
    emoji: "📱"
  },
  {
    id: "pixel-7-128",
    name: "Google Pixel 7 128GB",
    subtitle: "Pre-owned • Confirm live stock, condition & battery health",
    pricePaise: 2649900,
    category: "phone",
    emoji: "📱"
  },
  {
    id: "magnetic-case",
    name: "Magnetic Protective Case",
    subtitle: "iPhone 12–16 series • Compatibility confirmed before order",
    pricePaise: 89900,
    category: "accessory",
    emoji: "🛡️"
  },
  {
    id: "gan-65w-charger",
    name: "65W GaN Dual Fast Charger",
    subtitle: "USB-C Power Delivery • Compatibility confirmed before order",
    pricePaise: 129900,
    category: "accessory",
    emoji: "⚡"
  },
  {
    id: "repair-inspection",
    name: "Repair Inspection Booking",
    subtitle: "Device inspection booking • Final repair quote after diagnosis",
    pricePaise: 49900,
    category: "service",
    emoji: "🛠️"
  }
];

export function priceCart(items: Array<{ productId: string; qty: number }>) {
  const normalized = items.map((item) => {
    const product = catalog.find((p) => p.id === item.productId);
    if (!product) throw new Error(`Unknown product: ${item.productId}`);
    const qty = Math.max(1, Math.min(5, Math.floor(Number(item.qty) || 1)));
    return {
      productId: product.id,
      name: product.name,
      qty,
      unitPricePaise: product.pricePaise,
      lineTotalPaise: product.pricePaise * qty
    };
  });

  const amountPaise = normalized.reduce((sum, item) => sum + item.lineTotalPaise, 0);
  if (amountPaise < 100) throw new Error("Order amount is too small.");

  return { items: normalized, amountPaise };
}
