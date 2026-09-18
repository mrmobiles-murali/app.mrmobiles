import { NextRequest } from "next/server";
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
    const requestType = body?.requestType === "sell_exchange" ? "sell_exchange" : "repair";
    const customerName = cleanText(body?.name, 120);
    const customerPhone = normalizePhone(body?.phone);
    const customerEmail = cleanText(body?.email, 160) || null;
    const deviceBrand = cleanText(body?.brand, 100) || null;
    const deviceModel = cleanText(body?.model, 160);
    const issueOrCondition = cleanText(body?.issueOrCondition, 300);
    const details = cleanText(body?.details, 800) || null;

    if (customerName.length < 2) throw new Error("Enter your name.");
    if (deviceModel.length < 2) throw new Error("Enter the device model.");
    if (issueOrCondition.length < 2) {
      throw new Error(requestType === "repair" ? "Describe the issue." : "Select the device condition.");
    }

    const referenceCode = generateReference(requestType === "repair" ? "MRR" : "MRE");
    const supabase = getSupabaseAdmin();

    const { data: row, error } = await supabase
      .from("service_requests")
      .insert({
        request_type: requestType,
        reference_code: referenceCode,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        device_brand: deviceBrand,
        device_model: deviceModel,
        issue_or_condition: issueOrCondition,
        details,
        status: "received"
      })
      .select("id")
      .single();

    if (error || !row) throw new Error(error?.message || "Could not create request.");

    await addWorkflowEvent({
      entityType: "service_request",
      entityId: row.id,
      referenceCode,
      status: "received",
      message: requestType === "repair"
        ? "Repair request received. Mr Mobiles will inspect the details and update the status."
        : "Sell / exchange request received. Mr Mobiles will review the device details."
    });

    return webJson({
      ok: true,
      referenceCode,
      status: "received",
      requestType
    });
  } catch (error) {
    return webJson(
      { ok: false, error: error instanceof Error ? error.message : "Could not create request." },
      400
    );
  }
}
