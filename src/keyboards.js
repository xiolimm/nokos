const { keyboard } = require("./telegram");

function mainKeyboard(isAdmin = false) {
const rows = [
[
{ text: "📋 TASK / MISI", callback_data: "menu_tasks" },
{ text: "🎁 REWARD", callback_data: "menu_reward" }
],
[
{ text: "👤 PROFIL", callback_data: "menu_profile" },
{ text: "📊 STATUS", callback_data: "menu_status" }
],
[
{ text: "📖 READ FIRST", callback_data: "menu_read" }
],
[
{ text: "🛠️ DEVELOPER", callback_data: "menu_developer" }
]
];

if (isAdmin) {
rows.push([
{ text: "👑 ADMIN PANEL", callback_data: "admin_panel" }
]);
}

return keyboard(rows);
}

function taskKeyboard(tasks) {
const rows = [];

for (const t of tasks) {
rows.push([
{
text: "${t.title} • +${t.reward}",
callback_data: "task:${t.id}"
}
]);
}

rows.push([
{
text: "🏠 MENU UTAMA",
callback_data: "home"
}
]);

return keyboard(rows);
}

function taskDetailKeyboard(task, completed = false) {
const rows = [
[
{
text: "🚀 BUKA TASK",
url: task.link
}
]
];

if (!completed) {
rows.push([
{
text: "📤 KIRIM BUKTI",
callback_data: "submit:${task.id}"
}
]);
}

rows.push([
{
text: "⬅️ KEMBALI",
callback_data: "menu_tasks"
}
]);

return keyboard(rows);
}

function adminKeyboard() {
return keyboard([
[
{
text: "⏳ PENDING",
callback_data: "admin_pending"
}
],
[
{
text: "📊 STATISTIK",
callback_data: "admin_stats"
}
],
[
{
text: "📢 BROADCAST",
callback_data: "admin_broadcast"
}
],
[
{
text: "🏠 MENU UTAMA",
callback_data: "home"
}
]
]);
}

module.exports = {
mainKeyboard,
taskKeyboard,
taskDetailKeyboard,
adminKeyboard
};
