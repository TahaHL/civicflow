/* global process */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

async function startTestServer(port, databasePath) {
  const child = spawn(process.execPath, ['server/server.js'], {
    cwd: path.resolve('.'),
    env: { ...process.env, PORT: String(port), CIVICFLOW_DB_PATH: databasePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Test server did not start.')), 10000)
    child.once('error', reject)
    child.stderr.on('data', (chunk) => {
      const message = chunk.toString()
      if (message.includes('Error')) reject(new Error(message))
    })
    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('CivicFlow API running')) {
        clearTimeout(timeout)
        resolve()
      }
    })
  })
  return child
}

test('CivicFlow full API workflow', async (context) => {
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'civicflow-test-'))
  const databasePath = path.join(tempDirectory, 'test.db')
  const port = await availablePort()
  const server = await startTestServer(port, databasePath)
  context.after(async () => {
    const exited = once(server, 'exit')
    server.kill()
    await exited
    await fs.rm(tempDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  })

  const base = `http://127.0.0.1:${port}`
  let cookie = ''
  async function request(route, options = {}) {
    const response = await fetch(`${base}${route}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...options.headers },
    })
    const setCookie = response.headers.get('set-cookie')
    if (setCookie) cookie = setCookie.split(';')[0]
    return response
  }

  const register = await request('/api/auth/register', { method: 'POST', body: JSON.stringify({ firstName: 'Integration', email: 'integration@example.local', password: 'testing123' }) })
  assert.equal(register.status, 201)
  assert.match(cookie, /^civicflow_session=/)
  const registration = await register.json()
  assert.match(registration.sessionToken, /^[a-f0-9]{64}$/)

  const bearerMe = await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${registration.sessionToken}` } })
  assert.equal(bearerMe.status, 200)
  assert.equal((await bearerMe.json()).user.email, 'integration@example.local')

  const me = await (await request('/api/auth/me')).json()
  assert.equal(me.user.firstName, 'Integration')
  assert.equal(me.user.preferences.theme, 'system')

  const initialTasks = await (await request('/api/tasks')).json()
  assert.equal(initialTasks.tasks.length, 0)
  const initialAppointments = await (await request('/api/appointments')).json()
  const initialDocuments = await (await request('/api/documents')).json()
  const initialMoney = await (await request('/api/money')).json()
  const initialBudgets = await (await request('/api/budgets')).json()
  const initialNotifications = await (await request('/api/notifications')).json()
  assert.deepEqual(initialAppointments.appointments, [])
  assert.deepEqual(initialDocuments.documents, [])
  assert.deepEqual(initialMoney.records, [])
  assert.deepEqual(initialBudgets.budgets, [])
  assert.deepEqual(initialNotifications.notifications, [])
  const today = new Date().toISOString().slice(0, 10)
  const createdTask = await (await request('/api/tasks', { method: 'POST', body: JSON.stringify({ title: 'Integration task', priority: 'High', dueDate: today }) })).json()
  assert.equal(createdTask.task.title, 'Integration task')
  const completedTask = await (await request(`/api/tasks/${createdTask.task.id}`, { method: 'PATCH', body: JSON.stringify({ done: true }) })).json()
  assert.equal(completedTask.task.done, true)
  const editedTask = await (await request(`/api/tasks/${createdTask.task.id}`, { method: 'PATCH', body: JSON.stringify({ title: 'Edited integration task', priority: 'Low', dueDate: today }) })).json()
  assert.equal(editedTask.task.title, 'Edited integration task')
  assert.equal(editedTask.task.priority, 'Low')

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const appointment = await (await request('/api/appointments', { method: 'POST', body: JSON.stringify({ title: 'Integration appointment', date: tomorrow, time: '10:30', endTime: '12:00', location: 'Test office' }) })).json()
  assert.equal(appointment.appointment.location, 'Test office')
  assert.equal(appointment.appointment.endTime, '12:00')
  assert.equal(appointment.appointment.completed, false)
  const editedAppointment = await (await request(`/api/appointments/${appointment.appointment.id}`, { method: 'PATCH', body: JSON.stringify({ title: 'Edited appointment', date: tomorrow, time: '11:45', endTime: '13:15', location: 'Updated office', notes: 'Bring reference' }) })).json()
  assert.equal(editedAppointment.appointment.time, '11:45')
  assert.equal(editedAppointment.appointment.endTime, '13:15')
  assert.equal(editedAppointment.appointment.notes, 'Bring reference')
  const completedAppointment = await (await request(`/api/appointments/${appointment.appointment.id}`, { method: 'PATCH', body: JSON.stringify({ completed: true }) })).json()
  assert.equal(completedAppointment.appointment.completed, true)
  const reopenedAppointment = await (await request(`/api/appointments/${appointment.appointment.id}`, { method: 'PATCH', body: JSON.stringify({ completed: false }) })).json()
  assert.equal(reopenedAppointment.appointment.completed, false)

  const expiryDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  const document = await (await request('/api/documents', { method: 'POST', body: JSON.stringify({ name: 'Integration document', category: 'Identity', expiryDate }) })).json()
  assert.equal(document.document.category, 'Identity')
  const editedDocument = await (await request(`/api/documents/${document.document.id}`, { method: 'PATCH', body: JSON.stringify({ name: 'Edited document', category: 'Finance', issuer: 'Test issuer', expiryDate, notes: 'Renew online' }) })).json()
  assert.equal(editedDocument.document.category, 'Finance')
  assert.equal(editedDocument.document.notes, 'Renew online')

  const income = await (await request('/api/money', { method: 'POST', body: JSON.stringify({ title: 'Salary', type: 'income', category: 'Income', amount: 2400, date: today, frequency: 'Monthly' }) })).json()
  assert.equal(income.record.amountPence, 240000)
  const bill = await (await request('/api/money', { method: 'POST', body: JSON.stringify({ title: 'Energy', type: 'bill', category: 'Utilities', amount: 86.42, date: tomorrow, frequency: 'Monthly' }) })).json()
  assert.equal(bill.record.paid, false)
  const expense = await (await request('/api/money', { method: 'POST', body: JSON.stringify({ title: 'Groceries', type: 'expense', category: 'Groceries', amount: 32.19, date: today }) })).json()
  assert.equal(expense.record.amountPence, 3219)
  const money = await (await request('/api/money')).json()
  assert.equal(money.records.length, 3)
  const editedExpense = await (await request(`/api/money/${expense.record.id}`, { method: 'PATCH', body: JSON.stringify({ title: 'Supermarket', amount: 41.75, category: 'Shopping', date: tomorrow, notes: 'Edited in integration test' }) })).json()
  assert.equal(editedExpense.record.title, 'Supermarket')
  assert.equal(editedExpense.record.amountPence, 4175)
  assert.equal(editedExpense.record.category, 'Shopping')
  const paidBill = await (await request(`/api/money/${bill.record.id}`, { method: 'PATCH', body: JSON.stringify({ paid: true }) })).json()
  assert.equal(paidBill.record.paid, true)
  assert.equal(paidBill.nextRecord.paid, false)
  assert.notEqual(paidBill.nextRecord.date, bill.record.date)

  const budget = await (await request('/api/budgets', { method: 'POST', body: JSON.stringify({ category: 'Groceries', month: today.slice(0, 7), limit: 350, rollover: true }) })).json()
  assert.equal(budget.budget.limitPence, 35000)
  assert.equal(budget.budget.rollover, true)
  const updatedBudget = await (await request('/api/budgets', { method: 'POST', body: JSON.stringify({ category: 'Groceries', month: today.slice(0, 7), limit: 400, rollover: false }) })).json()
  assert.equal(updatedBudget.created, false)
  assert.equal(updatedBudget.budget.limitPence, 40000)
  const editedBudget = await (await request(`/api/budgets/${updatedBudget.budget.id}`, { method: 'PATCH', body: JSON.stringify({ category: 'Shopping', limit: 425, rollover: true }) })).json()
  assert.equal(editedBudget.budget.category, 'Shopping')
  assert.equal(editedBudget.budget.limitPence, 42500)
  const nextMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1)).toISOString().slice(0, 7)
  const copiedBudgets = await (await request('/api/budgets/copy', { method: 'POST', body: JSON.stringify({ fromMonth: today.slice(0, 7), toMonth: nextMonth }) })).json()
  assert.equal(copiedBudgets.budgets.length, 1)
  const savedBudgets = await (await request('/api/budgets')).json()
  assert.equal(savedBudgets.budgets.length, 2)

  const alerts = await (await request('/api/notifications')).json()
  assert.ok(alerts.notifications.some((item) => item.type === 'appointment'))
  assert.ok(alerts.notifications.some((item) => item.type === 'document'))
  assert.ok(alerts.unreadCount > 0)

  const profile = await (await request('/api/profile', { method: 'PATCH', body: JSON.stringify({ firstName: 'Updated' }) })).json()
  assert.equal(profile.user.firstName, 'Updated')
  const preferences = await (await request('/api/profile/preferences', { method: 'PATCH', body: JSON.stringify({ documentReminders: false, theme: 'dark' }) })).json()
  assert.equal(preferences.user.preferences.documentReminders, false)
  assert.equal(preferences.user.preferences.theme, 'dark')

  const passwordChange = await request('/api/profile/password', { method: 'PATCH', body: JSON.stringify({ currentPassword: 'testing123', newPassword: 'updated456' }) })
  assert.equal(passwordChange.status, 204)
  cookie = ''
  assert.equal((await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'integration@example.local', password: 'testing123' }) })).status, 401)
  assert.equal((await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'integration@example.local', password: 'updated456' }) })).status, 200)

  const forgotPassword = await (await request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: 'integration@example.local' }) })).json()
  assert.match(forgotPassword.devResetUrl, /reset-password\?token=/)
  const resetToken = new URL(forgotPassword.devResetUrl).searchParams.get('token')
  const resetPassword = await request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: resetToken, password: 'recovered789' }) })
  assert.equal(resetPassword.status, 200)
  assert.match((await resetPassword.json()).sessionToken, /^[a-f0-9]{64}$/)
  cookie = ''
  assert.equal((await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'integration@example.local', password: 'updated456' }) })).status, 401)
  assert.equal((await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'integration@example.local', password: 'recovered789' }) })).status, 200)

  assert.equal((await request(`/api/appointments/${appointment.appointment.id}`, { method: 'DELETE' })).status, 204)
  assert.equal((await request(`/api/documents/${document.document.id}`, { method: 'DELETE' })).status, 204)
  assert.equal((await request(`/api/money/${income.record.id}`, { method: 'DELETE' })).status, 204)
  assert.equal((await request(`/api/money/${bill.record.id}`, { method: 'DELETE' })).status, 204)
  assert.equal((await request(`/api/money/${paidBill.nextRecord.id}`, { method: 'DELETE' })).status, 204)
  assert.equal((await request(`/api/money/${expense.record.id}`, { method: 'DELETE' })).status, 204)
  assert.equal((await request(`/api/budgets/${updatedBudget.budget.id}`, { method: 'DELETE' })).status, 204)
  assert.equal((await request(`/api/budgets/${copiedBudgets.budgets[0].id}`, { method: 'DELETE' })).status, 204)
  assert.equal((await request(`/api/tasks/${createdTask.task.id}`, { method: 'DELETE' })).status, 204)
})
