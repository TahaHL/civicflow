import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Header from '../components/Header'
import ConfirmDeleteButton from '../components/ConfirmDeleteButton'
import EditDialog from '../components/EditDialog'
import Icon from '../components/Icon'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../hooks/useAuth'
import { api } from '../lib/api'
import './Dashboard.css'

function TasksPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tasks, setTasks] = useState([])
  const requestedView = searchParams.get('view')
  const [filter, setFilter] = useState(requestedView === 'deadlines' ? 'deadlines' : requestedView === 'open' ? 'open' : 'all')
  const [form, setForm] = useState({ title: '', dueDate: '', priority: 'Medium' })
  const [editingTask, setEditingTask] = useState(null)
  const [editError, setEditError] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => { api('/api/tasks').then((data) => setTasks(data.tasks)).catch(console.error) }, [])

  const today = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }, [])
  const deadlineTasks = useMemo(() => tasks
    .filter((task) => !task.done && task.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || ({ High: 0, Medium: 1, Low: 2 }[a.priority] - { High: 0, Medium: 1, Low: 2 }[b.priority])), [tasks])
  const filteredTasks = useMemo(() => {
    if (filter === 'deadlines') return deadlineTasks
    return tasks.filter((task) => filter === 'open' ? !task.done : filter === 'completed' ? task.done : true)
  }, [tasks, filter, deadlineTasks])
  const deadlineStats = useMemo(() => {
    const weekEnd = new Date(`${today}T12:00:00`)
    weekEnd.setDate(weekEnd.getDate() + 7)
    const weekEndKey = `${weekEnd.getFullYear()}-${String(weekEnd.getMonth() + 1).padStart(2, '0')}-${String(weekEnd.getDate()).padStart(2, '0')}`
    return {
      overdue: deadlineTasks.filter((task) => task.dueDate < today).length,
      today: deadlineTasks.filter((task) => task.dueDate === today).length,
      thisWeek: deadlineTasks.filter((task) => task.dueDate > today && task.dueDate <= weekEndKey).length,
    }
  }, [deadlineTasks, today])

  async function addTask(event) {
    event.preventDefault()
    if (!form.title.trim()) return
    const { task } = await api('/api/tasks', { method: 'POST', body: JSON.stringify(form) })
    setTasks((current) => [task, ...current])
    setForm({ title: '', dueDate: '', priority: 'Medium' })
  }

  async function toggleTask(task) {
    const data = await api(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ done: !task.done }) })
    setTasks((current) => current.map((item) => item.id === task.id ? data.task : item))
  }

  async function deleteTask(taskId) {
    await api(`/api/tasks/${taskId}`, { method: 'DELETE' })
    setTasks((current) => current.filter((task) => task.id !== taskId))
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

  function formatDate(date) {
    return date ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${date}T12:00:00`)) : 'No due date'
  }

  function deadlineDetails(date) {
    const days = Math.round((new Date(`${date}T12:00:00`) - new Date(`${today}T12:00:00`)) / 86400000)
    if (days < 0) return { label: `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`, state: 'overdue' }
    if (days === 0) return { label: 'Due today', state: 'today' }
    if (days === 1) return { label: 'Due tomorrow', state: 'soon' }
    if (days <= 7) return { label: `Due in ${days} days`, state: 'soon' }
    return { label: formatDate(date), state: 'scheduled' }
  }

  function changeFilter(nextFilter) {
    setFilter(nextFilter)
    if (nextFilter === 'deadlines' || nextFilter === 'open') setSearchParams({ view: nextFilter }, { replace: true })
    else setSearchParams({}, { replace: true })
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="dashboard tasks-page">
        <Header firstName={user.firstName} title="Tasks" onAddItem={() => document.querySelector('#task-title')?.focus()} />
        <section className="task-workspace">
          <form className="task-creator panel" onSubmit={addTask}>
            <div><p className="eyebrow">New task</p><h2>What needs doing?</h2></div>
            <div className="task-creator__fields">
              <label className="task-title-field">Task name<input id="task-title" onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Add something to your list" required value={form.title} /></label>
              <label>Due date<input onChange={(event) => setForm({ ...form, dueDate: event.target.value })} type="date" value={form.dueDate} /></label>
              <label>Priority<select onChange={(event) => setForm({ ...form, priority: event.target.value })} value={form.priority}><option>Low</option><option>Medium</option><option>High</option></select></label>
              <button className="primary-button" type="submit"><Icon name="plus" size={18} /> Add task</button>
            </div>
          </form>

          <section className="panel all-tasks" aria-labelledby="all-tasks-title">
            <div className="panel__header task-list-header">
              <div><p className="eyebrow">{filter === 'deadlines' ? 'Deadline focus' : 'Your list'}</p><h2 id="all-tasks-title">{filter === 'deadlines' ? 'Upcoming deadlines' : 'All tasks'} <span>{filteredTasks.length}</span></h2></div>
              <div className="filter-tabs">
                {['all', 'open', 'deadlines', 'completed'].map((item) => <button className={filter === item ? 'active' : ''} key={item} onClick={() => changeFilter(item)} type="button">{item}</button>)}
              </div>
            </div>
            {filter === 'deadlines' && <div className="deadline-focus" aria-label="Deadline summary">
              <div className="deadline-focus__next">
                <span className="deadline-focus__icon"><Icon name="clock" size={19} /></span>
                <div><small>{deadlineTasks[0]?.dueDate < today ? 'Needs attention first' : 'Next deadline'}</small><strong>{deadlineTasks[0]?.title || 'No upcoming deadlines'}</strong><p>{deadlineTasks[0] ? deadlineDetails(deadlineTasks[0].dueDate).label : 'Add a due date to a task and it will appear here.'}</p></div>
                {deadlineTasks[0] && <button onClick={() => { setEditError(''); setEditingTask({ ...deadlineTasks[0] }) }} type="button">Review task <Icon name="arrow" size={14} /></button>}
              </div>
              <div className="deadline-focus__stats">
                <span><strong>{deadlineStats.overdue}</strong><small>Overdue</small></span>
                <span><strong>{deadlineStats.today}</strong><small>Due today</small></span>
                <span><strong>{deadlineStats.thisWeek}</strong><small>Next 7 days</small></span>
              </div>
            </div>}
            <div className="full-task-list">
              {filteredTasks.map((task) => {
                const deadline = task.dueDate ? deadlineDetails(task.dueDate) : null
                return <article className={`full-task${task.done ? ' full-task--done' : ''}${filter === 'deadlines' ? ` full-task--deadline full-task--${deadline.state}` : ''}`} key={task.id}>
                  <button className="task-check-button" onClick={() => toggleTask(task)} type="button" aria-label={`${task.done ? 'Reopen' : 'Complete'} ${task.title}`}><Icon name="check" size={15} /></button>
                  <div className="full-task__content"><h3>{task.title}</h3><p>{filter === 'deadlines' ? deadline.label : formatDate(task.dueDate)}</p></div>
                  <span className={`priority priority--${task.priority.toLowerCase()}`}>{task.priority}</span>
                  <div className="row-actions"><button aria-label={`Edit ${task.title}`} className="edit-button" onClick={() => { setEditError(''); setEditingTask({ ...task }) }} type="button"><Icon name="edit" size={15} /></button><ConfirmDeleteButton className="delete-button" label={task.title} onConfirm={() => deleteTask(task.id)} /></div>
                </article>
              })}
              {!filteredTasks.length && <div className="empty-state"><span><Icon name="check" size={25} /></span><h3>{filter === 'deadlines' ? 'No deadlines on the horizon' : 'Nothing here'}</h3><p>{filter === 'deadlines' ? 'Add a due date to an open task to build your deadline view.' : `Your ${filter === 'all' ? '' : filter} task list is clear.`}</p></div>}
            </div>
          </section>
        </section>
        <EditDialog error={editError} onClose={() => setEditingTask(null)} onSubmit={saveTaskEdit} open={Boolean(editingTask)} saving={savingEdit} title="Task">
          {editingTask && <>
            <label className="edit-field--full">Task name<input maxLength={120} onChange={(event) => setEditingTask({ ...editingTask, title: event.target.value })} required value={editingTask.title} /></label>
            <label>Due date<input onChange={(event) => setEditingTask({ ...editingTask, dueDate: event.target.value })} type="date" value={editingTask.dueDate || ''} /></label>
            <label>Priority<select onChange={(event) => setEditingTask({ ...editingTask, priority: event.target.value })} value={editingTask.priority}><option>Low</option><option>Medium</option><option>High</option></select></label>
            <label className="edit-checkbox edit-field--full"><input checked={editingTask.done} onChange={(event) => setEditingTask({ ...editingTask, done: event.target.checked })} type="checkbox" /> Mark this task as completed</label>
          </>}
        </EditDialog>
      </main>
    </div>
  )
}

export default TasksPage
