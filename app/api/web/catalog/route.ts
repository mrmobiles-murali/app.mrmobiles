import { catalog } from "@/lib/catalog";
import { webJson, webOptions } from "@/lib/web-automation";

export function OPTIONS() {
  return webOptions();
}

export async function GET() {
  return webJson({
    ok: true,
    products: catalog
      .filter((item) => item.category !== "service")
      .map((item) => ({
        id: item.id,
        name: item.name,
        subtitle: item.subtitle,
        pricePaise: item.pricePaise,
        category: item.category,
        emoji: item.emoji
      }))
  });
}
