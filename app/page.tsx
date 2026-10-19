"use client";
import { useEffect } from "react";
export default function Home() {
  useEffect(() => {
    // Keep Telegram launch data in the URL hash across the new storefront entry.
    window.location.replace("/liquid-store.html" + window.location.search + window.location.hash);
  }, []);
  return <main style={{minHeight:"100dvh",background:"#06070b",color:"#f1f5f9",display:"grid",placeItems:"center"}}>Opening MR MOBILES Store…</main>;
}
