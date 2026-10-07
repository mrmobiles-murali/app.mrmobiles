import { NextRequest } from "next/server";

const images: Record<string, string> = {
  "iphone-13-pro-128": "https://www.apple.com/newsroom/images/product/iphone/standard/Apple_iPhone-13-Pro_iPhone-13-Pro-Max_09142021_inline.jpg.slideshow-xlarge.jpg",
  "galaxy-s22-ultra-256": "https://images.unsplash.com/photo-1670885725673-b36d37cbfba0?auto=format&fit=crop&w=1200&q=86",
  "pixel-7-128": "https://images.unsplash.com/photo-1635434650834-575ad4b02f7e?auto=format&fit=crop&w=1200&q=84",
  "oneplus-11r-128": "https://images.unsplash.com/photo-1660311921380-c5c9001bd8bf?auto=format&fit=crop&w=1200&q=84",
  "phone": "https://images.unsplash.com/photo-1670885725673-b36d37cbfba0?auto=format&fit=crop&w=1200&q=84",
  "accessory": "https://images.unsplash.com/photo-1752729472749-5a02c4f4e0e7?auto=format&fit=crop&w=1200&q=84",
  "service": "https://images.pexels.com/photos/6755092/pexels-photo-6755092.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "hero": "https://images.unsplash.com/photo-1670885725673-b36d37cbfba0?auto=format&fit=crop&w=1600&q=88"
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = String(searchParams.get("id") || "").trim();
  const category = String(searchParams.get("category") || "phone").trim();
  const target = images[id] || images[category] || images.phone;

  try {
    const response = await fetch(target, {
      headers: {
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "user-agent": "MR-MOBILES-Showcase/1.0"
      },
      next: { revalidate: 86400 }
    });

    if (!response.ok || !String(response.headers.get("content-type") || "").startsWith("image/")) {
      return new Response("Image unavailable", { status: 502 });
    }

    const headers = new Headers();
    headers.set("content-type", response.headers.get("content-type") || "image/jpeg");
    headers.set("cache-control", "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400");
    headers.set("x-content-type-options", "nosniff");
    return new Response(response.body, { status: 200, headers });
  } catch {
    return new Response("Image unavailable", { status: 502 });
  }
}
