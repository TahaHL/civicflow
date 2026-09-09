import Icon from './Icon'
import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const navigationItems = [
  { label: 'Overview', icon: 'grid', to: '/' },
  { label: 'Notifications', icon: 'bell', to: '/notifications' },
  { label: 'Tasks', icon: 'check', to: '/tasks' },
  { label: 'Calendar', icon: 'calendar', to: '/calendar' },
  { label: 'Documents', icon: 'file', to: '/documents' },
  { label: 'Finances', icon: 'wallet', to: '/money' },
  { label: 'Settings', icon: 'settings', to: '/settings' },
]

function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (!mobileOpen) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function closeOnEscape(event) { if (event.key === 'Escape') setMobileOpen(false) }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [mobileOpen])

  async function signOut() {
    await logout()
    setMobileOpen(false)
    navigate('/signin')
  }

  return (
    <aside className="sidebar">
      <Link className="brand" to="/" aria-label="CivicFlow home">
        <span className="brand__mark"><Icon name="spark" size={21} /></span>
        <span>CivicFlow</span>
      </Link>
      <button aria-controls="mobile-navigation" aria-expanded={mobileOpen} aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'} className="mobile-nav-toggle" onClick={() => setMobileOpen((current) => !current)} type="button"><Icon name={mobileOpen ? 'close' : 'menu'} size={21} /></button>
      {mobileOpen && <button aria-label="Close navigation menu" className="mobile-nav-backdrop" onClick={() => setMobileOpen(false)} type="button" />}
      <nav className={`sidebar__nav${mobileOpen ? ' sidebar__nav--open' : ''}`} aria-label="Main navigation" id="mobile-navigation">
        <p className="sidebar__label">Workspace</p>
        {navigationItems.map((item) => (
          <NavLink aria-label={item.label} className={({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`} end={item.to === '/'} onClick={() => setMobileOpen(false)} to={item.to} key={item.label}>
            <Icon name={item.icon} size={19} /><span>{item.label}</span>
          </NavLink>
        ))}
        <div className="mobile-nav-account">
          <span className="profile__avatar">{user.firstName.slice(0, 2).toUpperCase()}</span>
          <span><strong>{user.firstName}</strong><small>{user.email}</small></span>
        </div>
        <button className="nav-item nav-item--button mobile-signout" type="button" onClick={signOut}><Icon name="logout" size={19} /><span>Sign out</span></button>
      </nav>
      <div className="sidebar__bottom">
        <div className="profile">
          <span className="profile__avatar">{user.firstName.slice(0, 2).toUpperCase()}</span>
          <span><strong>{user.firstName}</strong><small>{user.email}</small></span>
        </div>
        <button aria-label="Sign out" className="nav-item nav-item--button" type="button" onClick={signOut}><Icon name="logout" size={18} /><span>Sign out</span></button>
      </div>
    </aside>
  )
}

export default Sidebar
