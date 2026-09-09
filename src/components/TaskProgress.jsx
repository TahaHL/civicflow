import { Link } from 'react-router-dom'
import Icon from './Icon'

function encouragement(total, completed, overdue) {
  if (total === 0) return { title: 'Your space is clear', message: 'Add something when you’re ready—there’s no rush.' }

  const percentage = Math.round((completed / total) * 100)
  const outstanding = total - completed
  if (percentage === 100) return { title: 'Everything completed', message: 'Take a moment to enjoy it—you’ve earned that feeling.' }
  if (outstanding >= 8 && percentage < 50) return { title: 'One thing at a time', message: 'There’s plenty here, but you don’t need to do it all at once. Start with one priority.' }
  if (overdue > 0) return { title: 'A gentle place to begin', message: `${overdue} ${overdue === 1 ? 'item needs' : 'items need'} attention. Choose the smallest next step and build from there.` }
  if (percentage < 25) return { title: 'A fresh start', message: 'One small task is enough to build momentum.' }
  if (percentage < 50) return { title: 'You’re making progress', message: 'Each completed task is creating a little more headspace.' }
  if (percentage < 80) return { title: 'More than halfway there', message: 'Nice work—your list is getting noticeably lighter.' }
  return { title: 'You’re finishing strong', message: 'Almost clear. Keep the steady pace that got you here.' }
}

function TaskProgress({ tasks }) {
  const total = tasks.length
  const completed = tasks.filter((task) => task.done).length
  const today = new Date().toISOString().slice(0, 10)
  const overdue = tasks.filter((task) => !task.done && task.dueDate && task.dueDate < today).length
  const outstanding = total - completed
  const percentage = total ? Math.round((completed / total) * 100) : 0
  const completedArc = total ? (completed / total) * 100 : 0
  const overdueArc = total ? (overdue / total) * 100 : 0
  const copy = encouragement(total, completed, overdue)

  return (
    <section className="progress-panel" aria-labelledby="progress-title">
      <div className="progress-chart" role="img" aria-label={`${percentage}% of tasks completed. ${completed} completed, ${outstanding} outstanding, ${overdue} overdue.`}>
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle className="progress-chart__track" cx="60" cy="60" r="48" pathLength="100" />
          <circle className="progress-chart__completed" cx="60" cy="60" r="48" pathLength="100" strokeDasharray={`${completedArc} ${100 - completedArc}`} />
          {overdueArc > 0 && <circle className="progress-chart__overdue" cx="60" cy="60" r="48" pathLength="100" strokeDasharray={`${overdueArc} ${100 - overdueArc}`} strokeDashoffset={-completedArc} />}
        </svg>
        <span><strong>{percentage}%</strong><small>complete</small></span>
      </div>
      <div className="progress-copy">
        <p className="eyebrow">Your progress</p>
        <h2 id="progress-title">{copy.title}</h2>
        <p>{copy.message}</p>
        <Link to="/tasks">See all tasks <Icon name="arrow" size={15} /></Link>
      </div>
      <div className="progress-stats">
        <div><span className="progress-dot progress-dot--complete" /><strong>{completed}</strong><small>Completed</small></div>
        <div><span className="progress-dot progress-dot--open" /><strong>{outstanding}</strong><small>Outstanding</small></div>
        <div><span className="progress-dot progress-dot--overdue" /><strong>{overdue}</strong><small>Overdue</small></div>
      </div>
    </section>
  )
}

export default TaskProgress
