const config = require("./config");
const db = require("./db");
const tg = require("./telegram");
const kb = require("./keyboards");

const VIDEO_URL = config.VIDEO_URL;
const BOT_NAME = config.BOT_NAME;
const DEVELOPER = config.DEVELOPER;
const ADMIN_ID = Number(config.ADMIN_ID);
const TASKS = config.TASKS;

const sessions = new Map();

function isAdmin(id) {
  return Number(id) === ADMIN_ID;
}

function nameOf(user) {
  const name = [
    user.first_name,
    user.last_name
  ].filter(Boolean).join(" ");

  return name || "User";
}

function menu(user) {
  return [
    "🎁 " + BOT_NAME,
    "",
    "Halo, " + nameOf(user) + " 👋",
    "",
    "🎁 Saldo: " + (user.balance || 0),
    "",
    "Pilih menu di bawah."
  ].join("\n");
}

async function sendHome(chatId, user) {
  return tg.sendMessage(
    chatId,
    menu(user),
    {
      reply_markup: kb.mainKeyboard(isAdmin(user.id))
    }
  );
}

async function sendStart(chatId, user) {
  const caption = [
    "🎁 " + BOT_NAME,
    "",
    "Selamat datang, " + nameOf(user) + "!",
    "",
    "Selesaikan task yang tersedia.",
    "Kirim bukti setelah task selesai.",
    "",
    "Reward diberikan setelah bukti disetujui admin."
  ].join("\n");

  return tg.sendVideo(
    chatId,
    VIDEO_URL,
    caption,
    {
      reply_markup: kb.mainKeyboard(isAdmin(user.id))
    }
  );
}

async function showTasks(chatId, user) {
  return tg.sendMessage(
    chatId,
    [
      "📋 TASK / MISI",
      "",
      "Pilih task yang ingin dikerjakan."
    ].join("\n"),
    {
      reply_markup: kb.taskKeyboard(TASKS)
    }
  );
}

async function showTask(chatId, user, taskId) {
  const task = TASKS.find(function(item) {
    return item.id === taskId;
  });

  if (!task) {
    return tg.sendMessage(
      chatId,
      "❌ Task tidak ditemukan."
    );
  }

  const completed = await db.getCompleted(user.id);

  const done = completed.some(function(item) {
    return item.task_id === taskId;
  });

  const text = [
    task.title,
    "",
    "🎁 Reward: +" + task.reward,
    "",
    task.description,
    "",
    "📎 Bukti yang diperlukan:",
    task.proofHint,
    "",
    "Status: " + (done ? "✅ Selesai" : "⏳ Belum selesai")
  ].join("\n");

  return tg.sendMessage(
    chatId,
    text,
    {
      reply_markup: kb.taskDetailKeyboard(task, done)
    }
  );
}

async function startProof(chatId, userId, taskId) {
  const task = TASKS.find(function(item) {
    return item.id === taskId;
  });

  if (!task) {
    return tg.sendMessage(
      chatId,
      "❌ Task tidak ditemukan."
    );
  }

  const completed = await db.getCompleted(userId);

  if (completed.some(function(item) {
    return item.task_id === taskId;
  })) {
    return tg.sendMessage(
      chatId,
      "✅ Task ini sudah pernah diselesaikan."
    );
  }

  const pending = await db.getPendingSubmission(userId);

  if (pending) {
    return tg.sendMessage(
      chatId,
      "⏳ Kamu masih memiliki submission pending #" +
      pending.id +
      ".\n\nTunggu admin memeriksanya terlebih dahulu."
    );
  }

  sessions.set(userId, {
    mode: "proof",
    taskId: taskId
  });

  return tg.sendMessage(
    chatId,
    [
      "📤 KIRIM BUKTI",
      "",
      task.title,
      "",
      task.proofHint,
      "",
      "Kirim foto, video, document, atau teks.",
      "",
      "Ketik /cancel untuk membatalkan."
    ].join("\n")
  );
}

async function sendProofToAdmin(user, submission) {
  const task = TASKS.find(function(item) {
    return item.id === submission.task_id;
  });

  const text = [
    "📥 SUBMISSION BARU",
    "",
    "👤 Nama: " + nameOf(user),
    "🔗 Username: " + (
      user.username
        ? "@" + user.username
        : "-"
    ),
    "🆔 User ID: " + user.id,
    "📋 Task: " + (
      task
        ? task.title
        : submission.task_id
    ),
    "📎 Tipe: " + (
      submission.proof_type || "-"
    ),
    "🆔 Submission #" + submission.id
  ].join("\n");

  await tg.sendMessage(
    ADMIN_ID,
    text,
    {
      reply_markup: tg.keyboard([
        [
          {
            text: "✅ APPROVE",
            callback_data: "approve:" + submission.id
          },
          {
            text: "❌ REJECT",
            callback_data: "reject:" + submission.id
          }
        ]
      ])
    }
  );

  if (!submission.proof_file_id) {
    if (submission.proof_text) {
      await tg.sendMessage(
        ADMIN_ID,
        "📝 Bukti teks:\n\n" + submission.proof_text
      );
    }

    return;
  }

  if (submission.proof_type === "photo") {
    await tg.sendPhoto(
      ADMIN_ID,
      submission.proof_file_id,
      "📎 Bukti #" + submission.id
    );
    return;
  }

  if (submission.proof_type === "video") {
    await tg.tg(
      "sendVideo",
      {
        chat_id: ADMIN_ID,
        video: submission.proof_file_id,
        caption: "📎 Bukti #" + submission.id
      }
    );
    return;
  }

  if (submission.proof_type === "document") {
    await tg.sendDocument(
      ADMIN_ID,
      submission.proof_file_id,
      "📎 Bukti #" + submission.id
    );
  }
}

async function handleProof(chatId, user, message) {
  const session = sessions.get(user.id);

  if (!session || session.mode !== "proof") {
    return false;
  }

  if (message.text === "/cancel") {
    sessions.delete(user.id);

    await tg.sendMessage(
      chatId,
      "❌ Pengiriman bukti dibatalkan.",
      {
        reply_markup: kb.mainKeyboard(isAdmin(user.id))
      }
    );

    return true;
  }

  let type = null;
  let fileId = null;
  let proofText = null;

  if (message.photo && message.photo.length > 0) {
    type = "photo";
    fileId = message.photo[
      message.photo.length - 1
    ].file_id;
  } else if (message.video) {
    type = "video";
    fileId = message.video.file_id;
  } else if (message.document) {
    type = "document";
    fileId = message.document.file_id;
  } else if (message.text) {
    type = "text";
    proofText = message.text;
  } else {
    await tg.sendMessage(
      chatId,
      "⚠️ Format tidak didukung. Kirim foto, video, document, atau teks."
    );

    return true;
  }

  const pending = await db.getPendingSubmission(user.id);

  if (pending) {
    sessions.delete(user.id);

    await tg.sendMessage(
      chatId,
      "⏳ Submission #" +
      pending.id +
      " masih menunggu pemeriksaan admin."
    );

    return true;
  }

  const submission = await db.createSubmission({
    user_id: user.id,
    task_id: session.taskId,
    proof_type: type,
    proof_file_id: fileId,
    proof_text: proofText
  });

  sessions.delete(user.id);

  try {
    await sendProofToAdmin(
      user,
      submission
    );
  } catch (error) {
    console.error(
      "SEND PROOF ADMIN ERROR:",
      error
    );
  }

  await tg.sendMessage(
    chatId,
    [
      "✅ BUKTI TERKIRIM",
      "",
      "Submission #" + submission.id,
      "",
      "⏳ Status: Menunggu pemeriksaan admin.",
      "",
      "Jangan kirim ulang sebelum submission ini diproses."
    ].join("\n")
  );

  return true;
}

async function adminPanel(chatId) {
  return tg.sendMessage(
    chatId,
    [
      "👑 ADMIN PANEL",
      "",
      "Pilih menu:"
    ].join("\n"),
    {
      reply_markup: kb.adminKeyboard()
    }
  );
}

async function adminPending(chatId) {
  const rows = await db.sql`
    SELECT
      s.*,
      u.username,
      u.first_name,
      u.last_name
    FROM submissions s
    JOIN users u
      ON u.id = s.user_id
    WHERE s.status = 'pending'
    ORDER BY s.created_at ASC
    LIMIT 20
  `;

  if (!rows.length) {
    return tg.sendMessage(
      chatId,
      "⏳ Tidak ada submission pending.",
      {
        reply_markup: kb.adminKeyboard()
      }
    );
  }

  for (const row of rows) {
    const userName = [
      row.first_name,
      row.last_name
    ].filter(Boolean).join(" ") || "User";

    const task = TASKS.find(function(item) {
      return item.id === row.task_id;
    });

    const text = [
      "📥 SUBMISSION #" + row.id,
      "",
      "👤 " + userName,
      "🔗 " + (
        row.username
          ? "@" + row.username
          : "-"
      ),
      "🆔 User ID: " + row.user_id,
      "📋 Task: " + (
        task
          ? task.title
          : row.task_id
      ),
      "📎 Tipe: " + (
        row.proof_type || "-"
      ),
      "",
      row.proof_text
        ? "📝 " + row.proof_text
        : ""
    ].join("\n");

    await tg.sendMessage(
      chatId,
      text,
      {
        reply_markup: tg.keyboard([
          [
            {
              text: "✅ APPROVE",
              callback_data: "approve:" + row.id
            },
            {
              text: "❌ REJECT",
              callback_data: "reject:" + row.id
            }
          ]
        ])
      }
    );

    if (row.proof_file_id) {
      try {
        if (row.proof_type === "photo") {
          await tg.sendPhoto(
            chatId,
            row.proof_file_id,
            "📎 Bukti #" + row.id
          );
        }

        if (row.proof_type === "video") {
          await tg.tg(
            "sendVideo",
            {
              chat_id: chatId,
              video: row.proof_file_id,
              caption: "📎 Bukti #" + row.id
            }
          );
        }

        if (row.proof_type === "document") {
          await tg.sendDocument(
            chatId,
            row.proof_file_id,
            "📎 Bukti #" + row.id
          );
        }
      } catch (error) {
        console.error(
          "SEND PENDING PROOF ERROR:",
          error
        );
      }
    }
  }

  return tg.sendMessage(
    chatId,
    "👑 Admin Panel",
    {
      reply_markup: kb.adminKeyboard()
    }
  );
}

async function approve(id, adminChatId) {
  const submission = await db.approveSubmission(
    id,
    "Approved by admin"
  );

  if (!submission) {
    return tg.sendMessage(
      adminChatId,
      "⚠️ Submission sudah diproses atau tidak ditemukan."
    );
  }

  try {
    await tg.sendMessage(
      submission.user_id,
      [
        "✅ BUKTI DISETUJUI",
        "",
        "Task: " + submission.task_id,
        "",
        "🎁 Reward sudah ditambahkan ke saldo kamu."
      ].join("\n")
    );
  } catch (error) {
    console.error(
      "APPROVE NOTIFY ERROR:",
      error
    );
  }

  return tg.sendMessage(
    adminChatId,
    "✅ Submission #" +
    submission.id +
    " berhasil di-approve."
  );
}

async function reject(id, adminChatId) {
  const submission = await db.rejectSubmission(
    id,
    "Rejected by admin"
  );

  if (!submission) {
    return tg.sendMessage(
      adminChatId,
      "⚠️ Submission sudah diproses atau tidak ditemukan."
    );
  }

  try {
    await tg.sendMessage(
      submission.user_id,
      [
        "❌ BUKTI DITOLAK",
        "",
        "Task: " + submission.task_id,
        "",
        "Silakan cek kembali ketentuan task lalu kirim bukti yang lebih jelas."
      ].join("\n")
    );
  } catch (error) {
    console.error(
      "REJECT NOTIFY ERROR:",
      error
    );
  }

  return tg.sendMessage(
    adminChatId,
    "❌ Submission #" +
    submission.id +
    " berhasil ditolak."
  );
}

async function showStats(chatId) {
  const s = await db.stats();

  return tg.sendMessage(
    chatId,
    [
      "📊 STATISTIK",
      "",
      "👥 Users: " + s.users,
      "⏳ Pending: " + s.pending,
      "✅ Approved: " + s.approved,
      "❌ Rejected: " + s.rejected,
      "🎁 Total reward: " + s.rewards
    ].join("\n"),
    {
      reply_markup: kb.adminKeyboard()
    }
  );
}

async function callback(query) {
  const chatId =
    query.message &&
    query.message.chat
      ? query.message.chat.id
      : null;

  const userId =
    query.from
      ? query.from.id
      : null;

  const data = query.data || "";

  if (!chatId || !userId) {
    return;
  }

  await tg.answerCallbackQuery(
    query.id
  );

  const user = await db.getUser(userId);

  if (!user) {
    return;
  }

  if (data === "home") {
    return sendHome(chatId, user);
  }

  if (data === "menu_tasks") {
    return showTasks(chatId, user);
  }

  if (data.startsWith("task:")) {
    return showTask(
      chatId,
      user,
      data.slice(5)
    );
  }

  if (data.startsWith("submit:")) {
    return startProof(
      chatId,
      user.id,
      data.slice(7)
    );
  }

  if (data === "menu_profile") {
    return tg.sendMessage(
      chatId,
      [
        "👤 PROFIL",
        "",
        "Nama: " + nameOf(user),
        "Username: " + (
          user.username
            ? "@" + user.username
            : "-"
        ),
        "User ID: " + user.id,
        "",
        "🎁 Saldo: " + (user.balance || 0)
      ].join("\n"),
      {
        reply_markup: tg.keyboard([
          [
            {
              text: "🏠 MENU UTAMA",
              callback_data: "home"
            }
          ]
        ])
      }
    );
  }

  if (data === "menu_reward") {
    return tg.sendMessage(
      chatId,
      [
        "🎁 REWARD",
        "",
        "Saldo kamu: " + (user.balance || 0),
        "",
        "Reward masuk setelah task disetujui admin."
      ].join("\n"),
      {
        reply_markup: tg.keyboard([
          [
            {
              text: "📋 TASK / MISI",
              callback_data: "menu_tasks"
            }
          ],
          [
            {
              text: "🏠 MENU UTAMA",
              callback_data: "home"
            }
          ]
        ])
      }
    );
  }

  if (data === "menu_status") {
    const completed = await db.getCompleted(user.id);
    const done = new Set(
      completed.map(function(item) {
        return item.task_id;
      })
    );

    const lines = TASKS.map(function(task) {
      return (
        (done.has(task.id) ? "✅ " : "⏳ ") +
        task.title +
        " (+" +
        task.reward +
        ")"
      );
    });

    return tg.sendMessage(
      chatId,
      "📊 STATUS\n\n" + lines.join("\n"),
      {
        reply_markup: tg.keyboard([
          [
            {
              text: "🏠 MENU UTAMA",
              callback_data: "home"
            }
          ]
        ])
      }
    );
  }

  if (data === "menu_read") {
    return tg.sendMessage(
      chatId,
      [
        "📖 READ FIRST",
        "",
        "1. Pilih task.",
        "2. Buka link task.",
        "3. Selesaikan task.",
        "4. Kirim bukti.",
        "5. Tunggu pemeriksaan admin.",
        "6. Reward diberikan setelah disetujui."
      ].join("\n"),
      {
        reply_markup: tg.keyboard([
          [
            {
              text: "📋 TASK / MISI",
              callback_data: "menu_tasks"
            }
          ],
          [
            {
              text: "🏠 MENU UTAMA",
              callback_data: "home"
            }
          ]
        ])
      }
    );
  }

  if (data === "menu_developer") {
    return tg.sendMessage(
      chatId,
      "🛠️ DEVELOPER\n\n" + DEVELOPER,
      {
        reply_markup: tg.keyboard([
          [
            {
              text: "🏠 MENU UTAMA",
              callback_data: "home"
            }
          ]
        ])
      }
    );
  }

  if (data === "admin_panel") {
    if (!isAdmin(userId)) {
      return;
    }

    return adminPanel(chatId);
  }

  if (data === "admin_pending") {
    if (!isAdmin(userId)) {
      return;
    }

    return adminPending(chatId);
  }

  if (data === "admin_stats") {
    if (!isAdmin(userId)) {
      return;
    }

    return showStats(chatId);
  }

  if (data === "admin_broadcast") {
    if (!isAdmin(userId)) {
      return;
    }

    sessions.set(userId, {
      mode: "broadcast"
    });

    return tg.sendMessage(
      chatId,
      [
        "📢 BROADCAST",
        "",
        "Kirim pesan yang mau dikirim ke semua user.",
        "",
        "Ketik /cancel untuk membatalkan."
      ].join("\n")
    );
  }

  if (data.startsWith("approve:")) {
    if (!isAdmin(userId)) {
      return;
    }

    return approve(
      Number(data.slice(8)),
      chatId
    );
  }

  if (data.startsWith("reject:")) {
    if (!isAdmin(userId)) {
      return;
    }

    return reject(
      Number(data.slice(7)),
      chatId
    );
  }
}

async function handleBroadcast(
  chatId,
  user,
  message
) {
  if (!isAdmin(user.id)) {
    return false;
  }

  const session = sessions.get(user.id);

  if (!session || session.mode !== "broadcast") {
    return false;
  }

  if (message.text === "/cancel") {
    sessions.delete(user.id);

    await tg.sendMessage(
      chatId,
      "❌ Broadcast dibatalkan.",
      {
        reply_markup: kb.adminKeyboard()
      }
    );

    return true;
  }

  const text =
    message.text ||
    message.caption ||
    "";

  if (!text) {
    await tg.sendMessage(
      chatId,
      "⚠️ Broadcast harus berupa teks."
    );

    return true;
  }

  sessions.delete(user.id);

  const users = await db.allUsers();

  let sent = 0;
  let failed = 0;

  for (const row of users) {
    try {
      await tg.sendMessage(
        row.id,
        text
      );

      sent++;
    } catch (error) {
      failed++;

      console.error(
        "BROADCAST FAILED:",
        row.id,
        error.message
      );
    }
  }

  await db.saveBroadcast(
    text,
    sent,
    failed
  );

  await tg.sendMessage(
    chatId,
    [
      "📢 BROADCAST SELESAI",
      "",
      "✅ Terkirim: " + sent,
      "❌ Gagal: " + failed
    ].join("\n"),
    {
      reply_markup: kb.adminKeyboard()
    }
  );

  return true;
}

async function handleMessage(message) {
  if (!message || !message.from || !message.chat) {
    return;
  }

  const user = message.from;

  await db.upsertUser(user);

  if (message.chat.type !== "private") {
    return;
  }

  if (
    await handleBroadcast(
      message.chat.id,
      user,
      message
    )
  ) {
    return;
  }

  if (
    await handleProof(
      message.chat.id,
      user,
      message
    )
  ) {
    return;
  }

  if (message.text === "/start") {
    const saved = await db.getUser(user.id);

    return sendStart(
      message.chat.id,
      saved || user
    );
  }

  if (message.text === "/cancel") {
    return tg.sendMessage(
      message.chat.id,
      "Tidak ada proses yang sedang berjalan.",
      {
        reply_markup: kb.mainKeyboard(
          isAdmin(user.id)
        )
      }
    );
  }

  if (
    message.text === "/admin" &&
    isAdmin(user.id)
  ) {
    return adminPanel(
      message.chat.id
    );
  }

  if (
    message.text === "/stats" &&
    isAdmin(user.id)
  ) {
    return showStats(
      message.chat.id
    );
  }

  if (
    message.text === "/broadcast" &&
    isAdmin(user.id)
  ) {
    sessions.set(user.id, {
      mode: "broadcast"
    });

    return tg.sendMessage(
      message.chat.id,
      [
        "📢 BROADCAST",
        "",
        "Kirim pesan broadcast sekarang.",
        "",
        "Ketik /cancel untuk membatalkan."
      ].join("\n")
    );
  }

  return sendHome(
    message.chat.id,
    user
  );
}

module.exports = {
  handleMessage,
  callback
};
