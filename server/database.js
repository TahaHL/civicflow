/* global process */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const directory = path.dirname(fileURLToPath(import.meta.url))
const dataDirectory = path.join(directory, 'data')
const databasePath = process.env.CIVICFLOW_DB_PATH || path.join(dataDirectory, 'civicflow.db')
const legacyPath = path.join(dataDirectory, 'db.json')

fs.mkdirSync(path.dirname(databasePath), { recursive: true })
const sqlite = new DatabaseSync(databasePath)
sqlite.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    preferences TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    priority TEXT NOT NULL,
    due_date TEXT,
    done INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    end_time TEXT,
    location TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    issuer TEXT NOT NULL DEFAULT '',
    expiry_date TEXT,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS money_records (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    category TEXT NOT NULL,
    amount_pence INTEGER NOT NULL,
    date TEXT NOT NULL,
    frequency TEXT NOT NULL DEFAULT 'Once',
    paid INTEGER NOT NULL DEFAULT 1,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    month TEXT NOT NULL,
    limit_pence INTEGER NOT NULL,
    rollover INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    UNIQUE(user_id, month, category)
  );
  CREATE TABLE IF NOT EXISTS notification_states (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_id TEXT NOT NULL,
    read INTEGER NOT NULL DEFAULT 0,
    dismissed INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, notification_id)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_user_due ON tasks(user_id, due_date);
  CREATE INDEX IF NOT EXISTS idx_appointments_user_date ON appointments(user_id, date, time);
  CREATE INDEX IF NOT EXISTS idx_documents_user_expiry ON documents(user_id, expiry_date);
  CREATE INDEX IF NOT EXISTS idx_money_user_date ON money_records(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON budgets(user_id, month);
  CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
`)

const appointmentColumns = sqlite.prepare('PRAGMA table_info(appointments)').all()
if (!appointmentColumns.some((column) => column.name === 'end_time')) sqlite.exec('ALTER TABLE appointments ADD COLUMN end_time TEXT')
if (!appointmentColumns.some((column) => column.name === 'completed')) sqlite.exec('ALTER TABLE appointments ADD COLUMN completed INTEGER NOT NULL DEFAULT 0')

export function readDatabase() {
  return {
    users: sqlite.prepare('SELECT * FROM users').all().map((row) => ({ id: row.id, firstName: row.first_name, email: row.email, passwordHash: row.password_hash, preferences: JSON.parse(row.preferences), createdAt: row.created_at })),
    tasks: sqlite.prepare('SELECT * FROM tasks').all().map((row) => ({ id: row.id, userId: row.user_id, title: row.title, priority: row.priority, dueDate: row.due_date, done: Boolean(row.done), createdAt: row.created_at })),
    appointments: sqlite.prepare('SELECT * FROM appointments').all().map((row) => ({ id: row.id, userId: row.user_id, title: row.title, date: row.date, time: row.time, endTime: row.end_time, location: row.location, notes: row.notes, completed: Boolean(row.completed), createdAt: row.created_at })),
    documents: sqlite.prepare('SELECT * FROM documents').all().map((row) => ({ id: row.id, userId: row.user_id, name: row.name, category: row.category, issuer: row.issuer, expiryDate: row.expiry_date, notes: row.notes, createdAt: row.created_at })),
    moneyRecords: sqlite.prepare('SELECT * FROM money_records').all().map((row) => ({ id: row.id, userId: row.user_id, title: row.title, type: row.type, category: row.category, amountPence: Number(row.amount_pence), date: row.date, frequency: row.frequency, paid: Boolean(row.paid), notes: row.notes, createdAt: row.created_at })),
    budgets: sqlite.prepare('SELECT * FROM budgets').all().map((row) => ({ id: row.id, userId: row.user_id, category: row.category, month: row.month, limitPence: Number(row.limit_pence), rollover: Boolean(row.rollover), createdAt: row.created_at })),
    notificationStates: sqlite.prepare('SELECT * FROM notification_states').all().map((row) => ({ userId: row.user_id, notificationId: row.notification_id, read: Boolean(row.read), dismissed: Boolean(row.dismissed) })),
    sessions: sqlite.prepare('SELECT * FROM sessions').all().map((row) => ({ token: row.token, userId: row.user_id, expiresAt: Number(row.expires_at) })),
  }
}

export function writeDatabase(database) {
  sqlite.exec('BEGIN IMMEDIATE')
  try {
    for (const table of ['notification_states', 'sessions', 'budgets', 'money_records', 'documents', 'appointments', 'tasks', 'users']) sqlite.exec(`DELETE FROM ${table}`)
    const insertUser = sqlite.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?)')
    for (const item of database.users || []) insertUser.run(item.id, item.firstName, item.email, item.passwordHash, JSON.stringify(item.preferences || {}), item.createdAt)
    const insertTask = sqlite.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?)')
    for (const item of database.tasks || []) insertTask.run(item.id, item.userId, item.title, item.priority, item.dueDate, item.done ? 1 : 0, item.createdAt)
    const insertAppointment = sqlite.prepare('INSERT INTO appointments (id, user_id, title, date, time, end_time, location, notes, completed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    for (const item of database.appointments || []) insertAppointment.run(item.id, item.userId, item.title, item.date, item.time, item.endTime || null, item.location || '', item.notes || '', item.completed ? 1 : 0, item.createdAt)
    const insertDocument = sqlite.prepare('INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    for (const item of database.documents || []) insertDocument.run(item.id, item.userId, item.name, item.category, item.issuer || '', item.expiryDate, item.notes || '', item.createdAt)
    const insertMoneyRecord = sqlite.prepare('INSERT INTO money_records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    for (const item of database.moneyRecords || []) insertMoneyRecord.run(item.id, item.userId, item.title, item.type, item.category, item.amountPence, item.date, item.frequency || 'Once', item.paid ? 1 : 0, item.notes || '', item.createdAt)
    const insertBudget = sqlite.prepare('INSERT INTO budgets VALUES (?, ?, ?, ?, ?, ?, ?)')
    for (const item of database.budgets || []) insertBudget.run(item.id, item.userId, item.category, item.month, item.limitPence, item.rollover ? 1 : 0, item.createdAt)
    const insertNotificationState = sqlite.prepare('INSERT INTO notification_states VALUES (?, ?, ?, ?)')
    for (const item of database.notificationStates || []) insertNotificationState.run(item.userId, item.notificationId, item.read ? 1 : 0, item.dismissed ? 1 : 0)
    const insertSession = sqlite.prepare('INSERT INTO sessions VALUES (?, ?, ?)')
    for (const item of database.sessions || []) insertSession.run(item.token, item.userId, item.expiresAt)
    sqlite.exec('COMMIT')
  } catch (error) {
    sqlite.exec('ROLLBACK')
    throw error
  }
}

if (sqlite.prepare('SELECT COUNT(*) AS count FROM users').get().count === 0 && fs.existsSync(legacyPath)) {
  const legacyDatabase = JSON.parse(fs.readFileSync(legacyPath, 'utf8'))
  writeDatabase(legacyDatabase)
  console.log('Migrated existing CivicFlow data from JSON to SQLite.')
}
