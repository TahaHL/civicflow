import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../components/Icon'
import { useAuth } from '../hooks/useAuth'
import { api } from '../lib/api'
import './AuthPage.css'

function AuthPage({ resetMode = false }) {
  const { user, loading, login, register, completePasswordReset } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState(resetMode ? 'reset' : 'signin')
  const [form, setForm] = useState({ firstName: '', email: '', password: '', confirmPassword: '' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!loading && user && !resetMode) return <Navigate to="/" replace />

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    setSubmitting(true)
    try {
      if (mode === 'signup') {
        await register(form)
      } else if (mode === 'forgot') {
        const data = await api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: form.email }) })
        setMessage(data.message)
      } else if (mode === 'reset') {
        if (form.password !== form.confirmPassword) throw new Error('Passwords do not match.')
        const data = await api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: searchParams.get('token'), password: form.password }) })
        completePasswordReset(data)
        navigate('/', { replace: true })
      } else {
        await login({ email: form.email, password: form.password })
      }
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSubmitting(false)
    }
  }

  function changeMode(nextMode) {
    setMode(nextMode)
    setError('')
    setMessage('')
  }

  const heading = mode === 'signup' ? 'Create your workspace' : mode === 'forgot' ? 'Reset your password' : mode === 'reset' ? 'Choose a new password' : 'Sign in to your workspace'
  const description = mode === 'signup' ? 'Start building a calmer way to manage life.' : mode === 'forgot' ? 'Enter your account email and we’ll send you a secure reset link.' : mode === 'reset' ? 'Use a strong password with at least 8 characters.' : 'Your day is waiting—let’s get you organised.'

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <Link className="auth-brand" to="/signin"><span><Icon name="spark" size={23} /></span>CivicFlow</Link>
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
            <h2>{heading}</h2>
            <p>{description}</p>
          </div>

          {!resetMode && mode !== 'forgot' && <div className="auth-tabs" role="tablist" aria-label="Account options">
              <button className={mode === 'signin' ? 'active' : ''} onClick={() => changeMode('signin')} role="tab" type="button">Sign in</button>
              <button className={mode === 'signup' ? 'active' : ''} onClick={() => changeMode('signup')} role="tab" type="button">Create account</button>
            </div>}

          <form className="auth-form" onSubmit={submit}>
            {mode === 'signup' && <label>First name<input autoComplete="given-name" name="firstName" onChange={updateField} placeholder="e.g. Maya" required value={form.firstName} /></label>}
            {mode !== 'reset' && <label>Email address<input autoComplete="email" name="email" onChange={updateField} placeholder="you@example.com" required type="email" value={form.email} /></label>}
            {mode !== 'forgot' && <label>Password<input autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={8} name="password" onChange={updateField} placeholder="At least 8 characters" required type="password" value={form.password} /></label>}
            {mode === 'reset' && <label>Confirm password<input autoComplete="new-password" minLength={8} name="confirmPassword" onChange={updateField} placeholder="Type it again" required type="password" value={form.confirmPassword} /></label>}
            {error && <p className="form-error" role="alert">{error}</p>}
            {message && <p className="form-success" role="status">{message}</p>}
            <button className="auth-submit" disabled={submitting} type="submit">
              {submitting ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create my account' : mode === 'forgot' ? 'Send reset link' : 'Save new password'}
              {!submitting && <Icon name="arrow" size={17} />}
            </button>
          </form>
          {mode === 'signin' && <button className="forgot-password-link" onClick={() => changeMode('forgot')} type="button">Forgot your password?</button>}
          {mode === 'forgot' && <button className="forgot-password-link" onClick={() => changeMode('signin')} type="button">Back to sign in</button>}
          <p className="auth-note">Your information is stored privately in your CivicFlow workspace.</p>
        </div>
      </section>
    </main>
  )
}

export default AuthPage
