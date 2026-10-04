import { NextRequest, NextResponse } from "next/server";
import { priceInventoryCart } from "@/lib/server-catalog";
import { createRazorpayOrder } from "@/lib/razorpay";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateTelegramInitData } from "@/lib/telegram-auth";
import { parseCustomPaymentAmount } from "@/lib/custom-payment";
import { createPaymentBridgeToken } from "@/lib/payment-bridge";
import {
  createRepairPaymentCartItem,
  normalizeRepairReference,
  repairPaymentReservationId
} from "@/lib/repair-payment";

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
    const repairReference = normalizeRepairReference(body?.repairReference);
    const modeCount =
      (cart.length ? 1 : 0) +
      (customAmountSupplied ? 1 : 0) +
      (repairReference ? 1 : 0);

    if (modeCount !== 1) {
      throw new Error("Choose one payment type at a time.");
    }

    const supabase = getSupabaseAdmin();
    const customAmountPaise = customAmountSupplied
      ? parseCustomPaymentAmount(body.customAmount)
      : null;

    let repairTicket:
      | {
          reference_code: string;
          device_brand: string | null;
          device_model: string;
          status: string;
          quoted_amount_paise: number | null;
        }
      | null = null;

    if (repairReference) {
      const { data, error } = await supabase
        .from("service_requests")
        .select("reference_code,device_brand,device_model,status,quoted_amount_paise")
        .eq("request_type", "repair")
        .eq("source", "telegram")
        .eq("telegram_user_id", user.id)
        .eq("reference_code", repairReference)
        .maybeSingle();

      if (error || !data) throw new Error("Repair quote not found.");
      if (data.status !== "approved") {
        throw new Error(
          data.status === "repairing" || data.status === "ready" || data.status === "completed"
            ? "This repair payment is already completed or in progress."
            : "Approve the repair quote in Telegram before payment."
        );
      }
      if (!Number.isSafeInteger(data.quoted_amount_paise) || Number(data.quoted_amount_paise) < 100) {
        throw new Error("This repair quote does not have a valid payable amount.");
      }
      repairTicket = data;
    }

    const repairPayment = Boolean(repairTicket);
    const customPayment = customAmountPaise !== null;

    const priced = repairTicket
      ? {
          amountPaise: Number(repairTicket.quoted_amount_paise),
          items: [
            createRepairPaymentCartItem(
              repairTicket.reference_code,
              Number(repairTicket.quoted_amount_paise),
              [repairTicket.device_brand, repairTicket.device_model].filter(Boolean).join(" ") || "Repair service"
            )
          ]
        }
      : customAmountPaise
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

    const repairReservationId = repairTicket
      ? repairPaymentReservationId(user.id, repairTicket.reference_code, priced.amountPaise)
      : null;

    let reservedOrderRow: { id: string } | null = null;

    if (repairTicket && repairReservationId) {
      const { data: existingRepairOrder, error: priorError } = await supabase
        .from("orders")
        .select("id,amount_paise,status,razorpay_order_id,razorpay_payment_id,cart")
        .eq("id", repairReservationId)
        .eq("telegram_user_id", user.id)
        .maybeSingle();

      if (priorError) throw new Error("Could not verify previous repair payments.");

      if (existingRepairOrder?.status === "paid") {
        throw new Error("This repair quote is already paid.");
      }

      if (
        existingRepairOrder?.razorpay_order_id &&
        ["created", "payment_pending", "payment_capture_failed"].includes(String(existingRepairOrder.status))
      ) {
        const keyId = process.env.RAZORPAY_KEY_ID;
        if (!keyId) throw new Error("Razorpay API credentials are missing.");
        const bridgeToken = createPaymentBridgeToken({
          internalOrderId: existingRepairOrder.id,
          razorpayOrderId: existingRepairOrder.razorpay_order_id,
          telegramUserId: user.id
        });

        return NextResponse.json({
          ok: true,
          keyId,
          orderId: existingRepairOrder.razorpay_order_id,
          amount: priced.amountPaise,
          currency: "INR",
          internalOrderId: existingRepairOrder.id,
          customPayment: false,
          repairPayment: true,
          repairReference: repairTicket.reference_code,
          resumed: true,
          bridgeUrl: process.env.PAYMENT_BRIDGE_URL || "https://mrmobiles.in/pay",
          bridgeToken
        });
      }

      if (existingRepairOrder?.status === "creating_payment") {
        throw new Error("Repair payment setup is already in progress. Please retry in a moment.");
      }

      if (["signature_failed", "payment_mismatch"].includes(String(existingRepairOrder?.status || ""))) {
        throw new Error("A previous repair payment needs verification. Please contact Mr Mobiles support.");
      }

      if (existingRepairOrder) {
        const { data: claimed, error: claimError } = await supabase
          .from("orders")
          .update({
            amount_paise: priced.amountPaise,
            currency: "INR",
            status: "creating_payment",
            workflow_status: "payment_processing",
            workflow_note: `Creating secure payment for repair ${repairTicket.reference_code}.`,
            cart: priced.items,
            razorpay_order_id: null,
            razorpay_payment_id: null,
            paid_at: null,
            updated_at: new Date().toISOString()
          })
          .eq("id", existingRepairOrder.id)
          .eq("status", existingRepairOrder.status)
          .select("id")
          .maybeSingle();

        if (claimError) throw new Error(claimError.message);
        if (!claimed) {
          throw new Error("Repair payment setup is already in progress. Please retry in a moment.");
        }
        reservedOrderRow = claimed;
      }
    }

    const paymentType = repairPayment ? "repair_quote" : customPayment ? "custom_test" : "catalog";
    const workflowNote = repairPayment
      ? `Creating secure payment for repair ${repairTicket?.reference_code}.`
      : customPayment
        ? "Creating secure custom payment checkout."
        : "Creating secure Razorpay checkout.";

    let orderRow: { id: string } | null = reservedOrderRow;

    if (!orderRow) {
      const { data: insertedOrder, error: insertError } = await supabase
        .from("orders")
        .insert({
          ...(repairReservationId ? { id: repairReservationId } : {}),
          telegram_user_id: user.id,
          telegram_username: user.username ?? null,
          amount_paise: priced.amountPaise,
          currency: "INR",
          status: "creating_payment",
          workflow_status: "payment_processing",
          workflow_note: workflowNote,
          cart: priced.items
        })
        .select("id")
        .single();

      if (insertError || !insertedOrder) {
        if (repairReservationId && insertError?.code === "23505") {
          const { data: winner } = await supabase
            .from("orders")
            .select("id,status,razorpay_order_id")
            .eq("id", repairReservationId)
            .eq("telegram_user_id", user.id)
            .maybeSingle();

          if (winner?.status === "paid") {
            throw new Error("This repair quote is already paid.");
          }
          if (winner?.razorpay_order_id) {
            const keyId = process.env.RAZORPAY_KEY_ID;
            if (!keyId) throw new Error("Razorpay API credentials are missing.");
            const bridgeToken = createPaymentBridgeToken({
              internalOrderId: winner.id,
              razorpayOrderId: winner.razorpay_order_id,
              telegramUserId: user.id
            });
            return NextResponse.json({
              ok: true,
              keyId,
              orderId: winner.razorpay_order_id,
              amount: priced.amountPaise,
              currency: "INR",
              internalOrderId: winner.id,
              customPayment: false,
              repairPayment: true,
              repairReference: repairTicket?.reference_code || null,
              resumed: true,
              bridgeUrl: process.env.PAYMENT_BRIDGE_URL || "https://mrmobiles.in/pay",
              bridgeToken
            });
          }
          throw new Error("Repair payment setup is already in progress. Please retry in a moment.");
        }
        throw new Error(insertError?.message || "Could not create order.");
      }

      orderRow = insertedOrder;
    }

    let razorpayResult;
    try {
      const prefix = repairPayment ? "mrr" : customPayment ? "mrt" : "mr";
      razorpayResult = await createRazorpayOrder({
        amountPaise: priced.amountPaise,
        receipt: `${prefix}_${String(orderRow.id).replaceAll("-", "").slice(0, 28)}`,
        notes: {
          internal_order_id: orderRow.id,
          telegram_user_id: String(user.id),
          payment_type: paymentType,
          ...(repairTicket ? { repair_reference: repairTicket.reference_code } : {})
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
        workflow_note: repairPayment
          ? `Repair ${repairTicket?.reference_code} approved. Awaiting quoted payment.`
          : customPayment
            ? "Custom payment checkout created. Awaiting customer payment."
            : "Secure checkout created. Awaiting customer payment.",
        razorpay_order_id: order.id,
        updated_at: new Date().toISOString()
      })
      .eq("id", orderRow.id);

    if (updateError) throw new Error(updateError.message);

    const bridgeToken = createPaymentBridgeToken({
      internalOrderId: orderRow.id,
      razorpayOrderId: order.id,
      telegramUserId: user.id
    });

    return NextResponse.json({
      ok: true,
      keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      internalOrderId: orderRow.id,
      customPayment,
      repairPayment,
      repairReference: repairTicket?.reference_code || null,
      bridgeUrl: process.env.PAYMENT_BRIDGE_URL || "https://mrmobiles.in/pay",
      bridgeToken
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not create payment." },
      { status: 400 }
    );
  }
}
