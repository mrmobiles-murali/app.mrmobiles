"use client";
import { useState } from "react";

type Language = "en" | "ta";
const copy = {
  en: {
    title: "MR MOBILES • 5G Upgrade & Repair Desk",
    intro: "Explore an upgrade or request a repair assessment. Prices, availability and compatibility are confirmed by staff before any order.",
    model: "Your current phone model",
    interest: "I'm interested in",
    budget: "Budget (optional)",
    details: "Describe your requirement (optional)",
    upgrade: "5G phone upgrade", repair: "Phone repair", accessory: "Accessories",
    send: "Prepare enquiry", preview: "Enquiry preview", privacy: "No personal data is stored by this page. Review the message before sharing it with MR MOBILES.",
    disclaimer: "No purchase, booking or payment is created by this enquiry.",
    copy: "Copy enquiry", copied: "Copied", empty: "Not specified",
  },
  ta: {
    title: "MR MOBILES • 5G அப்கிரேடு & ரிப்பேர்",
    intro: "புதிய 5G போன் அல்லது ரிப்பேர் பற்றி விசாரிக்கலாம். விலை, ஸ்டாக் மற்றும் பொருத்தம் கடை ஊழியர் உறுதி செய்த பிறகே ஆர்டர்.",
    model: "தற்போதைய போன் மாடல்",
    interest: "தேவை",
    budget: "பட்ஜெட் (விருப்பம்)",
    details: "கூடுதல் விவரம் (விருப்பம்)",
    upgrade: "5G போன் அப்கிரேடு", repair: "போன் ரிப்பேர்", accessory: "அக்சஸரீஸ்",
    send: "விசாரணை தயார் செய்", preview: "விசாரணை விவரம்", privacy: "இந்தப் பக்கம் தனிப்பட்ட தகவலை சேமிக்காது. MR MOBILES-க்கு பகிரும் முன் சரிபார்க்கவும்.",
    disclaimer: "இந்த விசாரணையால் ஆர்டர், புக்கிங் அல்லது பணப் பரிவர்த்தனை உருவாகாது.",
    copy: "விவரத்தை நகலெடு", copied: "நகலெடுக்கப்பட்டது", empty: "குறிப்பிடவில்லை",
  }
} as const;

function clean(value: string, limit: number) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, limit);
}

export default function UpgradeDesk() {
  const [language, setLanguage] = useState<Language>("en");
  const [model, setModel] = useState("");
  const [interest, setInterest] = useState<"upgrade" | "repair" | "accessory">("upgrade");
  const [budget, setBudget] = useState("");
  const [details, setDetails] = useState("");
  const [preview, setPreview] = useState("");
  const [copied, setCopied] = useState(false);
  const t = copy[language];

  function prepare() {
    const message = [
      "MR MOBILES — Customer enquiry",
      "Language: " + language,
      "Current model: " + (clean(model, 80) || t.empty),
      "Request: " + t[interest],
      "Budget: " + (clean(budget, 40) || t.empty),
      "Details: " + (clean(details, 500) || t.empty),
      "Please confirm pricing, stock, compatibility and next steps."
    ].join("\n");
    setPreview(message);
    setCopied(false);
  }

  return <main style={{minHeight:"100dvh",background:"#0b0c10",color:"#f8fafc",padding:"24px 16px",fontFamily:"system-ui,sans-serif"}}>
    <section style={{maxWidth:640,margin:"0 auto",display:"grid",gap:16}}>
      <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
        <strong style={{color:"#fb923c"}}>MR MOBILES</strong>
        <button type="button" onClick={()=>setLanguage(language==="en"?"ta":"en")} style={buttonStyle} aria-label="Switch language">{language==="en"?"தமிழ்":"English"}</button>
      </header>
      <h1 style={{fontSize:"clamp(24px,5vw,34px)",margin:0}}>{t.title}</h1>
      <p style={{color:"#cbd5e1",lineHeight:1.6}}>{t.intro}</p>
      <label style={labelStyle}>{t.model}<input maxLength={80} value={model} onChange={e=>setModel(e.target.value)} style={inputStyle} placeholder="e.g. Galaxy A17 5G"/></label>
      <label style={labelStyle}>{t.interest}<select value={interest} onChange={e=>setInterest(e.target.value as typeof interest)} style={inputStyle}>
        <option value="upgrade">{t.upgrade}</option><option value="repair">{t.repair}</option><option value="accessory">{t.accessory}</option>
      </select></label>
      <label style={labelStyle}>{t.budget}<input maxLength={40} value={budget} onChange={e=>setBudget(e.target.value)} style={inputStyle} placeholder="₹"/></label>
      <label style={labelStyle}>{t.details}<textarea maxLength={500} rows={4} value={details} onChange={e=>setDetails(e.target.value)} style={inputStyle}/></label>
      <button type="button" onClick={prepare} style={{...buttonStyle,background:"#ea580c",color:"white",padding:14}}>{t.send}</button>
      <p style={{fontSize:13,color:"#cbd5e1",lineHeight:1.6}}>{t.privacy} {t.disclaimer}</p>
      {preview && <section aria-live="polite" style={{background:"#18181b",border:"1px solid #52525b",borderRadius:12,padding:16}}>
        <h2 style={{fontSize:18}}>{t.preview}</h2>
        <pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",fontFamily:"inherit",lineHeight:1.5}}>{preview}</pre>
        <button type="button" style={buttonStyle} onClick={async()=>{try {await navigator.clipboard.writeText(preview);setCopied(true);}catch{setCopied(false);}}}>{copied?t.copied:t.copy}</button>
      </section>}
    </section>
  </main>;
}
const inputStyle: React.CSSProperties = {display:"block",width:"100%",boxSizing:"border-box",background:"#18181b",color:"#f8fafc",border:"1px solid #71717a",borderRadius:10,padding:12,fontSize:16,marginTop:8};
const labelStyle: React.CSSProperties = {fontSize:15,fontWeight:600};
const buttonStyle: React.CSSProperties = {background:"#27272a",color:"#fff",border:"1px solid #71717a",borderRadius:10,padding:"10px 14px",cursor:"pointer",fontSize:15};
