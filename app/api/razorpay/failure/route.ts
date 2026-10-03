import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateTelegramInitData } from "@/lib/telegram-auth";

export async function POST(request: NextRequest) {
  try {
    const initData = request.headers.get("x-telegram-init-data") || "";
    const { user } = validateTelegramInitData(initData);
    const body = await request.json();
    const internalOrderId = String(body?.internalOrderId || "");
    const reason = String(body?.reason || "Payment failed.")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);

    if (!/^[0-9a-f-]{36}$/i.test(internalOrderId)) {
      throw new Error("Invalid order reference.");
    }

    const supabase = getSupabaseAdmin();
    const { data: order, error } = await supabase
      .from("orders")
      .select("id,status")
      .eq("id", internalOrderId)
      .eq("telegram_user_id", user.id)
      .maybeSingle();

    if (error || !order) throw new Error("Order not found.");
    if (order.status === "paid") return NextResponse.json({ ok: true, alreadyPaid: true });

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        status: "payment_failed",
        workflow_status: "payment_issue",
        workflow_note: reason || "Payment failed. Retry checkout or contact support.",
        updated_at: new Date().toISOString()
      })
      .eq("id", order.id)
      .neq("status", "paid");

    if (updateError) throw new Error(updateError.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not record payment failure." },
      { status: 400 }
    );
  }
}
