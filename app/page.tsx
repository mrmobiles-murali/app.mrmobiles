"use client";

import { useEffect, useMemo, useState } from "react";
import { catalog, type Product } from "@/lib/catalog";
import FloatingAiChat from "@/app/components/FloatingAiChat";
import { parseMiniAppWebsiteCart } from "@/lib/website-cart";

type StoreProduct = Product & {
  brand?: string | null;
  model?: string | null;
  imageUrl?: string | null;
  dailyVisualUrl?: string | null;
  visualRotationCount?: number;
  visualDay?: string | null;
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
  receipt_url: string;
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
  const [repairsOpen, setRepairsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"home" | "categories" | "search" | "orders" | "profile">("home");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

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
      const accent = "#ff8a3d";
      const accentText = "#180a02";

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

  const selectedProduct = useMemo(
    () => selectedProductId ? products.find((product) => product.id === selectedProductId) || null : null,
    [products, selectedProductId]
  );

  const searchedProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return products;
    return products.filter((product) =>
      [product.name, product.subtitle, product.brand, product.model, product.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [products, searchTerm]);

  const homePhones = useMemo(
    () => products.filter((product) => product.category === "phone").slice(0, 4),
    [products]
  );

  function productVisual(product: StoreProduct) {
    const exact: Record<string, string> = {
      "iphone-13-pro-128": "https://mrmobiles.in/__mr_photo/iphone-13-pro-128",
      "galaxy-s22-ultra-256": "https://mrmobiles.in/__mr_photo/galaxy-s22-ultra-256",
      "pixel-7-128": "https://mrmobiles.in/__mr_photo/pixel-7-128",
      "oneplus-11r-128": "https://mrmobiles.in/__mr_photo/oneplus-11r-128"
    };
    if (exact[product.id]) return exact[product.id];
    if (product.imageUrl) return product.imageUrl;
    if (product.dailyVisualUrl) return product.dailyVisualUrl;
    if (product.category === "accessory") return "https://mrmobiles.in/__mr_media/accessories";
    if (product.category === "service") return "https://mrmobiles.in/__mr_media/repair";
    return "https://mrmobiles.in/__mr_media/phones";
  }

  function openCategory(nextCategory: typeof category) {
    setSelectedProductId(null);
    setCategory(nextCategory);
    setActiveTab("categories");
    window.Telegram?.WebApp.HapticFeedback?.selectionChanged();
  }

  function openProduct(product: StoreProduct) {
    setSelectedProductId(product.id);
    window.Telegram?.WebApp.HapticFeedback?.impactOccurred("light");
  }

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
    <main className="shell storeShell">
      <header className="storeTopbar">
        <div>
          <strong>MR MOBILES</strong>
          <small>mini app</small>
        </div>
        <button type="button" aria-label="More options">•••</button>
      </header>

      {selectedProduct ? (
        <section className="productDetailView">
          <button type="button" className="detailBack" onClick={() => setSelectedProductId(null)} aria-label="Back to products">←</button>
          <button type="button" className="detailHeart" aria-label="Add to favourites">♡</button>
          <div className="detailVisual">
            <img src={productVisual(selectedProduct)} alt={selectedProduct.name} />
          </div>
          <div className="detailContent">
            <span className="detailCounter">1/1</span>
            <h1>{selectedProduct.name}</h1>
            <p>{selectedProduct.subtitle}</p>
            <div className="detailPriceRow">
              <strong>{money(selectedProduct.pricePaise)}</strong>
              <span>{typeof selectedProduct.stockQty === "number" && selectedProduct.stockQty > 0 ? "In Stock" : "Check Stock"}</span>
            </div>

            <div className="detailSpecs">
              <div><b>✓</b><span>Verified</span><small>MR Mobiles</small></div>
              <div><b>▣</b><span>Storage</span><small>{selectedProduct.name.match(/\d+GB/)?.[0] || "Live option"}</small></div>
              <div><b>◈</b><span>Condition</span><small>Confirmed before sale</small></div>
              <div><b>⌁</b><span>Support</span><small>Hosur store</small></div>
            </div>

            <div className="detailOptionBlock">
              <label>Available configuration</label>
              <div className="storageChoices">
                <button type="button" className="active">
                  {selectedProduct.name.match(/\d+GB/)?.[0] || "Current stock"}
                </button>
              </div>
            </div>

            <div className="detailOptionBlock">
              <label>Colour / condition</label>
              <p>Exact colour, grade and battery health are confirmed from live stock before order.</p>
            </div>

            <button className="detailAddButton" type="button" onClick={() => add(selectedProduct.id)}>
              🛒 {cart[selectedProduct.id] ? "In Cart · " + cart[selectedProduct.id] : "Add to Cart"}
            </button>
          </div>
        </section>
      ) : (
        <>
          {activeTab === "home" && (
            <>
              <section className="storeHero">
                <img src="https://mrmobiles.in/__mr_photo/iphone-13-pro-128" alt="Featured smartphone" loading="eager" />
                <div className="storeHeroShade" />
                <div className="storeHeroCopy">
                  <span>FEATURED TODAY</span>
                  <h1>iPhone 13 Pro</h1>
                  <p>Pro camera. Premium build. Certified pre-owned.</p>
                  <button type="button" onClick={() => {
                    const hero = products.find((product) => product.id === "iphone-13-pro-128");
                    if (hero) openProduct(hero);
                  }}>Explore Now →</button>
                </div>
                <div className="heroDots"><i /><i className="active" /><i /><i /></div>
              </section>

              <section className="quickCategories" aria-label="Quick categories">
                <button type="button" onClick={() => openCategory("phone")}><span>📱</span><b>Mobiles</b></button>
                <button type="button" onClick={() => openCategory("accessory")}><span>🎧</span><b>Accessories</b></button>
                <button type="button" onClick={() => openCategory("accessory")}><span>⌚</span><b>Gadgets</b></button>
                <button type="button" onClick={() => openCategory("service")}><span>🛠</span><b>Repairs</b></button>
              </section>

              <div className="storeSectionHeading">
                <div><h2>Today&apos;s Picks</h2><p>Fresh choices for you</p></div>
                <button type="button" onClick={() => openCategory("all")}>See All ›</button>
              </div>

              <section className="featuredGrid">
                {homePhones.slice(0, 2).map((product) => (
                  <article className="featuredCard" key={product.id} onClick={() => openProduct(product)}>
                    <div className="featuredImage"><img src={productVisual(product)} alt={product.name} /></div>
                    <small>{product.brand || "MR Mobiles"}</small>
                    <h3>{product.name}</h3>
                    <strong>{money(product.pricePaise)}</strong>
                    <button type="button" onClick={(event) => { event.stopPropagation(); add(product.id); }}>→</button>
                  </article>
                ))}
              </section>

              <section className="homePromoStrip">
                <img src="https://mrmobiles.in/__mr_media/repair" alt="Mobile repair service" />
                <div><small>MR MOBILES REPAIR</small><h3>Expert diagnostics & repair</h3><p>Track every stage inside Telegram.</p></div>
                <button type="button" onClick={() => openCategory("service")}>Book ›</button>
              </section>
            </>
          )}

          {activeTab === "categories" && (
            <>
              <div className="catalogTop">
                <h1>{category === "accessory" ? "Accessories" : category === "service" ? "Repairs" : "Mobiles"}</h1>
                <p>{category === "accessory" ? "Cases, charging gear and everyday essentials." : category === "service" ? "Diagnostics, repair booking and service support." : "Top brands. Live stock. Best available deals."}</p>
              </div>

              {category !== "service" && (
                <div className="brandRail">
                  {["All", "Apple", "Samsung", "Google", "OnePlus"].map((brand, index) => (
                    <button key={brand} type="button" className={index === 0 ? "active" : ""}>
                      <span>{brand === "Apple" ? "●" : brand === "Samsung" ? "S" : brand === "Google" ? "G" : brand === "OnePlus" ? "1+" : "✦"}</span>
                      <small>{brand}</small>
                    </button>
                  ))}
                </div>
              )}

              <section className="storeProductGrid">
                {filtered.map((product) => (
                  <article className="storeProductCard" key={product.id} onClick={() => openProduct(product)}>
                    <div className="storeProductImage">
                      <img src={productVisual(product)} alt={product.name} loading="lazy" />
                      <button type="button" className="heart" aria-label="Favourite">♡</button>
                    </div>
                    <h3>{product.name}</h3>
                    <p>{product.name.match(/\d+GB/)?.[0] || product.brand || "MR Mobiles"} · {typeof product.stockQty === "number" ? String(product.stockQty) + " in stock" : "Live stock"}</p>
                    <div><strong>{money(product.pricePaise)}</strong><button type="button" onClick={(event) => { event.stopPropagation(); add(product.id); }}>🛒</button></div>
                  </article>
                ))}
              </section>
            </>
          )}

          {activeTab === "search" && (
            <>
              <div className="catalogTop"><h1>Search</h1><p>Find phones, accessories and repair services.</p></div>
              <label className="storeSearch">
                <span>⌕</span>
                <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search MR MOBILES" autoFocus />
              </label>
              <section className="storeProductGrid">
                {searchedProducts.map((product) => (
                  <article className="storeProductCard" key={product.id} onClick={() => openProduct(product)}>
                    <div className="storeProductImage"><img src={productVisual(product)} alt={product.name} /></div>
                    <h3>{product.name}</h3>
                    <p>{product.subtitle}</p>
                    <div><strong>{money(product.pricePaise)}</strong><button type="button" onClick={(event) => { event.stopPropagation(); add(product.id); }}>🛒</button></div>
                  </article>
                ))}
              </section>
            </>
          )}

          {activeTab === "orders" && (
            <section className="accountScreen">
              <div className="catalogTop"><h1>Orders</h1><p>Receipts, payments and order progress.</p></div>
              {!sessionReady && <div className="accountEmpty">Connecting securely to Telegram…</div>}
              {sessionReady && account?.orders.length ? account.orders.map((order) => (
                <article className="orderCard" key={order.id}>
                  <div><span>{order.receipt_code}</span><strong>{money(order.amount_paise)}</strong></div>
                  <p>{order.tracking_code || "MR Mobiles order"}</p>
                  <small>{order.status}{order.workflow_status ? " · " + order.workflow_status.replaceAll("_", " ") : ""}</small>
                  <a href={order.receipt_url}>View receipt / PDF →</a>
                </article>
              )) : sessionReady ? <div className="accountEmpty">No Telegram orders yet.</div> : null}
            </section>
          )}

          {activeTab === "profile" && (
            <section className="accountScreen">
              <div className="profileHero">
                <div className="profileAvatar">MR</div>
                <div><h1>My MR MOBILES</h1><p>Devices, repairs, warranties & MR Points</p></div>
              </div>

              {account && (
                <div className="profileStats">
                  <div><strong>{account.summary.loyaltyPoints}</strong><span>MR Points</span></div>
                  <div><strong>{account.summary.activeRepairs}</strong><span>Active repairs</span></div>
                  <div><strong>{account.summary.activeWarranties}</strong><span>Warranties</span></div>
                  <div><strong>{account.summary.savedDevices}</strong><span>Devices</span></div>
                </div>
              )}

              <div className="profileSection">
                <h3>My devices</h3>
                <div className="deviceList">
                  {savedDevices.length ? savedDevices.map((device) => <span key={device}>📱 {device}</span>) : <p>Devices are saved automatically from repair history.</p>}
                </div>
              </div>

              <div className="profileSection">
                <h3>Repair history</h3>
                {repairs.length ? repairs.map((ticket) => (
                  <div className="repairItem" key={ticket.reference_code}>
                    <strong>{[ticket.device_brand, ticket.device_model].filter(Boolean).join(" ")}</strong>
                    <span>{ticket.reference_code} · {ticket.issue_or_condition}</span>
                    <em>{ticket.status.replaceAll("_", " ")}</em>
                  </div>
                )) : <p>No Telegram repair history yet.</p>}
              </div>

              {paymentsEnabled && (
                <div className="profileSection">
                  <h3>Custom / test payment</h3>
                  <div className="customPresets">
                    {["1", "10", "100"].map((amount) => (
                      <button type="button" key={amount} className={customAmount === amount ? "active" : ""} onClick={() => setCustomAmount(amount)}>₹{amount}</button>
                    ))}
                  </div>
                  <div className="profilePaymentRow">
                    <span>₹</span>
                    <input value={customAmount} onChange={(event) => setCustomAmount(event.target.value.replace(/[^0-9.]/g, "").slice(0, 8))} />
                    <button type="button" disabled={customLoading || !sessionReady} onClick={payCustomAmount}>{customLoading ? "Preparing…" : "Pay"}</button>
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {count > 0 && !selectedProduct && (
        <section className="storeCartBar">
          <div><span>{count} item{count === 1 ? "" : "s"}</span><strong>{money(total)}</strong></div>
          <button data-checkout-button disabled={loading || !sessionReady} onClick={checkout}>
            {loading ? "Preparing…" : paymentsEnabled ? "Checkout" : "Place order"}
          </button>
        </section>
      )}

      {message && <div className="storeToast" role="status">{message}</div>}

      {!selectedProduct && (
        <nav className="storeBottomNav" aria-label="Main navigation">
          {[
            ["home", "⌂", "Home"],
            ["categories", "▦", "Categories"],
            ["search", "⌕", "Search"],
            ["orders", "▣", "Orders"],
            ["profile", "♙", "Profile"]
          ].map(([value, icon, label]) => (
            <button
              type="button"
              key={value}
              className={activeTab === value ? "active" : ""}
              onClick={() => {
                setActiveTab(value as typeof activeTab);
                setSelectedProductId(null);
                if (value === "categories" && category === "all") setCategory("phone");
                window.Telegram?.WebApp.HapticFeedback?.selectionChanged();
              }}
            >
              <span>{icon}</span><small>{label}</small>
            </button>
          ))}
        </nav>
      )}

      <FloatingAiChat />
    </main>
    );
}
