import { NextRequest } from "next/server";
import { priceCart } from "@/lib/catalog";
import { createRazorpayOrder } from "@/lib/razorpay";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  addWorkflowEvent,
  cleanText,
  generateReference,
  normalizePhone,
  webJson,
  webOptions
} from "@/lib/web-automation";

export function OPTIONS() {
  return webOptions();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const cart = Array.isArray(body?.cart) ? body.cart : [];
    if (!cart.length) throw new Error("Your cart is empty.");

    const customerName = cleanText(body?.customer?.name, 120);
    const customerPhone = normalizePhone(body?.customer?.phone);
    const customerEmail = cleanText(body?.customer?.email, 160) || null;
    const deliveryAddress = cleanText(body?.customer?.address, 500);
    const customerNote = cleanText(body?.customer?.note, 500) || null;

    if (customerName.length < 2) throw new Error("Enter your name.");
    if (deliveryAddress.length < 8) throw new Error("Enter a complete delivery or pickup address.");

    const priced = priceCart(cart);
    const trackingCode = generateReference("MRO");
    const supabase = getSupabaseAdmin();

    const { data: orderRow, error: insertError } = await supabase
      .from("orders")
      .insert({
        telegram_user_id: null,
        telegram_username: null,
        source: "web",
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        delivery_address: deliveryAddress,
        tracking_code: trackingCode,
        customer_note: customerNote,
        amount_paise: priced.amountPaise,
        currency: "INR",
        status: "creating_payment",
        workflow_status: "awaiting_payment",
        cart: priced.items
      })
      .select("id")
      .single();

    if (insertError || !orderRow) throw new Error(insertError?.message || "Could not create order.");

    await addWorkflowEvent({
      entityType: "order",
      entityId: orderRow.id,
      referenceCode: trackingCode,
      status: "awaiting_payment",
      message: "Order received. Waiting for payment."
    });

    try {
      const { keyId, order } = await createRazorpayOrder({
        amountPaise: priced.amountPaise,
        receipt: `web_${String(orderRow.id).replaceAll("-", "").slice(0, 28)}`,
        notes: {
          internal_order_id: orderRow.id,
          source: "mrmobiles.in",
          tracking_code: trackingCode
        }
      });

      const { error: updateError } = await supabase
        .from("orders")
        .update({
          status: "created",
          razorpay_order_id: order.id,
          updated_at: new Date().toISOString()
        })
        .eq("id", orderRow.id);

      if (updateError) throw new Error(updateError.message);

      return webJson({
        ok: true,
        keyId,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        internalOrderId: orderRow.id,
        trackingCode
      });
    } catch (paymentError) {
      await supabase
        .from("orders")
        .update({
          status: "payment_create_failed",
          workflow_status: "payment_issue",
          updated_at: new Date().toISOString()
        })
        .eq("id", orderRow.id);

      await addWorkflowEvent({
        entityType: "order",
        entityId: orderRow.id,
        referenceCode: trackingCode,
        status: "payment_issue",
        message: "Payment could not be started. Please contact Mr Mobiles."
      });

      throw paymentError;
    }
  } catch (error) {
    return webJson(
      { ok: false, error: error instanceof Error ? error.message : "Could not create order." },
      400
    );
  }
}
