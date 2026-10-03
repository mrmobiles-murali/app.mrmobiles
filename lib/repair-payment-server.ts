import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { updateRepairTicket } from "@/lib/repair-tickets";
import { repairReferenceFromCart } from "@/lib/repair-payment";

export async function advanceRepairAfterPaidOrder(input: {
  telegramUserId: number;
  amountPaise: number;
  cart: unknown;
}) {
  const referenceCode = repairReferenceFromCart(input.cart);
  if (!referenceCode) return null;

  const supabase = getSupabaseAdmin();
  const { data: ticket, error } = await supabase
    .from("service_requests")
    .select("reference_code,telegram_user_id,status,quoted_amount_paise")
    .eq("request_type", "repair")
    .eq("source", "telegram")
    .eq("telegram_user_id", input.telegramUserId)
    .eq("reference_code", referenceCode)
    .maybeSingle();

  if (error || !ticket) return { referenceCode, advanced: false, status: null };

  if (Number(ticket.quoted_amount_paise || 0) !== Number(input.amountPaise)) {
    return { referenceCode, advanced: false, status: ticket.status };
  }

  if (ticket.status === "approved") {
    const updated = await updateRepairTicket({
      referenceCode,
      status: "repairing",
      note: "Repair quote payment confirmed. Repair work is authorized to proceed."
    });
    return {
      referenceCode,
      advanced: Boolean(updated),
      status: updated?.status || ticket.status
    };
  }

  return {
    referenceCode,
    advanced: false,
    status: ticket.status
  };
}
