import { ImageResponse } from "next/og";

export const runtime = "edge";

function clean(value: string | null, max = 64) {
  return (value || "").replace(/[^A-Za-z0-9_\-📱🛡️⚡🛠️🎧⌚🔊🔌]/g, "").slice(0, max);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const category = clean(url.searchParams.get("category"), 16) || "accessory";
  const emoji = clean(url.searchParams.get("emoji"), 8) || (category === "phone" ? "📱" : "⚡");
  const variant = Math.max(0, Math.min(5, Number(url.searchParams.get("variant")) || 0));

  const palettes = [
    ["#0a0d12", "#1d2430", "#ff8a3d", "#2d6470"],
    ["#090b0f", "#17131f", "#ffb35f", "#4c365f"],
    ["#0a1010", "#162523", "#ff8a3d", "#2f7d72"],
    ["#0b0d12", "#1c2030", "#ff9b54", "#334f84"],
    ["#0d0b0b", "#251b18", "#ff8a3d", "#7b4b2f"],
    ["#090d10", "#14252a", "#ffb36b", "#2f6d7b"]
  ] as const;
  const [bg, panel, accent, glow] = palettes[variant];

  const phone = category === "phone";
  const service = category === "service";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          background: `linear-gradient(145deg, ${bg} 0%, ${panel} 62%, ${bg} 100%)`,
          color: "white"
        }}
      >
        <div style={{
          position: "absolute",
          width: 390,
          height: 390,
          left: -120,
          top: -150,
          borderRadius: 999,
          background: accent,
          opacity: .18,
          filter: "blur(28px)"
        }} />
        <div style={{
          position: "absolute",
          width: 330,
          height: 330,
          right: -130,
          bottom: -150,
          borderRadius: 999,
          background: glow,
          opacity: .28,
          filter: "blur(26px)"
        }} />

        {phone ? (
          <div style={{
            width: 170,
            height: 286,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "3px solid rgba(255,255,255,.22)",
            borderRadius: 34,
            background: "linear-gradient(155deg, rgba(255,255,255,.12), rgba(255,255,255,.025))",
            boxShadow: "0 32px 80px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.16)",
            transform: `rotate(${variant % 2 === 0 ? "-6deg" : "6deg"})`,
            fontSize: 74
          }}>{emoji}</div>
        ) : (
          <div style={{
            width: service ? 200 : 220,
            height: service ? 200 : 220,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid rgba(255,255,255,.12)",
            borderRadius: service ? 56 : 999,
            background: "rgba(255,255,255,.055)",
            boxShadow: "0 30px 70px rgba(0,0,0,.40), inset 0 1px 0 rgba(255,255,255,.08)",
            fontSize: service ? 92 : 104
          }}>{emoji}</div>
        )}

        <div style={{
          position: "absolute",
          left: 28,
          bottom: 24,
          display: "flex",
          alignItems: "center",
          gap: 10
        }}>
          <div style={{ width: 8, height: 8, borderRadius: 99, background: accent }} />
          <div style={{
            display: "flex",
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: 2.2,
            color: "rgba(255,255,255,.68)"
          }}>MR MOBILES</div>
        </div>
      </div>
    ),
    {
      width: 640,
      height: 360,
      headers: {
        "Cache-Control": "public, max-age=86400, immutable"
      }
    }
  );
}
