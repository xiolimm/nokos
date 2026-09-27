const TOKEN = process.env.BOT_TOKEN;

if (!TOKEN) {
  throw new Error("BOT_TOKEN belum diatur di environment variables.");
}

const API = `https://api.telegram.org/bot${TOKEN}`;

async function tg(method, payload = {}) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  let data;

  try {
    data = await res.json();
  } catch (e) {
    throw new Error(
      `Telegram ${method} mengembalikan response bukan JSON. HTTP ${res.status}`
    );
  }

  if (!data.ok) {
    throw new Error(
      data.description || `Telegram ${method} failed`
    );
  }

  return data.result;
}

function keyboard(rows) {
  return {
    inline_keyboard: rows
  };
}

async function sendMessage(chat_id, text, extra = {}) {
  return tg("sendMessage", {
    chat_id,
    text,
    ...extra
  });
}

async function editMessage(
  chat_id,
  message_id,
  text,
  extra = {}
) {
  return tg("editMessageText", {
    chat_id,
    message_id,
    text,
    ...extra
  });
}

async function editCaption(
  chat_id,
  message_id,
  caption,
  extra = {}
) {
  return tg("editMessageCaption", {
    chat_id,
    message_id,
    caption,
    ...extra
  });
}

async function editReplyMarkup(
  chat_id,
  message_id,
  reply_markup
) {
  return tg("editMessageReplyMarkup", {
    chat_id,
    message_id,
    reply_markup
  });
}

async function answerCallbackQuery(
  id,
  text = ""
) {
  const payload = {
    callback_query_id: id
  };

  if (text) {
    payload.text = text;
  }

  return tg("answerCallbackQuery", payload);
}

async function sendVideo(
  chat_id,
  video,
  caption,
  extra = {}
) {
  return tg("sendVideo", {
    chat_id,
    video,
    caption,
    ...extra
  });
}

async function sendPhoto(
  chat_id,
  photo,
  caption,
  extra = {}
) {
  return tg("sendPhoto", {
    chat_id,
    photo,
    caption,
    ...extra
  });
}

async function sendDocument(
  chat_id,
  document,
  caption,
  extra = {}
) {
  return tg("sendDocument", {
    chat_id,
    document,
    caption,
    ...extra
  });
}

module.exports = {
  tg,
  keyboard,
  sendMessage,
  editMessage,
  editCaption,
  editReplyMarkup,
  answerCallbackQuery,
  sendVideo,
  sendPhoto,
  sendDocument
};
