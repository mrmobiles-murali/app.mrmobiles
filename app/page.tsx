"use client";

import { useMemo, useState } from "react";
import { catalog, type Product } from "@/lib/catalog";

type SiteCategory = "all" | Product["category"];

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(paise / 100);
}

function productImage(product: Product) {
  return `/api/showcase-image?id=${encodeURIComponent(product.id)}&category=${encodeURIComponent(product.category)}`;
}

function encodeCart(cart: Record<string, number>) {
  return Object.entries(cart)
    .filter(([, quantity]) => quantity > 0)
    .map(([productId, quantity]) => `${productId}~${Math.min(quantity, 5)}`)
    .join(",");
}

export default function Home() {
  const [category, setCategory] = useState<SiteCategory>("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return catalog.filter((product) => {
      const matchesCategory = category === "all" || product.category === category;
      const matchesSearch = !term || [product.name, product.subtitle, product.brand, product.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
      return matchesCategory && matchesSearch;
    });
  }, [category, search]);

  const cartItems = useMemo(
    () => Object.entries(cart)
      .map(([productId, quantity]) => ({
        product: catalog.find((item) => item.id === productId),
        quantity
      }))
      .filter((item): item is { product: Product; quantity: number } => Boolean(item.product)),
    [cart]
  );

  const cartCount = cartItems.reduce((total, item) => total + item.quantity, 0);
  const cartTotal = cartItems.reduce((total, item) => total + item.product.pricePaise * item.quantity, 0);
  const heroProduct = catalog.find((product) => product.id === "iphone-13-pro-128") || catalog[0];

  function addToCart(productId: string) {
    setCart((current) => ({
      ...current,
      [productId]: Math.min((current[productId] || 0) + 1, 5)
    }));
    setCartOpen(true);
  }

  function changeQuantity(productId: string, delta: number) {
    setCart((current) => {
      const next = Math.max(0, Math.min(5, (current[productId] || 0) + delta));
      const copy = { ...current };
      if (next === 0) delete copy[productId];
      else copy[productId] = next;
      return copy;
    });
  }

  function checkout() {
    const encoded = encodeCart(cart);
    if (!encoded) return;
    window.location.assign(`/classic?website_cart=${encodeURIComponent(encoded)}`);
  }

  return (
    <main className="sitePage">
      <nav className="siteNav" aria-label="Primary navigation">
        <div className="siteNavInner">
          <a className="siteBrand" href="#top" aria-label="Mr Mobiles home">
            <span className="siteBrandMark">MR</span>
            <span><strong>MR MOBILES</strong><small>HOSUR · SMARTER BY DESIGN</small></span>
          </a>
          <div className="siteNavLinks">
            <a href="#shop">Shop</a>
            <a href="#service">Repairs</a>
            <a href="#why-us">Why us</a>
          </div>
          <button className="siteCartButton" type="button" onClick={() => setCartOpen(true)} aria-label={`Open cart with ${cartCount} items`}>
            Cart <span className="siteCartCount">{cartCount}</span>
          </button>
        </div>
      </nav>

      <div id="top" className="siteContainer">
        <section className="siteHero" aria-labelledby="hero-title">
          <div className="siteHeroCopy">
            <span className="siteKicker">Hosur's sharpest mobile store</span>
            <h1 id="hero-title">GOOD DEVICES.<br /><em>NO GAMES.</em></h1>
            <p className="siteHeroLead">Certified pre-owned phones, real condition checks and repairs that respect your time. Built for people who know what they want.</p>
            <div className="siteHeroActions">
              <a className="sitePrimaryButton" href="#shop">Shop the drop ↓</a>
              <a className="siteSecondaryButton" href="#service">Book a repair ↗</a>
            </div>
            <div className="siteHeroStats" id="why-us">
              <div><strong>01</strong><span>Condition checked</span></div>
              <div><strong>05</strong><span>Brands in rotation</span></div>
              <div><strong>∞</strong><span>Human support</span></div>
            </div>
          </div>
          <div className="siteHeroVisual">
            <img src={productImage(heroProduct)} alt={heroProduct.name} />
            <div className="siteHeroTag">Pro camera.<br />Premium build.<br />No nonsense.</div>
          </div>
        </section>
      </div>

      <div className="siteTicker" aria-label="Store highlights">
        <div className="siteTickerTrack">
          <span>Live stock</span><span>Certified devices</span><span>Hosur support</span><span>Fast checkout</span><span>Repair tracking</span>
          <span>Live stock</span><span>Certified devices</span><span>Hosur support</span><span>Fast checkout</span><span>Repair tracking</span>
        </div>
      </div>

      <section className="siteSection" id="shop">
        <div className="siteContainer">
          <div className="siteSectionHeader">
            <div><span className="siteSectionKicker">The current rotation</span><h2>Pick your<br />next daily driver.</h2></div>
            <p>Top brands, live stock and clean pricing. Tap a product to add it fast.</p>
          </div>

          <div className="siteShopTools">
            <div className="siteFilters" role="tablist" aria-label="Filter products">
              {([
                ["all", "Everything"],
                ["phone", "Mobiles"],
                ["accessory", "Accessories"],
                ["service", "Services"]
              ] as const).map(([value, label]) => (
                <button key={value} type="button" role="tab" aria-selected={category === value} className={`siteFilter ${category === value ? "active" : ""}`} onClick={() => setCategory(value)}>
                  {label}
                </button>
              ))}
            </div>
            <label className="siteSearch">
              <span aria-hidden="true">⌕</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search models, brands..." aria-label="Search products" />
            </label>
          </div>

          <div className="siteProductGrid">
            {filteredProducts.map((product) => (
              <article className="siteProductCard" key={product.id}>
                <div className="siteProductImage"><img src={productImage(product)} alt={product.name} loading="lazy" /></div>
                <div className="siteProductBody">
                  <div className="siteProductMeta"><span>{product.brand || "MR Mobiles"}</span><span>{product.category}</span></div>
                  <h3>{product.name}</h3>
                  <div className="siteProductBottom">
                    <strong>{money(product.pricePaise)}</strong>
                    <button className="siteAddButton" type="button" aria-label={`Add ${product.name} to cart`} onClick={() => addToCart(product.id)}>+</button>
                  </div>
                </div>
              </article>
            ))}
            {!filteredProducts.length && <div className="siteEmpty">Nothing in this rotation. Try a different search.</div>}
          </div>
        </div>
      </section>

      <section className="siteSection" id="service">
        <div className="siteContainer">
          <div className="siteRepair">
            <div className="siteRepairCopy">
              <span className="siteSectionKicker">Repair, without the runaround</span>
              <h2>Cracked screen?<br />We have a plan.</h2>
              <p>Start with a proper inspection. Get a clear quote. Track what happens next inside Telegram. No vague timelines, no mystery charges.</p>
              <div className="siteHeroActions">
                <a className="sitePrimaryButton" href="/upgrade">Start a repair enquiry ↗</a>
                <a className="siteSecondaryButton" href="#shop">Browse devices</a>
              </div>
            </div>
            <div className="siteRepairPanel">
              <strong>Every repair includes</strong>
              <ul className="siteRepairList">
                <li>Human diagnosis before quote</li>
                <li>Clear status updates</li>
                <li>Secure online payment</li>
                <li>Support after pickup</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <footer className="siteFooter">
        <div className="siteContainer siteFooterInner">
          <p>© {new Date().getFullYear()} MR MOBILES · Tank Street, Hosur</p>
          <div className="siteFooterLinks"><a href="#shop">Shop</a><a href="/upgrade">Repairs</a><a href="mailto:contact@mrmobiles.in">Contact</a></div>
        </div>
      </footer>

      {cartOpen && (
        <>
          <button className="siteCartDrawerBackdrop" type="button" aria-label="Close cart" onClick={() => setCartOpen(false)} />
          <aside className="siteCartDrawer" aria-label="Shopping cart">
            <div className="siteCartDrawerHeader"><h2>Your cart</h2><button className="siteCloseButton" type="button" onClick={() => setCartOpen(false)} aria-label="Close cart">×</button></div>
            <div className="siteCartItems">
              {cartItems.length ? cartItems.map(({ product, quantity }) => (
                <div className="siteCartItem" key={product.id}>
                  <img src={productImage(product)} alt="" />
                  <div className="siteCartItemInfo">
                    <strong>{product.name}</strong>
                    <span>{money(product.pricePaise * quantity)}</span>
                    <div className="siteQty"><button type="button" onClick={() => changeQuantity(product.id, -1)} aria-label={`Decrease ${product.name} quantity`}>−</button><span>{quantity}</span><button type="button" onClick={() => changeQuantity(product.id, 1)} aria-label={`Increase ${product.name} quantity`}>+</button></div>
                  </div>
                </div>
              )) : <div className="siteCartEmpty">Your cart is ready when you are.</div>}
            </div>
            <div className="siteCartTotal"><span>Total</span><strong>{money(cartTotal)}</strong></div>
            <button className="siteCheckoutButton" type="button" disabled={!cartItems.length} onClick={checkout}>Continue in Telegram ↗</button>
          </aside>
        </>
      )}
    </main>
  );
}
