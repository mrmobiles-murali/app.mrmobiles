import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { answerBusinessQuestion } from "@/lib/business-ai";

export const runtime = "nodejs";

const VISITOR_TOKEN = /^[A-Za-z0-9_-]{16,80}$/;

function websiteUserId(token: string) {
  const digest = createHash("sha256").update(`mrmobiles:web:${token}`).digest();
  const numeric = digest.readUIntBE(0, 6);
  return -(numeric || 1);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const message = typeof body?.message === "string" ? body.message.trim().slice(0, 1200) : "";
    const token = typeof body?.visitorToken === "string" ? body.visitorToken.trim() : "";

    if (!message) {
      return NextResponse.json({ error: "Type a message first." }, { status: 400 });
    }

    if (!VISITOR_TOKEN.test(token)) {
      return NextResponse.json({ error: "Refresh the page and try again." }, { status: 400 });
    }

    const result = await answerBusinessQuestion(
      websiteUserId(token),
      message,
      undefined,
      { channel: "website" }
    );

    return NextResponse.json(
      {
        text: result.text,
        products: result.products.slice(0, 3).map((product) => ({
          id: product.id,
          name: product.name,
          category: product.category,
          pricePaise: product.pricePaise,
          stockQty: product.stockQty ?? null
        }))
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch {
    return NextResponse.json(
      { error: "AI assistant is temporarily unavailable. Please try again or talk to our team." },
      { status: 500 }
    );
  }
}
