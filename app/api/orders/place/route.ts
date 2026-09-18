import { NextRequest, NextResponse } from "next/server";
import { priceCart } from "@/lib/catalog";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateTelegramInitData } from "@/lib/telegram-auth";
import { sendTelegramMessage } from "@/lib/telegram-bot";

export async function POST(request: NextRequest) {
  try {
    const initData = request.headers.get("x-telegram-init-data") || "";
    const { user } = validateTelegramInitData(initData);

    const body = await request.json();
    const cart = Array.isArray(body?.cart) ? body.cart : [];
    if (!cart.length) throw new Error("Cart is empty.");

    const priced = priceCart(cart);
    const supabase = getSupabaseAdmin();

    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        telegram_user_id: user.id,
        telegram_username: user.username ?? null,
        amount_paise: priced.amountPaise,
        currency: "INR",
        status: "payment_pending",
        cart: priced.items
      })
      .select("id, amount_paise, status")
      .single();

    if (error || !order) throw new Error(error?.message || "Could not create order.");

    const amount = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0
    }).format(order.amount_paise / 100);

    await sendTelegramMessage(
      user.id,
      `✅ <b>Order received</b>\nOrder: <code>${order.id}</code>\nAmount: <b>${amount}</b>\nStatus: Payment pending\n\nMr Mobiles will confirm the next step in Telegram.`
    );

    return NextResponse.json({
      ok: true,
      orderId: order.id,
      amountPaise: order.amount_paise,
      status: order.status
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not place order." },
      { status: 400 }
    );
  }
}
