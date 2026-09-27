import { ImageResponse } from "next/og";

export const runtime = "edge";

function clean(value: string | null, max = 80) {
  return (value || "").replace(/[<>]/g, "").slice(0, max);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = clean(url.searchParams.get("name")) || "Mr Mobiles";
  const price = clean(url.searchParams.get("price"), 40);
  const stock = clean(url.searchParams.get("stock"), 50);
  const emoji = clean(url.searchParams.get("emoji"), 8) || "📱";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 44,
          background: "linear-gradient(135deg, #0b0d10 0%, #151a21 55%, #0f766e 140%)",
          color: "white",
          fontFamily: "sans-serif"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: 1 }}>Mr Mobiles</div>
          <div style={{ fontSize: 56 }}>{emoji}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.1 }}>{name}</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{price}</div>
          <div style={{ fontSize: 18, opacity: 0.8 }}>{stock}</div>
        </div>
      </div>
    ),
    {
      width: 640,
      height: 360,
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600"
      }
    }
  );
}
