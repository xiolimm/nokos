const { neon } = require("@neondatabase/serverless");

const sql = neon(process.env.DATABASE_URL);

async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      balance INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS submissions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_id TEXT NOT NULL,
      proof_type TEXT,
      proof_file_id TEXT,
      proof_text TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      admin_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS completed_tasks (
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_id TEXT NOT NULL,
      submission_id BIGINT REFERENCES submissions(id) ON DELETE SET NULL,
      reward INTEGER NOT NULL DEFAULT 0,
      completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, task_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS broadcasts (
      id BIGSERIAL PRIMARY KEY,
      message_text TEXT NOT NULL,
      sent_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

async function upsertUser(u) {
  await sql`
    INSERT INTO users (id, username, first_name, last_name)
    VALUES (${u.id}, ${u.username || null}, ${u.first_name || null}, ${u.last_name || null})
    ON CONFLICT (id) DO UPDATE SET
      username = EXCLUDED.username,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      updated_at = NOW()
  `;
}

async function getUser(id) {
  const rows = await sql`SELECT * FROM users WHERE id=${id}`;
  return rows[0] || null;
}

async function getCompleted(id) {
  return await sql`SELECT task_id, reward, completed_at FROM completed_tasks WHERE user_id=${id}`;
}

async function createSubmission(data) {
  const rows = await sql`
    INSERT INTO submissions
      (user_id, task_id, proof_type, proof_file_id, proof_text)
    VALUES
      (${data.user_id}, ${data.task_id}, ${data.proof_type || null}, ${data.proof_file_id || null}, ${data.proof_text || null})
    RETURNING *
  `;
  return rows[0];
}

async function getPendingSubmission(id) {
  const rows = await sql`
    SELECT * FROM submissions
    WHERE user_id=${id} AND status='pending'
    ORDER BY created_at DESC LIMIT 1
  `;
  return rows[0] || null;
}

async function getSubmission(id) {
  const rows = await sql`SELECT * FROM submissions WHERE id=${id}`;
  return rows[0] || null;
}

async function approveSubmission(id, note="") {
  const rows = await sql`
    UPDATE submissions
    SET status='approved', admin_note=${note || null}, reviewed_at=NOW()
    WHERE id=${id} AND status='pending'
    RETURNING *
  `;
  const sub = rows[0];
  if (!sub) return null;

  const taskRows = await sql`
    SELECT 1 FROM completed_tasks WHERE user_id=${sub.user_id} AND task_id=${sub.task_id}
  `;
  if (taskRows.length === 0) {
    const { TASKS } = require("./config");
    const task = TASKS.find(t => t.id === sub.task_id);
    const reward = task ? task.reward : 0;

    await sql`
      INSERT INTO completed_tasks (user_id, task_id, submission_id, reward)
      VALUES (${sub.user_id}, ${sub.task_id}, ${sub.id}, ${reward})
      ON CONFLICT DO NOTHING
    `;
    if (reward > 0) {
      await sql`UPDATE users SET balance=balance+${reward}, updated_at=NOW() WHERE id=${sub.user_id}`;
    }
  }
  return sub;
}

async function rejectSubmission(id, note="") {
  const rows = await sql`
    UPDATE submissions
    SET status='rejected', admin_note=${note || null}, reviewed_at=NOW()
    WHERE id=${id} AND status='pending'
    RETURNING *
  `;
  return rows[0] || null;
}

async function stats() {
  const users = await sql`SELECT COUNT(*)::int AS n FROM users`;
  const pending = await sql`SELECT COUNT(*)::int AS n FROM submissions WHERE status='pending'`;
  const approved = await sql`SELECT COUNT(*)::int AS n FROM submissions WHERE status='approved'`;
  const rejected = await sql`SELECT COUNT(*)::int AS n FROM submissions WHERE status='rejected'`;
  const rewards = await sql`SELECT COALESCE(SUM(balance),0)::int AS n FROM users`;
  return {
    users: users[0].n,
    pending: pending[0].n,
    approved: approved[0].n,
    rejected: rejected[0].n,
    rewards: rewards[0].n
  };
}

async function allUsers() {
  return await sql`SELECT id FROM users ORDER BY id`;
}

async function saveBroadcast(text, sent, failed) {
  await sql`
    INSERT INTO broadcasts(message_text, sent_count, failed_count)
    VALUES (${text}, ${sent}, ${failed})
  `;
}

module.exports = {
  sql, initDb, upsertUser, getUser, getCompleted,
  createSubmission, getPendingSubmission, getSubmission,
  approveSubmission, rejectSubmission, stats, allUsers, saveBroadcast
};
