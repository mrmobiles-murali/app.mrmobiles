import { NextRequest, NextResponse } from "next/server";
import { listTelegramRepairTickets } from "@/lib/repair-tickets";
import { validateTelegramInitData } from "@/lib/telegram-auth";

export async function POST(request: NextRequest) {
  try {
    const initData = request.headers.get("x-telegram-init-data") || "";
    const { user } = validateTelegramInitData(initData);
    const tickets = await listTelegramRepairTickets(user.id, 20);

    return NextResponse.json(
      { tickets },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load repair history." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }
}
