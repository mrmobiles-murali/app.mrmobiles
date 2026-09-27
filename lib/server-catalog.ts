import { catalog, type Product } from "@/lib/catalog";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export type InventoryProduct = Product & {
  brand?: string | null;
  model?: string | null;
  imageUrl?: string | null;
  stockQty?: number | null;
  active?: boolean;
  searchAliases?: string[];
};

type ProductRow = {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  subtitle: string;
  price_paise: number;
  category: Product["category"];
  emoji: string;
  image_url: string | null;
  stock_qty: number | null;
  active: boolean;
  search_aliases: string[] | null;
};

function mapRow(row: ProductRow): InventoryProduct {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    model: row.model,
    subtitle: row.subtitle,
    pricePaise: row.price_paise,
    category: row.category,
    emoji: row.emoji,
    imageUrl: row.image_url,
    stockQty: row.stock_qty,
    active: row.active,
    searchAliases: row.search_aliases || []
  };
}

function fallbackProducts(): InventoryProduct[] {
  return catalog.map((product) => ({
    ...product,
    stockQty: null,
    active: true,
    searchAliases: []
  }));
}

export async function listInventoryProducts(options: { allowFallback?: boolean } = {}): Promise<InventoryProduct[]> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("products")
      .select("id,name,brand,model,subtitle,price_paise,category,emoji,image_url,stock_qty,active,search_aliases")
      .eq("active", true)
      .order("name", { ascending: true })
      .limit(200);

    if (error) throw new Error("Inventory lookup failed.");
    const products = (data || []).map((row) => mapRow(row as ProductRow))
      .filter((product) => product.stockQty === null || product.stockQty === undefined || product.stockQty > 0);

    if (!products.length && options.allowFallback) return fallbackProducts();
    return products;
  } catch {
    if (options.allowFallback) return fallbackProducts();
    throw new Error("Live inventory is temporarily unavailable.");
  }
}

export async function searchInventoryProducts(query: string): Promise<InventoryProduct[]> {
  const products = await listInventoryProducts({ allowFallback: true });
  const terms = query.toLowerCase().split(/\s+/).map((term) => term.trim()).filter(Boolean);

  return products
    .map((product) => {
      const haystack = [
        product.name,
        product.brand || "",
        product.model || "",
        product.subtitle,
        product.category,
        product.id,
        ...(product.searchAliases || [])
      ].join(" ").toLowerCase();
      const score = terms.length
        ? terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0)
        : 1;
      return { product, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
    .slice(0, 10)
    .map(({ product }) => product);
}

export async function priceInventoryCart(items: Array<{ productId: string; qty: number }>) {
  const products = await listInventoryProducts();
  const normalized = items.map((item) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    if (!product) throw new Error("A product is unavailable or out of stock.");

    const requested = Math.max(1, Math.min(5, Math.floor(Number(item.qty) || 1)));
    const qty = typeof product.stockQty === "number"
      ? Math.min(requested, product.stockQty)
      : requested;

    if (qty < 1) throw new Error("A product is out of stock.");

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
