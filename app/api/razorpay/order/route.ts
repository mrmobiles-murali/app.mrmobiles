import { NextRequest, NextResponse } from "next/server";
import { priceInventoryCart } from "@/lib/server-catalog";
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

    const priced = await priceInventoryCart(cart);
    const supabase = getSupabaseAdmin();

    // Recover payment attempts interrupted before Razorpay returned an order id.
    const staleCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await supabase
      .from("orders")
      .update({
        status: "payment_create_failed",
        workflow_status: "payment_issue",
        workflow_note: "Previous payment setup was interrupted. Retry checkout.",
        updated_at: new Date().toISOString()
      })
      .eq("telegram_user_id", user.id)
      .eq("status", "creating_payment")
      .lt("updated_at", staleCutoff);

    const { data: orderRow, error: insertError } = await supabase
      .from("orders")
      .insert({
        telegram_user_id: user.id,
        telegram_username: user.username ?? null,
        amount_paise: priced.amountPaise,
        currency: "INR",
        status: "creating_payment",
        workflow_status: "payment_processing",
        workflow_note: "Creating secure Razorpay checkout.",
        cart: priced.items
      })
      .select("id")
      .single();

    if (insertError || !orderRow) throw new Error(insertError?.message || "Could not create order.");

    let razorpayResult;
    try {
      razorpayResult = await createRazorpayOrder({
        amountPaise: priced.amountPaise,
        receipt: `mr_${String(orderRow.id).replaceAll("-", "").slice(0, 30)}`,
        notes: {
          internal_order_id: orderRow.id,
          telegram_user_id: String(user.id)
        }
      });
    } catch (paymentError) {
      await supabase
        .from("orders")
        .update({
          status: "payment_create_failed",
          workflow_status: "payment_issue",
          workflow_note: "Razorpay checkout could not be created. Retry checkout.",
          updated_at: new Date().toISOString()
        })
        .eq("id", orderRow.id);
      throw paymentError;
    }

    const { keyId, order } = razorpayResult;

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        status: "created",
        workflow_status: "awaiting_payment",
        workflow_note: "Secure checkout created. Awaiting customer payment.",
        razorpay_order_id: order.id,
        updated_at: new Date().toISOString()
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
