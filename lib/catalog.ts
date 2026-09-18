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
    id: "phone-demo-1",
    name: "Smartphone Deal",
    subtitle: "8 GB + 128 GB • Demo catalog item",
    pricePaise: 2499900,
    category: "phone",
    emoji: "📱"
  },
  {
    id: "acc-demo-1",
    name: "Fast Charger",
    subtitle: "Compatible fast charging accessory",
    pricePaise: 149900,
    category: "accessory",
    emoji: "⚡"
  },
  {
    id: "service-demo-1",
    name: "Display Service Booking",
    subtitle: "Booking advance for repair inspection",
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
