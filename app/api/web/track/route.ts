import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizePhone, webJson, webOptions } from "@/lib/web-automation";

export function OPTIONS() {
  return webOptions();
}

export async function GET(request: NextRequest) {
  try {
    const code = String(request.nextUrl.searchParams.get("code") || "").trim().toUpperCase();
    const phone = normalizePhone(request.nextUrl.searchParams.get("phone"));

    if (!/^MR[ORE]-[A-F0-9]{10}$/.test(code)) {
      throw new Error("Enter a valid tracking code.");
    }

    const supabase = getSupabaseAdmin();

    if (code.startsWith("MRO-")) {
      const { data: order } = await supabase
        .from("orders")
        .select("id, tracking_code, customer_name, amount_paise, currency, workflow_status, status, created_at, paid_at")
        .eq("tracking_code", code)
        .eq("customer_phone", phone)
        .eq("source", "web")
        .maybeSingle();

      if (!order) throw new Error("No matching order found.");

      const { data: events } = await supabase
        .from("workflow_events")
        .select("status, message, created_at")
        .eq("reference_code", code)
        .order("created_at", { ascending: true })
        .limit(20);

      return webJson({
        ok: true,
        type: "order",
        referenceCode: order.tracking_code,
        customerName: order.customer_name,
        amountPaise: order.amount_paise,
        currency: order.currency,
        status: order.workflow_status,
        paymentStatus: order.status,
        createdAt: order.created_at,
        paidAt: order.paid_at,
        events: events || []
      });
    }

    const { data: service } = await supabase
      .from("service_requests")
      .select("id, request_type, reference_code, customer_name, device_brand, device_model, issue_or_condition, status, quoted_amount_paise, created_at, updated_at")
      .eq("reference_code", code)
      .eq("customer_phone", phone)
      .maybeSingle();

    if (!service) throw new Error("No matching request found.");

    const { data: events } = await supabase
      .from("workflow_events")
      .select("status, message, created_at")
      .eq("reference_code", code)
      .order("created_at", { ascending: true })
      .limit(20);

    return webJson({
      ok: true,
      type: service.request_type,
      referenceCode: service.reference_code,
      customerName: service.customer_name,
      device: [service.device_brand, service.device_model].filter(Boolean).join(" "),
      issueOrCondition: service.issue_or_condition,
      status: service.status,
      quotedAmountPaise: service.quoted_amount_paise,
      createdAt: service.created_at,
      updatedAt: service.updated_at,
      events: events || []
    });
  } catch (error) {
    return webJson(
      { ok: false, error: error instanceof Error ? error.message : "Could not track request." },
      404
    );
  }
}
