export type OfflineChannel = "telegram" | "website";

export type OfflineProduct = {
  id: string;
  name: string;
  subtitle: string;
  pricePaise: number;
  category: "phone" | "accessory" | "service";
  brand?: string | null;
  model?: string | null;
  stockQty?: number | null;
  searchAliases?: string[];
};

export type OfflineIntent =
  | "greeting"
  | "capabilities"
  | "repair"
  | "product_search"
  | "compare"
  | "order"
  | "payment"
  | "warranty"
  | "human"
  | "unknown";

export type OfflineDecision = {
  handled: boolean;
  confidence: number;
  intent: OfflineIntent;
  text: string;
  products: OfflineProduct[];
};

const STOP_WORDS = new Set([
  "a","an","and","are","as","at","be","can","do","for","from","how","i","in","is","it","me","my",
  "of","on","or","please","the","this","to","want","what","with","you","your","help","mr","mobiles",
  "mobile","phone","phones","device","devices","show","give","need","looking","find","have","has",
  "iruku","iruka","venum","vena","enaku","ennoda","oru","enna","epdi","machi","machan","mapla","da"
]);

const PRODUCT_WORDS = [
  "buy","purchase","price","cost","stock","available","availability","budget","under","below","within",
  "iphone","samsung","galaxy","oneplus","pixel","android","ios","128gb","256gb","64gb","charger","case",
  "accessory","accessories"
];

const REPAIR_WORDS = [
  "repair","service","fix","broken","damage","damaged","screen","display","touch","battery","charging",
  "charge","charger","port","water","liquid","network","signal","speaker","mic","microphone","camera",
  "boot","restart","overheat","heating","software","frp","unlock","dead","not working","issue","problem",
  "replace","replacement"
];

const ORDER_WORDS = ["order","track","tracking","delivery","delivered","dispatch","shipment","receipt"];
const PAYMENT_WORDS = ["payment","paid","pay","refund","failed","razorpay","upi","card"];
const WARRANTY_WORDS = ["warranty","guarantee","coverage","covered"];
const HUMAN_WORDS = ["human","person","staff","team","agent","technician","call me","contact","support"];
const CAPABILITY_PATTERNS = [
  /what can (?:you|mr mobiles) (?:do|help)/i,
  /how can (?:you|mr mobiles) help/i,
  /what do you do/i,
  /what services/i,
  /enna help/i,
  /enna panna mudiyum/i,
  /neenga enna pannuveenga/i,
  /mr mobiles.*help/i
];

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/₹/g, " rs ")
    .replace(/[^a-z0-9.+\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(value: string) {
  return normalize(value).split(" ").filter(Boolean);
}

function hasAny(text: string, values: string[]) {
  return values.some((value) => text.includes(value));
}

function usefulTerms(value: string) {
  return words(value).filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

function formatInr(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(paise / 100);
}

export function extractOfflineBudgetPaise(message: string): number | null {
  const compact = message.match(/(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:\.\d+)?)\s*k\b/i);
  if (compact) return Math.round(Number(compact[1]) * 1000 * 100);

  const explicit = message.match(
    /(?:₹|rs\.?|inr|budget|under|below|within|less than|upto|up to)\s*[:=-]?\s*([\d,]{4,7})/i
  );
  if (!explicit) return null;
  const rupees = Number(explicit[1].replace(/,/g, ""));
  return Number.isFinite(rupees) && rupees > 0 ? Math.round(rupees * 100) : null;
}

function scoreProduct(query: string, product: OfflineProduct) {
  const normalized = normalize(query);
  const terms = usefulTerms(query);
  const name = normalize(product.name);
  const brand = normalize(product.brand || "");
  const model = normalize(product.model || "");
  const aliases = (product.searchAliases || []).map(normalize);
  const haystack = normalize([
    product.name,
    product.brand || "",
    product.model || "",
    product.subtitle,
    product.id,
    ...(product.searchAliases || [])
  ].join(" "));

  let score = 0;
  if (name && normalized.includes(name)) score += 12;
  if (brand && normalized.includes(brand)) score += 7;
  if (model && normalized.includes(model)) score += 9;
  for (const alias of aliases) {
    if (alias && normalized.includes(alias)) score += 5;
  }
  for (const term of terms) {
    if (name.split(" ").includes(term)) score += 3;
    else if (brand.split(" ").includes(term) || model.split(" ").includes(term)) score += 3;
    else if (haystack.includes(term)) score += 1;
  }
  return score;
}

export function rankOfflineProducts(message: string, products: OfflineProduct[]) {
  const budget = extractOfflineBudgetPaise(message);
  const normalized = normalize(message);
  const wantsAccessory = /charger|case|cable|accessor/.test(normalized);
  const wantsPhone = /iphone|samsung|galaxy|oneplus|pixel|android|ios|phone|mobile|budget|under|below|within|buy|price|stock/.test(normalized)
    && !hasAny(normalized, REPAIR_WORDS);

  return products
    .filter((product) => {
      if (budget && product.pricePaise > budget) return false;
      if (wantsAccessory) return product.category === "accessory";
      if (wantsPhone) return product.category === "phone";
      return product.category !== "service";
    })
    .map((product) => ({ product, score: scoreProduct(message, product) }))
    .filter(({ score }) => score > 0 || Boolean(budget))
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (budget) return b.product.pricePaise - a.product.pricePaise;
      return a.product.name.localeCompare(b.product.name);
    })
    .slice(0, 5)
    .map(({ product }) => product);
}

export function classifyOfflineIntent(message: string): { intent: OfflineIntent; confidence: number } {
  const text = normalize(message);

  if (!text) return { intent: "unknown", confidence: 0 };
  if (CAPABILITY_PATTERNS.some((pattern) => pattern.test(message))) {
    return { intent: "capabilities", confidence: 0.99 };
  }
  if (/^(hi|hello|hey|vanakkam|hai|helo|yo)\b/.test(text) && words(text).length <= 5) {
    return { intent: "greeting", confidence: 0.98 };
  }
  if (hasAny(text, HUMAN_WORDS)) return { intent: "human", confidence: 0.96 };
  if (hasAny(text, PAYMENT_WORDS)) return { intent: "payment", confidence: 0.96 };
  if (hasAny(text, ORDER_WORDS)) return { intent: "order", confidence: 0.95 };
  if (hasAny(text, WARRANTY_WORDS)) return { intent: "warranty", confidence: 0.94 };

  const repairHits = REPAIR_WORDS.reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0);
  const productHits = PRODUCT_WORDS.reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0);
  const compare = /compare|difference|vs\b|versus|which is better/i.test(message);

  if (repairHits > 0) {
    return { intent: "repair", confidence: Math.min(0.99, 0.82 + repairHits * 0.04) };
  }
  if (compare && productHits > 0) return { intent: "compare", confidence: 0.93 };
  if (productHits > 0 || extractOfflineBudgetPaise(message)) {
    return { intent: "product_search", confidence: 0.9 };
  }

  return { intent: "unknown", confidence: 0.25 };
}

function repairAnswer(message: string) {
  const text = normalize(message);

  if (/water|liquid|wet/.test(text)) {
    return "💧 Liquid/water issue-na phone-a switch off pannunga; charge panna vendam. Exact model + enna liquid exposure + phone ippo on aagudha nu sollunga. Mr Mobiles technician inspection dhaan final diagnosis/price confirm pannum.";
  }
  if (/battery|drain|swelling|shutdown|power off/.test(text)) {
    return "🔋 Battery issue-ku exact model + fast drain / sudden shutdown / swelling / charging slow nu which symptom nu sollunga. Swelling irundha use/charge pannama safe-aa keep pannunga. Battery/charging system inspect pannitu final quote confirm pannuvom.";
  }
  if (/screen|display|touch|glass|flicker|green line|black screen/.test(text)) {
    return "📱 Display/touch issue-ku exact brand + model sollunga. Screen visible-aa? touch full-aa work aagudha? crack/line/flicker iruka? Intha details base panni correct inspection path set pannalam; final part/price technician confirm pannuvanga.";
  }
  if (/charging|charge|port|usb|type c|type-c/.test(text)) {
    return "⚡ Charging issue-na exact model + charger connect panna response varudha + cable/adapter change panni test pannitingala + port loose/intermittent-aa nu sollunga. Port, battery, charging circuit possibilities irukkum; inspection dhaan exact fault confirm pannum.";
  }
  if (/network|signal|sim|no service|wifi|bluetooth/.test(text)) {
    return "📶 Network/connectivity issue-ku exact model + SIM/network/Wi-Fi/Bluetooth la edhu problem nu sollunga. Settings/SIM side-aa hardware antenna/board side-aa nu inspection-la separate pannalam.";
  }
  if (/boot|restart|logo|dead|not turning|power/.test(text)) {
    return "🧩 Boot/power issue-ku exact model + phone logo vara vara restart aagudha, vibration/charging symbol varudha, recent drop/water/software update irundhucha nu sollunga. Final diagnosis board/battery/software inspection-ku apram confirm pannuvom.";
  }
  if (/speaker|mic|microphone|earpiece|audio/.test(text)) {
    return "🔊 Audio issue-ku exact model + speaker / earpiece / microphone la edhu fail aaguthu nu sollunga. Calls, media, voice recorder la same issue varudha nu check panna diagnosis fast aagum.";
  }
  if (/camera|focus|lens/.test(text)) {
    return "📷 Camera issue-ku exact model + front/rear camera + blur/focus/shake/black screen/error la edhu symptom nu sollunga. Physical lens damage iruka nu kooda mention pannunga.";
  }
  if (/frp|unlock|account lock|google lock/.test(text)) {
    return "🔐 FRP/account-unlock help ownership-sensitive service. Exact brand/model and proof-of-ownership availability sollunga; Mr Mobiles team eligibility check pannitu safe next step confirm pannuvanga.";
  }

  return "🛠️ Repair-ku help pannuren. Brand + exact model + problem symptom 1 line-la sollunga — example: Samsung A17 5G, touch not working. Athukapram correct troubleshooting/inspection path kudukren. Final diagnosis & repair price technician inspection-ku apram dhaan.";
}

function productAnswer(products: OfflineProduct[]) {
  if (!products.length) {
    return "🔎 Unga exact requirement-ku current live list-la confident match kidaikkala. Brand/model or budget sollunga; wrong product guess panna maaten. Live stock/condition Mr Mobiles team confirm pannuvanga.";
  }

  const lines = products.slice(0, 3).map((product, index) => {
    const stock = typeof product.stockQty === "number"
      ? product.stockQty > 0 ? String(product.stockQty) + " in stock" : "out of stock"
      : "stock confirm";
    return String(index + 1) + ". " + product.name + " — " + formatInr(product.pricePaise) + " • " + stock;
  });

  return "📱 Best live matches:\n" + lines.join("\n") + "\nExact condition/battery health unit-wise confirm pannitu order pannunga.";
}

function compareAnswer(products: OfflineProduct[]) {
  if (products.length < 2) {
    return "⚖️ Compare panna rendu exact model names sollunga. Naan live price/stock/known listing details mattum compare pannuren; unknown specs invent panna maaten.";
  }
  const a = products[0];
  const b = products[1];
  const stock = (p: OfflineProduct) => typeof p.stockQty === "number" ? String(p.stockQty) + " in stock" : "stock confirm";
  return [
    "⚖️ Live Mr Mobiles comparison:",
    a.name + ": " + formatInr(a.pricePaise) + " • " + stock(a),
    b.name + ": " + formatInr(b.pricePaise) + " • " + stock(b),
    "Performance/camera/battery spec details listing context-la illa na guess panna maaten; exact models kudutha grounded comparison continue pannalam."
  ].join("\n");
}

export function answerOfflineBusinessQuestion(
  message: string,
  products: OfflineProduct[],
  channel: OfflineChannel = "website"
): OfflineDecision {
  const classified = classifyOfflineIntent(message);
  const ranked = rankOfflineProducts(message, products);

  switch (classified.intent) {
    case "greeting":
      return {
        handled: true,
        confidence: classified.confidence,
        intent: classified.intent,
        products: [],
        text: "👋 Hi! Mr Mobiles AI ready. Phone vaanga, live price/stock check, repair troubleshooting, order/payment help — edhu venumo direct-aa kelunga."
      };
    case "capabilities":
      return {
        handled: true,
        confidence: classified.confidence,
        intent: classified.intent,
        products: [],
        text: "🤖 Naan Mr Mobiles local business assistant. Live phone/accessory price & stock, budget suggestions, repair symptom triage, order/payment guidance, warranty questions, and technician handoff handle pannuren. Exact data illa na guess panna maaten — confirm panna solluven."
      };
    case "repair":
      return {
        handled: true,
        confidence: classified.confidence,
        intent: classified.intent,
        products: [],
        text: repairAnswer(message)
      };
    case "product_search":
      return {
        handled: true,
        confidence: classified.confidence,
        intent: classified.intent,
        products: ranked.slice(0, 3),
        text: productAnswer(ranked)
      };
    case "compare":
      return {
        handled: true,
        confidence: classified.confidence,
        intent: classified.intent,
        products: ranked.slice(0, 3),
        text: compareAnswer(ranked)
      };
    case "order":
      return {
        handled: true,
        confidence: classified.confidence,
        intent: classified.intent,
        products: [],
        text: channel === "website"
          ? "🧾 Order tracking private account data. Talk to Mr Mobiles Team tap panni Telegram-la secure-aa continue pannunga; order/receipt details angaye verify pannalam."
          : "🧾 Recent authenticated orders check panna /orders use pannunga; specific order issue-na order/receipt code share pannunga."
      };
    case "payment":
      return {
        handled: true,
        confidence: classified.confidence,
        intent: classified.intent,
        products: [],
        text: channel === "website"
          ? "💳 Payment issue-na OTP/card PIN/CVV share panna vendam. Payment failed/pending/success screen enna show aaguthu nu sollunga; private order verification-ku Telegram team handoff use pannunga."
          : "💳 Payment status secure order data-la verify pannalam. OTP/card PIN/CVV share panna vendam; order/receipt reference mattum use pannunga."
      };
    case "warranty":
      return {
        handled: true,
        confidence: classified.confidence,
        intent: classified.intent,
        products: [],
        text: "🛡️ Warranty product/repair-specific. Exact phone/repair reference sollunga; invoice/quotation-la applicable coverage and dates dhaan authoritative. Generic-aa fixed coverage invent panna maaten."
      };
    case "human":
      return {
        handled: true,
        confidence: classified.confidence,
        intent: classified.intent,
        products: [],
        text: "👨‍🔧 Sure — Talk to Mr Mobiles Team button tap pannunga. Unga current issue-ai technician side-ku continue pannalam."
      };
    default:
      return {
        handled: false,
        confidence: classified.confidence,
        intent: "unknown",
        products: [],
        text: ""
      };
  }
}
