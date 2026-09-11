import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/Header'
import Icon from '../components/Icon'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../hooks/useAuth'
import { useDataRefresh } from '../hooks/useDataRefresh'
import { api } from '../lib/api'
import './Dashboard.css'

const iconByType = { task: 'check', appointment: 'calendar', document: 'file', bill: 'wallet' }

function NotificationsPage() {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [filter, setFilter] = useState('all')

  useDataRefresh(() => { api('/api/notifications').then((data) => setNotifications(data.notifications)).catch(console.error) })

  const visibleNotifications = useMemo(() => notifications.filter((notification) => filter === 'all' || !notification.read), [notifications, filter])
  const unreadCount = notifications.filter((notification) => !notification.read).length

  async function markRead(notification) {
    if (notification.read) return
    await api(`/api/notifications/${notification.id}`, { method: 'PATCH', body: JSON.stringify({ read: true }) })
    setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read: true } : item))
  }

  async function dismiss(notification) {
    await api(`/api/notifications/${notification.id}`, { method: 'PATCH', body: JSON.stringify({ dismissed: true }) })
    setNotifications((current) => current.filter((item) => item.id !== notification.id))
  }

  async function markAllRead() {
    await api('/api/notifications/read-all', { method: 'POST' })
    setNotifications((current) => current.map((item) => ({ ...item, read: true })))
  }

  function formatDate(date) {
    return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00`))
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="dashboard notifications-page">
        <Header firstName={user.firstName} title="Notifications" />
        <section className="notifications-workspace panel" aria-labelledby="notifications-title">
          <div className="notifications-toolbar">
            <div>
              <p className="eyebrow">Stay ahead</p>
              <h2 id="notifications-title">Your alerts <span>{unreadCount} unread</span></h2>
            </div>
            <div className="notifications-toolbar__actions">
              <div className="filter-tabs">
                <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')} type="button">All</button>
                <button className={filter === 'unread' ? 'active' : ''} onClick={() => setFilter('unread')} type="button">Unread</button>
              </div>
              {unreadCount > 0 && <button className="mark-all-button" onClick={markAllRead} type="button"><Icon name="check" size={15} /> Mark all read</button>}
            </div>
          </div>

          <div className="notification-list">
            {visibleNotifications.map((notification) => (
              <article className={`notification-row notification-row--${notification.urgency}${notification.read ? ' notification-row--read' : ''}`} key={notification.id}>
                <span className="notification-row__icon"><Icon name={iconByType[notification.type]} size={20} /></span>
                <div className="notification-row__content">
                  <div><h3>{notification.title}</h3>{!notification.read && <span className="unread-indicator">New</span>}</div>
                  <p>{notification.message}</p>
                  <time dateTime={notification.date}>{formatDate(notification.date)}</time>
                </div>
                <div className="notification-row__actions">
                  <Link onClick={() => markRead(notification)} to={notification.link}>View</Link>
                  {!notification.read && <button onClick={() => markRead(notification)} type="button">Mark read</button>}
                  <button className="dismiss-button" onClick={() => dismiss(notification)} type="button">Dismiss</button>
                </div>
              </article>
            ))}
            {!visibleNotifications.length && (
              <div className="empty-state notification-empty">
                <span><Icon name="bell" size={25} /></span>
                <h3>{filter === 'unread' ? 'You’re all caught up' : 'Nothing needs your attention'}</h3>
                <p>CivicFlow will alert you when an important date is approaching.</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

export default NotificationsPage
