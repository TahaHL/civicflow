import { useState } from 'react'
import Header from '../components/Header'
import Icon from '../components/Icon'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../hooks/useAuth'
import { api } from '../lib/api'
import './Dashboard.css'

const reminderOptions = [
  { key: 'taskReminders', title: 'Task reminders', description: 'Overdue tasks and deadlines approaching within three days.' },
  { key: 'appointmentReminders', title: 'Appointment reminders', description: 'Appointments happening during the next seven days.' },
  { key: 'documentReminders', title: 'Document reminders', description: 'Documents that have expired or expire within 60 days.' },
  { key: 'billReminders', title: 'Bill reminders', description: 'Unpaid bills due during the next seven days.' },
]

function SettingsPage() {
  const { user, updateUser, logout } = useAuth()
  const [firstName, setFirstName] = useState(user.firstName)
  const [profileMessage, setProfileMessage] = useState('')
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [passwordMessage, setPasswordMessage] = useState({ text: '', error: false })

  async function saveProfile(event) {
    event.preventDefault()
    try {
      const data = await api('/api/profile', { method: 'PATCH', body: JSON.stringify({ firstName }) })
      updateUser(data.user)
      setProfileMessage('Your profile has been updated.')
    } catch (error) { setProfileMessage(error.message) }
  }

  async function savePreference(changes) {
    const data = await api('/api/profile/preferences', { method: 'PATCH', body: JSON.stringify(changes) })
    updateUser(data.user)
  }

  async function changePassword(event) {
    event.preventDefault()
    setPasswordMessage({ text: '', error: false })
    if (passwords.newPassword !== passwords.confirmPassword) {
      setPasswordMessage({ text: 'New passwords do not match.', error: true })
      return
    }
    try {
      await api('/api/profile/password', { method: 'PATCH', body: JSON.stringify(passwords) })
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setPasswordMessage({ text: 'Password updated. Other sessions have been signed out.', error: false })
    } catch (error) { setPasswordMessage({ text: error.message, error: true }) }
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="dashboard settings-page">
        <Header firstName={user.firstName} title="Settings" />
        <div className="settings-workspace">
          <section className="settings-section panel" aria-labelledby="profile-settings-title">
            <div className="settings-section__intro"><span><Icon name="user" size={20} /></span><div><p className="eyebrow">Profile</p><h2 id="profile-settings-title">Personal details</h2><p>This is how CivicFlow addresses you throughout your workspace.</p></div></div>
            <form className="settings-form" onSubmit={saveProfile}>
              <label>First name<input autoComplete="given-name" maxLength={50} onChange={(event) => setFirstName(event.target.value)} required value={firstName} /></label>
              <label>Email address<input disabled type="email" value={user.email} /></label>
              <div className="settings-form__footer">{profileMessage && <p className="settings-message">{profileMessage}</p>}<button className="settings-save" type="submit">Save changes</button></div>
            </form>
          </section>

          <section className="settings-section panel" aria-labelledby="reminder-settings-title">
            <div className="settings-section__intro"><span><Icon name="bell" size={20} /></span><div><p className="eyebrow">Notifications</p><h2 id="reminder-settings-title">Reminder preferences</h2><p>Choose which events appear in your Notification Centre.</p></div></div>
            <div className="preference-list">
              {reminderOptions.map((option) => (
                <label className="preference-row" key={option.key}>
                  <span><strong>{option.title}</strong><small>{option.description}</small></span>
                  <input checked={user.preferences[option.key]} onChange={(event) => savePreference({ [option.key]: event.target.checked })} type="checkbox" />
                  <span className="toggle" aria-hidden="true" />
                </label>
              ))}
            </div>
          </section>

          <section className="settings-section panel" aria-labelledby="appearance-settings-title">
            <div className="settings-section__intro"><span><Icon name="spark" size={20} /></span><div><p className="eyebrow">Appearance</p><h2 id="appearance-settings-title">Colour theme</h2><p>Choose how CivicFlow looks on this account.</p></div></div>
            <div className="theme-options">
              {['light', 'dark', 'system'].map((theme) => (
                <button className={user.preferences.theme === theme ? 'active' : ''} key={theme} onClick={() => savePreference({ theme })} type="button"><span className={`theme-preview theme-preview--${theme}`} /><strong>{theme}</strong>{user.preferences.theme === theme && <Icon name="check" size={15} />}</button>
              ))}
            </div>
          </section>

          <section className="settings-section panel" aria-labelledby="security-settings-title">
            <div className="settings-section__intro"><span><Icon name="lock" size={20} /></span><div><p className="eyebrow">Security</p><h2 id="security-settings-title">Change password</h2><p>Use at least eight characters and avoid passwords used elsewhere.</p></div></div>
            <form className="settings-form password-form" onSubmit={changePassword}>
              <label>Current password<input autoComplete="current-password" onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} required type="password" value={passwords.currentPassword} /></label>
              <label>New password<input autoComplete="new-password" minLength={8} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} required type="password" value={passwords.newPassword} /></label>
              <label>Confirm new password<input autoComplete="new-password" minLength={8} onChange={(event) => setPasswords({ ...passwords, confirmPassword: event.target.value })} required type="password" value={passwords.confirmPassword} /></label>
              <div className="settings-form__footer">{passwordMessage.text && <p className={`settings-message${passwordMessage.error ? ' settings-message--error' : ''}`} role={passwordMessage.error ? 'alert' : undefined}>{passwordMessage.text}</p>}<button className="settings-save" type="submit">Update password</button></div>
            </form>
          </section>

          <section className="session-card">
            <div><strong>Finished for now?</strong><p>Sign out safely on this device.</p></div>
            <button onClick={logout} type="button">Sign out</button>
          </section>
        </div>
      </main>
    </div>
  )
}

export default SettingsPage
