const { initDb } = require("../src/db");
const { handleMessage, callback } = require("../src/handlers");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ok:false});

  const secret = process.env.WEBHOOK_SECRET;
  if (secret && req.headers["x-telegram-bot-api-secret-token"] !== secret) {
    return res.status(401).json({ok:false});
  }

  try {
    await initDb();
    const update = req.body || {};
    if (update.callback_query) await callback(update.callback_query);
    else if (update.message) await handleMessage(update.message);
    return res.status(200).json({ok:true});
  } catch (e) {
    console.error(e);
    return res.status(200).json({ok:false, error:"internal"});
  }
};
