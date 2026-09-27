const { VIDEO_URL, BOT_NAME, DEVELOPER, ADMIN_ID, TASKS } = require("./config");
const db = require("./db");

const {
  tg,
  sendMessage,
  answerCallbackQuery,
  sendVideo,
  sendPhoto,
  sendDocument,
  keyboard
} = require("./telegram");

const {
  mainKeyboard,
  taskKeyboard,
  taskDetailKeyboard,
  adminKeyboard
} = require("./keyboards");

const sessions = new Map();

function isAdmin(id) {
  return Number(id) === Number(ADMIN_ID);
}

function displayName(u) {
  const name = [u.first_name, u.last_name]
    .filter(Boolean)
    .join(" ");

  return name || "User";
}

function homeText(u) {
  return [
    "🎁 " + BOT_NAME,
    "",
    "Halo, " + displayName(u) + " 👋",
    "Selesaikan task yang tersedia untuk mendapatkan reward.",
    "",
    "🆔 User ID: " + u.id,
    "🎁 Reward: " + (u.balance || 0),
    "",
    "Pilih menu di bawah."
  ].join("\n");
}

async function start(chatId, u) {
  const caption = [
    "🎁 " + BOT_NAME,
    "",
    "Selamat datang, " + displayName(u) + "!",
    "",
    "Selesaikan misi yang tersedia dan kirim bukti untuk diperiksa admin.",
    "Reward hanya diberikan setelah bukti diverifikasi."
  ].join("\n");

  return sendVideo(
    chatId,
    VIDEO_URL,
    caption,
    {
      reply_markup: mainKeyboard(isAdmin(u.id))
    }
  );
}

async function showHome(chatId, u) {
  return sendMessage(
    chatId,
    homeText(u),
    {
      reply_markup: mainKeyboard(isAdmin(u.id))
    }
  );
}

async function callback(q) {
  const chatId = q.message && q.message.chat
    ? q.message.chat.id
    : null;

  const userId = q.from
    ? q.from.id
    : null;

  const data = q.data || "";

  if (!chatId || !userId) {
    return;
  }

  const u = await db.getUser(userId);

  await answerCallbackQuery(q.id);

  if (!u) {
    return;
  }

  if (data === "home") {
    return showHome(chatId, u);
  }

  if (data === "menu_tasks") {
    return sendMessage(
      chatId,
      [
        "📋 TASK / MISI",
        "",
        "Selesaikan task berikut sesuai instruksi.",
        "Setelah selesai, kirim bukti.",
        "Admin akan memeriksa bukti sebelum reward diberikan."
      ].join("\n"),
      {
        reply_markup: taskKeyboard(TASKS)
      }
    );
  }

  if (data.startsWith("task:")) {
    const id = data.slice(5);

    const task = TASKS.find(function(x) {
      return x.id === id;
    });

    if (!task) {
      return sendMessage(
        chatId,
        "❌ Task tidak ditemukan."
      );
    }

    const completedRows = await db.getCompleted(u.id);

    const completed = completedRows.some(function(x) {
      return x.task_id === id;
    });

    const text = [
      task.title,
      "",
      "🎁 Reward: +" + task.reward,
      "",
      task.description,
      "",
      "📎 Bukti:",
      task.proofHint,
      "",
      "Status: " +
        (
          completed
            ? "✅ Sudah selesai & disetujui"
            : "⏳ Belum disetujui"
        )
    ].join("\n");

    return sendMessage(
      chatId,
      text,
      {
        reply_markup: taskDetailKeyboard(
          task,
          completed
        )
      }
    );
  }

  if (data.startsWith("submit:")) {
    const id = data.slice(7);

    const task = TASKS.find(function(x) {
      return x.id === id;
    });

    if (!task) {
      return sendMessage(
        chatId,
        "❌ Task tidak ditemukan."
      );
    }

    const pending = await db.getPendingSubmission(u.id);

    if (pending) {
      return sendMessage(
        chatId,
        "⏳ Kamu masih memiliki submission pending.\n\n" +
        "Submission #" + pending.id + "\n" +
        "Task: " + pending.task_id + "\n\n" +
        "Tunggu admin memeriksanya terlebih dahulu."
      );
    }

    sessions.set(u.id, {
      mode: "proof",
      taskId: id
    });

    return sendMessage(
      chatId,
      [
        "📤 KIRIM BUKTI — " + task.title,
        "",
        task.proofHint,
        "",
        "Kirim screenshot, foto, video, document, atau teks penjelasan.",
        "",
        "Ketik /cancel untuk membatalkan."
      ].join("\n")
    );
  }

  if (data === "menu_profile") {
    return sendMessage(
      chatId,
      [
        "👤 PROFIL",
        "",
        "Nama: " + displayName(u),
        "Username: " +
          (u.username ? "@" + u.username : "-"),
        "User ID: " + u.id,
        "",
        "🎁 Reward: " + (u.balance || 0)
      ].join("\n"),
      {
        reply_markup: keyboard([
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
    return sendMessage(
      chatId,
      [
        "🎁 REWARD",
        "",
        "Saldo reward kamu saat ini: " +
          (u.balance || 0),
        "",
        "Reward diberikan setelah task diverifikasi admin."
      ].join("\n"),
      {
        reply_markup: keyboard([
          [
            {
              text: "📋 LIHAT TASK",
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
    const rows = await db.getCompleted(u.id);

    const completed = new Set(
      rows.map(function(x) {
        return x.task_id;
      })
    );

    const lines = TASKS.map(function(t) {
      return (
        (completed.has(t.id) ? "✅" : "⏳") +
        " " +
        t.title +
        " (+" +
        t.reward +
        ")"
      );
    });

    return sendMessage(
      chatId,
      "📊 STATUS\n\n" + lines.join("\n"),
      {
        reply_markup: keyboard([
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
    return sendMessage(
      chatId,
      [
        "📖 READ FIRST",
        "",
        "1. Pilih task.",
        "2. Buka link task.",
        "3. Selesaikan ketentuan yang dijelaskan.",
        "4. Kirim bukti yang jelas.",
        "5. Tunggu admin memeriksa.",
        "6. Reward masuk setelah disetujui.",
        "",
        "⚠️ Jangan kirim bukti palsu atau edit screenshot."
      ].join("\n"),
      {
        reply_markup: keyboard([
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
    return sendMessage(
      chatId,
      [
        "🛠️ DEVELOPER",
        "",
        DEVELOPER,
        "",
        "NOKOSS XIOLIM FREE"
      ].join("\n"),
      {
        reply_markup: keyboard([
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

    const s = await db.stats();

    return sendMessage(
      chatId,
      [
        "📊 STATISTIK",
        "",
        "👥 Users: " + s.users,
        "⏳ Pending: " + s.pending,
        "✅ Approved: " + s.approved,
        "❌ Rejected: " + s.rejected,
        "🎁 Total reward user: " + s.rewards
      ].join("\n"),
      {
        reply_markup: adminKeyboard()
      }
    );
  }

  if (data === "admin_broadcast") {
    if (!isAdmin(userId)) {
      return;
    }

    sessions.set(userId, {
      mode: "broadcast"
    });

    return sendMessage(
      chatId,
      [
        "📢 BROADCAST",
        "",
        "Kirim pesan yang ingin dikirim ke semua user sekarang.",
        "",
        "Ketik /cancel untuk membatalkan."
      ].join("\n")
    );
  }

  if (data.startsWith("approve:")) {
    if (!isAdmin(userId)) {
      return;
    }

    const id = Number(data.slice(8));

    const sub = await db.approveSubmission(
      id,
      "Approved by admin"
    );

    if (!sub) {
      return answerCallbackQuery(
        q.id,
        "Submission sudah diproses."
      );
    }

    await sendMessage(
      sub.user_id,
      [
        "✅ BUKTI DISETUJUI",
        "",
        "Task: " + sub.task_id,
        "🎁 Reward sudah ditambahkan ke akun kamu.",
        "",
        "Terima kasih."
      ].join("\n")
    );

    return sendMessage(
      chatId,
      "✅ Submission #" +
        sub.id +
        " berhasil di-approve."
    );
  }

  if (data.startsWith("reject:")) {
    if (!isAdmin(userId)) {
      return;
    }

    const id = Number(data.slice(7));

    const sub = await db.rejectSubmission(
      id,
      "Rejected by admin"
    );

    if (!sub) {
      return answerCallbackQuery(
        q.id,
        "Submission sudah diproses."
      );
    }

    await sendMessage(
      sub.user_id,
      [
        "❌ BUKTI DITOLAK",
        "",
        "Task: " + sub.task_id,
        "",
        "Silakan periksa kembali ketentuan task dan kirim bukti yang lebih jelas."
      ].join("\n")
    );

    return sendMessage(
      chatId,
      "❌ Submission #" +
        sub.id +
        " ditolak."
    );
  }
}

async function adminPanel(chatId) {
  return sendMessage(
    chatId,
    "🛠️ ADMIN PANEL\n\nPilih fitur admin:",
    {
      reply_markup: adminKeyboard()
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
    JOIN users u ON u.id = s.user_id
    WHERE s.status = 'pending'
    ORDER BY s.created_at ASC
    LIMIT 10
  `;

  if (!rows.length) {
    return sendMessage(
      chatId,
      "⏳ Tidak ada submission pending.",
      {
        reply_markup: adminKeyboard()
      }
    );
  }

  for (const s of rows) {
    const name =
      [s.first_name, s.last_name]
        .filter(Boolean)
        .join(" ") || "User";

    const text = [
      "📥 SUBMISSION #" + s.id,
      "",
      "👤 " + name,
      "🔗 " +
        (s.username ? "@" + s.username : "-"),
      "🆔 " + s.user_id,
      "📋 Task: " + s.task_id,
      "🕐 " + s.created_at,
      "",
      "Bukti type: " +
        (s.proof_type || "-"),
      s.proof_text || ""
    ].join("\n");

    await sendMessage(
      chatId,
      text,
      {
        reply_markup: keyboard([
          [
            {
              text: "✅ APPROVE",
              callback_data:
                "approve:" + s.id
            },
            {
              text: "❌ REJECT",
              callback_data:
                "reject:" + s.id
            }
          ]
        ])
      }
    );

    if (s.proof_file_id) {
      try {
        if (s.proof_type === "photo") {
          await sendPhoto(
            chatId,
            s.proof_file_id,
            "📎 Bukti submission #" +
              s.id
          );
        }

        if (s.proof_type === "video") {
          await tg("sendVideo", {
            chat_id: chatId,
            video: s.proof_file_id,
            caption:
              "📎 Bukti submission #" +
              s.id
          });
        }

        if (s.proof_type === "document") {
          await sendDocument(
            chatId,
            s.proof_file_id,
            "📎 Bukti submission #" +
              s.id
          );
        }
      } catch (e) {
        console.error(
          "FAILED SEND PROOF:",
          e.message
        );
      }
    }
  }

  return sendMessage(
    chatId,
    "🛠️ Admin panel",
    {
      reply_markup: adminKeyboard()
    }
  );
}

async function handleProof(chatId, u, message) {
  const session = sessions.get(u.id);

  if (!session || session.mode !== "proof") {
    return false;
  }

  if (message.text === "/cancel") {
    sessions.delete(u.id);

    await sendMessage(
      chatId,
      "❌ Pengiriman bukti dibatalkan.",
      {
        reply_markup: mainKeyboard(
          isAdmin(u.id)
        )
      }
    );

    return true;
  }

  let type = null;
  let fileId = null;
  let text = null;

  if (
    message.photo &&
    message.photo.length
  ) {
    type = "photo";
    fileId =
      message.photo[
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
    text = message.text;
  } else {
    await sendMessage(
      chatId,
      "⚠️ Format bukti belum didukung. Kirim foto, video, document, atau teks."
    );

    return true;
  }

  const pending =
    await db.getPendingSubmission(u.id);

  if (pending) {
    sessions.delete(u.id);

    await sendMessage(
      chatId,
      "⏳ Kamu masih memiliki submission pending #" +
        pending.id +
        ".\n\nTunggu admin memeriksanya terlebih dahulu."
    );

    return true;
  }

  const sub = await db.createSubmission({
    user_id: u.id,
    task_id: session.taskId,
    proof_type: type,
    proof_file_id: fileId,
    proof_text: text
  });

  sessions.delete(u.id);

  const task = TASKS.find(function(t) {
    return t.id === session.taskId;
  });

  const adminText = [
    "📥 SUBMISSION BARU",
    "",
    "👤 Nama: " + displayName(u),
    "🔗 Username: " +
      (u.username ? "@" + u.username : "-"),
    "🆔 User ID: " + u.id,
    "📋 Misi: " +
      (task ? task.title : session.taskId),
    "🕐 " +
      new Date().toISOString(),
    "",
    "📎 Tipe bukti: " + type,
    "Submission #" + sub.id
  ].join("\n");

  await sendMessage(
    ADMIN_ID,
    adminText,
    {
      reply_markup: keyboard([
        [
          {
            text: "✅ APPROVE",
            callback_data:
              "approve:" + sub.id
          },
          {
            text: "❌ REJECT",
            callback_data:
              "reject:" + sub.id
          }
        ]
      ])
    }
  );

  if (fileId) {
    try {
      if (type === "photo") {
        await sendPhoto(
          ADMIN_ID,
          fileId,
          "📎 Bukti submission #" +
            sub.id
        );
      }

      if (type === "video") {
        await tg("sendVideo", {
          chat_id: ADMIN_ID,
          video: fileId,
          caption:
            "📎 Bukti submission #" +
            sub.id
        });
      }

      if (type === "document") {
        await sendDocument(
          ADMIN_ID,
          fileId,
          "📎 Bukti submission #" +
            sub.id
        );
      }
    } catch (e) {
      console.error(
        "FAILED SEND PROOF TO ADMIN:",
        e.message
      );

      await sendMessage(
        ADMIN_ID,
        "⚠️ File bukti submission #" +
          sub.id +
          " gagal dikirim.\n\nError: " +
          e.message
      );
    }
  }

  await sendMessage(
    chatId,
    [
      "✅ Bukti sudah diterima.",
      "",
      "Submission #" + sub.id,
      "Status: ⏳ Menunggu pemeriksaan admin.",
      "",
      "Jangan kirim submission berulang kali sebelum yang ini diproses."
    ].join("\n")
  );

  return true;
}

async function handleBroadcast(
  chatId,
  u,
  message
) {
  if (!isAdmin(u.id)) {
    return false;
  }

  const session = sessions.get(u.id);

  if (
    !session ||
    session.mode !== "broadcast"
  ) {
    return false;
  }

  if (message.text === "/cancel") {
    sessions.delete(u.id);

    await sendMessage(
      chatId,
      "❌ Broadcast dibatalkan.",
      {
        reply_markup: adminKeyboard()
      }
    );

    return true;
  }

  const text =
    message.text ||
    message.caption;

  if (!text) {
    await sendMessage(
      chatId,
      "⚠️ Broadcast saat ini hanya mendukung teks."
    );

    return true;
  }

  sessions.delete(u.id);

  const users =
    await db.allUsers();

  let sent = 0;
  let failed = 0;

  for (const row of users) {
    try {
      await sendMessage(
        row.id,
        text
      );

      sent++;
    } catch (e) {
      failed++;

      console.error(
        "BROADCAST FAILED:",
        row.id,
        e.message
      );
    }
  }

  await db.saveBroadcast(
    text,
    sent,
    failed
  );

  await sendMessage(
    chatId,
    [
      "📢 BROADCAST SELESAI",
      "",
      "✅ Terkirim: " + sent,
      "❌ Gagal: " + failed
    ].join("\n"),
    {
      reply_markup: adminKeyboard()
    }
  );

  return true;
}

async function handleMessage(message) {
  const u = message.from;

  await db.upsertUser(u);

  if (
    message.chat &&
    message.chat.type !== "private"
  ) {
    return;
  }

  if (
    await handleBroadcast(
      message.chat.id,
      u,
      message
    )
  ) {
    return;
  }

  if (
    await handleProof(
      message.chat.id,
      u,
      message
    )
  ) {
    return;
  }

  if (message.text === "/start") {
    return start(
      message.chat.id,
      await db.getUser(u.id)
    );
  }

  if (message.text === "/cancel") {
    return sendMessage(
      message.chat.id,
      "Tidak ada proses yang sedang berjalan.",
      {
        reply_markup:
          mainKeyboard(
            isAdmin(u.id)
          )
      }
    );
  }

  if (
    message.text === "/admin" &&
    isAdmin(u.id)
  ) {
    return adminPanel(
      message.chat.id
    );
  }

  if (
    message.text === "/stats" &&
    isAdmin(u.id)
  ) {
    const s =
      await db.stats();

    return sendMessage(
      message.chat.id,
      [
        "📊 STATISTIK",
        "",
        "👥 Users: " + s.users,
        "⏳ Pending: " + s.pending,
        "✅ Approved: " + s.approved,
        "❌ Rejected: " + s.rejected
      ].join("\n"),
      {
        reply_markup:
          adminKeyboard()
      }
    );
  }

  if (
    message.text === "/broadcast" &&
    isAdmin(u.id)
  ) {
    sessions.set(u.id, {
      mode: "broadcast"
    });

    return sendMessage(
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

  return sendMessage(
    message.chat.id,
    "Gunakan menu di bawah untuk mulai.",
    {
      reply_markup:
        mainKeyboard(isAdmin(u.id))
    }
  );
}

module.exports = {
  handleMessage,
  callback
};
