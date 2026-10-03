import { NextRequest, NextResponse } from "next/server";
import { priceInventoryCart } from "@/lib/server-catalog";
import { createRazorpayOrder } from "@/lib/razorpay";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateTelegramInitData } from "@/lib/telegram-auth";
import { parseCustomPaymentAmount } from "@/lib/custom-payment";

export async function POST(request: NextRequest) {
  try {
    const initData = request.headers.get("x-telegram-init-data") || "";
    const { user } = validateTelegramInitData(initData);

    const body = await request.json();
    const cart = Array.isArray(body?.cart) ? body.cart : [];
    const customAmountSupplied =
      body?.customAmount !== undefined &&
      body?.customAmount !== null &&
      String(body.customAmount).trim() !== "";

    if (cart.length && customAmountSupplied) {
      throw new Error("Use either cart checkout or custom payment, not both.");
    }
    if (!cart.length && !customAmountSupplied) {
      throw new Error("Cart is empty.");
    }

    const customAmountPaise = customAmountSupplied
      ? parseCustomPaymentAmount(body.customAmount)
      : null;

    const priced = customAmountPaise
      ? {
          amountPaise: customAmountPaise,
          items: [{
            productId: "custom-payment",
            name: "Custom / Test Payment",
            qty: 1,
            unitPricePaise: customAmountPaise,
            lineTotalPaise: customAmountPaise
          }]
        }
      : await priceInventoryCart(cart);

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

    const customPayment = customAmountPaise !== null;
    const { data: orderRow, error: insertError } = await supabase
      .from("orders")
      .insert({
        telegram_user_id: user.id,
        telegram_username: user.username ?? null,
        amount_paise: priced.amountPaise,
        currency: "INR",
        status: "creating_payment",
        workflow_status: "payment_processing",
        workflow_note: customPayment
          ? "Creating secure custom payment checkout."
          : "Creating secure Razorpay checkout.",
        cart: priced.items
      })
      .select("id")
      .single();

    if (insertError || !orderRow) throw new Error(insertError?.message || "Could not create order.");

    let razorpayResult;
    try {
      razorpayResult = await createRazorpayOrder({
        amountPaise: priced.amountPaise,
        receipt: `${customPayment ? "mrt" : "mr"}_${String(orderRow.id).replaceAll("-", "").slice(0, 29)}`,
        notes: {
          internal_order_id: orderRow.id,
          telegram_user_id: String(user.id),
          payment_type: customPayment ? "custom_test" : "catalog"
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
        workflow_note: customPayment
          ? "Custom payment checkout created. Awaiting customer payment."
          : "Secure checkout created. Awaiting customer payment.",
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
      internalOrderId: orderRow.id,
      customPayment
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not create payment." },
      { status: 400 }
    );
  }
}
