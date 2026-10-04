"use client";

import { useEffect, useMemo, useState } from "react";
import { catalog, type Product } from "@/lib/catalog";
import FloatingAiChat from "@/app/components/FloatingAiChat";
import { parseMiniAppWebsiteCart } from "@/lib/website-cart";

type StoreProduct = Product & {
  brand?: string | null;
  model?: string | null;
  imageUrl?: string | null;
  stockQty?: number | null;
};

type CartMap = Record<string, number>;

type RepairItem = {
  reference_code: string;
  device_brand?: string | null;
  device_model: string;
  issue_or_condition: string;
  status: string;
  quoted_amount_paise?: number | null;
  status_note?: string | null;
  created_at: string;
  updated_at: string;
};

type AccountOrder = {
  id: string;
  amount_paise: number;
  status: string;
  workflow_status?: string | null;
  tracking_code?: string | null;
  created_at: string;
  paid_at?: string | null;
  receipt_code: string;
};

type AccountSummary = {
  orderCount: number;
  paidOrderCount: number;
  paidSpendPaise: number;
  loyaltyPoints: number;
  repairCount: number;
  activeRepairs: number;
  savedDevices: number;
  activeWarranties: number;
};

type ServiceWarranty = {
  warranty_code: string;
  repair_reference: string;
  device_label: string;
  start_at: string;
  end_at: string;
  status: string;
  note?: string | null;
};

type AccountData = {
  summary: AccountSummary;
  orders: AccountOrder[];
  warranties: ServiceWarranty[];
};

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(paise / 100);
}

function productVisualUrl(product: StoreProduct) {
  if (product.imageUrl) return product.imageUrl;
  const params = new URLSearchParams({
    name: product.name,
    price: money(product.pricePaise),
    stock: typeof product.stockQty === "number" ? `${product.stockQty} in stock` : "Stock confirmation required",
    emoji: product.emoji
  });
  return `/api/product-card?${params.toString()}`;
}

export default function Home() {
  const [cart, setCart] = useState<CartMap>({});
  const [products, setProducts] = useState<StoreProduct[]>(catalog);
  const [category, setCategory] = useState<"all" | Product["category"]>("all");
  const [loading, setLoading] = useState(false);
  const [customLoading, setCustomLoading] = useState(false);
  const [customAmount, setCustomAmount] = useState("1");
  const [repairLoading, setRepairLoading] = useState(false);
  const [repairPaymentRef, setRepairPaymentRef] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  const [repairs, setRepairs] = useState<RepairItem[]>([]);
  const [account, setAccount] = useState<AccountData | null>(null);
  const [repairsOpen, setRepairsOpen] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedCategory = params.get("category");
    const requestedProduct = params.get("product");
    const buyFromQuery = params.get("buy") === "1";
    const websiteCart = parseMiniAppWebsiteCart(params.get("website_cart"));
    const requestedRepairRef = String(params.get("repair_ref") || "").trim().toUpperCase();

    if (/^MRR-[A-F0-9]{10}$/.test(requestedRepairRef)) {
      setRepairPaymentRef(requestedRepairRef);
      setRepairsOpen(true);
    }

    if (requestedCategory === "phone" || requestedCategory === "accessory" || requestedCategory === "service") {
      setCategory(requestedCategory);
    }

    fetch("/api/catalog")
      .then((r) => r.json())
      .then((data) => {
        const liveProducts: StoreProduct[] = Array.isArray(data) && data.length ? data as StoreProduct[] : catalog;
        setProducts(liveProducts);

        const selected = requestedProduct
          ? liveProducts.find((product) => product.id === requestedProduct)
          : undefined;
        if (selected) {
          setCategory(selected.category);
          if (buyFromQuery) {
            setCart((current) => ({ ...current, [selected.id]: 1 }));
            setMessage(`${selected.name} added to your cart.`);
          }
        }

        if (websiteCart.length) {
          const imported: CartMap = {};
          for (const item of websiteCart) {
            const product = liveProducts.find((candidate) => candidate.id === item.productId);
            if (!product) continue;
            const stockLimit = typeof product.stockQty === "number"
              ? Math.max(0, Math.min(5, product.stockQty))
              : 5;
            if (stockLimit < 1) continue;
            imported[product.id] = Math.min(item.qty, stockLimit);
          }
          if (Object.keys(imported).length) {
            setCart(imported);
            setMessage("Website cart loaded in Telegram ✅ Review stock and continue checkout.");
          }
        }
      })
      .catch(() => setProducts(catalog));

    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => setPaymentsEnabled(Boolean(data?.paymentsEnabled)))
      .catch(() => setPaymentsEnabled(false));

    const tg = window.Telegram?.WebApp;
    if (!tg) {
      setMessage("Open this app from Telegram to place an order.");
      return;
    }

    const startParam = tg.initDataUnsafe?.start_param;
    const deepLinkMatch = typeof startParam === "string"
      ? startParam.match(/^(view|buy)_([A-Za-z0-9_-]{1,58})$/)
      : null;
    if (deepLinkMatch) {
      const [, action, productId] = deepLinkMatch;
      fetch("/api/catalog")
        .then((r) => r.json())
        .then((data) => {
          const liveProducts: StoreProduct[] = Array.isArray(data) && data.length ? data as StoreProduct[] : catalog;
          setProducts(liveProducts);
          const selected = liveProducts.find((product) => product.id === productId);
          if (!selected) return;
          setCategory(selected.category);
          if (action === "buy") {
            setCart((current) => ({ ...current, [selected.id]: 1 }));
            setMessage(`${selected.name} added to your cart.`);
          }
        })
        .catch(() => undefined);
    }

    const applyTelegramTheme = () => {
      const theme = tg.themeParams || {};
      const isLight = tg.colorScheme === "light";
      const root = document.documentElement;
      const bg = theme.bg_color || (isLight ? "#f5f7fa" : "#0b0d10");
      const panel = theme.secondary_bg_color || (isLight ? "#ffffff" : "#12161b");
      const panel2 = theme.section_bg_color || panel;
      const text = theme.text_color || (isLight ? "#111827" : "#f7f9fb");
      const muted = theme.hint_color || (isLight ? "#667085" : "#98a2ad");
      const line = theme.section_separator_color || (isLight ? "#dfe3e8" : "#252c34");
      const accent = theme.button_color || "#14b8a6";
      const accentText = theme.button_text_color || (isLight ? "#ffffff" : "#04100e");

      root.style.colorScheme = tg.colorScheme;
      root.style.setProperty("--bg", bg);
      root.style.setProperty("--panel", panel);
      root.style.setProperty("--panel-2", panel2);
      root.style.setProperty("--text", text);
      root.style.setProperty("--muted", muted);
      root.style.setProperty("--line", line);
      root.style.setProperty("--accent", accent);
      root.style.setProperty("--accent-text", accentText);

      tg.setHeaderColor(bg);
      tg.setBackgroundColor(bg);
      tg.setBottomBarColor?.(panel);
    };

    const applyTelegramViewport = () => {
      if (typeof tg.viewportStableHeight === "number" && tg.viewportStableHeight > 0) {
        document.documentElement.style.setProperty(
          "--tg-viewport-stable-height",
          `${tg.viewportStableHeight}px`
        );
      }
    };

    tg.ready();
    tg.expand();
    applyTelegramTheme();
    applyTelegramViewport();
    tg.onEvent?.("themeChanged", applyTelegramTheme);
    tg.onEvent?.("viewportChanged", applyTelegramViewport);
    tg.enableClosingConfirmation();
    try {
      tg.requestFullscreen?.();
    } catch {
      // Older Telegram clients may not support fullscreen requests.
    }

    fetch("/api/telegram/session", {
      method: "POST",
      headers: { "x-telegram-init-data": tg.initData }
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Telegram session validation failed.");
        setSessionReady(true);

        fetch("/api/telegram/account", {
          method: "POST",
          headers: { "x-telegram-init-data": tg.initData }
        })
          .then((response) => response.ok ? response.json() : Promise.reject())
          .then((accountData) => {
            setRepairs(Array.isArray(accountData?.repairs) ? accountData.repairs : []);
            if (accountData?.summary && Array.isArray(accountData?.orders)) {
              setAccount({
                summary: accountData.summary,
                orders: accountData.orders,
                warranties: Array.isArray(accountData?.warranties) ? accountData.warranties : []
              });
            }
          })
          .catch(() => undefined);

        try {
          const reconcileResponse = await fetch("/api/orders/reconcile", {
            method: "POST",
            headers: { "x-telegram-init-data": tg.initData }
          });
          const reconciled = await reconcileResponse.json();
          if (reconcileResponse.ok && reconciled?.reconciled > 0) {
            setMessage(
              reconciled.reconciled === 1
                ? "A previous payment was confirmed successfully."
                : `${reconciled.reconciled} previous payments were confirmed successfully.`
            );
            tg.HapticFeedback?.notificationOccurred("success");
          }
        } catch {
          // Reconciliation is best-effort and should not block shopping.
        }
      })
      .catch((e) => setMessage(e.message));

    return () => {
      tg.offEvent?.("themeChanged", applyTelegramTheme);
      tg.offEvent?.("viewportChanged", applyTelegramViewport);
    };
  }, []);

  const filtered = useMemo(
    () => category === "all" ? products : products.filter((p) => p.category === category),
    [category, products]
  );

  const total = useMemo(
    () => products.reduce((sum, p) => sum + p.pricePaise * (cart[p.id] || 0), 0),
    [cart, products]
  );

  const count = Object.values(cart).reduce((a, b) => a + b, 0);

  const savedDevices = useMemo(() => {
    const labels = repairs
      .map((ticket) => [ticket.device_brand, ticket.device_model].filter(Boolean).join(" ").trim())
      .filter(Boolean);
    return Array.from(new Set(labels));
  }, [repairs]);

  const repairPaymentTicket = useMemo(
    () => repairPaymentRef
      ? repairs.find((ticket) => ticket.reference_code === repairPaymentRef) || null
      : null,
    [repairPaymentRef, repairs]
  );

  useEffect(() => {
    const mainButton = window.Telegram?.WebApp.MainButton;
    if (!mainButton) return;

    const handleCheckout = () => {
      document.querySelector<HTMLButtonElement>("[data-checkout-button]")?.click();
    };

    if (!count) {
      mainButton.hide();
      return () => mainButton.hide();
    }

    mainButton.setText(
      paymentsEnabled ? `PAY ${money(total)}` : `PLACE ORDER · ${money(total)}`
    );
    if (loading || !sessionReady) mainButton.disable();
    else mainButton.enable();

    mainButton.onClick(handleCheckout);
    mainButton.show();

    return () => {
      mainButton.offClick(handleCheckout);
      mainButton.hide();
    };
  }, [count, loading, paymentsEnabled, sessionReady, total]);

  useEffect(() => {
    const backButton = window.Telegram?.WebApp.BackButton;
    if (!backButton) return;

    const handleBack = () => setCategory("all");

    if (category === "all") {
      backButton.hide();
      return () => backButton.hide();
    }

    backButton.onClick(handleBack);
    backButton.show();

    return () => {
      backButton.offClick(handleBack);
      backButton.hide();
    };
  }, [category]);

  function maxQty(productId: string) {
    const product = products.find((item) => item.id === productId);
    if (typeof product?.stockQty === "number") return Math.max(0, Math.min(5, product.stockQty));
    return 5;
  }

  function add(productId: string) {
    const limit = maxQty(productId);
    if (limit < 1) {
      setMessage("This product is currently out of stock.");
      return;
    }
    setCart((current) => ({
      ...current,
      [productId]: Math.min(limit, (current[productId] || 0) + 1)
    }));
    window.Telegram?.WebApp.HapticFeedback?.impactOccurred("light");
  }

  function changeQty(productId: string, delta: number) {
    const limit = maxQty(productId);
    setCart((current) => {
      const next = Math.max(0, Math.min(limit, (current[productId] || 0) + delta));
      const copy = { ...current };
      if (next === 0) delete copy[productId];
      else copy[productId] = next;
      return copy;
    });
    window.Telegram?.WebApp.HapticFeedback?.selectionChanged();
  }

  async function placePendingOrder() {
    const tg = window.Telegram?.WebApp;
    if (!tg) throw new Error("Open this app from Telegram.");

    const cartPayload = Object.entries(cart).map(([productId, qty]) => ({ productId, qty }));

    const response = await fetch("/api/orders/place", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-telegram-init-data": tg.initData
      },
      body: JSON.stringify({ cart: cartPayload })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not place order.");

    setCart({});
    setMessage(`Order placed successfully. Order ${data.orderId}`);
    tg.HapticFeedback?.notificationOccurred("success");
    tg.showAlert("Order received ✅\nPayment can be completed after Mr Mobiles confirms the order.");
  }

  function openOwnDomainPayment(order: any, description: string) {
    const bridgeUrl = String(order?.bridgeUrl || "");
    const bridgeToken = String(order?.bridgeToken || "");
    if (!bridgeUrl.startsWith("https://mrmobiles.in/") || !bridgeToken) {
      throw new Error("Secure Mr Mobiles payment bridge is unavailable.");
    }

    const tg = window.Telegram?.WebApp;
    const user = tg?.initDataUnsafe?.user;
    const state = {
      keyId: String(order.keyId || ""),
      amount: Number(order.amount || 0),
      currency: String(order.currency || "INR"),
      orderId: String(order.orderId || ""),
      internalOrderId: String(order.internalOrderId || ""),
      bridgeToken,
      description,
      customerName: [user?.first_name, user?.last_name].filter(Boolean).join(" ")
    };

    if (!state.keyId || !state.amount || !state.orderId || !state.internalOrderId) {
      throw new Error("Incomplete secure payment session.");
    }

    window.location.assign(`${bridgeUrl}#${encodeURIComponent(JSON.stringify(state))}`);
  }

  async function payWithRazorpay() {
    const tg = window.Telegram?.WebApp;
    if (!tg) throw new Error("Open this app from Telegram.");

    const cartPayload = Object.entries(cart).map(([productId, qty]) => ({ productId, qty }));

    const orderResponse = await fetch("/api/razorpay/order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-telegram-init-data": tg.initData
      },
      body: JSON.stringify({ cart: cartPayload })
    });

    const order = await orderResponse.json();
    if (!orderResponse.ok) throw new Error(order.error || "Could not create order.");

    openOwnDomainPayment(order, "Telegram Mini App order");
  }

  async function payRepairQuote() {
    const tg = window.Telegram?.WebApp;
    if (!tg) {
      setMessage("Open this app from Telegram.");
      return;
    }
    if (!sessionReady) {
      setMessage("Secure Telegram session is not ready.");
      return;
    }
    if (!paymentsEnabled) {
      setMessage("Online payment is temporarily unavailable.");
      return;
    }
    if (!repairPaymentRef || !repairPaymentTicket) {
      setMessage("Repair quote is still loading.");
      return;
    }
    if (repairPaymentTicket.status !== "approved" || !repairPaymentTicket.quoted_amount_paise) {
      setMessage(
        repairPaymentTicket.status === "repairing" || repairPaymentTicket.status === "ready" || repairPaymentTicket.status === "completed"
          ? "This repair payment is already completed or the repair is in progress."
          : "Approve the repair quote in Telegram before payment."
      );
      return;
    }

    try {
      setRepairLoading(true);
      setMessage("");

      const orderResponse = await fetch("/api/razorpay/order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": tg.initData
        },
        body: JSON.stringify({ repairReference: repairPaymentRef })
      });

      const order = await orderResponse.json();
      if (!orderResponse.ok) throw new Error(order.error || "Could not create repair payment.");

      openOwnDomainPayment(order, `Repair ${repairPaymentRef}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Repair payment failed.");
      setRepairLoading(false);
    }
  }

  async function payCustomAmount() {
    const tg = window.Telegram?.WebApp;
    if (!tg) {
      setMessage("Open this app from Telegram.");
      return;
    }
    if (!sessionReady) {
      setMessage("Secure Telegram session is not ready.");
      return;
    }
    if (!paymentsEnabled) {
      setMessage("Online payment is temporarily unavailable.");
      return;
    }

    const amountValue = Number(customAmount);
    if (!Number.isFinite(amountValue) || amountValue < 1 || amountValue > 10000) {
      setMessage("Enter a custom amount between ₹1 and ₹10,000.");
      return;
    }

    try {
      setCustomLoading(true);
      setMessage("");

      const orderResponse = await fetch("/api/razorpay/order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": tg.initData
        },
        body: JSON.stringify({ customAmount: customAmount.trim() })
      });

      const order = await orderResponse.json();
      if (!orderResponse.ok) throw new Error(order.error || "Could not create custom payment.");

      openOwnDomainPayment(order, "Custom / Test Payment");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Custom payment failed.");
      setCustomLoading(false);
    }
  }

  async function checkout() {
    window.Telegram?.WebApp.HapticFeedback?.impactOccurred("medium");
    if (!sessionReady) {
      setMessage("Secure Telegram session is not ready.");
      return;
    }
    if (!count) {
      setMessage("Add an item before checkout.");
      return;
    }

    try {
      setLoading(true);
      setMessage("");

      if (paymentsEnabled) await payWithRazorpay();
      else await placePendingOrder();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Checkout failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <div className="eyebrow">Mr Mobiles • Telegram Shop</div>
          <h1>Shop. Repair. Order.</h1>
          <p>Phones, accessories and service bookings — directly inside Telegram.</p>
        </div>
        <div className="brandMark">Mr</div>
      </section>

      <nav className="chips" aria-label="Product categories">
        {[
          ["all", "All"],
          ["phone", "Phones"],
          ["accessory", "Accessories"],
          ["service", "Repair"]
        ].map(([value, label]) => (
          <button
            key={value}
            className={category === value ? "chip active" : "chip"}
            onClick={() => {
              setCategory(value as typeof category);
              window.Telegram?.WebApp.HapticFeedback?.selectionChanged();
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      <section className="accountPanel">
          <button className="accountToggle" onClick={() => setRepairsOpen((value) => !value)}>
            <span>
              <strong>My Mr Mobiles Account</strong>
              <small>
                {sessionReady
                  ? `${account?.summary.orderCount ?? 0} orders · ${repairs.length} repairs · ${account?.summary.loyaltyPoints ?? 0} MR Points`
                  : "Connecting securely to Telegram…"}
              </small>
            </span>
            <span>{repairsOpen ? "−" : "+"}</span>
          </button>
          {repairsOpen && (
            <div className="accountBody">
              {!sessionReady && <p>Open this Mini App from Mr Mobiles in Telegram to load your private account.</p>}
              {sessionReady && account && (
                <>
                  <h3>Account overview</h3>
                  <div className="accountStats">
                    <div><strong>{account.summary.loyaltyPoints}</strong><span>MR Points</span></div>
                    <div><strong>{money(account.summary.paidSpendPaise)}</strong><span>Paid spend</span></div>
                    <div><strong>{account.summary.activeRepairs}</strong><span>Active repairs</span></div>
                    <div><strong>{account.summary.activeWarranties}</strong><span>Warranties</span></div>
                  </div>
                  <p className="accountNote">MR Points earn at 1 point per ₹100 of verified paid orders.</p>
                  <h3>Recent orders & receipts</h3>
                  {account.orders.length ? account.orders.slice(0, 5).map((order) => (
                    <div className="repairItem" key={order.id}>
                      <strong>{order.receipt_code}</strong>
                      <span>{money(order.amount_paise)} · {order.status}{order.workflow_status ? ` · ${order.workflow_status.replaceAll("_", " ")}` : ""}</span>
                      <em>{order.tracking_code || "Order receipt"}</em>
                    </div>
                  )) : <p>No Telegram orders yet.</p>}
                  <h3>Service warranties</h3>
                  {account.warranties.length ? account.warranties.map((warranty) => (
                    <div className="repairItem" key={warranty.warranty_code}>
                      <strong>🛡 {warranty.device_label}</strong>
                      <span>{warranty.warranty_code} · Repair {warranty.repair_reference}</span>
                      <em>Valid until {new Date(warranty.end_at).toLocaleDateString("en-IN")}</em>
                      {warranty.note ? <span>{warranty.note}</span> : null}
                    </div>
                  )) : <p>No active service warranties.</p>}
                </>
              )}
              <h3>Repair history</h3>
              {sessionReady && repairs.length ? repairs.map((ticket) => (
                <div className="repairItem" key={ticket.reference_code}>
                  <strong>{[ticket.device_brand, ticket.device_model].filter(Boolean).join(" ")}</strong>
                  <span>{ticket.reference_code} · {ticket.issue_or_condition}</span>
                  <em>{ticket.status.replaceAll("_", " ")}</em>
                </div>
              )) : sessionReady ? <p>No Telegram repair history yet.</p> : null}
              <h3>My devices</h3>
              <div className="deviceList">
                {sessionReady && savedDevices.length ? savedDevices.map((device) => <span key={device}>📱 {device}</span>) : sessionReady ? <p>Devices are saved automatically from repair history.</p> : null}
              </div>
              {sessionReady && (
                <p className="accountNote">
                  Service warranty dates shown above are issued by Mr Mobiles after a completed repair. Product warranty terms remain governed by the official bill/manufacturer terms.
                </p>
              )}
            </div>
          )}
        </section>

      <section className="grid">
        {filtered.map((product) => {
          const qty = cart[product.id] || 0;
          return (
            <article className="card" key={product.id}>
              <div className="productIcon">
                <img
                  src={productVisualUrl(product)}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="cardBody">
                <span className="pill">{product.category}</span>
                <h2>{product.name}</h2>
                {(product.brand || product.model) && (
                  <p>{[product.brand, product.model].filter(Boolean).join(" • ")}</p>
                )}
                <p>{product.subtitle}</p>
                <p>
                  {typeof product.stockQty === "number"
                    ? `${product.stockQty} in stock`
                    : "Stock confirmed before order"}
                </p>
                <div className="cardBottom">
                  <strong>{money(product.pricePaise)}</strong>
                  {qty === 0 ? (
                    <button className="add" onClick={() => add(product.id)}>Add</button>
                  ) : (
                    <div className="qty">
                      <button onClick={() => changeQty(product.id, -1)} aria-label="Decrease">−</button>
                      <span>{qty}</span>
                      <button onClick={() => changeQty(product.id, 1)} aria-label="Increase">+</button>
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {repairPaymentRef && (
        <section className="customPaymentPanel" aria-labelledby="repair-payment-title">
          <div className="customPaymentHeading">
            <div>
              <span className="pill">Approved repair</span>
              <h2 id="repair-payment-title">Pay repair quote</h2>
              <p>
                {repairPaymentTicket
                  ? `${[repairPaymentTicket.device_brand, repairPaymentTicket.device_model].filter(Boolean).join(" ")} · ${repairPaymentTicket.reference_code}`
                  : `Loading ${repairPaymentRef}…`}
              </p>
            </div>
            <strong>🔧</strong>
          </div>

          {repairPaymentTicket ? (
            <div className="customPaymentForm">
              <label>Quoted amount</label>
              <div>
                <span>₹</span>
                <input
                  aria-label="Approved repair quote amount"
                  value={repairPaymentTicket.quoted_amount_paise ? String(repairPaymentTicket.quoted_amount_paise / 100) : ""}
                  readOnly
                />
                <button
                  type="button"
                  disabled={
                    repairLoading ||
                    !sessionReady ||
                    repairPaymentTicket.status !== "approved" ||
                    !repairPaymentTicket.quoted_amount_paise
                  }
                  onClick={payRepairQuote}
                >
                  {repairLoading
                    ? "Preparing…"
                    : repairPaymentTicket.status === "approved"
                      ? `Pay ${money(Number(repairPaymentTicket.quoted_amount_paise || 0))}`
                      : "Payment completed"}
                </button>
              </div>
              <small>
                {repairPaymentTicket.status === "approved"
                  ? "Amount is locked to the technician-approved quote and verified again on the server."
                  : `Repair status: ${repairPaymentTicket.status.replaceAll("_", " ")}`}
              </small>
            </div>
          ) : (
            <p className="accountNote">Loading your approved repair quote securely from Telegram…</p>
          )}
        </section>
      )}

      {paymentsEnabled && (
        <section className="customPaymentPanel" aria-labelledby="custom-payment-title">
          <div className="customPaymentHeading">
            <div>
              <span className="pill">Test payment</span>
              <h2 id="custom-payment-title">Pay a custom amount</h2>
              <p>Use ₹1 for a real end-to-end payment test without buying a product.</p>
            </div>
            <strong>₹</strong>
          </div>

          <div className="customPresets" aria-label="Quick custom amounts">
            {["1", "10", "100"].map((amount) => (
              <button
                type="button"
                key={amount}
                className={customAmount === amount ? "active" : ""}
                onClick={() => setCustomAmount(amount)}
              >
                ₹{amount}
              </button>
            ))}
          </div>

          <div className="customPaymentForm">
            <label htmlFor="custom-amount">Amount in rupees</label>
            <div>
              <span>₹</span>
              <input
                id="custom-amount"
                inputMode="decimal"
                autoComplete="off"
                value={customAmount}
                onChange={(event) => setCustomAmount(event.target.value.replace(/[^0-9.]/g, "").slice(0, 8))}
                placeholder="1"
                aria-describedby="custom-payment-help"
              />
              <button
                type="button"
                disabled={customLoading || !sessionReady}
                onClick={payCustomAmount}
              >
                {customLoading ? "Preparing…" : "Pay custom amount"}
              </button>
            </div>
            <small id="custom-payment-help">Allowed: ₹1–₹10,000. Secure checkout opens on mrmobiles.in.</small>
          </div>
        </section>
      )}

      <section className="checkoutBar">
        <div>
          <span>{count} item{count === 1 ? "" : "s"}</span>
          <strong>{money(total)}</strong>
        </div>
        <button data-checkout-button disabled={loading || !sessionReady || count === 0} onClick={checkout}>
          {loading ? "Preparing…" : paymentsEnabled ? "Pay securely" : "Place order"}
        </button>
      </section>

      {message && <div className="status" role="status">{message}</div>}

      <footer>
        {paymentsEnabled
          ? "Payments open on mrmobiles.in and are verified securely by the Mr Mobiles server."
          : "Online payment is temporarily unavailable. Orders can still be placed securely through Telegram."}
      </footer>

      <FloatingAiChat />
    </main>
  );
}
