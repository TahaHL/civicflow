import { useEffect, useMemo, useRef, useState } from 'react'
import Header from '../components/Header'
import ConfirmDeleteButton from '../components/ConfirmDeleteButton'
import EditDialog from '../components/EditDialog'
import Icon from '../components/Icon'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../hooks/useAuth'
import { useDataRefresh } from '../hooks/useDataRefresh'
import { api } from '../lib/api'
import './Dashboard.css'

const hourHeight = 56
const hours = Array.from({ length: 24 }, (_, hour) => hour)

function toDateKey(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

function toTime(total) {
  const safe = Math.max(0, Math.min(total, 1439))
  return String(Math.floor(safe / 60)).padStart(2, '0') + ':' + String(safe % 60).padStart(2, '0')
}

function toMinutes(time) {
  const parts = time.split(':').map(Number)
  return (parts[0] * 60) + parts[1]
}

function defaultEnd(time) {
  return toTime(toMinutes(time) + 60)
}

function formatDate(dateKey, options) {
  return new Intl.DateTimeFormat('en-GB', options).format(new Date(dateKey + 'T12:00:00'))
}

function CalendarPage() {
  const { user } = useAuth()
  const today = toDateKey(new Date())
  const [appointments, setAppointments] = useState([])
  const [tasks, setTasks] = useState([])
  const [selectedDate, setSelectedDate] = useState(today)
  const [focusedDate, setFocusedDate] = useState(null)
  const [visibleMonth, setVisibleMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [form, setForm] = useState({ title: '', date: today, time: '09:00', endTime: '10:00', location: '', notes: '' })
  const [composing, setComposing] = useState(false)
  const [selection, setSelection] = useState(null)
  const [editingAppointment, setEditingAppointment] = useState(null)
  const [formError, setFormError] = useState('')
  const [editError, setEditError] = useState('')
  const [dayMessage, setDayMessage] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [isMobileCalendar, setIsMobileCalendar] = useState(false)
  const titleRef = useRef(null)
  const timelineRef = useRef(null)
  const dragStartRef = useRef(null)

  useDataRefresh(() => {
    Promise.all([api('/api/appointments'), api('/api/tasks')])
      .then(([appointmentData, taskData]) => {
        setAppointments(appointmentData.appointments)
        setTasks(taskData.tasks)
      })
      .catch(console.error)
  })

  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)')
    const update = () => setIsMobileCalendar(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const calendarDays = useMemo(() => {
    const firstDayIndex = (visibleMonth.getDay() + 6) % 7
    const start = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1 - firstDayIndex)
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      return date
    })
  }, [visibleMonth])

  const focusedAppointments = appointments
    .filter((item) => !item.completed && item.date === focusedDate)
    .sort((a, b) => a.time.localeCompare(b.time))
  const focusedTasks = tasks.filter((item) => !item.done && item.dueDate === focusedDate)
  const selectedAppointments = appointments.filter((item) => !item.completed && item.date === selectedDate)
  const selectedTasks = tasks.filter((item) => !item.done && item.dueDate === selectedDate)
  const upcomingTasks = tasks.filter((item) => !item.done && item.dueDate >= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5)
  const upcomingAppointments = appointments.filter((item) => !item.completed && item.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 5)

  useEffect(() => {
    if (!focusedDate || !timelineRef.current) return
    const firstAppointment = appointments.filter((item) => !item.completed && item.date === focusedDate).sort((a, b) => a.time.localeCompare(b.time))[0]
    const start = firstAppointment ? toMinutes(firstAppointment.time) : 8 * 60
    timelineRef.current.scrollTop = Math.max(0, ((start / 60) * hourHeight) - 90)
  }, [focusedDate, appointments])

  useEffect(() => {
    if (!focusedDate) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        setFocusedDate(null)
        setComposing(false)
        setSelection(null)
      }
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [focusedDate])

  function showMonth(dateKey) {
    const date = new Date(dateKey + 'T12:00:00')
    setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1))
  }

  function changeVisibleMonth(amount) {
    const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + amount, 1)
    setVisibleMonth(next)
    if (isMobileCalendar) setSelectedDate(toDateKey(next))
  }

  function prepareAppointment(dateKey, start = 9 * 60, end = 10 * 60) {
    setForm({ title: '', date: dateKey, time: toTime(start), endTime: toTime(end), location: '', notes: '' })
    setSelection({ start, end })
    setFormError('')
    setComposing(true)
    setTimeout(() => titleRef.current?.focus(), 0)
  }

  function openDay(date, createNow = false) {
    const dateKey = typeof date === 'string' ? date : toDateKey(date)
    setSelectedDate(dateKey)
    showMonth(dateKey)
    setFocusedDate(dateKey)
    setComposing(false)
    setSelection(null)
    if (createNow) prepareAppointment(dateKey)
  }

  function selectCalendarDay(date) {
    const dateKey = typeof date === 'string' ? date : toDateKey(date)
    if (!isMobileCalendar) {
      openDay(dateKey)
      return
    }
    setSelectedDate(dateKey)
    showMonth(dateKey)
  }

  function closeDay() {
    setFocusedDate(null)
    setComposing(false)
    setSelection(null)
    setFormError('')
    setDayMessage('')
  }

  function timelineMinute(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    const raw = ((event.clientY - rect.top) / hourHeight) * 60
    return Math.max(0, Math.min(1425, Math.round(raw / 15) * 15))
  }

  function startDrag(event) {
    if (event.pointerType === 'touch' || event.button !== 0) return
    if (event.target.closest('.timeline-event')) return
    const start = timelineMinute(event)
    dragStartRef.current = start
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelection({ start, end: Math.min(1439, start + 30) })
  }

  function moveDrag(event) {
    if (dragStartRef.current === null) return
    const current = timelineMinute(event)
    const start = Math.min(dragStartRef.current, current)
    const end = Math.min(1439, Math.max(dragStartRef.current, current) + 15)
    setSelection({ start, end: Math.max(start + 15, end) })
  }

  function finishDrag(event) {
    if (dragStartRef.current === null) return
    const current = timelineMinute(event)
    const start = Math.min(dragStartRef.current, current)
    const end = Math.min(1439, Math.max(dragStartRef.current, current) + 15)
    dragStartRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
    prepareAppointment(focusedDate, start, Math.max(start + 15, end))
  }

  async function addAppointment(event) {
    event.preventDefault()
    setFormError('')
    try {
      const { appointment } = await api('/api/appointments', { method: 'POST', body: JSON.stringify(form) })
      setAppointments((current) => [...current, appointment].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)))
      setSelectedDate(appointment.date)
      showMonth(appointment.date)
      closeDay()
    } catch (error) { setFormError(error.message) }
  }

  async function deleteAppointment(id) {
    await api('/api/appointments/' + id, { method: 'DELETE' })
    setAppointments((current) => current.filter((item) => item.id !== id))
  }

  async function completeAppointment(item) {
    setDayMessage('')
    setFormError('')
    setAppointments((current) => current.map((existing) => existing.id === item.id ? { ...existing, completed: true } : existing))
    try {
      await api('/api/appointments/' + item.id, { method: 'PATCH', body: JSON.stringify({ completed: true }) })
      setDayMessage(`“${item.title}” marked as completed.`)
    } catch (error) {
      setAppointments((current) => current.map((existing) => existing.id === item.id ? { ...existing, completed: false } : existing))
      setFormError(error.message)
    }
  }

  async function toggleFocusedTask(task) {
    setDayMessage('')
    setFormError('')
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, done: !task.done } : item))
    try {
      const data = await api(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ done: !task.done }) })
      setTasks((current) => current.map((item) => item.id === task.id ? data.task : item))
      setDayMessage(`“${task.title}” marked as completed.`)
    } catch (error) {
      setTasks((current) => current.map((item) => item.id === task.id ? task : item))
      setFormError(error.message)
    }
  }

  async function deleteTask(id) {
    await api(`/api/tasks/${id}`, { method: 'DELETE' })
    setTasks((current) => current.filter((item) => item.id !== id))
  }

  async function saveAppointmentEdit(event) {
    event.preventDefault()
    setSavingEdit(true)
    setEditError('')
    try {
      const { appointment } = await api('/api/appointments/' + editingAppointment.id, { method: 'PATCH', body: JSON.stringify(editingAppointment) })
      setAppointments((current) => current.map((item) => item.id === appointment.id ? appointment : item).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)))
      setSelectedDate(appointment.date)
      showMonth(appointment.date)
      setFocusedDate(appointment.date)
      setEditingAppointment(null)
    } catch (error) { setEditError(error.message) }
    finally { setSavingEdit(false) }
  }

  return (
    <div className="app-shell" id="top">
      <Sidebar />
      <main className="dashboard calendar-page">
        <Header firstName={user.firstName} title="Calendar" subtitle="See the shape of your month, then open any day to plan it precisely." onAddItem={() => openDay(selectedDate, true)} />
        <section className="calendar-workspace calendar-workspace--month">
          <div className="calendar-main panel">
            <div className="calendar-toolbar">
              <div><p className="eyebrow">Your month</p><h2>{new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(visibleMonth)}</h2></div>
              <div className="month-controls">
                <button aria-label="Previous month" onClick={() => changeVisibleMonth(-1)} type="button"><Icon name="arrow" size={18} /></button>
                <button onClick={() => { setSelectedDate(today); showMonth(today) }} type="button">Today</button>
                <button aria-label="Next month" onClick={() => changeVisibleMonth(1)} type="button"><Icon name="arrow" size={18} /></button>
              </div>
            </div>
            <div className="weekday-row">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day}>{day}</span>)}</div>
            <div className="month-grid month-grid--rich">
              {calendarDays.map((date) => {
                const dateKey = toDateKey(date)
                const dayAppointments = appointments.filter((item) => !item.completed && item.date === dateKey).sort((a, b) => a.time.localeCompare(b.time))
                const dayTasks = tasks.filter((item) => !item.done && item.dueDate === dateKey)
                const itemCount = dayAppointments.length + dayTasks.length
                const classes = ['calendar-day', 'calendar-day--rich', date.getMonth() !== visibleMonth.getMonth() ? 'calendar-day--outside' : '', dateKey === today ? 'calendar-day--today' : '', dateKey === selectedDate ? 'calendar-day--selected' : ''].filter(Boolean).join(' ')
                return (
                  <button aria-label={`${formatDate(dateKey, { weekday: 'long', day: 'numeric', month: 'long' })}, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`} className={classes} key={dateKey} onClick={() => selectCalendarDay(date)} type="button">
                    <span className="calendar-day__number">{date.getDate()}</span>
                    {itemCount > 0 && <span aria-hidden="true" className="calendar-day__count"><strong>{itemCount}</strong><small>{itemCount === 1 ? 'item' : 'items'}</small></span>}
                  </button>
                )
              })}
            </div>
            <section className="mobile-day-preview" aria-live="polite">
              <div className="mobile-day-preview__date"><strong>{formatDate(selectedDate, { day: 'numeric' })}</strong><span>{formatDate(selectedDate, { month: 'short' })}</span></div>
              <div><p className="eyebrow">Selected day</p><h3>{formatDate(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' })}</h3><p>{selectedAppointments.length} event{selectedAppointments.length === 1 ? '' : 's'} · {selectedTasks.length} task{selectedTasks.length === 1 ? '' : 's'}</p></div>
              <button onClick={() => openDay(selectedDate)} type="button">View full day <Icon name="arrow" size={15} /></button>
            </section>
            <p className="calendar-help"><Icon name="calendar" size={15} /><span className="calendar-help__desktop">Select a date to enlarge it and manage its schedule.</span><span className="calendar-help__mobile">Select a date, then choose View full day for its complete agenda.</span></p>
          </div>

          <section className="calendar-reminders panel" aria-labelledby="calendar-reminders-title">
            <div className="calendar-reminders__header"><p className="eyebrow">Dates to watch</p><h2 id="calendar-reminders-title">Upcoming reminders</h2></div>
            <div className="calendar-reminders__grid">
              <div><h3>Task deadlines</h3>{upcomingTasks.map((task) => <button key={task.id} onClick={() => openDay(task.dueDate)} type="button"><span className={'reminder-marker reminder-marker--' + task.priority.toLowerCase()} /><span><strong>{task.title}</strong><small>{formatDate(task.dueDate, { weekday: 'short', day: 'numeric', month: 'short' })} · {task.priority} priority</small></span><Icon name="arrow" size={15} /></button>)}{!upcomingTasks.length && <p className="reminder-empty">No open task deadlines.</p>}</div>
              <div><h3>Scheduled next</h3>{upcomingAppointments.map((item) => <button key={item.id} onClick={() => openDay(item.date)} type="button"><span className="reminder-date"><strong>{formatDate(item.date, { day: 'numeric' })}</strong><small>{formatDate(item.date, { month: 'short' })}</small></span><span><strong>{item.title}</strong><small>{item.time}–{item.endTime || defaultEnd(item.time)}</small></span><Icon name="arrow" size={15} /></button>)}{!upcomingAppointments.length && <p className="reminder-empty">Nothing scheduled yet.</p>}</div>
            </div>
          </section>
        </section>

        {focusedDate && (
          <div className={`day-focus-backdrop${composing ? ' day-focus-backdrop--composing' : ''}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDay() }}>
            <section aria-labelledby="day-focus-title" aria-modal="true" className={`day-focus-dialog${composing ? ' day-focus-dialog--composing' : ''}`} role="dialog">
              <header className="day-focus__header">
                <div><p className="eyebrow">Full day</p><h2 id="day-focus-title">{formatDate(focusedDate, { weekday: 'long', day: 'numeric', month: 'long' })}</h2><p>{focusedAppointments.length} event{focusedAppointments.length === 1 ? '' : 's'} · {focusedTasks.length} task{focusedTasks.length === 1 ? '' : 's'}</p>{dayMessage && <p className="day-focus__message" role="status">{dayMessage}</p>}{formError && !composing && <p className="day-focus__message day-focus__message--error" role="alert">{formError}</p>}</div>
                <button aria-label="Close day planner" onClick={closeDay} type="button"><Icon name="close" size={19} /></button>
              </header>
              <div className={`day-focus__body${composing ? ' day-focus__body--composing' : ''}`}>
                <div className="day-focus__timeline-wrap">
                  <p className="drag-instruction"><span><Icon name="plus" size={14} /></span> Click or drag anywhere on the timeline to create a time block.</p>
                  <div className="mobile-day-planner">
                    <button className="primary-button mobile-day-planner__add" onClick={() => prepareAppointment(focusedDate)} type="button"><Icon name="plus" size={16} /> Add a time block</button>
                    <div className="mobile-day-planner__heading"><p className="eyebrow">Your schedule</p><h3>{focusedAppointments.length ? 'A clear view of your day' : 'No timed events yet'}</h3></div>
                    <div className="mobile-day-planner__events">
                      {focusedAppointments.map((item) => {
                        const endTime = item.endTime || defaultEnd(item.time)
                        return <article className="mobile-day-event" key={item.id}><time>{item.time}<span>{endTime}</span></time><span><strong>{item.title}</strong><small>{item.location || 'No location'}</small></span><button aria-label={`Edit ${item.title}`} className="edit-button" onClick={() => { setEditError(''); setEditingAppointment({ ...item, endTime }) }} type="button"><Icon name="edit" size={15} /></button><div className="calendar-item-actions mobile-day-event__actions"><button className="calendar-complete-action" onClick={() => completeAppointment(item)} type="button"><Icon name="check" size={14} /> Mark as completed</button><ConfirmDeleteButton className="delete-button" label={item.title} onConfirm={() => deleteAppointment(item.id)} /></div></article>
                      })}
                      {!focusedAppointments.length && <div className="mobile-day-planner__empty"><Icon name="calendar" size={19} /><span><strong>Your day is clear</strong><small>Add a time block when you’re ready.</small></span></div>}
                    </div>
                    <div className="mobile-day-planner__heading mobile-day-planner__heading--tasks"><p className="eyebrow">Tasks due</p><h3>{focusedTasks.length ? `${focusedTasks.length} to keep in view` : 'Nothing due today'}</h3></div>
                    <div className="mobile-day-planner__tasks">
                      {focusedTasks.map((task) => <article className="mobile-day-task" key={task.id}><span className="mobile-day-task__check"><Icon name="check" size={14} /></span><span><strong>{task.title}</strong><small>{task.priority} priority</small></span><div className="calendar-item-actions mobile-day-task__actions"><button className="calendar-complete-action" onClick={() => toggleFocusedTask(task)} type="button"><Icon name="check" size={14} /> Mark as completed</button><ConfirmDeleteButton className="delete-button" label={task.title} onConfirm={() => deleteTask(task.id)} /></div></article>)}
                      {!focusedTasks.length && <p className="mobile-day-planner__task-empty">A calm day—there are no tasks due.</p>}
                    </div>
                  </div>
                  <div className="day-focus__timeline-scroll" ref={timelineRef}>
                    <div aria-label="Daily timeline. Click or drag to schedule." className="day-focus__timeline" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={finishDrag} role="application" style={{ height: hours.length * hourHeight + 'px' }}>
                      {hours.map((hour) => <div className="day-focus__hour" key={hour} style={{ height: hourHeight + 'px', top: hour * hourHeight + 'px' }}><time>{String(hour).padStart(2, '0')}:00</time><span /></div>)}
                      {selection && <div className="timeline-selection" style={{ top: (selection.start / 60) * hourHeight + 'px', height: Math.max(14, ((selection.end - selection.start) / 60) * hourHeight) + 'px' }}><span>{toTime(selection.start)}–{toTime(selection.end)}</span></div>}
                      {focusedAppointments.map((item) => {
                        const endTime = item.endTime || defaultEnd(item.time)
                        const start = toMinutes(item.time)
                        const duration = Math.max(15, toMinutes(endTime) - start)
                        return <button aria-label={'Edit ' + item.title + ', ' + item.time + ' to ' + endTime} className="timeline-event" key={item.id} onPointerDown={(event) => event.stopPropagation()} onClick={() => { setEditError(''); setEditingAppointment({ ...item, endTime }) }} style={{ top: (start / 60) * hourHeight + 'px', height: Math.max(36, (duration / 60) * hourHeight) + 'px' }} type="button"><strong>{item.title}</strong><span>{item.time}–{endTime}{item.location ? ' · ' + item.location : ''}</span></button>
                      })}
                    </div>
                  </div>
                </div>
                <aside className={`day-focus__side${composing ? '' : ' day-focus__side--summary'}`}>
                  {composing ? (
                    <form className="day-composer" onSubmit={addAppointment}>
                      <div className="day-composer__intro"><span><Icon name="clock" size={18} /></span><div><p className="eyebrow">New time block</p><h3>Add to your schedule</h3><p>{formatDate(focusedDate, { weekday: 'long', day: 'numeric', month: 'long' })}</p></div></div>
                      <label>Title<input maxLength={120} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="What are you doing?" ref={titleRef} required value={form.title} /></label>
                      <div className="day-composer__times"><label>Starts<input onChange={(event) => setForm({ ...form, time: event.target.value })} required type="time" value={form.time} /></label><label>Ends<input onChange={(event) => setForm({ ...form, endTime: event.target.value })} required type="time" value={form.endTime} /></label></div>
                      <label>Location<input maxLength={150} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Optional" value={form.location} /></label>
                      <label>Notes<textarea maxLength={500} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Anything useful to remember" rows={3} value={form.notes} /></label>
                      {formError && <p className="form-error">{formError}</p>}
                      <div className="day-composer__actions"><button className="secondary-button" onClick={() => { setComposing(false); setSelection(null) }} type="button">Cancel</button><button className="primary-button" type="submit">Save event</button></div>
                    </form>
                  ) : (
                    <div className="day-focus__summary">
                      <p className="eyebrow">On this day</p><h3>{focusedAppointments.length ? 'Your schedule' : 'Nothing planned yet'}</h3>
                      <p>{focusedAppointments.length ? 'Select an event to edit it, or use the planner to add another.' : 'Use the planner to reserve time for something important.'}</p>
                       <div>{focusedAppointments.map((item) => {
                        const endTime = item.endTime || defaultEnd(item.time)
                         return <article key={item.id}><time>{item.time}<span>–{endTime}</span></time><span><strong>{item.title}</strong><small>{item.location || 'No location'}</small></span><div className="row-actions"><button aria-label={'Mark ' + item.title + ' as completed'} className="complete-task-button" onClick={() => completeAppointment(item)} type="button"><Icon name="check" size={14} /></button><button aria-label={'Edit ' + item.title} className="edit-button" onClick={() => { setEditError(''); setEditingAppointment({ ...item, endTime }) }} type="button"><Icon name="edit" size={14} /></button><ConfirmDeleteButton label={item.title} onConfirm={() => deleteAppointment(item.id)} /></div></article>
                       })}</div>
                       {focusedTasks.length > 0 && <div className="day-focus__tasks"><p className="eyebrow">Outstanding tasks</p>{focusedTasks.map((task) => <article key={task.id}><span><strong>{task.title}</strong><small>{task.priority} priority</small></span><div className="row-actions"><button aria-label={`Mark ${task.title} as completed`} className="complete-task-button" onClick={() => toggleFocusedTask(task)} type="button"><Icon name="check" size={14} /></button><ConfirmDeleteButton label={task.title} onConfirm={() => deleteTask(task.id)} /></div></article>)}</div>}
                     </div>
                  )}
                </aside>
              </div>
            </section>
          </div>
        )}

        <EditDialog error={editError} onClose={() => setEditingAppointment(null)} onSubmit={saveAppointmentEdit} open={Boolean(editingAppointment)} saving={savingEdit} title="Appointment">
          {editingAppointment && <>
            <label className="edit-field--full">Title<input maxLength={120} onChange={(event) => setEditingAppointment({ ...editingAppointment, title: event.target.value })} required value={editingAppointment.title} /></label>
            <label>Date<input onChange={(event) => setEditingAppointment({ ...editingAppointment, date: event.target.value })} required type="date" value={editingAppointment.date} /></label>
            <label>Starts<input onChange={(event) => setEditingAppointment({ ...editingAppointment, time: event.target.value })} required type="time" value={editingAppointment.time} /></label>
            <label>Ends<input onChange={(event) => setEditingAppointment({ ...editingAppointment, endTime: event.target.value })} required type="time" value={editingAppointment.endTime || defaultEnd(editingAppointment.time)} /></label>
            <label className="edit-field--full">Location<input maxLength={150} onChange={(event) => setEditingAppointment({ ...editingAppointment, location: event.target.value })} placeholder="Optional" value={editingAppointment.location || ''} /></label>
            <label className="edit-field--full">Notes<textarea maxLength={500} onChange={(event) => setEditingAppointment({ ...editingAppointment, notes: event.target.value })} placeholder="Anything useful to remember" rows={3} value={editingAppointment.notes || ''} /></label>
          </>}
        </EditDialog>
      </main>
    </div>
  )
}

export default CalendarPage
