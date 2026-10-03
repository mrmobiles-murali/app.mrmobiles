type TelegramReplyMarkup = {
  inline_keyboard?: Array<Array<Record<string, unknown>>>;
  [key: string]: unknown;
};

export async function sendTelegramMessage(
  chatId: number,
  text: string,
  options?: { replyMarkup?: TelegramReplyMarkup }
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      ...(options?.replyMarkup ? { reply_markup: options.replyMarkup } : {})
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12000)
  });
}
