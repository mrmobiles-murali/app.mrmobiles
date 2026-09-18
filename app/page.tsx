"use client";

import { useEffect, useMemo, useState } from "react";
import { catalog, type Product } from "@/lib/catalog";

type CartMap = Record<string, number>;

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(paise / 100);
}

export default function Home() {
  const [cart, setCart] = useState<CartMap>({});
  const [category, setCategory] = useState<"all" | Product["category"]>("all");
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => setPaymentsEnabled(Boolean(data?.paymentsEnabled)))
      .catch(() => setPaymentsEnabled(false));

    const tg = window.Telegram?.WebApp;
    if (!tg) {
      setMessage("Open this app from Telegram to place an order.");
      return;
    }

    tg.ready();
    tg.expand();
    tg.setHeaderColor("#0b0d10");
    tg.setBackgroundColor("#0b0d10");
    tg.enableClosingConfirmation();

    fetch("/api/telegram/session", {
      method: "POST",
      headers: { "x-telegram-init-data": tg.initData }
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Telegram session validation failed.");
        setSessionReady(true);
      })
      .catch((e) => setMessage(e.message));
  }, []);

  const filtered = useMemo(
    () => category === "all" ? catalog : catalog.filter((p) => p.category === category),
    [category]
  );

  const total = useMemo(
    () => catalog.reduce((sum, p) => sum + p.pricePaise * (cart[p.id] || 0), 0),
    [cart]
  );

  const count = Object.values(cart).reduce((a, b) => a + b, 0);

  function add(productId: string) {
    setCart((current) => ({
      ...current,
      [productId]: Math.min(5, (current[productId] || 0) + 1)
    }));
    window.Telegram?.WebApp.HapticFeedback?.impactOccurred("light");
  }

  function changeQty(productId: string, delta: number) {
    setCart((current) => {
      const next = Math.max(0, Math.min(5, (current[productId] || 0) + delta));
      const copy = { ...current };
      if (next === 0) delete copy[productId];
      else copy[productId] = next;
      return copy;
    });
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

  async function payWithRazorpay() {
    const tg = window.Telegram?.WebApp;
    if (!tg) throw new Error("Open this app from Telegram.");
    if (!window.Razorpay) throw new Error("Razorpay Checkout is still loading.");

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

    const user = tg.initDataUnsafe?.user;

    const rzp = new window.Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: "Mr Mobiles",
      description: "Telegram Mini App order",
      order_id: order.orderId,
      prefill: {
        name: [user?.first_name, user?.last_name].filter(Boolean).join(" ")
      },
      notes: {
        internal_order_id: order.internalOrderId
      },
      theme: { color: "#14b8a6" },
      handler: async (response: any) => {
        const verifyResponse = await fetch("/api/razorpay/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-telegram-init-data": tg.initData
          },
          body: JSON.stringify(response)
        });

        const verified = await verifyResponse.json();
        if (!verifyResponse.ok) {
          setMessage(verified.error || "Payment verification failed.");
          tg.HapticFeedback?.notificationOccurred("error");
          return;
        }

        setCart({});
        setMessage(`Payment successful. Order ${verified.internalOrderId}`);
        tg.HapticFeedback?.notificationOccurred("success");
        tg.showAlert("Payment successful ✅\nYour Mr Mobiles order has been confirmed.");
      }
    });

    rzp.on("payment.failed", (response: any) => {
      setMessage(response?.error?.description || "Payment failed. Please try again.");
      tg.HapticFeedback?.notificationOccurred("error");
    });

    rzp.open();
  }

  async function checkout() {
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
            onClick={() => setCategory(value as typeof category)}
          >
            {label}
          </button>
        ))}
      </nav>

      <section className="grid">
        {filtered.map((product) => {
          const qty = cart[product.id] || 0;
          return (
            <article className="card" key={product.id}>
              <div className="productIcon" aria-hidden="true">{product.emoji}</div>
              <div className="cardBody">
                <span className="pill">{product.category}</span>
                <h2>{product.name}</h2>
                <p>{product.subtitle}</p>
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

      <section className="checkoutBar">
        <div>
          <span>{count} item{count === 1 ? "" : "s"}</span>
          <strong>{money(total)}</strong>
        </div>
        <button disabled={loading || !sessionReady || count === 0} onClick={checkout}>
          {loading ? "Preparing…" : paymentsEnabled ? "Pay securely" : "Place order"}
        </button>
      </section>

      {message && <div className="status" role="status">{message}</div>}

      <footer>
        {paymentsEnabled
          ? "Payments processed securely by Razorpay. Order verification happens on the Mr Mobiles server."
          : "Online payment is temporarily unavailable. Orders can still be placed securely through Telegram."}
      </footer>
    </main>
  );
}
