/* global Buffer, process */
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'

const databaseAdapter = process.env.DATABASE_URL ? await import('./database-postgres.js') : await import('./database.js')
const { readDatabase, writeDatabase } = databaseAdapter

const app = express()
const port = process.env.PORT || 3001
const isProduction = process.env.NODE_ENV === 'production'
const sessionCookieName = 'civicflow_session'
const allowedOrigins = (process.env.APP_ORIGIN || '').split(',').map((origin) => origin.trim()).filter(Boolean)
const defaultPreferences = {
  taskReminders: true,
  appointmentReminders: true,
  documentReminders: true,
  billReminders: true,
  theme: 'system',
}
if (isProduction) app.set('trust proxy', 1)
app.use(helmet({ contentSecurityPolicy: isProduction ? undefined : false }))
app.use(express.json({ limit: '32kb' }))
app.use('/api', (request, response, next) => {
  const requestOrigin = request.get('origin')
  const originAllowed = requestOrigin && allowedOrigins.includes(requestOrigin)

  if (originAllowed) {
    response.setHeader('Access-Control-Allow-Origin', requestOrigin)
    response.setHeader('Access-Control-Allow-Credentials', 'true')
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    response.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PATCH,DELETE,OPTIONS')
    response.setHeader('Vary', 'Origin')
  }

  if (request.method === 'OPTIONS') {
    if (isProduction && requestOrigin && !originAllowed) return response.status(403).end()
    return response.status(204).end()
  }

  if (isProduction && requestOrigin && !originAllowed) return response.status(403).json({ message: 'Request origin is not allowed.' })
  next()
})
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }))
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, skipSuccessfulRequests: true }))

app.get('/api/health', async (request, response, next) => {
  try {
    await readDatabase()
    response.json({ status: 'ok', database: process.env.DATABASE_URL ? 'postgresql' : 'sqlite', timestamp: new Date().toISOString() })
  } catch (error) { next(error) }
})

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) reject(error)
      else resolve(`${salt}:${derivedKey.toString('hex')}`)
    })
  })
}

async function passwordMatches(password, savedHash) {
  const [salt, key] = savedHash.split(':')
  const attemptedHash = await hashPassword(password, salt)
  return crypto.timingSafeEqual(Buffer.from(attemptedHash), Buffer.from(`${salt}:${key}`))
}

function cookies(request) {
  return Object.fromEntries((request.headers.cookie || '').split(';').filter(Boolean).map((part) => {
    const [key, ...value] = part.trim().split('=')
    return [key, decodeURIComponent(value.join('='))]
  }))
}

function sessionTokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function createSession(response, database, userId) {
  const token = crypto.randomBytes(32).toString('hex')
  database.sessions = database.sessions.filter((session) => session.expiresAt > Date.now())
  database.sessions.push({ token: sessionTokenHash(token), userId, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 })
  response.setHeader('Set-Cookie', `${sessionCookieName}=${token}; HttpOnly; Path=/; Max-Age=604800${isProduction ? '; SameSite=None; Secure' : '; SameSite=Lax'}`)
}

async function clearSession(request, response) {
  const token = cookies(request)[sessionCookieName]
  if (token) {
    const database = await readDatabase()
    const tokenHash = sessionTokenHash(token)
    database.sessions = database.sessions.filter((session) => session.token !== token && session.token !== tokenHash)
    await writeDatabase(database)
  }
  response.setHeader('Set-Cookie', `${sessionCookieName}=; HttpOnly; Path=/; Max-Age=0${isProduction ? '; SameSite=None; Secure' : '; SameSite=Lax'}`)
}

async function requireUser(request, response, next) {
  const token = cookies(request)[sessionCookieName]
  const database = await readDatabase()
  const tokenHash = token ? sessionTokenHash(token) : ''
  const session = database.sessions.find((item) => item.token === tokenHash || item.token === token)
  if (!session || session.expiresAt < Date.now()) {
    return response.status(401).json({ message: 'Please sign in to continue.' })
  }
  if (session.token === token) {
    session.token = tokenHash
    await writeDatabase(database)
  }
  const user = database.users.find((item) => item.id === session.userId)
  if (!user) return response.status(401).json({ message: 'Account not found.' })
  request.user = user
  next()
}

function publicUser(user) {
  return { id: user.id, firstName: user.firstName, email: user.email, preferences: { ...defaultPreferences, ...user.preferences } }
}

function daysFromToday(date) {
  const today = new Date()
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const [year, month, day] = date.split('-').map(Number)
  return Math.round((Date.UTC(year, month - 1, day) - todayUtc) / 86400000)
}

function timeAfter(time, minutes = 60) {
  const [hours, mins] = time.split(':').map(Number)
  const total = Math.min((hours * 60) + mins + minutes, (24 * 60) - 1)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function validTimeRange(start, end) {
  const validTime = (value) => {
    if (!/^\d{2}:\d{2}$/.test(value)) return false
    const [hours, minutes] = value.split(':').map(Number)
    return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60
  }
  return validTime(start) && validTime(end) && end > start
}

function buildNotifications(database, userId) {
  const notifications = []
  const user = database.users.find((item) => item.id === userId)
  const preferences = { ...defaultPreferences, ...user?.preferences }
  for (const task of database.tasks.filter((item) => preferences.taskReminders && item.userId === userId && !item.done && item.dueDate)) {
    const days = daysFromToday(task.dueDate)
    if (days <= 3) notifications.push({
      id: `task-${task.id}`, type: 'task', sourceId: task.id,
      title: days < 0 ? 'Task overdue' : days === 0 ? 'Task due today' : 'Task deadline approaching',
      message: task.title, date: task.dueDate, urgency: days < 0 ? 'critical' : days === 0 ? 'warning' : 'info',
      link: '/tasks',
    })
  }
  for (const appointment of database.appointments.filter((item) => preferences.appointmentReminders && item.userId === userId)) {
    const days = daysFromToday(appointment.date)
    if (days >= 0 && days <= 7) notifications.push({
      id: `appointment-${appointment.id}`, type: 'appointment', sourceId: appointment.id,
      title: days === 0 ? 'Appointment today' : days === 1 ? 'Appointment tomorrow' : 'Upcoming appointment',
      message: `${appointment.title} · ${appointment.time}–${appointment.endTime || timeAfter(appointment.time)}`, date: appointment.date,
      urgency: days <= 1 ? 'warning' : 'info', link: '/calendar',
    })
  }
  for (const document of database.documents.filter((item) => preferences.documentReminders && item.userId === userId && item.expiryDate)) {
    const days = daysFromToday(document.expiryDate)
    if (days <= 60) notifications.push({
      id: `document-${document.id}`, type: 'document', sourceId: document.id,
      title: days < 0 ? 'Document expired' : days === 0 ? 'Document expires today' : 'Document expiry approaching',
      message: document.name, date: document.expiryDate,
      urgency: days < 0 ? 'critical' : days <= 14 ? 'warning' : 'info', link: '/documents',
    })
  }
  for (const bill of (database.moneyRecords || []).filter((item) => preferences.billReminders && item.userId === userId && item.type === 'bill' && !item.paid)) {
    const days = daysFromToday(bill.date)
    if (days <= 7) notifications.push({
      id: `bill-${bill.id}`, type: 'bill', sourceId: bill.id,
      title: days < 0 ? 'Bill overdue' : days === 0 ? 'Bill due today' : 'Bill payment approaching',
      message: `${bill.title} · £${(bill.amountPence / 100).toFixed(2)}`, date: bill.date,
      urgency: days < 0 ? 'critical' : days <= 2 ? 'warning' : 'info', link: '/money',
    })
  }

  const urgencyOrder = { critical: 0, warning: 1, info: 2 }
  return notifications.map((notification) => {
    const state = database.notificationStates.find((item) => item.userId === userId && item.notificationId === notification.id)
    return { ...notification, read: state?.read || false, dismissed: state?.dismissed || false }
  }).filter((notification) => !notification.dismissed)
    .sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency] || a.date.localeCompare(b.date))
}

app.post('/api/auth/register', async (request, response, next) => {
  try {
    const firstName = request.body.firstName?.trim()
    const email = request.body.email?.trim().toLowerCase()
    const password = request.body.password
    if (!firstName || !email || !password) return response.status(400).json({ message: 'All fields are required.' })
    if (password.length < 8) return response.status(400).json({ message: 'Password must be at least 8 characters.' })

    const database = await readDatabase()
    if (database.users.some((user) => user.email === email)) return response.status(409).json({ message: 'An account with this email already exists.' })

    const user = { id: crypto.randomUUID(), firstName, email, passwordHash: await hashPassword(password), preferences: { ...defaultPreferences }, createdAt: new Date().toISOString() }
    database.users.push(user)
    createSession(response, database, user.id)
    await writeDatabase(database)
    response.status(201).json({ user: publicUser(user) })
  } catch (error) { next(error) }
})

app.post('/api/auth/login', async (request, response, next) => {
  try {
    const email = request.body.email?.trim().toLowerCase()
    const password = request.body.password || ''
    const database = await readDatabase()
    const user = database.users.find((item) => item.email === email)
    if (!user || !(await passwordMatches(password, user.passwordHash))) return response.status(401).json({ message: 'Incorrect email or password.' })
    createSession(response, database, user.id)
    await writeDatabase(database)
    response.json({ user: publicUser(user) })
  } catch (error) { next(error) }
})

app.post('/api/auth/logout', async (request, response, next) => {
  try {
    await clearSession(request, response)
  } catch (error) { return next(error) }
  response.status(204).end()
})

app.get('/api/auth/me', requireUser, (request, response) => response.json({ user: publicUser(request.user) }))

app.patch('/api/profile', requireUser, async (request, response, next) => {
  try {
    const firstName = request.body.firstName?.trim()
    if (!firstName) return response.status(400).json({ message: 'First name is required.' })
    if (firstName.length > 50) return response.status(400).json({ message: 'First name must be 50 characters or fewer.' })
    const database = await readDatabase()
    const user = database.users.find((item) => item.id === request.user.id)
    user.firstName = firstName
    await writeDatabase(database)
    response.json({ user: publicUser(user) })
  } catch (error) { next(error) }
})

app.patch('/api/profile/preferences', requireUser, async (request, response, next) => {
  try {
    const database = await readDatabase()
    const user = database.users.find((item) => item.id === request.user.id)
    const preferences = { ...defaultPreferences, ...user.preferences }
    for (const key of ['taskReminders', 'appointmentReminders', 'documentReminders', 'billReminders']) {
      if (typeof request.body[key] === 'boolean') preferences[key] = request.body[key]
    }
    if (['light', 'dark', 'system'].includes(request.body.theme)) preferences.theme = request.body.theme
    user.preferences = preferences
    await writeDatabase(database)
    response.json({ user: publicUser(user) })
  } catch (error) { next(error) }
})

app.patch('/api/profile/password', requireUser, async (request, response, next) => {
  try {
    const currentPassword = request.body.currentPassword || ''
    const newPassword = request.body.newPassword || ''
    if (newPassword.length < 8) return response.status(400).json({ message: 'New password must be at least 8 characters.' })
    const database = await readDatabase()
    const user = database.users.find((item) => item.id === request.user.id)
    if (!(await passwordMatches(currentPassword, user.passwordHash))) return response.status(401).json({ message: 'Your current password is incorrect.' })
    user.passwordHash = await hashPassword(newPassword)
    const currentToken = cookies(request)[sessionCookieName]
    const currentTokenHash = sessionTokenHash(currentToken)
    database.sessions = database.sessions.filter((session) => session.userId !== user.id || session.token === currentToken || session.token === currentTokenHash)
    await writeDatabase(database)
    response.status(204).end()
  } catch (error) { next(error) }
})

app.get('/api/tasks', requireUser, async (request, response, next) => {
  try {
    const database = await readDatabase()
    response.json({ tasks: database.tasks.filter((task) => task.userId === request.user.id) })
  } catch (error) { next(error) }
})

app.post('/api/tasks', requireUser, async (request, response, next) => {
  try {
    const title = request.body.title?.trim()
    if (!title) return response.status(400).json({ message: 'A task title is required.' })
    const task = {
      id: crypto.randomUUID(), userId: request.user.id, title,
      priority: ['Low', 'Medium', 'High'].includes(request.body.priority) ? request.body.priority : 'Medium',
      dueDate: request.body.dueDate || null, done: false, createdAt: new Date().toISOString(),
    }
    const database = await readDatabase()
    database.tasks.unshift(task)
    await writeDatabase(database)
    response.status(201).json({ task })
  } catch (error) { next(error) }
})

app.patch('/api/tasks/:id', requireUser, async (request, response, next) => {
  try {
    const database = await readDatabase()
    const task = database.tasks.find((item) => item.id === request.params.id && item.userId === request.user.id)
    if (!task) return response.status(404).json({ message: 'Task not found.' })
    if (request.body.title !== undefined) {
      const title = request.body.title?.trim()
      if (!title || title.length > 120) return response.status(400).json({ message: 'Enter a task name of 120 characters or fewer.' })
      task.title = title
    }
    if (typeof request.body.done === 'boolean') task.done = request.body.done
    if (['Low', 'Medium', 'High'].includes(request.body.priority)) task.priority = request.body.priority
    if (request.body.dueDate !== undefined) {
      if (request.body.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(request.body.dueDate)) return response.status(400).json({ message: 'Enter a valid due date.' })
      task.dueDate = request.body.dueDate || null
    }
    await writeDatabase(database)
    response.json({ task })
  } catch (error) { next(error) }
})

app.delete('/api/tasks/:id', requireUser, async (request, response, next) => {
  try {
    const database = await readDatabase()
    const taskIndex = database.tasks.findIndex((item) => item.id === request.params.id && item.userId === request.user.id)
    if (taskIndex === -1) return response.status(404).json({ message: 'Task not found.' })
    database.tasks.splice(taskIndex, 1)
    await writeDatabase(database)
    response.status(204).end()
  } catch (error) { next(error) }
})

app.get('/api/appointments', requireUser, async (request, response, next) => {
  try {
    const database = await readDatabase()
    const appointments = database.appointments
      .filter((appointment) => appointment.userId === request.user.id)
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
    response.json({ appointments })
  } catch (error) { next(error) }
})

app.post('/api/appointments', requireUser, async (request, response, next) => {
  try {
    const title = request.body.title?.trim()
    const date = request.body.date
    const time = request.body.time
    const endTime = request.body.endTime || timeAfter(time || '00:00')
    if (!title || !date || !time) return response.status(400).json({ message: 'Title, date and time are required.' })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !validTimeRange(time, endTime)) return response.status(400).json({ message: 'Choose a valid start and end time.' })
    const appointment = {
      id: crypto.randomUUID(), userId: request.user.id, title, date, time, endTime,
      location: request.body.location?.trim() || '', notes: request.body.notes?.trim() || '',
      createdAt: new Date().toISOString(),
    }
    const database = await readDatabase()
    database.appointments.push(appointment)
    await writeDatabase(database)
    response.status(201).json({ appointment })
  } catch (error) { next(error) }
})

app.patch('/api/appointments/:id', requireUser, async (request, response, next) => {
  try {
    const database = await readDatabase()
    const appointment = database.appointments.find((item) => item.id === request.params.id && item.userId === request.user.id)
    if (!appointment) return response.status(404).json({ message: 'Appointment not found.' })
    if (request.body.title !== undefined) appointment.title = request.body.title?.trim()
    if (request.body.date !== undefined) appointment.date = request.body.date
    if (request.body.time !== undefined) appointment.time = request.body.time
    if (request.body.endTime !== undefined) appointment.endTime = request.body.endTime
    if (typeof request.body.location === 'string') appointment.location = request.body.location.trim().slice(0, 150)
    if (typeof request.body.notes === 'string') appointment.notes = request.body.notes.trim().slice(0, 500)
    appointment.endTime ||= timeAfter(appointment.time)
    if (!appointment.title || appointment.title.length > 120 || !/^\d{4}-\d{2}-\d{2}$/.test(appointment.date) || !validTimeRange(appointment.time, appointment.endTime)) return response.status(400).json({ message: 'Choose a valid title, date, start time and end time.' })
    await writeDatabase(database)
    response.json({ appointment })
  } catch (error) { next(error) }
})

app.delete('/api/appointments/:id', requireUser, async (request, response, next) => {
  try {
    const database = await readDatabase()
    const index = database.appointments.findIndex((item) => item.id === request.params.id && item.userId === request.user.id)
    if (index === -1) return response.status(404).json({ message: 'Appointment not found.' })
    database.appointments.splice(index, 1)
    await writeDatabase(database)
    response.status(204).end()
  } catch (error) { next(error) }
})

app.get('/api/documents', requireUser, async (request, response, next) => {
  try {
    const database = await readDatabase()
    const documents = database.documents
      .filter((document) => document.userId === request.user.id)
      .sort((a, b) => (a.expiryDate || '9999').localeCompare(b.expiryDate || '9999'))
    response.json({ documents })
  } catch (error) { next(error) }
})

app.post('/api/documents', requireUser, async (request, response, next) => {
  try {
    const name = request.body.name?.trim()
    const allowedCategories = ['Identity', 'Home', 'Vehicle', 'Finance', 'Health', 'Other']
    if (!name) return response.status(400).json({ message: 'A document name is required.' })
    const document = {
      id: crypto.randomUUID(), userId: request.user.id, name,
      category: allowedCategories.includes(request.body.category) ? request.body.category : 'Other',
      issuer: request.body.issuer?.trim() || '', expiryDate: request.body.expiryDate || null,
      notes: request.body.notes?.trim() || '', createdAt: new Date().toISOString(),
    }
    const database = await readDatabase()
    database.documents.push(document)
    await writeDatabase(database)
    response.status(201).json({ document })
  } catch (error) { next(error) }
})

app.patch('/api/documents/:id', requireUser, async (request, response, next) => {
  try {
    const database = await readDatabase()
    const document = database.documents.find((item) => item.id === request.params.id && item.userId === request.user.id)
    if (!document) return response.status(404).json({ message: 'Document not found.' })
    const allowedCategories = ['Identity', 'Home', 'Vehicle', 'Finance', 'Health', 'Other']
    if (request.body.name !== undefined) {
      const name = request.body.name?.trim()
      if (!name || name.length > 120) return response.status(400).json({ message: 'Enter a document name of 120 characters or fewer.' })
      document.name = name
    }
    if (allowedCategories.includes(request.body.category)) document.category = request.body.category
    if (typeof request.body.issuer === 'string') document.issuer = request.body.issuer.trim().slice(0, 150)
    if (request.body.expiryDate !== undefined) {
      if (request.body.expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(request.body.expiryDate)) return response.status(400).json({ message: 'Enter a valid expiry date.' })
      document.expiryDate = request.body.expiryDate || null
    }
    if (typeof request.body.notes === 'string') document.notes = request.body.notes.trim().slice(0, 500)
    await writeDatabase(database)
    response.json({ document })
  } catch (error) { next(error) }
})

app.delete('/api/documents/:id', requireUser, async (request, response, next) => {
  try {
    const database = await readDatabase()
    const index = database.documents.findIndex((item) => item.id === request.params.id && item.userId === request.user.id)
    if (index === -1) return response.status(404).json({ message: 'Document not found.' })
    database.documents.splice(index, 1)
    await writeDatabase(database)
    response.status(204).end()
  } catch (error) { next(error) }
})

const moneyTypes = ['income', 'expense', 'bill']
const moneyCategories = ['Income', 'Housing', 'Utilities', 'Groceries', 'Transport', 'Health', 'Insurance', 'Subscriptions', 'Leisure', 'Shopping', 'Other']
const moneyFrequencies = ['Once', 'Weekly', 'Monthly', 'Quarterly', 'Yearly']

function nextMoneyDate(date, frequency) {
  const current = new Date(`${date}T12:00:00Z`)
  if (frequency === 'Weekly') current.setUTCDate(current.getUTCDate() + 7)
  else {
    const originalDay = current.getUTCDate()
    const months = frequency === 'Monthly' ? 1 : frequency === 'Quarterly' ? 3 : frequency === 'Yearly' ? 12 : 0
    current.setUTCDate(1)
    current.setUTCMonth(current.getUTCMonth() + months)
    const lastDay = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0)).getUTCDate()
    current.setUTCDate(Math.min(originalDay, lastDay))
  }
  return current.toISOString().slice(0, 10)
}

app.get('/api/money', requireUser, async (request, response, next) => {
  try {
    const database = await readDatabase()
    const records = (database.moneyRecords || [])
      .filter((record) => record.userId === request.user.id)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    response.json({ records })
  } catch (error) { next(error) }
})

app.post('/api/money', requireUser, async (request, response, next) => {
  try {
    const title = request.body.title?.trim()
    const type = request.body.type
    const amount = Number(request.body.amount)
    const date = request.body.date
    if (!title || !moneyTypes.includes(type) || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
      return response.status(400).json({ message: 'Enter a title, type, positive amount and valid date.' })
    }
    if (title.length > 100 || amount > 100000000) return response.status(400).json({ message: 'This financial record is too large.' })
    const record = {
      id: crypto.randomUUID(), userId: request.user.id, title, type,
      category: moneyCategories.includes(request.body.category) ? request.body.category : 'Other',
      amountPence: Math.round(amount * 100), date,
      frequency: type === 'bill' && moneyFrequencies.includes(request.body.frequency) ? request.body.frequency : 'Once',
      paid: type === 'bill' ? Boolean(request.body.paid) : true,
      notes: request.body.notes?.trim().slice(0, 500) || '', createdAt: new Date().toISOString(),
    }
    const database = await readDatabase()
    database.moneyRecords ||= []
    database.moneyRecords.push(record)
    await writeDatabase(database)
    response.status(201).json({ record })
  } catch (error) { next(error) }
})

app.patch('/api/money/:id', requireUser, async (request, response, next) => {
  try {
    const database = await readDatabase()
    const record = (database.moneyRecords || []).find((item) => item.id === request.params.id && item.userId === request.user.id)
    if (!record) return response.status(404).json({ message: 'Financial record not found.' })
    if (request.body.type !== undefined && !moneyTypes.includes(request.body.type)) return response.status(400).json({ message: 'Choose a valid record type.' })
    if (request.body.amount !== undefined) {
      const amount = Number(request.body.amount)
      if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) return response.status(400).json({ message: 'Enter a positive amount.' })
      record.amountPence = Math.round(amount * 100)
    }
    if (request.body.date !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(request.body.date)) return response.status(400).json({ message: 'Enter a valid date.' })
      record.date = request.body.date
    }
    if (request.body.type !== undefined) record.type = request.body.type
    if (request.body.category !== undefined) {
      if (!moneyCategories.includes(request.body.category)) return response.status(400).json({ message: 'Choose a valid category.' })
      record.category = request.body.category
    }
    if (record.type === 'income') record.category = 'Income'
    else if (record.category === 'Income') record.category = 'Other'
    if (request.body.frequency !== undefined && !moneyFrequencies.includes(request.body.frequency)) return response.status(400).json({ message: 'Choose a valid repeat schedule.' })
    record.frequency = record.type === 'bill' && request.body.frequency !== undefined ? request.body.frequency : record.type === 'bill' ? record.frequency : 'Once'
    const wasPaid = record.paid
    if (typeof request.body.paid === 'boolean' && record.type === 'bill') record.paid = request.body.paid
    if (record.type !== 'bill') record.paid = true
    if (request.body.title !== undefined) {
      const title = request.body.title?.trim()
      if (!title) return response.status(400).json({ message: 'A name is required.' })
      record.title = title.slice(0, 100)
    }
    if (typeof request.body.notes === 'string') record.notes = request.body.notes.trim().slice(0, 500)
    let nextRecord = null
    if (!wasPaid && record.paid && record.frequency !== 'Once') {
      const nextDate = nextMoneyDate(record.date, record.frequency)
      const alreadyScheduled = database.moneyRecords.some((item) => item.userId === record.userId && item.type === 'bill' && item.title === record.title && item.date === nextDate)
      if (!alreadyScheduled) {
        nextRecord = { ...record, id: crypto.randomUUID(), date: nextDate, paid: false, createdAt: new Date().toISOString() }
        database.moneyRecords.push(nextRecord)
      }
    }
    await writeDatabase(database)
    response.json({ record, nextRecord })
  } catch (error) { next(error) }
})

app.delete('/api/money/:id', requireUser, async (request, response, next) => {
  try {
    const database = await readDatabase()
    const index = (database.moneyRecords || []).findIndex((item) => item.id === request.params.id && item.userId === request.user.id)
    if (index === -1) return response.status(404).json({ message: 'Financial record not found.' })
    database.moneyRecords.splice(index, 1)
    await writeDatabase(database)
    response.status(204).end()
  } catch (error) { next(error) }
})

app.get('/api/budgets', requireUser, async (request, response, next) => {
  try {
    const database = await readDatabase()
    const budgets = (database.budgets || []).filter((budget) => budget.userId === request.user.id)
    response.json({ budgets })
  } catch (error) { next(error) }
})

app.post('/api/budgets/copy', requireUser, async (request, response, next) => {
  try {
    const { fromMonth, toMonth } = request.body
    if (!/^\d{4}-\d{2}$/.test(fromMonth || '') || !/^\d{4}-\d{2}$/.test(toMonth || '') || fromMonth === toMonth) {
      return response.status(400).json({ message: 'Choose two different valid months.' })
    }
    const database = await readDatabase()
    database.budgets ||= []
    const existingCategories = new Set(database.budgets.filter((item) => item.userId === request.user.id && item.month === toMonth).map((item) => item.category))
    const copied = database.budgets.filter((item) => item.userId === request.user.id && item.month === fromMonth && !existingCategories.has(item.category)).map((item) => ({ ...item, id: crypto.randomUUID(), month: toMonth, createdAt: new Date().toISOString() }))
    database.budgets.push(...copied)
    await writeDatabase(database)
    response.status(201).json({ budgets: copied })
  } catch (error) { next(error) }
})

app.post('/api/budgets', requireUser, async (request, response, next) => {
  try {
    const category = request.body.category
    const month = request.body.month
    const limit = Number(request.body.limit)
    if (!moneyCategories.includes(category) || category === 'Income' || !/^\d{4}-\d{2}$/.test(month || '') || !Number.isFinite(limit) || limit <= 0 || limit > 100000000) {
      return response.status(400).json({ message: 'Enter a category, valid month and positive budget limit.' })
    }
    const database = await readDatabase()
    database.budgets ||= []
    let budget = database.budgets.find((item) => item.userId === request.user.id && item.month === month && item.category === category)
    const created = !budget
    if (budget) {
      budget.limitPence = Math.round(limit * 100)
      budget.rollover = Boolean(request.body.rollover)
    } else {
      budget = { id: crypto.randomUUID(), userId: request.user.id, category, month, limitPence: Math.round(limit * 100), rollover: Boolean(request.body.rollover), createdAt: new Date().toISOString() }
      database.budgets.push(budget)
    }
    await writeDatabase(database)
    response.status(created ? 201 : 200).json({ budget, created })
  } catch (error) { next(error) }
})

app.delete('/api/budgets/:id', requireUser, async (request, response, next) => {
  try {
    const database = await readDatabase()
    const index = (database.budgets || []).findIndex((item) => item.id === request.params.id && item.userId === request.user.id)
    if (index === -1) return response.status(404).json({ message: 'Budget not found.' })
    database.budgets.splice(index, 1)
    await writeDatabase(database)
    response.status(204).end()
  } catch (error) { next(error) }
})

app.patch('/api/budgets/:id', requireUser, async (request, response, next) => {
  try {
    const database = await readDatabase()
    const budget = (database.budgets || []).find((item) => item.id === request.params.id && item.userId === request.user.id)
    if (!budget) return response.status(404).json({ message: 'Budget not found.' })
    if (request.body.category !== undefined) {
      const category = request.body.category
      if (!moneyCategories.includes(category) || category === 'Income') return response.status(400).json({ message: 'Choose a valid budget category.' })
      const duplicate = database.budgets.some((item) => item.id !== budget.id && item.userId === request.user.id && item.month === budget.month && item.category === category)
      if (duplicate) return response.status(409).json({ message: `${category} already has a budget for this month.` })
      budget.category = category
    }
    if (request.body.limit !== undefined) {
      const limit = Number(request.body.limit)
      if (!Number.isFinite(limit) || limit <= 0 || limit > 100000000) return response.status(400).json({ message: 'Enter a positive budget limit.' })
      budget.limitPence = Math.round(limit * 100)
    }
    if (typeof request.body.rollover === 'boolean') budget.rollover = request.body.rollover
    await writeDatabase(database)
    response.json({ budget })
  } catch (error) { next(error) }
})

app.get('/api/notifications', requireUser, async (request, response, next) => {
  try {
    const database = await readDatabase()
    const notifications = buildNotifications(database, request.user.id)
    response.json({ notifications, unreadCount: notifications.filter((item) => !item.read).length })
  } catch (error) { next(error) }
})

app.patch('/api/notifications/:id', requireUser, async (request, response, next) => {
  try {
    const database = await readDatabase()
    if (!buildNotifications(database, request.user.id).some((item) => item.id === request.params.id)) return response.status(404).json({ message: 'Notification not found.' })
    let state = database.notificationStates.find((item) => item.userId === request.user.id && item.notificationId === request.params.id)
    if (!state) {
      state = { userId: request.user.id, notificationId: request.params.id, read: false, dismissed: false }
      database.notificationStates.push(state)
    }
    if (typeof request.body.read === 'boolean') state.read = request.body.read
    if (typeof request.body.dismissed === 'boolean') state.dismissed = request.body.dismissed
    await writeDatabase(database)
    response.json({ notification: buildNotifications(database, request.user.id).find((item) => item.id === request.params.id) || null })
  } catch (error) { next(error) }
})

app.post('/api/notifications/read-all', requireUser, async (request, response, next) => {
  try {
    const database = await readDatabase()
    for (const notification of buildNotifications(database, request.user.id)) {
      let state = database.notificationStates.find((item) => item.userId === request.user.id && item.notificationId === notification.id)
      if (!state) {
        state = { userId: request.user.id, notificationId: notification.id, read: true, dismissed: false }
        database.notificationStates.push(state)
      } else state.read = true
    }
    await writeDatabase(database)
    response.status(204).end()
  } catch (error) { next(error) }
})

if (isProduction) {
  const serverDirectory = path.dirname(fileURLToPath(import.meta.url))
  const frontendDirectory = path.resolve(serverDirectory, '..', 'dist')
  app.use(express.static(frontendDirectory, { maxAge: '1d', etag: true }))
  app.get('/{*splat}', (request, response) => response.sendFile(path.join(frontendDirectory, 'index.html')))
}

// Express identifies error middleware by its four-argument signature.
// eslint-disable-next-line no-unused-vars
app.use((error, request, response, next) => {
  console.error(error)
  response.status(500).json({ message: 'Something went wrong on the server.' })
})

const server = app.listen(port, () => console.log(`CivicFlow API running at http://127.0.0.1:${port}`))

async function shutdown() {
  server.close(async () => {
    await databaseAdapter.closeDatabase?.()
    process.exit(0)
  })
}

process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
