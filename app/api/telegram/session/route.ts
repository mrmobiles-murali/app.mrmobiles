import { NextRequest, NextResponse } from "next/server";
import { validateTelegramInitData } from "@/lib/telegram-auth";

export async function POST(request: NextRequest) {
  try {
    const initData = request.headers.get("x-telegram-init-data") || "";
    const { user } = validateTelegramInitData(initData);

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        firstName: user.first_name,
        username: user.username ?? null
      }
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unauthorized" },
      { status: 401 }
    );
  }
}
