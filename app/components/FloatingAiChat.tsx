"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

type SuggestedProduct = {
  id: string;
  name: string;
  category: "phone" | "accessory" | "service";
  pricePaise: number;
  stockQty?: number | null;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  products?: SuggestedProduct[];
};

const QUICK_PROMPTS = [
  "I need mobile repair",
  "Show phones under ₹20,000",
  "I need order help"
];

function visitorToken() {
  const key = "mr-mobiles-ai-visitor";
  const stored = window.localStorage.getItem(key);
  if (stored && /^[A-Za-z0-9_-]{16,80}$/.test(stored)) return stored;

  const created = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replaceAll("-", "")
    : Array.from(crypto.getRandomValues(new Uint32Array(4)))
        .map((value) => value.toString(36))
        .join("");

  window.localStorage.setItem(key, created);
  return created;
}

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(paise / 100);
}

export default function FloatingAiChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Hi 👋 I’m Mr Mobiles AI. Ask me about phones, accessories, repairs, prices, stock or order help."
    }
  ]);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, open, sending]);

  async function sendMessage(raw: string) {
    const text = raw.trim().slice(0, 1200);
    if (!text || sending) return;

    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: "user", text }
    ]);
    setInput("");
    setSending(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          visitorToken: visitorToken()
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "AI assistant is temporarily unavailable.");
      }

      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: String(data?.text || "How can I help?"),
          products: Array.isArray(data?.products) ? data.products : []
        }
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          text: error instanceof Error
            ? error.message
            : "AI assistant is temporarily unavailable. You can still talk to our team on Telegram."
        }
      ]);
    } finally {
      setSending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  function openProduct(product: SuggestedProduct) {
    const url = new URL(window.location.href);
    url.searchParams.set("product", product.id);
    url.searchParams.delete("category");
    url.searchParams.delete("buy");
    window.location.assign(`${url.pathname}?${url.searchParams.toString()}`);
  }

  return (
    <div className={open ? "aiChat aiChatOpen" : "aiChat"}>
      {open && (
        <section className="aiPanel" role="dialog" aria-label="Mr Mobiles AI assistant">
          <header className="aiHeader">
            <div className="aiAvatar">AI</div>
            <div>
              <strong>Mr Mobiles AI</strong>
              <span>Shop • Repair • Support</span>
            </div>
            <button
              type="button"
              className="aiClose"
              onClick={() => setOpen(false)}
              aria-label="Close AI chat"
            >
              ×
            </button>
          </header>

          <div className="aiMessages" aria-live="polite">
            {messages.map((message) => (
              <div
                key={message.id}
                className={message.role === "user" ? "aiRow aiRowUser" : "aiRow"}
              >
                <div className={message.role === "user" ? "aiBubble aiBubbleUser" : "aiBubble"}>
                  {message.text}
                </div>

                {message.role === "assistant" && message.products?.length ? (
                  <div className="aiProducts">
                    {message.products.map((product) => (
                      <button
                        type="button"
                        key={product.id}
                        className="aiProduct"
                        onClick={() => openProduct(product)}
                      >
                        <span>
                          <strong>{product.name}</strong>
                          <small>
                            {money(product.pricePaise)}
                            {typeof product.stockQty === "number"
                              ? ` • ${product.stockQty} in stock`
                              : ""}
                          </small>
                        </span>
                        <b>View</b>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}

            {sending && (
              <div className="aiRow">
                <div className="aiBubble aiTyping" aria-label="AI is typing">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {messages.length === 1 && (
            <div className="aiQuickPrompts">
              {QUICK_PROMPTS.map((prompt) => (
                <button type="button" key={prompt} onClick={() => void sendMessage(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
          )}

          <div className="aiHandoff">
            <a
              href="https://t.me/MrMobileDoctor_bot?start=support"
              target="_blank"
              rel="noreferrer"
            >
              👨‍🔧 Talk to Mr Mobiles Team
            </a>
            <small>Never share OTP, password, card PIN or CVV in chat.</small>
          </div>

          <form className="aiComposer" onSubmit={submit}>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about a phone or repair…"
              maxLength={1200}
              aria-label="Message Mr Mobiles AI"
            />
            <button type="submit" disabled={sending || !input.trim()} aria-label="Send message">
              ➜
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        className="aiLauncher"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? "Close Mr Mobiles AI" : "Open Mr Mobiles AI"}
      >
        <span className="aiLauncherIcon">{open ? "×" : "✦"}</span>
        {!open && <span className="aiLauncherText">Ask Mr Mobiles AI</span>}
      </button>
    </div>
  );
}
