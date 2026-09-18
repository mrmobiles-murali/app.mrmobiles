import { NextRequest } from "next/server";
import { fetchRazorpayPayment, verifyPaymentSignature } from "@/lib/razorpay";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { addWorkflowEvent, webJson, webOptions } from "@/lib/web-automation";

export function OPTIONS() {
  return webOptions();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const paymentId = String(body?.razorpay_payment_id || "");
    const checkoutOrderId = String(body?.razorpay_order_id || "");
    const signature = String(body?.razorpay_signature || "");

    if (!paymentId || !checkoutOrderId || !signature) {
      throw new Error("Incomplete payment response.");
    }

    const supabase = getSupabaseAdmin();
    const { data: order, error } = await supabase
      .from("orders")
      .select("id, source, amount_paise, currency, razorpay_order_id, razorpay_payment_id, status, tracking_code")
      .eq("razorpay_order_id", checkoutOrderId)
      .eq("source", "web")
      .single();

    if (error || !order?.razorpay_order_id || !order.tracking_code) {
      throw new Error("Order not found.");
    }

    if (order.status === "paid") {
      return webJson({
        ok: true,
        internalOrderId: order.id,
        paymentId: order.razorpay_payment_id || paymentId,
        trackingCode: order.tracking_code,
        alreadyVerified: true
      });
    }

    if (!verifyPaymentSignature({
      serverOrderId: order.razorpay_order_id,
      paymentId,
      signature
    })) {
      await supabase
        .from("orders")
        .update({
          status: "signature_failed",
          workflow_status: "payment_issue",
          updated_at: new Date().toISOString()
        })
        .eq("id", order.id);
      throw new Error("Payment verification failed.");
    }

    const payment = await fetchRazorpayPayment(paymentId);
    const captured = payment.status === "captured" || payment.captured === true;

    if (
      payment.order_id !== order.razorpay_order_id ||
      Number(payment.amount) !== Number(order.amount_paise) ||
      String(payment.currency || "").toUpperCase() !== String(order.currency || "INR").toUpperCase()
    ) {
      await supabase
        .from("orders")
        .update({
          status: "payment_mismatch",
          workflow_status: "payment_issue",
          updated_at: new Date().toISOString()
        })
        .eq("id", order.id);
      throw new Error("Payment details did not match the order.");
    }

    if (!captured) {
      await supabase
        .from("orders")
        .update({
          status: "payment_authorized",
          workflow_status: "payment_processing",
          updated_at: new Date().toISOString()
        })
        .eq("id", order.id);
      throw new Error("Payment is processing. Track the order shortly.");
    }

    const { data: updated, error: updateError } = await supabase
      .from("orders")
      .update({
        status: "paid",
        workflow_status: "confirmed",
        razorpay_payment_id: paymentId,
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", order.id)
      .neq("status", "paid")
      .select("id")
      .maybeSingle();

    if (updateError) throw new Error(updateError.message);

    if (updated) {
      await addWorkflowEvent({
        entityType: "order",
        entityId: order.id,
        referenceCode: order.tracking_code,
        status: "confirmed",
        message: "Payment received. Your order is confirmed."
      });
    }

    return webJson({
      ok: true,
      internalOrderId: order.id,
      paymentId,
      trackingCode: order.tracking_code
    });
  } catch (error) {
    return webJson(
      { ok: false, error: error instanceof Error ? error.message : "Payment verification failed." },
      400
    );
  }
}
