import { NextResponse } from "next/server";
import { listInventoryProducts } from "@/lib/server-catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  const products = await listInventoryProducts({ allowFallback: true });
  return NextResponse.json(
    products.map((product) => ({
      id: product.id,
      name: product.name,
      brand: product.brand || null,
      model: product.model || null,
      subtitle: product.subtitle,
      pricePaise: product.pricePaise,
      category: product.category,
      emoji: product.emoji,
      imageUrl: product.imageUrl || null,
      stockQty: product.stockQty ?? null
    })),
    { headers: { "Cache-Control": "no-store" } }
  );
}
