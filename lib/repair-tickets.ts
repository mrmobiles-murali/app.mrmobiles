import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { repairReferenceFromCart } from "@/lib/repair-payment";
import { addWorkflowEvent, generateReference } from "@/lib/web-automation";

export const REPAIR_STATUSES = [
  "received",
  "reviewing",
  "diagnosing",
  "awaiting_approval",
  "approved",
  "repairing",
  "ready",
  "completed",
  "rejected",
  "cancelled"
] as const;

export type RepairStatus = typeof REPAIR_STATUSES[number];

export type RepairTicket = {
  id: string;
  reference_code: string;
  device_brand: string | null;
  device_model: string;
  issue_or_condition: string;
  status: RepairStatus;
  quoted_amount_paise: number | null;
  status_note: string | null;
  created_at: string;
  updated_at: string;
};

function clean(value: string, max: number) {
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

export function parseRepairDetails(details: string) {
  const raw = details.trim().slice(0, 1200);
  const lines = raw.split(/\r?\n/).map(line => clean(line, 240)).filter(Boolean);

  if (lines.length >= 3) {
    return {
      brand: clean(lines[0], 100),
      model: clean(lines[1], 160),
      issue: clean(lines.slice(2).join(" "), 300)
    };
  }

  const oneLine = clean(raw, 500);
  const parts = oneLine.split(/\s+(?:-|–|—|:)\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const device = parts[0].trim();
    const words = device.split(/\s+/);
    return {
      brand: clean(words[0] || "Unknown", 100),
      model: clean(words.slice(1).join(" ") || device, 160),
      issue: clean(parts.slice(1).join(" - "), 300)
    };
  }

  const words = oneLine.split(/\s+/);
  return {
    brand: clean(words[0] || "Unknown", 100),
    model: clean(words.slice(1, 4).join(" ") || "Model not specified", 160),
    issue: clean(oneLine, 300)
  };
}

export async function createTelegramRepairTicket(input: {
  telegramUserId: number;
  customerName: string;
  details: string;
}): Promise<RepairTicket> {
  const parsed = parseRepairDetails(input.details);
  const referenceCode = generateReference("MRR");
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("service_requests")
    .insert({
      request_type: "repair",
      reference_code: referenceCode,
      customer_name: clean(input.customerName || "Customer", 120),
      customer_phone: null,
      customer_email: null,
      device_brand: parsed.brand || null,
      device_model: parsed.model,
      issue_or_condition: parsed.issue,
      details: input.details.trim().slice(0, 1200),
      status: "received",
      status_note: "Repair request received through Telegram.",
      source: "telegram",
      telegram_user_id: input.telegramUserId
    })
    .select("id,reference_code,device_brand,device_model,issue_or_condition,status,quoted_amount_paise,status_note,created_at,updated_at")
    .single();

  if (error || !data) throw new Error("Could not create repair ticket.");

  await addWorkflowEvent({
    entityType: "service_request",
    entityId: data.id,
    referenceCode: data.reference_code,
    status: "received",
    message: "Repair request received through Telegram."
  });

  return data as RepairTicket;
}

export async function listTelegramRepairTickets(userId: number, requestedLimit = 5): Promise<RepairTicket[]> {
  const limit = Math.max(1, Math.min(20, Math.trunc(requestedLimit) || 5));
  const { data, error } = await getSupabaseAdmin()
    .from("service_requests")
    .select("id,reference_code,device_brand,device_model,issue_or_condition,status,quoted_amount_paise,status_note,created_at,updated_at")
    .eq("request_type", "repair")
    .eq("source", "telegram")
    .eq("telegram_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error("Repair ticket lookup failed.");
  return (data || []) as RepairTicket[];
}

export async function getTelegramRepairTicket(userId: number, referenceCode: string): Promise<RepairTicket | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("service_requests")
    .select("id,reference_code,device_brand,device_model,issue_or_condition,status,quoted_amount_paise,status_note,created_at,updated_at")
    .eq("request_type", "repair")
    .eq("source", "telegram")
    .eq("telegram_user_id", userId)
    .eq("reference_code", referenceCode)
    .maybeSingle();

  if (error) throw new Error("Repair ticket lookup failed.");
  return data as RepairTicket | null;
}

export async function updateRepairTicket(input: {
  referenceCode: string;
  status: RepairStatus;
  note?: string;
  quotedAmountPaise?: number | null;
}) {
  const supabase = getSupabaseAdmin();
  const note = clean(input.note || "", 800) || null;

  const patch: Record<string, unknown> = {
    status: input.status,
    status_note: note,
    updated_at: new Date().toISOString()
  };
  if (input.quotedAmountPaise !== undefined) {
    patch.quoted_amount_paise = input.quotedAmountPaise;
  }

  const { data, error } = await supabase
    .from("service_requests")
    .update(patch)
    .eq("request_type", "repair")
    .eq("reference_code", input.referenceCode)
    .select("id,reference_code,telegram_user_id,device_brand,device_model,issue_or_condition,status,quoted_amount_paise,status_note,created_at,updated_at")
    .maybeSingle();

  if (error) throw new Error("Repair ticket update failed.");
  if (!data) return null;

  await addWorkflowEvent({
    entityType: "service_request",
    entityId: data.id,
    referenceCode: data.reference_code,
    status: data.status,
    message: note || `Repair status changed to ${data.status}.`
  });

  return data;
}

export const CUSTOMER_CANCELLABLE_REPAIR_STATUSES: RepairStatus[] = [
  "received",
  "reviewing",
  "diagnosing",
  "awaiting_approval",
  "approved"
];

export async function cancelTelegramRepairTicket(userId: number, referenceCode: string) {
  const supabase = getSupabaseAdmin();
  const { data: existing, error: lookupError } = await supabase
    .from("service_requests")
    .select("id,reference_code,telegram_user_id,status")
    .eq("request_type", "repair")
    .eq("source", "telegram")
    .eq("telegram_user_id", userId)
    .eq("reference_code", referenceCode)
    .maybeSingle();

  if (lookupError) throw new Error("Repair ticket lookup failed.");
  if (!existing || !CUSTOMER_CANCELLABLE_REPAIR_STATUSES.includes(existing.status as RepairStatus)) {
    return null;
  }

  const { data: paymentOrders, error: paymentError } = await supabase
    .from("orders")
    .select("status,cart")
    .eq("telegram_user_id", userId)
    .not("razorpay_order_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (paymentError) throw new Error("Repair payment lookup failed.");

  const paymentStarted = (paymentOrders || []).some(order =>
    repairReferenceFromCart(order.cart) === referenceCode &&
    ["creating_payment", "created", "payment_pending", "payment_capture_failed", "paid"].includes(String(order.status || ""))
  );

  if (paymentStarted) return null;

  const note = "Customer cancelled the repair request in Telegram.";
  const { data, error } = await supabase
    .from("service_requests")
    .update({
      status: "cancelled",
      status_note: note,
      updated_at: new Date().toISOString()
    })
    .eq("id", existing.id)
    .eq("status", existing.status)
    .select("id,reference_code,telegram_user_id,device_brand,device_model,issue_or_condition,status,quoted_amount_paise,status_note,created_at,updated_at")
    .maybeSingle();

  if (error) throw new Error("Repair cancellation failed.");
  if (!data) return null;

  await addWorkflowEvent({
    entityType: "service_request",
    entityId: data.id,
    referenceCode: data.reference_code,
    status: "cancelled",
    message: note
  });

  return data;
}

export async function approveRepairQuote(userId: number, referenceCode: string) {
  const supabase = getSupabaseAdmin();
  const { data: existing, error: lookupError } = await supabase
    .from("service_requests")
    .select("id,reference_code,telegram_user_id,status,quoted_amount_paise")
    .eq("request_type", "repair")
    .eq("source", "telegram")
    .eq("telegram_user_id", userId)
    .eq("reference_code", referenceCode)
    .maybeSingle();

  if (lookupError) throw new Error("Repair ticket lookup failed.");
  if (!existing || existing.status !== "awaiting_approval" || !existing.quoted_amount_paise) return null;

  const { data, error } = await supabase
    .from("service_requests")
    .update({
      status: "approved",
      status_note: "Customer approved the repair quote in Telegram.",
      updated_at: new Date().toISOString()
    })
    .eq("id", existing.id)
    .eq("status", "awaiting_approval")
    .select("id,reference_code,telegram_user_id,status,quoted_amount_paise")
    .maybeSingle();

  if (error) throw new Error("Repair approval failed.");
  if (!data) return null;

  await addWorkflowEvent({
    entityType: "service_request",
    entityId: data.id,
    referenceCode: data.reference_code,
    status: "approved",
    message: "Customer approved the repair quote in Telegram."
  });

  return data;
}
