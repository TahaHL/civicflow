/* global process */
import pg from 'pg'

const { Pool } = pg
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' },
})

await pool.query(`
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, first_name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, preferences JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL);
  CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, priority TEXT NOT NULL, due_date DATE, done BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL);
  CREATE TABLE IF NOT EXISTS appointments (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, date DATE NOT NULL, time TIME NOT NULL, end_time TIME, location TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL);
  ALTER TABLE appointments ADD COLUMN IF NOT EXISTS end_time TIME;
  CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, category TEXT NOT NULL, issuer TEXT NOT NULL DEFAULT '', expiry_date DATE, notes TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL);
  CREATE TABLE IF NOT EXISTS money_records (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, type TEXT NOT NULL, category TEXT NOT NULL, amount_pence INTEGER NOT NULL, date DATE NOT NULL, frequency TEXT NOT NULL DEFAULT 'Once', paid BOOLEAN NOT NULL DEFAULT TRUE, notes TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL);
  CREATE TABLE IF NOT EXISTS budgets (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, category TEXT NOT NULL, month TEXT NOT NULL, limit_pence INTEGER NOT NULL, rollover BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL, UNIQUE(user_id, month, category));
  CREATE TABLE IF NOT EXISTS notification_states (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, notification_id TEXT NOT NULL, read BOOLEAN NOT NULL DEFAULT FALSE, dismissed BOOLEAN NOT NULL DEFAULT FALSE, PRIMARY KEY (user_id, notification_id));
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at BIGINT NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_tasks_user_due ON tasks(user_id, due_date);
  CREATE INDEX IF NOT EXISTS idx_appointments_user_date ON appointments(user_id, date, time);
  CREATE INDEX IF NOT EXISTS idx_documents_user_expiry ON documents(user_id, expiry_date);
  CREATE INDEX IF NOT EXISTS idx_money_user_date ON money_records(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON budgets(user_id, month);
  CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
`)

function dateKey(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : null
}

export async function readDatabase() {
  const [users, tasks, appointments, documents, moneyRecords, budgets, notificationStates, sessions] = await Promise.all([
    pool.query('SELECT * FROM users'), pool.query('SELECT * FROM tasks'), pool.query('SELECT * FROM appointments'),
    pool.query('SELECT * FROM documents'), pool.query('SELECT * FROM money_records'), pool.query('SELECT * FROM budgets'), pool.query('SELECT * FROM notification_states'), pool.query('SELECT * FROM sessions'),
  ])
  return {
    users: users.rows.map((row) => ({ id: row.id, firstName: row.first_name, email: row.email, passwordHash: row.password_hash, preferences: row.preferences, createdAt: row.created_at.toISOString() })),
    tasks: tasks.rows.map((row) => ({ id: row.id, userId: row.user_id, title: row.title, priority: row.priority, dueDate: dateKey(row.due_date), done: row.done, createdAt: row.created_at.toISOString() })),
    appointments: appointments.rows.map((row) => ({ id: row.id, userId: row.user_id, title: row.title, date: dateKey(row.date), time: String(row.time).slice(0, 5), endTime: row.end_time ? String(row.end_time).slice(0, 5) : null, location: row.location, notes: row.notes, createdAt: row.created_at.toISOString() })),
    documents: documents.rows.map((row) => ({ id: row.id, userId: row.user_id, name: row.name, category: row.category, issuer: row.issuer, expiryDate: dateKey(row.expiry_date), notes: row.notes, createdAt: row.created_at.toISOString() })),
    moneyRecords: moneyRecords.rows.map((row) => ({ id: row.id, userId: row.user_id, title: row.title, type: row.type, category: row.category, amountPence: Number(row.amount_pence), date: dateKey(row.date), frequency: row.frequency, paid: row.paid, notes: row.notes, createdAt: row.created_at.toISOString() })),
    budgets: budgets.rows.map((row) => ({ id: row.id, userId: row.user_id, category: row.category, month: row.month, limitPence: Number(row.limit_pence), rollover: row.rollover, createdAt: row.created_at.toISOString() })),
    notificationStates: notificationStates.rows.map((row) => ({ userId: row.user_id, notificationId: row.notification_id, read: row.read, dismissed: row.dismissed })),
    sessions: sessions.rows.map((row) => ({ token: row.token, userId: row.user_id, expiresAt: Number(row.expires_at) })),
  }
}

export async function writeDatabase(database) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('LOCK TABLE users, tasks, appointments, documents, money_records, budgets, notification_states, sessions IN EXCLUSIVE MODE')
    await client.query('TRUNCATE notification_states, sessions, budgets, money_records, documents, appointments, tasks, users CASCADE')
    for (const item of database.users || []) await client.query('INSERT INTO users VALUES ($1,$2,$3,$4,$5,$6)', [item.id, item.firstName, item.email, item.passwordHash, item.preferences || {}, item.createdAt])
    for (const item of database.tasks || []) await client.query('INSERT INTO tasks VALUES ($1,$2,$3,$4,$5,$6,$7)', [item.id, item.userId, item.title, item.priority, item.dueDate, item.done, item.createdAt])
    for (const item of database.appointments || []) await client.query('INSERT INTO appointments (id,user_id,title,date,time,end_time,location,notes,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [item.id, item.userId, item.title, item.date, item.time, item.endTime || null, item.location || '', item.notes || '', item.createdAt])
    for (const item of database.documents || []) await client.query('INSERT INTO documents VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [item.id, item.userId, item.name, item.category, item.issuer || '', item.expiryDate, item.notes || '', item.createdAt])
    for (const item of database.moneyRecords || []) await client.query('INSERT INTO money_records VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [item.id, item.userId, item.title, item.type, item.category, item.amountPence, item.date, item.frequency || 'Once', item.paid, item.notes || '', item.createdAt])
    for (const item of database.budgets || []) await client.query('INSERT INTO budgets VALUES ($1,$2,$3,$4,$5,$6,$7)', [item.id, item.userId, item.category, item.month, item.limitPence, item.rollover, item.createdAt])
    for (const item of database.notificationStates || []) await client.query('INSERT INTO notification_states VALUES ($1,$2,$3,$4)', [item.userId, item.notificationId, item.read, item.dismissed])
    for (const item of database.sessions || []) await client.query('INSERT INTO sessions VALUES ($1,$2,$3)', [item.token, item.userId, item.expiresAt])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function closeDatabase() {
  await pool.end()
}
