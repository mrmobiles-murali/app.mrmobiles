"use client";
import { useEffect } from "react";
export default function Home() {
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
    const repairDeepLinkMatch = typeof startParam === "string"
      ? startParam.match(/^repair_(MRR-[A-F0-9]{10})$/i)
      : null;
    if (repairDeepLinkMatch) {
      setRepairPaymentRef(repairDeepLinkMatch[1].toUpperCase());
      setRepairsOpen(true);
    }
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
      const accent = isLight ? "#b74725" : "#ffab85";
      const accentText = isLight ? "#ffffff" : "#291109";

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
    // Keep Telegram launch data in the URL hash across the new storefront entry.
    window.location.replace("/liquid-store.html" + window.location.search + window.location.hash);
  }, []);
  return <main style={{minHeight:"100dvh",background:"#06070b",color:"#f1f5f9",display:"grid",placeItems:"center"}}>Opening MR MOBILES Store…</main>;
}
