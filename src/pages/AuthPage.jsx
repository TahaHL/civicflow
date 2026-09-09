import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import Icon from '../components/Icon'
import { useAuth } from '../hooks/useAuth'
import './AuthPage.css'

function AuthPage() {
  const { user, loading, login, register } = useAuth()
  const [mode, setMode] = useState('signin')
  const [form, setForm] = useState({ firstName: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!loading && user) return <Navigate to="/" replace />

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      if (mode === 'signup') await register(form)
      else await login({ email: form.email, password: form.password })
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function changeMode(nextMode) {
    setMode(nextMode)
    setError('')
  }

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <a className="auth-brand" href="/signin"><span><Icon name="spark" size={23} /></span>CivicFlow</a>
        <div className="auth-intro__content">
          <p className="auth-kicker">Life admin, simplified</p>
          <h1>More headspace.<br />Less paperwork.</h1>
          <p>Bring your tasks, deadlines and everyday responsibilities together in one calm, private workspace.</p>
        </div>
        <div className="auth-quote"><Icon name="check" size={18} /><span>Everything important, finally in one place.</span></div>
      </section>

      <section className="auth-form-side">
        <div className="auth-card">
          <div className="auth-card__heading">
            <p className="eyebrow">Welcome to CivicFlow</p>
            <h2>{mode === 'signin' ? 'Sign in to your workspace' : 'Create your workspace'}</h2>
            <p>{mode === 'signin' ? 'Your day is waiting—let’s get you organised.' : 'Start building a calmer way to manage life.'}</p>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Account options">
            <button className={mode === 'signin' ? 'active' : ''} onClick={() => changeMode('signin')} role="tab" type="button">Sign in</button>
            <button className={mode === 'signup' ? 'active' : ''} onClick={() => changeMode('signup')} role="tab" type="button">Create account</button>
          </div>

          <form className="auth-form" onSubmit={submit}>
            {mode === 'signup' && <label>First name<input autoComplete="given-name" name="firstName" onChange={updateField} placeholder="e.g. Maya" required value={form.firstName} /></label>}
            <label>Email address<input autoComplete="email" name="email" onChange={updateField} placeholder="you@example.com" required type="email" value={form.email} /></label>
            <label>Password<input autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={8} name="password" onChange={updateField} placeholder="At least 8 characters" required type="password" value={form.password} /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="auth-submit" disabled={submitting} type="submit">
              {submitting ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create my account'}
              {!submitting && <Icon name="arrow" size={17} />}
            </button>
          </form>
          <p className="auth-note">Your information is stored privately in your CivicFlow workspace.</p>
        </div>
      </section>
    </main>
  )
}

export default AuthPage
