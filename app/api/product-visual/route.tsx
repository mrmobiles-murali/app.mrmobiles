export const runtime = "edge";

function clean(value: string | null, max = 64) {
  return (value || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, max);
}

function deviceArt(id: string, category: string, variant: number) {
  const tilt = variant % 2 === 0 ? -5 : 5;

  if (id.includes("iphone-13-pro")) {
    return `
      <g transform="translate(320 180) rotate(${tilt}) translate(-320 -180)">
        <rect x="242" y="48" width="156" height="264" rx="30" fill="#1b2028" stroke="#d9dee7" stroke-width="4"/>
        <rect x="254" y="60" width="132" height="240" rx="23" fill="url(#screen)"/>
        <rect x="267" y="72" width="58" height="58" rx="15" fill="#20252d" stroke="#798392"/>
        <circle cx="282" cy="87" r="10" fill="#0a0d12" stroke="#b9c1cc"/>
        <circle cx="309" cy="87" r="10" fill="#0a0d12" stroke="#b9c1cc"/>
        <circle cx="295" cy="113" r="10" fill="#0a0d12" stroke="#b9c1cc"/>
        <circle cx="318" cy="111" r="4" fill="#ffd56a"/>
      </g>`;
  }

  if (id.includes("iphone-12") || id.includes("iphone-11")) {
    return `
      <g transform="translate(320 180) rotate(${tilt}) translate(-320 -180)">
        <rect x="244" y="52" width="152" height="256" rx="28" fill="#1d232b" stroke="#d9dee7" stroke-width="4"/>
        <rect x="255" y="63" width="130" height="234" rx="22" fill="url(#screen)"/>
        <rect x="267" y="75" width="50" height="50" rx="14" fill="#20252d" stroke="#798392"/>
        <circle cx="281" cy="89" r="10" fill="#0a0d12" stroke="#b9c1cc"/>
        <circle cx="303" cy="111" r="10" fill="#0a0d12" stroke="#b9c1cc"/>
      </g>`;
  }

  if (id.includes("galaxy-s22-ultra")) {
    return `
      <g transform="translate(320 180) rotate(${tilt}) translate(-320 -180)">
        <rect x="244" y="48" width="152" height="264" rx="20" fill="#171c22" stroke="#d9dee7" stroke-width="4"/>
        <rect x="254" y="58" width="132" height="244" rx="15" fill="url(#screen2)"/>
        <circle cx="275" cy="83" r="11" fill="#090c10" stroke="#bdc5cf"/>
        <circle cx="275" cy="112" r="11" fill="#090c10" stroke="#bdc5cf"/>
        <circle cx="304" cy="83" r="8" fill="#090c10" stroke="#bdc5cf"/>
        <circle cx="304" cy="108" r="8" fill="#090c10" stroke="#bdc5cf"/>
      </g>`;
  }

  if (id.includes("pixel-7")) {
    return `
      <g transform="translate(320 180) rotate(${tilt}) translate(-320 -180)">
        <rect x="246" y="50" width="148" height="260" rx="28" fill="#20252b" stroke="#d7dde5" stroke-width="4"/>
        <rect x="256" y="61" width="128" height="238" rx="21" fill="url(#screen3)"/>
        <rect x="258" y="82" width="124" height="34" rx="12" fill="#383f49"/>
        <circle cx="286" cy="99" r="10" fill="#080b0e" stroke="#c2c9d2"/>
        <circle cx="338" cy="99" r="10" fill="#080b0e" stroke="#c2c9d2"/>
      </g>`;
  }

  if (id.includes("oneplus-11r")) {
    return `
      <g transform="translate(320 180) rotate(${tilt}) translate(-320 -180)">
        <rect x="246" y="50" width="148" height="260" rx="28" fill="#1a1f25" stroke="#d8dee6" stroke-width="4"/>
        <rect x="256" y="61" width="128" height="238" rx="21" fill="url(#screen4)"/>
        <circle cx="291" cy="100" r="34" fill="#2a3038" stroke="#9099a7"/>
        <circle cx="281" cy="91" r="8" fill="#07090c" stroke="#c5ccd5"/>
        <circle cx="301" cy="91" r="8" fill="#07090c" stroke="#c5ccd5"/>
        <circle cx="291" cy="111" r="8" fill="#07090c" stroke="#c5ccd5"/>
      </g>`;
  }

  if (id.includes("magnetic-case")) {
    return `
      <g transform="translate(320 180) rotate(${tilt}) translate(-320 -180)">
        <rect x="238" y="45" width="164" height="270" rx="32" fill="none" stroke="#d9dee7" stroke-width="10"/>
        <circle cx="320" cy="182" r="48" fill="none" stroke="#ff9a57" stroke-width="8"/>
        <line x1="320" y1="230" x2="320" y2="268" stroke="#ff9a57" stroke-width="8" stroke-linecap="round"/>
        <rect x="255" y="65" width="54" height="54" rx="14" fill="none" stroke="#9aa5b3" stroke-width="6"/>
      </g>`;
  }

  if (id.includes("charger")) {
    return `
      <g transform="translate(320 180) rotate(${tilt}) translate(-320 -180)">
        <rect x="245" y="95" width="150" height="150" rx="30" fill="#f2f4f7" stroke="#c3cad4" stroke-width="4"/>
        <rect x="285" y="130" width="70" height="38" rx="10" fill="#171b21"/>
        <rect x="297" y="140" width="18" height="18" rx="4" fill="#ff8a3d"/>
        <rect x="326" y="140" width="18" height="18" rx="4" fill="#ff8a3d"/>
        <rect x="277" y="245" width="18" height="54" rx="8" fill="#d3d8df"/>
        <rect x="345" y="245" width="18" height="54" rx="8" fill="#d3d8df"/>
      </g>`;
  }

  if (category === "service") {
    return `
      <g transform="translate(320 180) rotate(${tilt}) translate(-320 -180)">
        <circle cx="320" cy="180" r="94" fill="#171d23" stroke="#76808d" stroke-width="3"/>
        <path d="M278 224 L356 146" stroke="#ff9a57" stroke-width="18" stroke-linecap="round"/>
        <circle cx="366" cy="136" r="28" fill="none" stroke="#ff9a57" stroke-width="14"/>
        <path d="M267 130 L304 167" stroke="#d9dee7" stroke-width="14" stroke-linecap="round"/>
        <path d="M258 121 L278 101" stroke="#d9dee7" stroke-width="14" stroke-linecap="round"/>
      </g>`;
  }

  return `
    <g transform="translate(320 180) rotate(${tilt}) translate(-320 -180)">
      <rect x="240" y="80" width="160" height="200" rx="38" fill="#1b2027" stroke="#d9dee7" stroke-width="4"/>
      <circle cx="320" cy="180" r="54" fill="none" stroke="#ff9a57" stroke-width="8"/>
      <circle cx="320" cy="180" r="16" fill="#ff9a57"/>
    </g>`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = clean(url.searchParams.get("id")) || "product";
  const category = clean(url.searchParams.get("category"), 16) || "accessory";
  const variant = Math.max(0, Math.min(5, Number(url.searchParams.get("variant")) || 0));

  const palettes = [
    ["#0a0d12", "#17202a", "#ff8a3d", "#254c59"],
    ["#0a0c10", "#211925", "#ffad66", "#4f365e"],
    ["#09100f", "#152721", "#ff8a3d", "#2e7167"],
    ["#0b0d12", "#182039", "#ff9d5b", "#324e82"],
    ["#0d0b0b", "#2a1b16", "#ff8a3d", "#75412d"],
    ["#090d10", "#13272c", "#ffb06a", "#2e6b79"]
  ] as const;

  const [bg, panel, accent, glow] = palettes[variant];
  const art = deviceArt(id, category, variant);

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
    <defs>
      <linearGradient id="screen" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#28384d"/>
        <stop offset="1" stop-color="#11151b"/>
      </linearGradient>
      <linearGradient id="screen2" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#28515f"/>
        <stop offset="1" stop-color="#11161c"/>
      </linearGradient>
      <linearGradient id="screen3" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#40364f"/>
        <stop offset="1" stop-color="#12161b"/>
      </linearGradient>
      <linearGradient id="screen4" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#314c42"/>
        <stop offset="1" stop-color="#12161b"/>
      </linearGradient>
      <radialGradient id="bgGlow" cx="22%" cy="18%" r="68%">
        <stop offset="0" stop-color="${accent}" stop-opacity=".20"/>
        <stop offset=".58" stop-color="${panel}" stop-opacity=".18"/>
        <stop offset="1" stop-color="${bg}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="bgGlow2" cx="84%" cy="82%" r="58%">
        <stop offset="0" stop-color="${glow}" stop-opacity=".34"/>
        <stop offset="1" stop-color="${bg}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="640" height="360" fill="${bg}"/>
    <rect width="640" height="360" fill="url(#bgGlow)"/>
    <rect width="640" height="360" fill="url(#bgGlow2)"/>
    <ellipse cx="320" cy="306" rx="120" ry="22" fill="#000" opacity=".32"/>
    ${art}
    <circle cx="34" cy="326" r="5" fill="${accent}"/>
    <rect x="49" y="321" width="104" height="10" rx="5" fill="#e9edf3" opacity=".56"/>
  </svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, immutable"
    }
  });
}
