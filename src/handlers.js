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
  keyboard,
  sendMessage,
  sendVideo,
  sendPhoto,
  sendDocument,
  answerCallbackQuery
} = require("./telegram");

const {
  mainKeyboard,
  taskKeyboard,
  taskDetailKeyboard,
  adminKeyboard
} = require("./keyboards");

/*
|--------------------------------------------------------------------------
| SESSION
|--------------------------------------------------------------------------
| Catatan:
| Session disimpan di memory server.
| Untuk flow sederhana masih bisa digunakan.
|--------------------------------------------------------------------------
*/

const sessions = new Map();

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function isAdmin(userId) {
  return Number(userId) === Number(ADMIN_ID);
}

function displayName(user) {
  const parts = [
    user.first_name,
    user.last_name
  ].filter(Boolean);

  return parts.length
    ? parts.join(" ")
    : "User";
}

function getTask(taskId) {
  return TASKS.find(function(task) {
    return task.id === taskId;
  });
}

function homeText(user) {
  return [
    "🎁 " + BOT_NAME,
    "",
    "Halo, " + displayName(user) + " 👋",
    "",
    "Selesaikan task yang tersedia untuk mendapatkan nokos.",
    "",
    "🆔 User ID: " + user.id,
    "🎁 Saldo: " + (user.balance || 0),
    "",
    "Pilih menu di bawah."
  ].join("\n");
}

/*
|--------------------------------------------------------------------------
| HOME / START
|--------------------------------------------------------------------------
*/

async function sendHome(chatId, user) {
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

async function sendStart(chatId, user) {
  const caption = [
    "🎁 " + BOT_NAME,
    "",
    "Selamat datang, " + displayName(user) + "!",
    "",
    "Selesaikan misi yang tersedia.",
    "Kirim bukti setelah task selesai.",
    "",
    "🎁 Nokos diberikan setelah bukti disetujui admin."
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

/*
|--------------------------------------------------------------------------
| TASK LIST
|--------------------------------------------------------------------------
*/

async function showTasks(chatId) {
  return sendMessage(
    chatId,
    [
      "📋 TASK / MISI",
      "",
      "Pilih task yang ingin kamu kerjakan."
    ].join("\n"),
    {
      reply_markup: taskKeyboard(TASKS)
    }
  );
}

/*
|--------------------------------------------------------------------------
| TASK DETAIL
|--------------------------------------------------------------------------
*/

async function showTask(chatId, user, taskId) {
  const task = getTask(taskId);

  if (!task) {
    return sendMessage(
      chatId,
      "❌ Task tidak ditemukan."
    );
  }

  const completed =
    await db.getCompleted(user.id);

  const done = completed.some(function(item) {
    return item.task_id === task.id;
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
      (done ? "✅ Sudah selesai" : "⏳ Belum selesai")
  ].join("\n");

  return sendMessage(
    chatId,
    text,
    {
      reply_markup:
        taskDetailKeyboard(
          task,
          done
        )
    }
  );
}

/*
|--------------------------------------------------------------------------
| START PROOF
|--------------------------------------------------------------------------
*/

async function startProof(chatId, userId, taskId) {
  const task = getTask(taskId);

  if (!task) {
    return sendMessage(
      chatId,
      "❌ Task tidak ditemukan."
    );
  }

  const completed =
    await db.getCompleted(userId);

  const alreadyDone =
    completed.some(function(item) {
      return item.task_id === taskId;
    });

  if (alreadyDone) {
    return sendMessage(
      chatId,
      "✅ Task ini sudah pernah kamu selesaikan."
    );
  }

  const pending =
    await db.getPendingSubmission(
      userId
    );

  if (pending) {
    return sendMessage(
      chatId,
      [
        "⏳ Kamu masih memiliki submission pending.",
        "",
        "Submission #" + pending.id,
        "",
        "Tunggu admin memeriksa bukti tersebut terlebih dahulu."
      ].join("\n")
    );
  }

  sessions.set(
    userId,
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
      "Kirim salah satu:",
      "• Screenshot / foto",
      "• Video",
      "• Document",
      "• Teks",
      "",
      "Ketik /cancel untuk membatalkan."
    ].join("\n")
  );
}

/*
|--------------------------------------------------------------------------
| SEND PROOF TO ADMIN
|--------------------------------------------------------------------------
*/

async function sendProofToAdmin(
  user,
  submission
) {
  const task =
    getTask(submission.task_id);

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
    "🆔 User ID: " +
      user.id,
    "",
    "📋 Task: " +
      (
        task
          ? task.title
          : submission.task_id
      ),
    "🎁 Reward: +" +
      (
        task
          ? task.reward
          : 0
      ),
    "📎 Tipe bukti: " +
      (
        submission.proof_type || "-"
      ),
    "🆔 Submission #" +
      submission.id
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

  if (
    submission.proof_type === "photo" &&
    submission.proof_file_id
  ) {
    await sendPhoto(
      ADMIN_ID,
      submission.proof_file_id,
      "📎 Bukti submission #" +
        submission.id
    );

    return;
  }

  if (
    submission.proof_type === "video" &&
    submission.proof_file_id
  ) {
    await tg(
      "sendVideo",
      {
        chat_id: ADMIN_ID,
        video: submission.proof_file_id,
        caption:
          "📎 Bukti submission #" +
          submission.id
      }
    );

    return;
  }

  if (
    submission.proof_type === "document" &&
    submission.proof_file_id
  ) {
    await sendDocument(
      ADMIN_ID,
      submission.proof_file_id,
      "📎 Bukti submission #" +
        submission.id
    );

    return;
  }

  if (
    submission.proof_type === "text" &&
    submission.proof_text
  ) {
    await sendMessage(
      ADMIN_ID,
      [
        "📝 BUKTI TEKS",
        "",
        submission.proof_text
      ].join("\n")
    );
  }
}

/*
|--------------------------------------------------------------------------
| HANDLE PROOF
|--------------------------------------------------------------------------
*/

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

  if (
    message.text === "/cancel"
  ) {
    sessions.delete(user.id);

    await sendMessage(
      chatId,
      "❌ Pengiriman bukti dibatalkan.",
      {
        reply_markup:
          mainKeyboard(
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
    message.photo.length
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

  const alreadyDone =
    completed.some(function(item) {
      return item.task_id ===
        session.taskId;
    });

  if (alreadyDone) {
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
        "⏳ Kamu masih memiliki submission pending.",
        "",
        "Submission #" +
          pending.id
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

  await sendMessage(
    chatId,
    [
      "✅ BUKTI TERKIRIM",
      "",
      "Submission #" +
        submission.id,
      "",
      "⏳ Status: Menunggu pemeriksaan admin.",
      "",
      "Tunggu admin memproses bukti kamu."
    ].join("\n")
  );

  return true;
}

/*
|--------------------------------------------------------------------------
| ADMIN PANEL
|--------------------------------------------------------------------------
*/

async function adminPanel(chatId) {
  return sendMessage(
    chatId,
    [
      "👑 ADMIN PANEL",
      "",
      "Pilih fitur admin:"
    ].join("\n"),
    {
      reply_markup:
        adminKeyboard()
    }
  );
}

/*
|--------------------------------------------------------------------------
| ADMIN PENDING
|--------------------------------------------------------------------------
*/

async function adminPending(chatId) {
  const rows =
    await db.sql`
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
    return sendMessage(
      chatId,
      "⏳ Tidak ada submission pending.",
      {
        reply_markup:
          adminKeyboard()
      }
    );
  }

  for (const row of rows) {
    const task =
      getTask(row.task_id);

    const name = [
      row.first_name,
      row.last_name
    ].filter(Boolean).join(" ") || "User";

    const text = [
      "📥 SUBMISSION #" +
        row.id,
      "",
      "👤 Nama: " +
        name,
      "🔗 Username: " +
        (
          row.username
            ? "@" + row.username
            : "-"
        ),
      "🆔 User ID: " +
        row.user_id,
      "",
      "📋 Task: " +
        (
          task
            ? task.title
            : row.task_id
        ),
      "🎁 Reward: +" +
        (
          task
            ? task.reward
            : 0
        ),
      "📎 Tipe: " +
        (
          row.proof_type || "-"
        ),
      "",
      row.proof_text
        ? "📝 " + row.proof_text
        : ""
    ].join("\n");

    await sendMessage(
      chatId,
      text,
      {
        reply_markup:
          keyboard([
            [
              {
                text: "✅ APPROVE",
                callback_data:
                  "approve:" +
                  row.id
              },
              {
                text: "❌ REJECT",
                callback_data:
                  "reject:" +
                  row.id
              }
            ]
          ])
      }
    );

    try {
      if (
        row.proof_type === "photo" &&
        row.proof_file_id
      ) {
        await sendPhoto(
          chatId,
          row.proof_file_id,
          "📎 Bukti #" + row.id
        );
      }

      if (
        row.proof_type === "video" &&
        row.proof_file_id
      ) {
        await tg(
          "sendVideo",
          {
            chat_id: chatId,
            video: row.proof_file_id,
            caption:
              "📎 Bukti #" + row.id
          }
        );
      }

      if (
        row.proof_type === "document" &&
        row.proof_file_id
      ) {
        await sendDocument(
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

  return sendMessage(
    chatId,
    "👑 Admin Panel",
    {
      reply_markup:
        adminKeyboard()
    }
  );
}

/*
|--------------------------------------------------------------------------
| APPROVE
|--------------------------------------------------------------------------
*/

async function approveSubmission(
  submissionId,
  adminChatId
) {
  const submission =
    await db.approveSubmission(
      submissionId,
      "Approved by admin"
    );

  if (!submission) {
    return sendMessage(
      adminChatId,
      "⚠️ Submission sudah diproses atau tidak ditemukan."
    );
  }

  const task =
    getTask(submission.task_id);

  try {
    await sendMessage(
      submission.user_id,
      [
        "✅ BUKTI DISETUJUI",
        "",
        "Task: " +
          (
            task
              ? task.title
              : submission.task_id
          ),
        "",
        "🎁 Reward: +" +
          (
            task
              ? task.reward
              : 0
          ),
        "",
        "Reward sudah ditambahkan ke saldo kamu."
      ].join("\n")
    );
  } catch (error) {
    console.error(
      "APPROVE NOTIFY ERROR:",
      error
    );
  }

  return sendMessage(
    adminChatId,
    "✅ Submission #" +
      submission.id +
      " berhasil di-approve."
  );
}

/*
|--------------------------------------------------------------------------
| REJECT
|--------------------------------------------------------------------------
*/

async function rejectSubmission(
  submissionId,
  adminChatId
) {
  const submission =
    await db.rejectSubmission(
      submissionId,
      "Rejected by admin"
    );

  if (!submission) {
    return sendMessage(
      adminChatId,
      "⚠️ Submission sudah diproses atau tidak ditemukan."
    );
  }

  const task =
    getTask(submission.task_id);

  try {
    await sendMessage(
      submission.user_id,
      [
        "❌ BUKTI DITOLAK",
        "",
        "Task: " +
          (
            task
              ? task.title
              : submission.task_id
          ),
        "",
        "Silakan cek kembali ketentuan task.",
        "Setelah itu kamu bisa mengirim bukti lagi."
      ].join("\n")
    );
  } catch (error) {
    console.error(
      "REJECT NOTIFY ERROR:",
      error
    );
  }

  return sendMessage(
    adminChatId,
    "❌ Submission #" +
      submission.id +
      " berhasil ditolak."
  );
}

/*
|--------------------------------------------------------------------------
| STATS
|--------------------------------------------------------------------------
*/

async function showStats(chatId) {
  const stats =
    await db.stats();

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
      "🎁 Total reward: " +
        stats.rewards
    ].join("\n"),
    {
      reply_markup:
        adminKeyboard()
    }
  );
}

/*
|--------------------------------------------------------------------------
| CALLBACK HANDLER
|--------------------------------------------------------------------------
*/

async function callback(query) {
  if (!query) {
    return;
  }

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

  try {
    await answerCallbackQuery(
      query.id
    );
  } catch (error) {
    console.error(
      "CALLBACK ANSWER ERROR:",
      error
    );
  }

  const user =
    await db.getUser(userId);

  if (!user) {
    return sendMessage(
      chatId,
      "Silakan kirim /start terlebih dahulu."
    );
  }

  /*
  | HOME
  */

  if (data === "home") {
    return sendHome(
      chatId,
      user
    );
  }

  /*
  | TASK MENU
  */

  if (data === "menu_tasks") {
    return showTasks(chatId);
  }

  /*
  | TASK DETAIL
  */

  if (data.startsWith("task:")) {
    return showTask(
      chatId,
      user,
      data.substring(5)
    );
  }

  /*
  | SUBMIT
  */

  if (data.startsWith("submit:")) {
    return startProof(
      chatId,
      user.id,
      data.substring(7)
    );
  }

  /*
  | PROFILE
  */

  if (data === "menu_profile") {
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
        "🆔 User ID: " +
          user.id,
        "",
        "🎁 Saldo: " +
          (user.balance || 0)
      ].join("\n"),
      {
        reply_markup:
          keyboard([
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

  /*
  | REWARD
  */

  if (data === "menu_reward") {
    return sendMessage(
      chatId,
      [
        "🎁 REWARD",
        "",
        "Saldo kamu: " +
          (user.balance || 0),
        "",
        "Nokos diberikan setelah task disetujui admin."
      ].join("\n"),
      {
        reply_markup:
          keyboard([
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

  /*
  | STATUS
  */

  if (data === "menu_status") {
    const completed =
      await db.getCompleted(user.id);

    const completedIds =
      new Set(
        completed.map(function(item) {
          return item.task_id;
        })
      );

    const lines =
      TASKS.map(function(task) {
        return (
          (
            completedIds.has(task.id)
              ? "✅ "
              : "⏳ "
          ) +
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
        reply_markup:
          keyboard([
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

  /*
  | READ FIRST
  */

  if (data === "menu_read") {
    return sendMessage(
      chatId,
      [
        "📖 READ FIRST",
        "",
        "1. Pilih task.",
        "2. Buka link task.",
        "3. Selesaikan ketentuan.",
        "4. Kirim bukti.",
        "5. Tunggu admin memeriksa.",
        "6. Nokos bisa di Akses setelah disetujui. ( nokos hanya bisa di klaim jika udah punya 4 nokos yaaaw(⁠ ⁠◜⁠‿⁠◝⁠ ⁠)⁠♡)"
        
      ].join("\n"),
      {
        reply_markup:
          keyboard([
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

  /*
  | DEVELOPER
  */

  if (data === "menu_developer") {
    return sendMessage(
      chatId,
      [
        "🛠️ DEVELOPER",
        "",
        DEVELOPER
      ].join("\n"),
      {
        reply_markup:
          keyboard([
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

  /*
  | ADMIN PANEL
  */

  if (data === "admin_panel") {
    if (!isAdmin(userId)) {
      return sendMessage(
        chatId,
        "❌ Akses ditolak."
      );
    }

    return adminPanel(chatId);
  }

  /*
  | ADMIN PENDING
  */

  if (data === "admin_pending") {
    if (!isAdmin(userId)) {
      return sendMessage(
        chatId,
        "❌ Akses ditolak."
      );
    }

    return adminPending(chatId);
  }

  /*
  | ADMIN STATS
  */

  if (data === "admin_stats") {
    if (!isAdmin(userId)) {
      return sendMessage(
        chatId,
        "❌ Akses ditolak."
      );
    }

    return showStats(chatId);
  }

  /*
  | ADMIN BROADCAST
  */

  if (data === "admin_broadcast") {
    if (!isAdmin(userId)) {
      return sendMessage(
        chatId,
        "❌ Akses ditolak."
      );
    }

    sessions.set(
      userId,
      {
        mode: "broadcast"
      }
    );

    return sendMessage(
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

  /*
  | APPROVE
  */

  if (data.startsWith("approve:")) {
    if (!isAdmin(userId)) {
      return sendMessage(
        chatId,
        "❌ Akses ditolak."
      );
    }

    const id =
      Number(data.substring(8));

    return approveSubmission(
      id,
      chatId
    );
  }

  /*
  | REJECT
  */

  if (data.startsWith("reject:")) {
    if (!isAdmin(userId)) {
      return sendMessage(
        chatId,
        "❌ Akses ditolak."
      );
    }

    const id =
      Number(data.substring(7));

    return rejectSubmission(
      id,
      chatId
    );
  }
}

/*
|--------------------------------------------------------------------------
| BROADCAST MESSAGE
|--------------------------------------------------------------------------
*/

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

  if (
    message.text === "/cancel"
  ) {
    sessions.delete(user.id);

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
    message.caption ||
    "";

  if (!text) {
    await sendMessage(
      chatId,
      "⚠️ Broadcast harus berupa pesan teks."
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
      "✅ Terkirim: " +
        sent,
      "❌ Gagal: " +
        failed
    ].join("\n"),
    {
      reply_markup:
        adminKeyboard()
    }
  );

  return true;
}

/*
|--------------------------------------------------------------------------
| HANDLE MESSAGE
|--------------------------------------------------------------------------
*/

async function handleMessage(message) {
  if (
    !message ||
    !message.from ||
    !message.chat
  ) {
    return;
  }

  const user =
    message.from;

  const chatId =
    message.chat.id;

  /*
  | SAVE USER
  */

  await db.upsertUser(user);

  /*
  | PRIVATE CHAT ONLY
  */

  if (
    message.chat.type !== "private"
  ) {
    return;
  }

  /*
  | BROADCAST
  */

  if (
    await handleBroadcast(
      chatId,
      user,
      message
    )
  ) {
    return;
  }

  /*
  | PROOF
  */

  const proofSession =
    sessions.get(user.id);

  if (
    proofSession &&
    proofSession.mode === "proof"
  ) {
    await handleProof(
      chatId,
      user,
      message
    );

    return;
  }

  /*
  | START
  */

  if (
    message.text === "/start"
  ) {
    const savedUser =
      await db.getUser(user.id);

    return sendStart(
      chatId,
      savedUser || user
    );
  }

  /*
  | CANCEL
  */

  if (
    message.text === "/cancel"
  ) {
    sessions.delete(user.id);

    return sendMessage(
      chatId,
      "❌ Tidak ada proses yang sedang berjalan.",
      {
        reply_markup:
          mainKeyboard(
            isAdmin(user.id)
          )
      }
    );
  }

  /*
  | ADMIN COMMAND
  */

  if (
    message.text === "/admin" &&
    isAdmin(user.id)
  ) {
    return adminPanel(chatId);
  }

  if (
    message.text === "/stats" &&
    isAdmin(user.id)
  ) {
    return showStats(chatId);
  }

  if (
    message.text === "/broadcast" &&
    isAdmin(user.id)
  ) {
    sessions.set(
      user.id,
      {
        mode: "broadcast"
      }
    );

    return sendMessage(
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

  /*
  | DEFAULT
  */

  return sendHome(
    chatId,
    user
  );
}

/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
*/

module.exports = {
  handleMessage,
  callback
};
