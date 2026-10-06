import { listInventoryProducts } from "@/lib/server-catalog";
import { webJson, webOptions } from "@/lib/web-automation";

export function OPTIONS() {
  return webOptions();
}

export async function GET() {
  const products = await listInventoryProducts({ allowFallback: true });
  return webJson({
    ok: true,
    products: products
      .filter((item) => item.category !== "service")
      .map((item) => ({
        id: item.id,
        name: item.name,
        brand: item.brand || null,
        model: item.model || null,
        subtitle: item.subtitle,
        pricePaise: item.pricePaise,
        category: item.category,
        emoji: item.emoji,
        imageUrl: item.imageUrl || null,
        dailyVisualUrl: item.dailyVisualUrl || null,
        visualRotationCount: item.visualRotationCount || 0,
        visualDay: item.visualDay || null,
        stockQty: item.stockQty ?? null
      }))
  });
}
