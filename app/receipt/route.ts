import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  orderReceiptCode,
  verifyReceiptAccessToken
} from "@/lib/receipt-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatInr(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(Number(paise || 0) / 100);
}

function formatDate(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Kolkata"
      });
}

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("t") || "";
    const access = verifyReceiptAccessToken(token);
    const supabase = getSupabaseAdmin();

    const { data: order, error } = await supabase
      .from("orders")
      .select("id,telegram_user_id,telegram_username,amount_paise,currency,status,workflow_status,razorpay_payment_id,cart,created_at,paid_at")
      .eq("id", access.orderId)
      .eq("telegram_user_id", access.telegramUserId)
      .single();

    if (error || !order) {
      return new Response("Receipt not found.", { status: 404 });
    }

    const items = Array.isArray(order.cart) ? order.cart : [];
    const rows = items.map((item: any) => {
      const name = escapeHtml(item?.name || item?.productId || "Mr Mobiles item");
      const qty = Math.max(1, Number(item?.qty || 1));
      const unit = Number(item?.unitPricePaise || 0);
      const line = Number(item?.lineTotalPaise || unit * qty);
      return `<tr><td><strong>${name}</strong></td><td>${qty}</td><td>${escapeHtml(formatInr(unit))}</td><td>${escapeHtml(formatInr(line))}</td></tr>`;
    }).join("");

    const paid = order.status === "paid";
    const receipt = orderReceiptCode(order.id, order.created_at);
    const username = order.telegram_username ? `@${order.telegram_username}` : "Telegram customer";
    const paymentId = order.razorpay_payment_id || "—";
    const status = String(order.workflow_status || order.status || "created").replaceAll("_", " ");

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<title>${escapeHtml(receipt)} · Mr Mobiles</title>
<style>
:root{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#111827;background:#f3f4f6}
*{box-sizing:border-box}body{margin:0;padding:24px;background:#f3f4f6;color:#111827}
.wrap{max-width:760px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:20px;overflow:hidden;box-shadow:0 18px 55px rgba(15,23,42,.08)}
.head{padding:26px;display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid #e5e7eb}
.brand{font-weight:900;font-size:24px;letter-spacing:-.04em}.brand span{display:block;margin-top:4px;font-size:12px;color:#6b7280;letter-spacing:.08em;text-transform:uppercase}
.badge{height:fit-content;padding:7px 10px;border-radius:999px;background:${paid?"#dcfce7":"#fef3c7"};color:${paid?"#166534":"#92400e"};font-size:12px;font-weight:800;text-transform:uppercase}
.meta{padding:20px 26px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;border-bottom:1px solid #e5e7eb}
.meta div{padding:12px;border:1px solid #e5e7eb;border-radius:12px}.meta small{display:block;color:#6b7280;margin-bottom:4px}.meta strong{word-break:break-word}
.tableWrap{padding:20px 26px;overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:560px}th,td{padding:12px 10px;border-bottom:1px solid #e5e7eb;text-align:left}th{font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em}td:nth-child(2),th:nth-child(2){text-align:center}td:nth-child(3),td:nth-child(4),th:nth-child(3),th:nth-child(4){text-align:right}
.total{padding:0 26px 24px;display:flex;justify-content:flex-end}.total div{min-width:260px;padding:16px;border-radius:14px;background:#f9fafb;display:flex;justify-content:space-between;gap:20px}.total strong{font-size:20px}
.note{padding:18px 26px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5}
.actions{padding:18px 26px 26px;display:flex;gap:10px}.actions button{min-height:44px;padding:0 16px;border-radius:12px;border:1px solid #d1d5db;background:#fff;font-weight:800;cursor:pointer}.actions .primary{background:#111827;color:#fff;border-color:#111827}
@media(max-width:600px){body{padding:10px}.wrap{border-radius:15px}.head,.meta,.tableWrap,.total,.note,.actions{padding-left:16px;padding-right:16px}.meta{grid-template-columns:1fr}.head{flex-direction:column}.total div{min-width:0;width:100%}}
@media print{body{padding:0;background:#fff}.wrap{max-width:none;border:0;border-radius:0;box-shadow:none}.actions{display:none}}
</style>
</head>
<body>
<main class="wrap">
<section class="head">
  <div class="brand">MR MOBILES<span>Order / Payment Receipt</span></div>
  <div class="badge">${paid ? "Paid" : escapeHtml(status)}</div>
</section>
<section class="meta">
  <div><small>Receipt</small><strong>${escapeHtml(receipt)}</strong></div>
  <div><small>Customer</small><strong>${escapeHtml(username)}</strong></div>
  <div><small>Order created</small><strong>${escapeHtml(formatDate(order.created_at))}</strong></div>
  <div><small>Payment confirmed</small><strong>${escapeHtml(order.paid_at ? formatDate(order.paid_at) : "Not yet")}</strong></div>
  <div><small>Order ID</small><strong>${escapeHtml(order.id)}</strong></div>
  <div><small>Payment ID</small><strong>${escapeHtml(paymentId)}</strong></div>
</section>
<section class="tableWrap">
<table>
<thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Amount</th></tr></thead>
<tbody>${rows || '<tr><td colspan="4">Order details recorded by Mr Mobiles.</td></tr>'}</tbody>
</table>
</section>
<section class="total"><div><span>Total</span><strong>${escapeHtml(formatInr(Number(order.amount_paise)))}</strong></div></section>
<section class="note">
  Status: <strong>${escapeHtml(status)}</strong>. This receipt is generated from the Mr Mobiles server record.
  It is an order/payment receipt and is not a GST tax invoice unless tax registration and tax breakup are explicitly shown.
</section>
<section class="actions">
  <button class="primary" onclick="window.print()">Print / Save PDF</button>
  <button onclick="history.length>1?history.back():window.close()">Back</button>
</section>
</main>
</body>
</html>`;

    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Receipt unavailable.";
    return new Response(escapeHtml(message), {
      status: message.includes("expired") ? 410 : 401,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "private, no-store"
      }
    });
  }
}
