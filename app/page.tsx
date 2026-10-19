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

function imageFor(product: Product) {
  return "/api/showcase-image?id=" + encodeURIComponent(product.id) + "&category=" + encodeURIComponent(product.category);
}

function encodeCart(cart: Record<string, number>) {
  return Object.entries(cart)
    .filter(([, quantity]) => quantity > 0)
    .map(([productId, quantity]) => productId + "~" + Math.min(quantity, 5))
    .join(",");
}

const categoryLabels: Array<[SiteCategory, string]> = [
  ["all", "All stock"],
  ["phone", "Phones"],
  ["accessory", "Accessories"],
  ["service", "Services"]
];

export default function Home() {
  const [category, setCategory] = useState<SiteCategory>("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return catalog.filter((product) => {
      const matchesCategory = category === "all" || product.category === category;
      const searchable = [product.name, product.subtitle, product.brand, product.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return matchesCategory && (!term || searchable.includes(term));
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

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cartItems.reduce((sum, item) => sum + item.product.pricePaise * item.quantity, 0);
  const heroProduct = catalog.find((product) => product.id === "iphone-13-pro-128") || catalog[0];

  function addToCart(productId: string) {
    setCart((current) => ({
      ...current,
      [productId]: Math.min((current[productId] || 0) + 1, 5)
    }));
    setSelectedProduct(null);
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
    if (encoded) window.location.assign("/classic?website_cart=" + encodeURIComponent(encoded));
  }

  return (
    <main className="reframePage">
      <div className="reframeTopline">
        <div className="reframeContainer reframeToplineInner">
          <span>MR MOBILES / HOSUR</span>
          <span>LIVE STOCK · LOCAL SUPPORT · NO NONSENSE</span>
        </div>
      </div>

      <header className="reframeNav">
        <div className="reframeContainer reframeNavInner">
          <a className="reframeLogo" href="#top" aria-label="MR Mobiles home">
            <span className="reframeLogoBox">MR</span>
            <span><strong>MR MOBILES</strong><small>DEVICES / CARE / CONNECTION</small></span>
          </a>
          <nav className="reframeNavLinks" aria-label="Primary navigation">
            <a href="#stock">Stock</a>
            <a href="#services">Services</a>
            <a href="#why-mr">Why MR</a>
          </nav>
          <button className="reframeCartButton" type="button" onClick={() => setCartOpen(true)} aria-label={"Open cart with " + cartCount + " items"}>
            <span className="reframeCartDot">{cartCount}</span>
            Cart
          </button>
        </div>
      </header>

      <div id="top" className="reframeContainer">
        <section className="reframeHero" aria-labelledby="reframeHeroTitle">
          <div className="reframeHeroCopy">
            <div className="reframeEyebrow"><span /> The local device desk</div>
            <h1 id="reframeHeroTitle">THE NEXT<br /><em>MOVE</em> IS HERE.</h1>
            <p>Phones that earn their place. Accessories that do the job. Repairs that tell you exactly what happens next.</p>
            <div className="reframeActions">
              <a className="reframeButton reframeButtonSolid" href="#stock">See what&apos;s in</a>
              <a className="reframeButton reframeButtonGhost" href="/upgrade">Fix my device <span>↗</span></a>
            </div>
            <div className="reframeHeroMeta">
              <span><b>01</b> Live inventory</span>
              <span><b>02</b> Human diagnosis</span>
              <span><b>03</b> Telegram checkout</span>
            </div>
          </div>

          <div className="reframeHeroCard">
            <div className="reframeHeroCardTop"><span>FEATURED / 01</span><span>AVAILABLE NOW</span></div>
            <div className="reframeHeroImage"><img src={imageFor(heroProduct)} alt={heroProduct.name} /></div>
            <div className="reframeHeroProduct">
              <div><span>{heroProduct.brand || "MR MOBILES"} / PRE-OWNED</span><h2>{heroProduct.name}</h2></div>
              <strong>{money(heroProduct.pricePaise)}</strong>
            </div>
            <button className="reframeHeroLink" type="button" onClick={() => setSelectedProduct(heroProduct)}>Open product <span>↗</span></button>
            <div className="reframeStamp">HOSUR<br />635109</div>
          </div>
        </section>
      </div>

      <div className="reframeMarquee" aria-label="Store values">
        <div className="reframeMarqueeTrack">
          <span>BUY BETTER</span><b>✦</b><span>REPAIR SMARTER</span><b>✦</b><span>KEEP MOVING</span><b>✦</b>
          <span>BUY BETTER</span><b>✦</b><span>REPAIR SMARTER</span><b>✦</b><span>KEEP MOVING</span><b>✦</b>
        </div>
      </div>

      <section className="reframeSection" id="stock">
        <div className="reframeContainer">
          <div className="reframeSectionHead">
            <div><span className="reframeEyebrow">01 / The current floor</span><h2>Pick your<br /><em>daily driver.</em></h2></div>
            <p>Real products from the MR MOBILES rotation. Open a product for a closer look, then send your cart to Telegram.</p>
          </div>

          <div className="reframeControls">
            <div className="reframeTabs" role="tablist" aria-label="Stock categories">
              {categoryLabels.map(([value, label]) => (
                <button key={value} type="button" role="tab" aria-selected={category === value} className={category === value ? "active" : ""} onClick={() => setCategory(value)}>{label}</button>
              ))}
            </div>
            <label className="reframeSearch"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search model or brand" aria-label="Search stock" /></label>
          </div>

          <div className="reframeProducts">
            {filteredProducts.map((product, index) => (
              <article className="reframeProduct" key={product.id}>
                <button className="reframeProductVisual" type="button" onClick={() => setSelectedProduct(product)} aria-label={"View " + product.name}>
                  <span className="reframeProductIndex">{String(index + 1).padStart(2, "0")}</span>
                  <img src={imageFor(product)} alt={product.name} loading="lazy" />
                  <span className="reframeView">Quick view ↗</span>
                </button>
                <div className="reframeProductBody">
                  <div className="reframeProductMeta"><span>{product.brand || "MR MOBILES"}</span><span>{product.category}</span></div>
                  <h3>{product.name}</h3>
                  <div className="reframeProductBottom"><strong>{money(product.pricePaise)}</strong><button type="button" onClick={() => addToCart(product.id)} aria-label={"Add " + product.name + " to cart"}>+</button></div>
                </div>
              </article>
            ))}
            {!filteredProducts.length && <div className="reframeEmpty">No match on the floor. Try another model, brand or category.</div>}
          </div>
        </div>
      </section>

      <section className="reframeSection reframeDarkBand" id="services">
        <div className="reframeContainer">
          <div className="reframeSectionHead reframeLightHead">
            <div><span className="reframeEyebrow">02 / The service desk</span><h2>Keep your<br /><em>old one alive.</em></h2></div>
            <p>When the device is worth saving, we make the next step simple: diagnose, quote, repair, update.</p>
          </div>
          <div className="reframeServiceGrid">
            <a className="reframeServiceCard reframeServiceLead" href="/upgrade"><span>01 / REPAIR ENQUIRY</span><h3>Cracked screen?<br />Start here.</h3><p>Tell us what happened and get a clear next step from the team.</p><strong>Open the desk ↗</strong></a>
            <a className="reframeServiceCard" href="/upgrade"><span>02 / DEVICE CHECK</span><h3>Not sure what&apos;s wrong?</h3><p>We begin with an inspection before we talk numbers.</p><strong>Book inspection ↗</strong></a>
            <a className="reframeServiceCard" href="#stock"><span>03 / ACCESSORIES</span><h3>Make the setup better.</h3><p>Protection, power and practical upgrades for everyday use.</p><strong>Shop accessories ↗</strong></a>
          </div>
        </div>
      </section>

      <section className="reframeSection" id="why-mr">
        <div className="reframeContainer">
          <div className="reframeWhy">
            <div><span className="reframeEyebrow">03 / Why MR</span><h2>Less theatre.<br /><em>More clarity.</em></h2><p>We built the storefront around the things that matter after the scroll: a real device, a clear price and a human answer when you need one.</p></div>
            <div className="reframeSteps">
              <div><span>01</span><div><strong>See the stock</strong><p>Browse the current rotation without digging through noise.</p></div></div>
              <div><span>02</span><div><strong>Ask the right question</strong><p>Use repair support when buying isn&apos;t the right answer.</p></div></div>
              <div><span>03</span><div><strong>Move forward fast</strong><p>Send your selected cart to Telegram and continue securely.</p></div></div>
            </div>
          </div>
        </div>
      </section>

      <footer className="reframeFooter">
        <div className="reframeContainer reframeFooterGrid">
          <div><div className="reframeFooterMark">MR</div><h2>Keep moving.</h2><p>MR MOBILES · Tank Street, Hosur</p></div>
          <div className="reframeFooterLinks"><a href="#stock">Shop stock</a><a href="/upgrade">Repair desk</a><a href="mailto:contact@mrmobiles.in">Contact team</a></div>
          <div className="reframeFooterNote">Built for everyday devices.<br />Made for Hosur.</div>
        </div>
      </footer>

      {selectedProduct && (
        <div className="reframeModalBackdrop" role="presentation" onClick={() => setSelectedProduct(null)}>
          <section className="reframeModal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title" onClick={(event) => event.stopPropagation()}>
            <button className="reframeClose" type="button" onClick={() => setSelectedProduct(null)} aria-label="Close product details">×</button>
            <div className="reframeModalImage"><img src={imageFor(selectedProduct)} alt={selectedProduct.name} /></div>
            <div className="reframeModalCopy"><span className="reframeEyebrow">{selectedProduct.brand || "MR MOBILES"} / {selectedProduct.category}</span><h2 id="product-modal-title">{selectedProduct.name}</h2><p>{selectedProduct.subtitle}</p><strong>{money(selectedProduct.pricePaise)}</strong><button className="reframeButton reframeButtonSolid" type="button" onClick={() => addToCart(selectedProduct.id)}>Add to cart ↗</button></div>
          </section>
        </div>
      )}

      {cartOpen && (
        <>
          <button className="reframeDrawerBackdrop" type="button" aria-label="Close cart" onClick={() => setCartOpen(false)} />
          <aside className="reframeDrawer" aria-label="Shopping cart">
            <div className="reframeDrawerHead"><div><span className="reframeEyebrow">Your selection</span><h2>Cart / {cartCount}</h2></div><button className="reframeClose" type="button" onClick={() => setCartOpen(false)} aria-label="Close cart">×</button></div>
            <div className="reframeDrawerItems">
              {cartItems.length ? cartItems.map(({ product, quantity }) => (
                <div className="reframeDrawerItem" key={product.id}><img src={imageFor(product)} alt="" /><div><strong>{product.name}</strong><span>{money(product.pricePaise * quantity)}</span><div className="reframeQty"><button type="button" onClick={() => changeQuantity(product.id, -1)} aria-label="Decrease quantity">−</button><b>{quantity}</b><button type="button" onClick={() => changeQuantity(product.id, 1)} aria-label="Increase quantity">+</button></div></div></div>
              )) : <div className="reframeDrawerEmpty">Your cart is waiting.<br />Add something worth carrying.</div>}
            </div>
            <div className="reframeDrawerFoot"><div><span>Total</span><strong>{money(cartTotal)}</strong></div><button className="reframeButton reframeButtonSolid" type="button" disabled={!cartItems.length} onClick={checkout}>Continue in Telegram ↗</button></div>
          </aside>
        </>
      )}
    </main>
  );
}
