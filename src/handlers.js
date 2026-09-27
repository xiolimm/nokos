const {
  VIDEO_URL,
  BOT_NAME,
  DEVELOPER,
  ADMIN_ID,
  TASKS
} = require("./config");

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
  const name = [
    u.first_name,
    u.last_name
  ]
    .filter(Boolean)
    .join(" ");

  return name || "User";
}

function homeText(u) {
  return [
    "🎁 " + BOT_NAME,
    "",
    "Halo, " + displayName(u) + " 👋",
    "",
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
      reply_markup: mainKeyboard(
        isAdmin(u.id)
      )
    }
  );
}

async function showHome(chatId, u) {
  return sendMessage(
    chatId,
    homeText(u),
    {
      reply_markup: mainKeyboard(
        isAdmin(u.id)
      )
    }
  );
}

async function adminPanel(chatId) {
  return sendMessage(
    chatId,
    [
      "🛠️ ADMIN PANEL",
      "",
      "Pilih fitur admin:"
    ].join("\n"),
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
    JOIN users u
      ON u.id = s.user_id
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
      [
        s.first_name,
        s.last_name
      ]
        .filter(Boolean)
        .join(" ") || "User";

    const text = [
      "📥 SUBMISSION #" + s.id,
      "",
      "👤 " + name,
      "🔗 " +
        (s.username
          ? "@" + s.username
          : "-"),
      "🆔 " + s.user_id,
      "📋 Task: " + s.task_id,
      "🕐 " + s.created_at,
      "",
      "📎 Tipe bukti: " +
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

    if (!s.proof_file_id) {
      continue;
    }

    try {
      if (s.proof_type === "photo") {
        await sendPhoto(
          chatId,
          s.proof_file_id,
          "📎 Bukti submission #" +
            s.id
        );
      } else if (
        s.proof_type === "video"
      ) {
        await tg("sendVideo", {
          chat_id: chatId,
          video: s.proof_file_id,
          caption:
            "📎 Bukti submission #" +
            s.id
        });
      } else if (
        s.proof_type === "document"
      ) {
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
        e
      );

      await sendMessage(
        chatId,
        "⚠️ Bukti #" +
          s.id +
          " gagal dikirim ulang.\n\n" +
          e.message
      );
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

async function approveSubmission(
  callbackQuery,
  submissionId,
  adminChatId
) {
  const sub =
    await db.approveSubmission(
      submissionId,
      "Approved by admin"
    );

  if (!sub) {
    return answerCallbackQuery(
      callbackQuery.id,
      "Submission sudah diproses."
    );
  }

  try {
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
  } catch (e) {
    console.error(
      "FAILED NOTIFY APPROVED USER:",
      e
    );
  }

  await answerCallbackQuery(
    callbackQuery.id,
    "Submission approved."
  );

  return sendMessage(
    adminChatId,
    "✅ Submission #" +
      sub.id +
      " berhasil di-approve."
  );
}

async function rejectSubmission(
  callbackQuery,
  submissionId,
  adminChatId
) {
  const sub =
    await db.rejectSubmission(
      submissionId,
      "Rejected by admin"
    );

  if (!sub) {
    return answerCallbackQuery(
      callbackQuery.id,
      "Submission sudah diproses."
    );
  }

  try {
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
  } catch (e) {
    console.error(
      "FAILED NOTIFY REJECTED USER:",
      e
    );
  }

  await answerCallbackQuery(
    callbackQuery.id,
    "Submission rejected."
  );

  return sendMessage(
    adminChatId,
    "❌ Submission #" +
      sub.id +
      " ditolak."
  );
}

async function handleProof(
  chatId,
  u,
  message
) {
  const session =
    sessions.get(u.id);

  if (
    !session ||
    session.mode !== "proof"
  ) {
    return false;
  }

  if (message.text === "/cancel") {
    sessions.delete(u.id);

    await sendMessage(
      chatId,
      "❌ Pengiriman bukti dibatalkan.",
      {
        reply_markup:
          mainKeyboard(
            isAdmin(u.id)
          )
      }
    );

    return true;
  }

  let type = null;
  let fileId = null;
  let proofText = null;

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
    proofText = message.text;
  } else {
    await sendMessage(
      chatId,
      "⚠️ Format bukti belum didukung.\n\nKirim foto, video, document, atau teks."
    );

    return true;
  }

  const completed =
    await db.getCompleted(u.id);

  const alreadyCompleted =
    completed.some(function(row) {
      return row.task_id ===
        session.taskId;
    });

  if (alreadyCompleted) {
    sessions.delete(u.id);

    await sendMessage(
      chatId,
      "✅ Task ini sudah pernah diselesaikan."
    );

    return true;
  }

  const pending =
    await db.getPendingSubmission(
      u.id
    );

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

  const sub =
    await db.createSubmission({
      user_id: u.id,
      task_id: session.taskId,
      proof_type: type,
      proof_file_id: fileId,
      proof_text: proofText
    });

  sessions.delete(u.id);

  const task = TASKS.find(
    function(t) {
      return t.id ===
        session.taskId;
    }
  );

  const adminText = [
    "📥 SUBMISSION BARU",
    "",
    "👤 Nama: " +
      displayName(u),
    "🔗 Username: " +
      (u.username
        ? "@" + u.username
        : "-"),
    "🆔 User ID: " + u.id,
    "📋 Misi: " +
      (task
        ? task.title
        : session.taskId),
    "",
    "📎 Tipe bukti: " +
      type,
    "🆔 Submission #" +
      sub.id
  ].join("\n");

  try {
    await sendMessage(
      ADMIN_ID,
      adminText,
      {
        reply_markup:
          keyboard([
            [
              {
                text: "✅ APPROVE",
                callback_data:
                  "approve:" +
                  sub.id
              },
              {
                text: "❌ REJECT",
                callback_data:
                  "reject:" +
                  sub.id
              }
            ]
          ])
      }
    );

    if (fileId) {
      if (type === "photo") {
        await sendPhoto(
          ADMIN_ID,
          fileId,
          "📎 Bukti submission #" +
            sub.id
        );
      } else if (
        type === "video"
      ) {
        await tg("sendVideo", {
          chat_id: ADMIN_ID,
          video: fileId,
          caption:
            "📎 Bukti submission #" +
            sub.id
        });
      } else if (
        type === "document"
      ) {
        await sendDocument(
          ADMIN_ID,
          fileId,
          "📎 Bukti submission #" +
            sub.id
        );
      } else if (
        type === "text"
      ) {
        await sendMessage(
          ADMIN_ID,
          "📝 Isi bukti:\n\n" +
            proofText
        );
      }
    }
  } catch (e) {
    console.error(
      "FAILED SEND SUBMISSION TO ADMIN:",
      e
    );

    await sendMessage(
      ADMIN_ID,
      "⚠️ Submission #" +
        sub.id +
        " sudah tersimpan di database, tetapi notifikasi ke admin mengalami error.\n\n" +
        e.message
    );
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

  const session =
    sessions.get(u.id);

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
        reply_markup:
          adminKeyboard()
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
      reply_markup:
        adminKeyboard()
    }
  );

  return true;
}

async function callback(q) {
  const chatId =
    q.message &&
    q.message.chat
      ? q.message.chat.id
      : null;

  const userId =
    q.from
      ? q.from.id
      : null;

  const data =
    q.data || "";

  if (!chatId || !userId) {
    return;
  }

  const u =
    await db.getUser(userId);

  if (!u) {
    await answerCallbackQuery(
      q.id,
      "Silakan /start terlebih dahulu."
    );

    return;
  }

  if (data === "home") {
    await answerCallbackQuery(
      q.id
    );

    return showHome(
      chatId,
      u
    );
  }

  if (data === "menu_tasks") {
    await answerCallbackQuery(
      q.id
    );

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
        reply_markup:
          taskKeyboard(TASKS)
      }
    );
  }

  if (data.startsWith("task:")) {
    await answerCallbackQuery(
      q.id
    );

    const id =
      data.slice(5);

    const task =
      TASKS.find(
        function(x) {
          return x.id === id;
        }
      );

    if (!task) {
      return sendMessage(
        chatId,
        "❌ Task tidak ditemukan."
      );
    }

    const completedRows =
      await db.getCompleted(
        u.id
      );

    const completed =
      completedRows.some(
        function(x) {
          return x.task_id === id;
        }
      );

    return sendMessage(
      chatId,
      [
        task.title,
        "",
        "🎁 Reward: +" +
          task.reward,
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
      ].join("\n"),
      {
        reply_markup:
          taskDetailKeyboard(
            task,
            completed
          )
      }
    );
  }

  if (data.startsWith("submit:")) {
    await answerCallbackQuery(
      q.id
    );

    const id =
      data.slice(7);

    const task =
      TASKS.find(
        function(x) {
          return x.id === id;
        }
      );

    if (!task) {
      return sendMessage(
        chatId,
        "❌ Task tidak ditemukan."
      );
    }

    const completedRows =
      await db.getCompleted(
        u.id
      );

    if (
      completedRows.some(
        function(x) {
          return x.task_id === id;
        }
      )
    ) {
      return sendMessage(
        chatId,
        "✅ Task ini sudah selesai."
      );
    }

    const pending =
      await db.getPendingSubmission(
        u.id
      );

    if (pending) {
      return sendMessage(
        chatId,
        "⏳ Kamu masih memiliki submission pending #" +
          pending.id +
          ".\n\nTunggu admin memeriksanya terlebih dahulu."
      );
    }

    sessions.set(
      u.id,
      {
        mode: "proof",
        taskId: id
      }
    );

    return sendMessage(
      chatId,
      [
        "📤 KIRIM BUKTI — " +
          task.title,
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
    await answerCallbackQuery(
      q.id
    );

    return sendMessage(
      chatId,
      [
        "👤 PROFIL",
        "",
        "Nama: " +
          displayName(u),
        "Username: " +
          (u.username
            ? "@" + u.username
            : "-"),
        "User ID: " + u.id,
        "",
        "🎁 Reward: " +
          (u.balance || 0)
      ].join("\n"),
      {
        reply_markup:
          keyboard([
            [
              {
                text: "🏠 MENU UTAMA",
                callback_data:
                  "home"
              }
            ]
          ])
      }
    );
  }

  if (data === "menu_reward") {
    await answerCallbackQuery(
      q.id
    );

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
        reply_markup:
          keyboard([
            [
              {
                text: "📋 LIHAT TASK",
                callback_data:
                  "menu_tasks"
              }
            ],
            [
              {
                text: "🏠 MENU UTAMA",
                callback_data:
                  "home"
              }
            ]
          ])
      }
    );
  }

  if (data === "menu_status") {
    await answerCallbackQuery(
      q.id
    );

    const rows =
      await db.getCompleted(
        u.id
      );

    const completed =
      new Set(
        rows.map(
          function(x) {
            return x.task_id;
          }
        )
      );

    const lines =
      TASKS.map(
        function(t) {
          return (
            (
              completed.has(t.id)
                ? "✅"
                : "⏳"
            ) +
            " " +
            t.title +
            " (+" +
            t.reward +
            ")"
          );
        }
      );

    return sendMessage(
      chatId,
      "📊 STATUS\n\n" +
        lines.join("\n"),
      {
        reply_markup:
          keyboard([
            [
              {
                text: "🏠 MENU UTAMA",
                callback_data:
                  "home"
              }
            ]
          ])
      }
    );
  }

  if (data === "menu_read") {
    await answerCallbackQuery(
      q.id
    );

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
        reply_markup:
          keyboard([
            [
              {
                text: "📋 TASK / MISI",
                callback_data:
                  "menu_tasks"
              }
            ],
            [
              {
                text: "🏠 MENU UTAMA",
                callback_data:
                  "home"
              }
            ]
          ])
      }
    );
  }

  if (data === "menu_developer") {
    await answerCallbackQuery(
      q.id
    );

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
        reply_markup:
          keyboard([
            [
              {
                text: "🏠 MENU UTAMA",
                callback_data:
                  "home"
              }
            ]
          ])
      }
    );
  }

  if (data === "admin_panel") {
    if (!isAdmin(userId)) {
      return answerCallbackQuery(
        q.id,
        "Akses ditolak."
      );
    }

    await answerCallbackQuery(
      q.id
    );

    return adminPanel(
      chatId
    );
  }

  if (data === "admin_pending") {
    if (!isAdmin(userId)) {
      return answerCallbackQuery(
        q.id,
        "Akses ditolak."
      );
    }

    await answerCallbackQuery(
      q.id
    );

    return adminPending(
      chatId
    );
  }

  if (data === "admin_stats") {
    if (!isAdmin(userId)) {
      return answerCallbackQuery(
        q.id,
        "Akses ditolak."
      );
    }

    const s =
      await db.stats();

    await answerCallbackQuery(
      q.id
    );

    return sendMessage(
      chatId,
      [
        "📊 STATISTIK",
        "",
        "👥 Users: " + s.users,
        "⏳ Pending: " + s.pending,
        "✅ Approved: " + s.approved,
        "❌ Rejected: " + s.rejected,
        "🎁 Total reward user: " +
          s.rewards
      ].join("\n"),
      {
        reply_markup:
          adminKeyboard()
      }
    );
  }

  if (data === "admin_broadcast") {
    if (!isAdmin(userId)) {
      return answerCallbackQuery(
        q.id,
        "Akses ditolak."
      );
    }

    sessions.set(
      userId,
      {
        mode: "broadcast"
      }
    );

    await answerCallbackQuery(
      q.id
    );

    return sendMessage(
      chatId,
      [
        "📢 BROADCAST",
        "",
        "Kirim pesan yang ingin dikirim ke semua user sekarang.
