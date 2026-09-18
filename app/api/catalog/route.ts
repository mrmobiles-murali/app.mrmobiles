import { NextResponse } from "next/server";
import { catalog } from "@/lib/catalog";

export async function GET() {
  return NextResponse.json(
    catalog.map(({ id, name, subtitle, pricePaise, category, emoji }) => ({
      id, name, subtitle, pricePaise, category, emoji
    }))
  );
}
