const VIDEO_URL = "https://files.catbox.moe/jdkcdl.mp4";

const TASKS = [
  {
    id: "task_1",
    title: "🎯 TASK 1 — Referral",
    reward: 1,
    link: "https://t.me/ainovum_bot?start=ref_5280266010",
    description:
      "Buka bot referral melalui tombol di bawah dan ikuti instruksi yang tersedia di bot tersebut. Setelah kamu benar-benar menyelesaikan ketentuan referral, kembali ke sini dan kirim bukti.",
    proofHint: "Kirim screenshot yang menunjukkan bahwa ketentuan referral sudah selesai."
  },
  {
    id: "task_2",
    title: "⛏️ TASK 2 — MiningGRAM",
    reward: 2,
    link: "https://t.me/MiningGRAM_Bot/mine?startapp=2FBQFBU",
    description:
      "Buka MiningGRAM melalui tombol di bawah. Selesaikan misi yang tersedia pada bagian TASK/Mission di bot tersebut. Jangan mengerjakan misi Boost Group untuk task ini. Setelah misi lain yang diwajibkan selesai, kirim bukti.",
    proofHint: "Kirim screenshot halaman TASK/Mission yang memperlihatkan progres atau misi yang sudah selesai."
  },
  {
    id: "task_3",
    title: "🌱 TASK 3 — HiFami",
    reward: 7,
    link: "https://s.hifamiapp.com/1/2lxOpRH3h",
    description:
      "Buka referral HiFami melalui tombol di bawah dan instal aplikasinya. Lakukan progres sampai tanaman mencapai level 20. Setelah level 20 benar-benar tercapai, kirim bukti.",
    proofHint: "Kirim screenshot aplikasi yang jelas memperlihatkan tanaman sudah level 20."
  }
];

module.exports = {
  VIDEO_URL,
  BOT_NAME: "NOKOSS XIOLIM FREE",
  DEVELOPER: process.env.DEVELOPER || "@limprincee",
  ADMIN_ID: Number(process.env.ADMIN_ID || "5280266010"),
  TASKS
};
