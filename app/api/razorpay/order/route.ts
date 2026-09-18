import { NextRequest, NextResponse } from "next/server";
import { priceCart } from "@/lib/catalog";
import { createRazorpayOrder } from "@/lib/razorpay";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateTelegramInitData } from "@/lib/telegram-auth";

export async function POST(request: NextRequest) {
  try {
    const initData = request.headers.get("x-telegram-init-data") || "";
    const { user } = validateTelegramInitData(initData);

    const body = await request.json();
    const cart = Array.isArray(body?.cart) ? body.cart : [];
    if (!cart.length) throw new Error("Cart is empty.");

    const priced = priceCart(cart);
    const supabase = getSupabaseAdmin();

    const { data: orderRow, error: insertError } = await supabase
      .from("orders")
      .insert({
        telegram_user_id: user.id,
        telegram_username: user.username ?? null,
        amount_paise: priced.amountPaise,
        currency: "INR",
        status: "creating_payment",
        cart: priced.items
      })
      .select("id")
      .single();

    if (insertError || !orderRow) throw new Error(insertError?.message || "Could not create order.");

    const { keyId, order } = await createRazorpayOrder({
      amountPaise: priced.amountPaise,
      receipt: `mr_${String(orderRow.id).replaceAll("-", "").slice(0, 30)}`,
      notes: {
        internal_order_id: orderRow.id,
        telegram_user_id: String(user.id)
      }
    });

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        status: "created",
        razorpay_order_id: order.id
      })
      .eq("id", orderRow.id);

    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({
      ok: true,
      keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      internalOrderId: orderRow.id
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not create payment." },
      { status: 400 }
    );
  }
}
