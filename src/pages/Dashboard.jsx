import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/Header'
import ConfirmDeleteButton from '../components/ConfirmDeleteButton'
import EditDialog from '../components/EditDialog'
import Icon from '../components/Icon'
import Sidebar from '../components/Sidebar'
import SummaryCard from '../components/SummaryCard'
import TaskProgress from '../components/TaskProgress'
import { useAuth } from '../hooks/useAuth'
import { useDataRefresh } from '../hooks/useDataRefresh'
import { api } from '../lib/api'
import './Dashboard.css'

function Dashboard() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState([])
  const [appointments, setAppointments] = useState([])
  const [moneyRecords, setMoneyRecords] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [newTask, setNewTask] = useState('')
  const [newTaskPriority, setNewTaskPriority] = useState('Medium')
  const [editingTask, setEditingTask] = useState(null)
  const [editingAppointment, setEditingAppointment] = useState(null)
  const [editError, setEditError] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const quickAddRef = useRef(null)

  useDataRefresh(() => {
    Promise.all([api('/api/tasks'), api('/api/appointments'), api('/api/notifications'), api('/api/money')])
      .then(([taskData, appointmentData, notificationData, moneyData]) => {
        setTasks(taskData.tasks)
        setAppointments(appointmentData.appointments)
        setUnreadCount(notificationData.unreadCount)
        setMoneyRecords(moneyData.records)
      })
      .catch(console.error)
  })

  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const currentMonth = today.slice(0, 7)
  const currentMoneyRecords = moneyRecords.filter((record) => record.date.startsWith(currentMonth))
  const upcomingAppointments = appointments.filter((appointment) => !appointment.completed && appointment.date >= today)
  const unpaidBills = currentMoneyRecords.filter((record) => record.type === 'bill' && !record.paid)
  const accountBalance = moneyRecords.reduce((balance, record) => {
    if (record.type === 'income') return balance + record.amountPence
    if (record.type === 'expense' || (record.type === 'bill' && record.paid)) return balance - record.amountPence
    return balance
  }, 0)
  const currency = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 })
  const openTasks = tasks.filter((task) => !task.done)
  const deadlineTasks = openTasks.filter((task) => task.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const nextDeadline = deadlineTasks[0]

  const summaryItems = [
    { id: 1, number: openTasks.length, label: 'Open tasks', detail: `${openTasks.filter((task) => task.dueDate === today).length} due today`, action: 'View tasks', icon: 'check', tone: 'violet', to: '/tasks?view=open' },
    { id: 2, number: deadlineTasks.length, label: 'Upcoming deadlines', detail: nextDeadline ? taskDueLabel(nextDeadline.dueDate) : 'Nothing scheduled', action: 'Review deadlines', icon: 'clock', tone: 'amber', to: '/tasks?view=deadlines' },
    { id: 3, number: upcomingAppointments.length, label: 'Appointments', detail: 'Still ahead', action: 'View calendar', icon: 'calendar', tone: 'blue', to: '/calendar' },
    { id: 4, number: currency.format(accountBalance / 100), label: 'Account balance', detail: `${unpaidBills.length} bill${unpaidBills.length === 1 ? '' : 's'} still due`, action: 'View finances', icon: 'wallet', tone: 'teal', to: '/money' },
  ]

  function taskDueLabel(dueDate) {
    if (!dueDate) return 'No due date'
    if (dueDate === today) return 'Due today'
    return `Due ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(`${dueDate}T12:00:00`))}`
  }

  async function toggleTask(taskId) {
    const currentTask = tasks.find((task) => task.id === taskId)
    const { task } = await api(`/api/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ done: !currentTask.done }) })
    setTasks((currentTasks) => currentTasks.map((item) => item.id === taskId ? task : item))
  }

  async function addTask(event) {
    event.preventDefault()
    const title = newTask.trim()
    if (!title) return
    const { task } = await api('/api/tasks', { method: 'POST', body: JSON.stringify({ title, priority: newTaskPriority }) })
    setTasks((currentTasks) => [task, ...currentTasks])
    setNewTask('')
  }

  async function deleteTask(taskId) {
    await api(`/api/tasks/${taskId}`, { method: 'DELETE' })
    setTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId))
  }

  async function saveTaskEdit(event) {
    event.preventDefault()
    setSavingEdit(true)
    setEditError('')
    try {
      const { task } = await api(`/api/tasks/${editingTask.id}`, { method: 'PATCH', body: JSON.stringify(editingTask) })
      setTasks((current) => current.map((item) => item.id === task.id ? task : item))
      setEditingTask(null)
    } catch (error) { setEditError(error.message) }
    finally { setSavingEdit(false) }
  }

  async function saveAppointmentEdit(event) {
    event.preventDefault()
    setSavingEdit(true)
    setEditError('')
    try {
      const { appointment } = await api(`/api/appointments/${editingAppointment.id}`, { method: 'PATCH', body: JSON.stringify(editingAppointment) })
      setAppointments((current) => current.map((item) => item.id === appointment.id ? appointment : item).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)))
      setEditingAppointment(null)
    } catch (error) { setEditError(error.message) }
    finally { setSavingEdit(false) }
  }

  return (
    <div className="app-shell" id="top">
      <Sidebar />
      <main className="dashboard">
        <Header firstName={user.firstName} onAddItem={() => quickAddRef.current?.focus()} />
        <section className="overview-section" aria-labelledby="overview-title">
          <div className="section-heading">
            <div><p className="eyebrow">At a glance</p><h2 id="overview-title">Your overview</h2></div>
            <Link className="icon-button" to="/notifications" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}>
              <Icon name="bell" size={20} />
              {unreadCount > 0 && <span className="notification-count">{unreadCount > 9 ? '9+' : unreadCount}</span>}
            </Link>
          </div>
          <div className="summary-grid">
            {summaryItems.map((item) => <SummaryCard key={item.id} {...item} />)}
          </div>
        </section>
        <TaskProgress tasks={tasks} />
        <div className="dashboard-grid">
          <section className="panel tasks-panel" id="tasks" aria-labelledby="tasks-title">
            <div className="panel__header">
              <div><p className="eyebrow">Keep moving</p><h2 id="tasks-title">Priority tasks</h2></div>
              <Link className="text-button" to="/tasks">View all <Icon name="arrow" size={16} /></Link>
            </div>
            <div className="task-list">
              {tasks.slice(0, 4).map((task) => (
                <article className={`task-row${task.done ? ' task-row--done' : ''}`} key={task.id}>
                  <label className="task-row__check">
                    <input checked={task.done} onChange={() => toggleTask(task.id)} type="checkbox" />
                    <span className="custom-checkbox"><Icon name="check" size={14} /></span>
                    <span className="sr-only">{task.done ? 'Reopen' : 'Complete'} {task.title}</span>
                  </label>
                  <span className="task-row__content"><strong>{task.title}</strong><small>{taskDueLabel(task.dueDate)}</small></span>
                  <span className={`priority priority--${task.priority.toLowerCase()}`}>{task.priority}</span>
                  <div className="row-actions"><button aria-label={`Edit ${task.title}`} className="edit-button" onClick={() => { setEditError(''); setEditingTask({ ...task }) }} type="button"><Icon name="edit" size={14} /></button><ConfirmDeleteButton className="dashboard-delete" label={task.title} onConfirm={() => deleteTask(task.id)} /></div>
                </article>
              ))}
            </div>
            <form className="quick-add" onSubmit={addTask}>
              <Icon name="plus" size={18} />
              <input aria-label="Add a new task" onChange={(event) => setNewTask(event.target.value)} placeholder="Quickly add a task..." ref={quickAddRef} value={newTask} />
              <label className="quick-add__priority"><span className="sr-only">Task priority</span><select aria-label="Task priority" onChange={(event) => setNewTaskPriority(event.target.value)} value={newTaskPriority}><option>Low</option><option>Medium</option><option>High</option></select></label>
              <button type="submit">Add</button>
            </form>
          </section>
          <section className="panel schedule-panel" id="calendar" aria-labelledby="schedule-title">
            <div className="panel__header">
              <div><p className="eyebrow">Coming up</p><h2 id="schedule-title">Your schedule</h2></div>
              <Link className="text-button" to="/calendar">Calendar <Icon name="arrow" size={16} /></Link>
            </div>
            <div className="appointment-list">
              {upcomingAppointments.slice(0, 3).map((appointment) => {
                const appointmentDate = new Date(`${appointment.date}T12:00:00`)
                return (
                <article className="appointment" key={appointment.id}>
                  <time className="date-tile" dateTime={appointment.date}><strong>{appointmentDate.getDate()}</strong><span>{new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(appointmentDate).toUpperCase()}</span></time>
                  <div className="appointment__content"><h3>{appointment.title}</h3><p>{appointment.time}{appointment.endTime ? `–${appointment.endTime}` : ''}{appointment.location ? ` · ${appointment.location}` : ''}</p></div>
                  <button aria-label={`Edit ${appointment.title}`} className="edit-button" onClick={() => { setEditError(''); setEditingAppointment({ ...appointment, endTime: appointment.endTime || '' }) }} type="button"><Icon name="edit" size={14} /></button>
                </article>
                )
              })}
              {!upcomingAppointments.length && <div className="schedule-empty"><span><Icon name="calendar" size={20} /></span><p>No outstanding appointments.</p></div>}
            </div>
          </section>
        </div>
        <EditDialog error={editError} onClose={() => setEditingTask(null)} onSubmit={saveTaskEdit} open={Boolean(editingTask)} saving={savingEdit} title="Task">
          {editingTask && <>
            <label className="edit-field--full">Task name<input maxLength={120} onChange={(event) => setEditingTask({ ...editingTask, title: event.target.value })} required value={editingTask.title} /></label>
            <label>Due date<input onChange={(event) => setEditingTask({ ...editingTask, dueDate: event.target.value })} type="date" value={editingTask.dueDate || ''} /></label>
            <label>Priority<select onChange={(event) => setEditingTask({ ...editingTask, priority: event.target.value })} value={editingTask.priority}><option>Low</option><option>Medium</option><option>High</option></select></label>
            <label className="edit-checkbox edit-field--full"><input checked={editingTask.done} onChange={(event) => setEditingTask({ ...editingTask, done: event.target.checked })} type="checkbox" /> Mark this task as completed</label>
          </>}
        </EditDialog>
        <EditDialog error={editError} onClose={() => setEditingAppointment(null)} onSubmit={saveAppointmentEdit} open={Boolean(editingAppointment)} saving={savingEdit} title="Appointment">
          {editingAppointment && <>
            <label className="edit-field--full">Title<input maxLength={120} onChange={(event) => setEditingAppointment({ ...editingAppointment, title: event.target.value })} required value={editingAppointment.title} /></label>
            <label>Date<input onChange={(event) => setEditingAppointment({ ...editingAppointment, date: event.target.value })} required type="date" value={editingAppointment.date} /></label>
            <label>Starts<input onChange={(event) => setEditingAppointment({ ...editingAppointment, time: event.target.value })} required type="time" value={editingAppointment.time} /></label>
            <label>Ends<input onChange={(event) => setEditingAppointment({ ...editingAppointment, endTime: event.target.value })} required type="time" value={editingAppointment.endTime || ''} /></label>
            <label className="edit-field--full">Location<input maxLength={150} onChange={(event) => setEditingAppointment({ ...editingAppointment, location: event.target.value })} placeholder="Optional" value={editingAppointment.location || ''} /></label>
            <label className="edit-field--full">Notes<textarea maxLength={500} onChange={(event) => setEditingAppointment({ ...editingAppointment, notes: event.target.value })} placeholder="Optional details" rows={3} value={editingAppointment.notes || ''} /></label>
          </>}
        </EditDialog>
      </main>
    </div>
  )
}

export default Dashboard
