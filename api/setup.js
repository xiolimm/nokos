const { tg } = require("../src/telegram");
const { initDb } = require("../src/db");

module.exports = async (req,res) => {
  if (req.method !== "GET") return res.status(405).json({ok:false});
  if (req.query.secret !== process.env.SETUP_SECRET) return res.status(403).json({ok:false});

  try {
    await initDb();
    const base = process.env.PUBLIC_BASE_URL;
    const webhookUrl = `${base}/api/webhook`;
    const result = await tg("setWebhook", {
      url: webhookUrl,
      secret_token: process.env.WEBHOOK_SECRET,
      allowed_updates: ["message","callback_query"],
      drop_pending_updates: true
    });
    return res.status(200).json({ok:true, webhookUrl, telegram:result});
  } catch(e) {
    console.error(e);
    return res.status(500).json({ok:false,error:e.message});
  }
};
