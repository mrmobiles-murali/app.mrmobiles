import { ImageResponse } from "next/og";

export const runtime = "edge";

function clean(value: string | null, max = 8) {
  return (value || "").replace(/[<>]/g, "").slice(0, max);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const emoji = clean(url.searchParams.get("emoji")) || "📱";

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
          background: "linear-gradient(145deg, #11161d 0%, #090c10 58%, #172129 100%)",
          color: "white"
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 360,
            height: 360,
            left: -80,
            top: -120,
            borderRadius: 999,
            background: "rgba(255,138,61,.20)",
            filter: "blur(18px)"
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 300,
            height: 300,
            right: -120,
            bottom: -150,
            borderRadius: 999,
            background: "rgba(33,167,183,.18)",
            filter: "blur(20px)"
          }}
        />
        <div
          style={{
            width: 190,
            height: 190,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid rgba(255,255,255,.08)",
            borderRadius: 48,
            background: "rgba(255,255,255,.035)",
            boxShadow: "0 30px 80px rgba(0,0,0,.38)",
            fontSize: 104
          }}
        >
          {emoji}
        </div>
        <div
          style={{
            position: "absolute",
            left: 34,
            bottom: 28,
            display: "flex",
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 1.6,
            color: "rgba(255,255,255,.72)"
          }}
        >
          MR MOBILES
        </div>
      </div>
    ),
    {
      width: 640,
      height: 360,
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300"
      }
    }
  );
}
