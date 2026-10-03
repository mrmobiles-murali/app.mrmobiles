import { NextRequest, NextResponse } from "next/server";
import { validateTelegramInitData } from "@/lib/telegram-auth";
import { listTelegramRepairTickets } from "@/lib/repair-tickets";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function receiptCode(id: string, createdAt: string) {
  const date = new Date(createdAt);
  const stamp = Number.isNaN(date.getTime())
    ? "ORDER"
    : date.toISOString().slice(0, 10).replaceAll("-", "");
  return `MRM-${stamp}-${String(id).slice(0, 8).toUpperCase()}`;
}

export async function POST(request: NextRequest) {
  try {
    const initData = request.headers.get("x-telegram-init-data") || "";
    const { user } = validateTelegramInitData(initData);
    const params = new URLSearchParams(initData);
    const startParam = params.get("start_param") || "";
    const referralMatch = startParam.match(/^ref_(\d+)$/);
    const referrerUserId = Number(referralMatch?.[1]);
    const supabase = getSupabaseAdmin();

    if (
      referralMatch &&
      Number.isSafeInteger(referrerUserId) &&
      referrerUserId > 0 &&
      referrerUserId !== user.id
    ) {
      const { error } = await supabase.from("telegram_referrals").insert({
        referred_user_id: user.id,
        referrer_user_id: referrerUserId,
        source: "mini_app"
      });
      if (error && error.code !== "23505") {
        throw new Error("Referral attribution failed.");
      }
    }

    const [{ data: orders, error: orderError }, tickets] = await Promise.all([
      supabase.from("orders")
        .select("id,amount_paise,status,workflow_status,tracking_code,created_at,paid_at")
        .eq("telegram_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10),
      listTelegramRepairTickets(user.id, 20)
    ]);

    if (orderError) throw new Error("Account order lookup failed.");

    const paidOrders = (orders || []).filter(order => order.status === "paid");
    const paidSpendPaise = paidOrders.reduce(
      (sum, order) => sum + Number(order.amount_paise || 0),
      0
    );
    const activeStatuses = new Set([
      "received",
      "reviewing",
      "diagnosing",
      "awaiting_approval",
      "approved",
      "repairing",
      "ready"
    ]);
    const savedDevices = Array.from(new Set(
      tickets
        .map(ticket => [ticket.device_brand, ticket.device_model].filter(Boolean).join(" ").trim())
        .filter(Boolean)
    ));

    return NextResponse.json({
      user: {
        id: user.id,
        firstName: user.first_name,
        username: user.username || null
      },
      summary: {
        orderCount: (orders || []).length,
        paidOrderCount: paidOrders.length,
        paidSpendPaise,
        loyaltyPoints: Math.floor(paidSpendPaise / 10000),
        repairCount: tickets.length,
        activeRepairs: tickets.filter(ticket => activeStatuses.has(ticket.status)).length,
        savedDevices: savedDevices.length
      },
      orders: (orders || []).map(order => ({
        ...order,
        receipt_code: receiptCode(order.id, order.created_at)
      })),
      repairs: tickets,
      savedDevices
    }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Account lookup failed."
    }, { status: 401 });
  }
}
