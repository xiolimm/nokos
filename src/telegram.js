const TOKEN = process.env.BOT_TOKEN;
const API = `https://api.telegram.org/bot${TOKEN}`;

async function tg(method, payload = {}) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || `Telegram ${method} failed`);
  return data.result;
}

function keyboard(rows) {
  return { inline_keyboard: rows };
}

async function sendMessage(chat_id, text, extra={}) {
  return tg("sendMessage", { chat_id, text, ...extra });
}

async function editMessage(chat_id, message_id, text, extra={}) {
  return tg("editMessageText", { chat_id, message_id, text, ...extra });
}

async function answerCallbackQuery(id, text) {
  return tg("answerCallbackQuery", { callback_query_id: id, text });
}

async function sendVideo(chat_id, video, caption, extra={}) {
  return tg("sendVideo", { chat_id, video, caption, ...extra });
}

module.exports = { tg, keyboard, sendMessage, editMessage, answerCallbackQuery, sendVideo };
