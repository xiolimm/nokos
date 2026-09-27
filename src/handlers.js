const { VIDEO_URL, BOT_NAME, DEVELOPER, ADMIN_ID, TASKS } = require("./config");
const db = require("./db");
const { sendMessage, editMessage, answerCallbackQuery, sendVideo, keyboard } = require("./telegram");
const { mainKeyboard, taskKeyboard, taskDetailKeyboard, adminKeyboard } = require("./keyboards");

const sessions = new Map();

function displayName(u) {
  const n = [u.first_name, u.last_name].filter(Boolean).join(" ");
  return n || "User";
}

function homeText(u) {
  return [
    `🎁 ${BOT_NAME}`,
    ``,
    `Halo, ${displayName(u)} 👋`,
    `Selesaikan task yang tersedia untuk mendapatkan reward.`,
    ``,
    `🆔 User ID: ${u.id}`,
    `🎁 Reward: ${u.balance || 0}`,
    ``,
    `Pilih menu di bawah.`
  ].join("\n");
}

async function showHome(chatId, u, edit=false, messageId=null) {
  const text = homeText(u);
  if (edit) return editMessage(chatId, messageId, text, {reply_markup:mainKeyboard()});
  return sendMessage(chatId, text, {reply_markup:mainKeyboard()});
}

async function start(chatId, u) {
  const caption = [
    `🎁 ${BOT_NAME}`,
    ``,
    `Selamat datang, ${displayName(u)}!`,
    ``,
    `Selesaikan misi yang tersedia dan kirim bukti untuk diperiksa admin.`,
    `Reward hanya diberikan setelah bukti diverifikasi.`
  ].join("\n");
  await sendVideo(chatId, VIDEO_URL, caption, {reply_markup:mainKeyboard()});
}

async function callback(q) {
  const chatId = q.message.chat.id;
  const messageId = q.message.message_id;
  const u = await db.getUser(q.from.id);
  await answerCallbackQuery(q.id);

  const data = q.data || "";

  if (data === "home") return showHome(chatId, u, true, messageId);
  if (data === "menu_tasks") {
    return editMessage(chatId, messageId,
      `📋 TASK / MISI\n\nSelesaikan task berikut sesuai instruksi. Setelah selesai, kirim bukti. Admin akan memeriksa bukti sebelum reward diberikan.`,
      {reply_markup:taskKeyboard(TASKS)});
  }

  if (data.startsWith("task:")) {
    const id = data.slice(5);
    const task = TASKS.find(x=>x.id===id);
    if (!task) return;
    const completed = (await db.getCompleted(u.id)).some(x=>x.task_id===id);
    return editMessage(chatId, messageId,
      `${task.title}\n\n🎁 Reward: +${task.reward}\n\n${task.description}\n\n📎 Bukti:\n${task.proofHint}\n\nStatus: ${completed ? "✅ Sudah selesai & disetujui" : "⏳ Belum disetujui"}`,
      {reply_markup:taskDetailKeyboard(task, completed)});
  }

  if (data.startsWith("submit:")) {
    const id = data.slice(7);
    const task = TASKS.find(x=>x.id===id);
    if (!task) return;
    sessions.set(u.id, {mode:"proof", taskId:id});
    return sendMessage(chatId,
      `📤 KIRIM BUKTI — ${task.title}\n\n${task.proofHint}\n\nKirim screenshot, foto, video, document, atau teks penjelasan. Setelah terkirim, submission akan masuk ke admin untuk diperiksa.\n\nKetik /cancel untuk membatalkan.`);
  }

  if (data === "menu_profile") {
    return editMessage(chatId, messageId,
      `👤 PROFIL\n\nNama: ${displayName(u)}\nUsername: ${u.username ? "@"+u.username : "-"}\nUser ID: ${u.id}\n\n🎁 Reward: ${u.balance || 0}`,
      {reply_markup:keyboard([[{text:"🏠 MENU UTAMA",callback_data:"home"}]])});
  }

  if (data === "menu_reward") {
    return editMessage(chatId, messageId,
      `🎁 REWARD\n\nSaldo reward kamu saat ini: ${u.balance || 0}\n\nReward diberikan setelah task diverifikasi admin.`,
      {reply_markup:keyboard([[{text:"📋 LIHAT TASK",callback_data:"menu_tasks"}],[{text:"🏠 MENU UTAMA",callback_data:"home"}]])});
  }

  if (data === "menu_status") {
    const rows = await db.getCompleted(u.id);
    const completed = new Set(rows.map(x=>x.task_id));
    const lines = TASKS.map(t=>`${completed.has(t.id) ? "✅" : "⏳"} ${t.title} (+${t.reward})`);
    return editMessage(chatId, messageId, `📊 STATUS\n\n${lines.join("\n")}`, {reply_markup:keyboard([[{text:"🏠 MENU UTAMA",callback_data:"home"}]])});
  }

  if (data === "menu_read") {
    return editMessage(chatId, messageId,
      `📖 READ FIRST\n\n1. Pilih task.\n2. Buka link task.\n3. Selesaikan ketentuan yang dijelaskan.\n4. Kirim bukti yang jelas.\n5. Tunggu admin memeriksa.\n6. Reward masuk setelah disetujui.\n\n⚠️ Jangan kirim bukti palsu atau edit screenshot.`,
      {reply_markup:keyboard([[{text:"📋 TASK / MISI",callback_data:"menu_tasks"}],[{text:"🏠 MENU UTAMA",callback_data:"home"}]])});
  }

  if (data === "menu_developer") {
    return editMessage(chatId, messageId,
      `🛠️ DEVELOPER\n\n${DEVELOPER}\n\nNOKOSS XIOLIM FREE`,
      {reply_markup:keyboard([[{text:"🏠 MENU UTAMA",callback_data:"home"}]])});
  }

  if (data === "admin_pending" && q.from.id === ADMIN_ID) return adminPending(chatId, messageId);
  if (data === "admin_stats" && q.from.id === ADMIN_ID) {
    const s = await db.stats();
    return editMessage(chatId, messageId, `📊 STATISTIK\n\n👥 Users: ${s.users}\n⏳ Pending: ${s.pending}\n✅ Approved: ${s.approved}\n❌ Rejected: ${s.rejected}\n🎁 Total reward user: ${s.rewards}`, {reply_markup:adminKeyboard()});
  }

  if (data.startsWith("approve:") && q.from.id === ADMIN_ID) {
    const sub = await db.approveSubmission(Number(data.slice(8)), "Approved by admin");
    if (!sub) return answerCallbackQuery(q.id, "Submission sudah diproses.");
    await sendMessage(sub.user_id, `✅ BUKTI DISETUJUI\n\nTask: ${sub.task_id}\n🎁 Reward sudah ditambahkan ke akun kamu.\n\nTerima kasih.`);
    return sendMessage(chatId, `✅ Submission #${sub.id} berhasil di-approve.`);
  }

  if (data.startsWith("reject:") && q.from.id === ADMIN_ID) {
    const sub = await db.rejectSubmission(Number(data.slice(7)), "Rejected by admin");
    if (!sub) return answerCallbackQuery(q.id, "Submission sudah diproses.");
    await sendMessage(sub.user_id, `❌ BUKTI DITOLAK\n\nTask: ${sub.task_id}\n\nSilakan periksa kembali ketentuan task dan kirim bukti yang lebih jelas.`);
    return sendMessage(chatId, `❌ Submission #${sub.id} ditolak.`);
  }
}

async function adminPending(chatId, messageId) {
  const rows = await db.sql`
    SELECT s.*, u.username, u.first_name, u.last_name
    FROM submissions s JOIN users u ON u.id=s.user_id
    WHERE s.status='pending'
    ORDER BY s.created_at ASC LIMIT 10
  `;
  if (!rows.length) return editMessage(chatId, messageId, "⏳ Tidak ada submission pending.", {reply_markup:adminKeyboard()});
  for (const s of rows) {
    const name = [s.first_name,s.last_name].filter(Boolean).join(" ") || "User";
    const text = `📥 SUBMISSION #${s.id}\n\n👤 ${name}\n🔗 ${s.username ? "@"+s.username : "-"}\n🆔 ${s.user_id}\n📋 Task: ${s.task_id}\n🕐 ${s.created_at}\n\nBukti type: ${s.proof_type || "-"}\n${s.proof_text || ""}`;
    await sendMessage(chatId, text, {reply_markup:keyboard([[{text:"✅ APPROVE",callback_data:`approve:${s.id}`},{text:"❌ REJECT",callback_data:`reject:${s.id}`} ]])});
  }
  return sendMessage(chatId, "🛠️ Admin panel", {reply_markup:adminKeyboard()});
}

async function adminPanel(chatId) {
  return sendMessage(chatId, `🛠️ ADMIN PANEL\n\nPilih fitur admin:`, {reply_markup:adminKeyboard()});
}

async function handleProof(chatId, u, message) {
  const session = sessions.get(u.id);
  if (!session || session.mode !== "proof") return false;

  if (message.text === "/cancel") {
    sessions.delete(u.id);
    await sendMessage(chatId, "❌ Pengiriman bukti dibatalkan.", {reply_markup:mainKeyboard()});
    return true;
  }

  let type=null, fileId=null, text=null;
  if (message.photo?.length) {
    type="photo"; fileId=message.photo.at(-1).file_id;
  } else if (message.video) {
    type="video"; fileId=message.video.file_id;
  } else if (message.document) {
    type="document"; fileId=message.document.file_id;
  } else if (message.text) {
    type="text"; text=message.text;
  } else {
    await sendMessage(chatId, "⚠️ Format bukti belum didukung. Kirim foto, video, document, atau teks.");
    return true;
  }

  const sub = await db.createSubmission({user_id:u.id, task_id:session.taskId, proof_type:type, proof_file_id:fileId, proof_text:text});
  sessions.delete(u.id);

  const task = TASKS.find(t=>t.id===session.taskId);
  const name = displayName(u);
  const adminText = `📥 SUBMISSION BARU\n\n👤 Nama: ${name}\n🔗 Username: ${u.username ? "@"+u.username : "-"}\n🆔 User ID: ${u.id}\n📋 Misi: ${task ? task.title : session.taskId}\n🕐 ${new Date().toISOString()}\n\nSubmission #${sub.id}`;

  await sendMessage(ADMIN_ID, adminText, {reply_markup:keyboard([[{text:"✅ APPROVE",callback_data:`approve:${sub.id}`},{text:"❌ REJECT",callback_data:`reject:${sub.id}`} ]])});

  if (fileId) {
    if (type==="photo") await tgSend("sendPhoto", {chat_id:ADMIN_ID, photo:fileId, caption:`Bukti submission #${sub.id}`});
    if (type==="video") await tgSend("sendVideo", {chat_id:ADMIN_ID, video:fileId, caption:`Bukti submission #${sub.id}`});
    if (type==="document") await tgSend("sendDocument", {chat_id:ADMIN_ID, document:fileId, caption:`Bukti submission #${sub.id}`});
  }

  await sendMessage(chatId, `✅ Bukti sudah diterima.\n\nSubmission #${sub.id}\nStatus: ⏳ Menunggu pemeriksaan admin.\n\nJangan kirim submission berulang kali sebelum yang ini diproses.`);
  return true;
}

async function tgSend(method,payload) {
  const {tg}=require("./telegram");
  return tg(method,payload);
}

async function handleMessage(message) {
  const u = message.from;
  await db.upsertUser(u);

  if (message.chat?.type !== "private") return;
  if (await handleProof(message.chat.id, u, message)) return;

  if (message.text === "/start") return start(message.chat.id, await db.getUser(u.id));
  if (message.text === "/cancel") return sendMessage(message.chat.id, "Tidak ada proses yang sedang berjalan.", {reply_markup:mainKeyboard()});
  if (message.text === "/admin" && u.id === ADMIN_ID) return adminPanel(message.chat.id);
  if (message.text === "/stats" && u.id === ADMIN_ID) {
    const s=await db.stats();
    return sendMessage(message.chat.id, `📊 Users ${s.users}\n⏳ Pending ${s.pending}\n✅ Approved ${s.approved}\n❌ Rejected ${s.rejected}`);
  }
  if (message.text === "/broadcast" && u.id === ADMIN_ID) {
    sessions.set(u.id,{mode:"broadcast"});
    return sendMessage(message.chat.id,"📢 Kirim pesan broadcast sekarang.\n\nKetik /cancel untuk membatalkan.");
  }

  if (u.id === ADMIN_ID && sessions.get(u.id)?.mode==="broadcast") {
    const text=message.text || message.caption;
    if (!text) return sendMessage(message.chat.id,"Kirim teks broadcast.");
    sessions.delete(u.id);
    const users=await db.allUsers();
    let sent=0, failed=0;
    for (const row of users) {
      try {
        await sendMessage(row.id, text);
        sent++;
      } catch(e) { failed++; }
    }
    await db.saveBroadcast(text,sent,failed);
    return sendMessage(message.chat.id,`📢 Broadcast selesai.\n\n✅ Terkirim: ${sent}\n❌ Gagal: ${failed}`);
  }

  return sendMessage(message.chat.id, "Gunakan menu di bawah untuk mulai.", {reply_markup:mainKeyboard()});
}

module.exports = { handleMessage, callback };
