import crypto from "crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const WEB_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};

export function webJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: WEB_CORS_HEADERS });
}

export function webOptions() {
  return new NextResponse(null, { status: 204, headers: WEB_CORS_HEADERS });
}

export function normalizePhone(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) {
    throw new Error("Enter a valid mobile number.");
  }
  return digits.length === 10 ? `91${digits}` : digits;
}

export function cleanText(value: unknown, max = 300) {
  return String(value || "").trim().slice(0, max);
}

export function generateReference(prefix: "MRO" | "MRR" | "MRE") {
  return `${prefix}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}

export async function addWorkflowEvent(input: {
  entityType: "order" | "service_request";
  entityId: string;
  referenceCode: string;
  status: string;
  message: string;
}) {
  const supabase = getSupabaseAdmin();
  await supabase.from("workflow_events").insert({
    entity_type: input.entityType,
    entity_id: input.entityId,
    reference_code: input.referenceCode,
    status: input.status,
    message: input.message
  });
}
