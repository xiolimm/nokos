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
  sendVideo,
  sendPhoto,
  sendDocument,
  answerCallbackQuery,
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

function displayName(user) {
  const name = [
    user.first_name,
    user.last_name
  ]
    .filter(Boolean)
    .join(" ");

  return name || "User";
}

function homeText(user) {
  return [
    "🎁 " + BOT_NAME,
    "",
    "Halo, " + displayName(user) + " 👋",
    "",
    "Selesaikan task yang tersedia untuk mendapatkan reward.",
    "",
    "🆔 User ID: " + user.id,
    "🎁 Reward: " + (user.balance || 0),
    "",
    "Pilih menu di bawah."
  ].join("\n");
}

async function start(chatId, user) {
  const caption = [
    "🎁 " + BOT_NAME,
    "",
    "Selamat datang, " + displayName(user) + "!",
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
        isAdmin(user.id)
      )
    }
  );
}

async function showHome(chatId, user) {
  return sendMessage(
    chatId,
    homeText(user),
    {
      reply_markup: mainKeyboard(
        isAdmin(user.id)
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

  for (const submission of rows) {
    const name = [
      submission.first_name,
      submission.last_name
    ]
      .filter(Boolean)
      .join(" ") || "User";

    const info = [
      "📥 SUBMISSION #" + submission.id,
      "",
      "👤 " + name,
      "🔗 " + (
        submission.username
          ? "@" + submission.username
          : "-"
      ),
      "🆔 User ID: " + submission.user_id,
      "📋 Task: " + submission.task_id,
      "📎 Tipe: " + (
        submission.proof_type || "-"
      ),
      "🕐 " + submission.created_at,
      "",
      submission.proof_text
        ? "📝 " + submission.proof_text
        : ""
    ].join("\n");

    await sendMessage(
      chatId,
      info,
      {
        reply_markup: keyboard([
          [
            {
              text: "✅ APPROVE",
              callback_data:
                "approve:" + submission.id
            },
            {
              text: "❌ REJECT",
              callback_data:
                "reject:" + submission.id
            }
          ]
        ])
      }
    );

    if (!submission.proof_file_id) {
      continue;
    }

    try {
      if (submission.proof_type === "photo") {
        await sendPhoto(
          chatId,
          submission.proof_file_id,
          "📎 Bukti submission #" +
            submission.id
        );
      } else if (
        submission.proof_type === "video"
      ) {
        await tg("sendVideo", {
          chat_id: chatId,
          video: submission.proof_file_id,
          caption:
            "📎 Bukti submission #" +
            submission.id
        });
      } else if (
        submission.proof_type === "document"
      ) {
        await sendDocument(
          chatId,
          submission.proof_file_id,
          "📎 Bukti submission #" +
            submission.id
        );
      }
    } catch (error) {
      console.error(
        "FAILED SEND PROOF:",
        error
      );
    }
  }

  return sendMessage(
    chatId,
    "🛠️ Admin Panel",
    {
      reply_markup: adminKeyboard()
    }
  );
}

async function approveSubmission(
  query,
  submissionId,
  adminChatId
) {
  const submission =
    await db.approveSubmission(
      submissionId,
      "Approved by admin"
    );

  if (!submission) {
    return answerCallbackQuery(
      query.id,
      "Submission sudah diproses."
    );
  }

  try {
    await sendMessage(
      submission.user_id,
      [
        "✅ BUKTI DISETUJUI",
        "",
        "Task: " + submission.task_id,
        "",
        "🎁 Reward sudah ditambahkan ke akun kamu."
      ].join("\n")
    );
  } catch (error) {
    console.error(
      "FAILED NOTIFY APPROVED USER:",
      error
    );
  }

  await answerCallbackQuery(
    query.id,
    "Submission approved."
  );

  return sendMessage(
    adminChatId,
    "✅ Submission #" +
      submission.id +
      " berhasil di-approve."
  );
}

async function rejectSubmission(
  query,
  submissionId,
  adminChatId
) {
  const submission =
    await db.rejectSubmission(
      submissionId,
      "Rejected by admin"
    );

  if (!submission) {
    return answerCallbackQuery(
      query.id,
      "Submission sudah diproses."
    );
  }

  try {
    await sendMessage(
      submission.user_id,
      [
        "❌ BUKTI DITOLAK",
        "",
        "Task: " + submission.task_id,
        "",
        "Silakan periksa kembali ketentuan task dan kirim bukti yang lebih jelas."
      ].join("\n")
    );
  } catch (error) {
    console.error(
      "FAILED NOTIFY REJECTED USER:",
      error
    );
  }

  await answerCallbackQuery(
    query.id,
    "Submission rejected."
  );

  return sendMessage(
    adminChatId,
    "❌ Submission #" +
      submission.id +
      " berhasil ditolak."
  );
}

async function handleProof(
  chatId,
  user,
  message
) {
  const session =
    sessions.get(user.id);

  if (
    !session ||
    session.mode !== "proof"
  ) {
    return false;
  }

  if (message.text === "/cancel") {
    sessions.delete(user.id);

    await sendMessage(
      chatId,
      "❌ Pengiriman bukti dibatalkan.",
      {
        reply_markup: mainKeyboard(
          isAdmin(user.id)
        )
      }
    );

    return true;
  }

  let proofType = null;
  let proofFileId = null;
  let proofText = null;

  if (
    message.photo &&
    message.photo.length > 0
  ) {
    proofType = "photo";

    proofFileId =
      message.photo[
        message.photo.length - 1
      ].file_id;
  } else if (message.video) {
    proofType = "video";
    proofFileId =
      message.video.file_id;
  } else if (message.document) {
    proofType = "document";
    proofFileId =
      message.document.file_id;
  } else if (message.text) {
    proofType = "text";
    proofText = message.text;
  } else {
    await sendMessage(
      chatId,
      [
        "⚠️ Format bukti tidak didukung.",
        "",
        "Kirim foto, video, document, atau teks."
      ].join("\n")
    );

    return true;
  }

  const completed =
    await db.getCompleted(user.id);

  const alreadyCompleted =
    completed.some(function(item) {
      return item.task_id ===
        session.taskId;
    });

  if (alreadyCompleted) {
    sessions.delete(user.id);

    await sendMessage(
      chatId,
      "✅ Task ini sudah pernah diselesaikan."
    );

    return true;
  }

  const pending =
    await db.getPendingSubmission(
      user.id
    );

  if (pending) {
    sessions.delete(user.id);

    await sendMessage(
      chatId,
      [
        "⏳ Kamu masih memiliki submission pending #" +
          pending.id,
        "",
        "Tunggu admin memeriksanya terlebih dahulu."
      ].join("\n")
    );

    return true;
  }

  const submission =
    await db.createSubmission({
      user_id: user.id,
      task_id: session.taskId,
      proof_type: proofType,
      proof_file_id: proofFileId,
      proof_text: proofText
    });

  sessions.delete(user.id);

  const task =
    TASKS.find(function(item) {
      return item.id ===
        session.taskId;
    });

  const adminText = [
    "📥 SUBMISSION BARU",
    "",
    "👤 Nama: " +
      displayName(user),
    "🔗 Username: " +
      (
        user.username
          ? "@" + user.username
          : "-"
      ),
    "🆔 User ID: " + user.id,
    "📋 Misi: " +
      (
        task
          ? task.title
          : session.taskId
      ),
    "📎 Tipe bukti: " +
      proofType,
    "🆔 Submission #" +
      submission.id
  ].join("\n");

  try {
    await sendMessage(
      ADMIN_ID,
      adminText,
      {
        reply_markup: keyboard([
          [
            {
              text: "✅ APPROVE",
              callback_data:
                "approve:" +
                submission.id
            },
            {
              text: "❌ REJECT",
              callback_data:
                "reject:" +
                submission.id
            }
          ]
        ])
      }
    );

    if (proofFileId) {
      if (proofType === "photo") {
        await sendPhoto(
          ADMIN_ID,
          proofFileId,
          "📎 Bukti submission #" +
            submission.id
        );
      } else if (
        proofType === "video"
      ) {
        await tg("sendVideo", {
          chat_id: ADMIN_ID,
          video: proofFileId,
          caption:
            "📎 Bukti submission #" +
            submission.id
        });
      } else if (
        proofType === "document"
      ) {
        await sendDocument(
          ADMIN_ID,
          proofFileId,
          "📎 Bukti submission #" +
            submission.id
        );
      }
    }

    if (
      proofType === "text" &&
      proofText
    ) {
      await sendMessage(
        ADMIN_ID,
        [
          "📝 ISI BUKTI",
          "",
          proofText
        ].join("\n")
      );
    }
  } catch (error) {
    console.error(
      "FAILED SEND SUBMISSION TO ADMIN:",
      error
    );
  }

  await sendMessage(
    chatId,
    [
      "✅ Bukti sudah diterima.",
      "",
      "Submission #" +
        submission.id,
      "Status: ⏳ Menunggu pemeriksaan admin.",
      "",
      "Tunggu sampai admin memproses bukti kamu."
    ].join("\n")
  );

  return true;
}

async function handleBroadcast(
  chatId,
  user,
  message
) {
  if (!isAdmin(user.id)) {
    return false;
  }

  const session =
    sessions.get(user.id);

  if (
    !session ||
    session.mode !== "broadcast"
  ) {
    return false;
  }

  if (message.text === "/cancel") {
    sessions.delete(user.id);

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
    message.caption ||
    "";

  if (!text) {
    await sendMessage(
      chatId,
      "⚠️ Broadcast saat ini hanya mendukung pesan teks."
    );

    return true;
  }

  sessions.delete(user.id);

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

  const data =
    query.data || "";

  if (!chatId || !userId) {
    return;
  }

  const user =
    await db.getUser(userId);

  if (!user) {
    await answerCallbackQuery(
      query.id,
      "Silakan /start terlebih dahulu."
    );

    return;
  }

  if (data === "home") {
    await answerCallbackQuery(query.id);

    return showHome(
      chatId,
      user
    );
  }

  if (data === "menu_tasks") {
    await answerCallbackQuery(query.id);

    return sendMessage(
      chatId,
      [
        "📋 TASK / MISI",
        "",
        "Selesaikan task sesuai instruksi.",
        "Setelah selesai, kirim bukti untuk diperiksa admin."
      ].join("\n"),
      {
        reply_markup:
          taskKeyboard(TASKS)
      }
    );
  }

  if (data.startsWith("task:")) {
    await answerCallbackQuery(query.id);

    const taskId =
      data.substring(5);

    const task =
      TASKS.find(function(item) {
        return item.id === taskId;
      });

    if (!task) {
      return sendMessage(
        chatId,
        "❌ Task tidak ditemukan."
      );
    }

    const completed =
      await db.getCompleted(
        user.id
      );

    const isCompleted =
      completed.some(function(item) {
        return item.task_id ===
          taskId;
      });

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
            isCompleted
              ? "✅ Sudah selesai"
              : "⏳ Belum selesai"
          )
      ].join("\n"),
      {
        reply_markup:
          taskDetailKeyboard(
            task,
            isCompleted
          )
      }
    );
  }

  if (data.startsWith("submit:")) {
    await answerCallbackQuery(query.id);

    const taskId =
      data.substring(7);

    const task =
      TASKS.find(function(item) {
        return item.id === taskId;
      });

    if (!task) {
      return sendMessage(
        chatId,
        "❌ Task tidak ditemukan."
      );
    }

    const completed =
      await db.getCompleted(
        user.id
      );

    if (
      completed.some(function(item) {
        return item.task_id === taskId;
      })
    ) {
      return sendMessage(
        chatId,
        "✅ Task ini sudah selesai."
      );
    }

    const pending =
      await db.getPendingSubmission(
        user.id
      );

    if (pending) {
      return sendMessage(
        chatId,
        [
          "⏳ Masih ada submission pending #" +
            pending.id,
          "",
          "Tunggu admin memeriksanya terlebih dahulu."
        ].join("\n")
      );
    }

    sessions.set(
      user.id,
      {
        mode: "proof",
        taskId: taskId
      }
    );

    return sendMessage(
      chatId,
      [
        "📤 KIRIM BUKTI",
        "",
        task.title,
        "",
        task.proofHint,
        "",
        "Kirim screenshot, foto, video, document, atau teks.",
        "",
        "Ketik /cancel untuk membatalkan."
      ].join("\n")
    );
  }

  if (data === "menu_profile") {
    await answerCallbackQuery(query.id);

    return sendMessage(
      chatId,
      [
        "👤 PROFIL",
        "",
        "Nama: " +
          displayName(user),
        "Username: " +
          (
            user.username
              ? "@" + user.username
              : "-"
          ),
        "User ID: " +
          user.id,
        "",
        "🎁 Reward: " +
          (user.balance || 0)
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
    await answerCallbackQuery(query.id);

    return sendMessage(
      chatId,
      [
        "🎁 REWARD",
        "",
        "Saldo reward kamu: " +
          (user.balance || 0),
        "",
        "Reward diberikan setelah task disetujui admin."
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

  if (data === "menu_status") {
    await answerCallbackQuery(query.id);

    const completed =
      await db.getCompleted(
        user.id
      );

    const completedSet =
      new Set(
        completed.map(function(item) {
          return item.task_id;
        })
      );

    const lines =
      TASKS.map(function(task) {
        return (
          (
            completedSet.has(task.id)
              ? "✅"
              : "⏳"
          ) +
          " " +
          task.title +
          " (+" +
          task.reward +
          ")"
        );
      });

    return sendMessage(
      chatId,
      [
        "📊 STATUS",
        "",
        ...lines
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

  if (data === "menu_read") {
    await answerCallbackQuery(query.id);

    return sendMessage(
      chatId,
      [
        "📖 READ FIRST",
        "",
        "1. Pilih task.",
        "2. Buka link task.",
        "3. Selesaikan ketentuannya.",
        "4. Kirim bukti yang jelas.",
        "5. Tunggu admin memeriksa.",
        "6. Reward masuk setelah disetujui.",
        "",
        "⚠️ Jangan kirim bukti palsu atau screenshot yang diedit."
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
    await answerCallbackQuery(query.id);

    return sendMessage(
      chatId,
      [
        "🛠️ DEVELOPER",
        "",
        DEVELOPER,
        "",
        BOT_NAME
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
      return answerCallbackQuery(
        query.id,
        "Akses ditolak."
      );
    }

    await answerCallbackQuery(query.id);

    return adminPanel(chatId);
  }

  if (data === "admin_pending") {
    if (!isAdmin(userId)) {
      return answerCallbackQuery(
        query.id,
        "Akses ditolak."
      );
    }

    await answerCallbackQuery(query.id);

    return adminPending(chatId);
  }

  if (data === "admin_stats") {
    if (!isAdmin(userId)) {
      return answerCallbackQuery(
        query.id,
        "Akses ditolak."
      );
    }

    const stats =
      await db.stats();

    await answerCallbackQuery(query.id);

    return sendMessage(
      chatId,
      [
        "📊 STATISTIK",
        "",
        "👥 Users: " +
          stats.users,
        "⏳ Pending: " +
          stats.pending,
        "✅ Approved: " +
          stats.approved,
        "❌ Rejected: " +
          stats.rejected,
        "🎁 Total reward user: " +
          stats.rewards
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
        query.id,
        "Akses ditolak."
      );
    }

    sessions.set(
      userId,
      {
        mode: "broadcast"
      }
    );

    await answerCallbackQuery(query.id);

    return sendMessage(
      chatId,
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
        mainKeyboard(
          isAdmin(user.id)
        )
    }
  );
}

module.exports = {
  handleMessage,
  callback
};
