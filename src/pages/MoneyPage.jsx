import { useMemo, useState } from 'react'
import ConfirmDeleteButton from '../components/ConfirmDeleteButton'
import EditDialog from '../components/EditDialog'
import Header from '../components/Header'
import Icon from '../components/Icon'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../hooks/useAuth'
import { useDataRefresh } from '../hooks/useDataRefresh'
import { api } from '../lib/api'
import './Dashboard.css'

const categories = ['Income', 'Housing', 'Utilities', 'Groceries', 'Transport', 'Health', 'Insurance', 'Subscriptions', 'Leisure', 'Shopping', 'Other']
const frequencies = ['Once', 'Weekly', 'Monthly', 'Quarterly', 'Yearly']
const filters = ['all', 'bill', 'expense', 'income']
const now = new Date()
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
const currentMonth = today.slice(0, 7)
const emptyForm = { title: '', type: 'expense', amount: '', category: 'Groceries', date: today, frequency: 'Once', paid: false, notes: '' }

function offsetMonth(month, amount) {
  const date = new Date(`${month}-01T12:00:00`)
  date.setMonth(date.getMonth() + amount)
  return date.toISOString().slice(0, 7)
}

function labelMonth(month) {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00`))
}

function MoneyPage() {
  const { user } = useAuth()
  const [records, setRecords] = useState([])
  const [budgets, setBudgets] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [budgetForm, setBudgetForm] = useState({ category: 'Groceries', limit: '', rollover: false })
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [filter, setFilter] = useState('all')
  const [privateMode, setPrivateMode] = useState(false)
  const [error, setError] = useState('')
  const [budgetMessage, setBudgetMessage] = useState('')
  const [editingRecord, setEditingRecord] = useState(null)
  const [editingBudget, setEditingBudget] = useState(null)
  const [editError, setEditError] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  useDataRefresh(() => {
    Promise.all([api('/api/money'), api('/api/budgets')])
      .then(([moneyData, budgetData]) => { setRecords(moneyData.records); setBudgets(budgetData.budgets) })
      .catch((requestError) => setError(requestError.message))
  })

  const monthRecords = useMemo(() => records.filter((record) => record.date.startsWith(selectedMonth)), [records, selectedMonth])
  const income = monthRecords.filter((record) => record.type === 'income').reduce((sum, record) => sum + record.amountPence, 0)
  const spent = monthRecords.filter((record) => record.type === 'expense' || (record.type === 'bill' && record.paid)).reduce((sum, record) => sum + record.amountPence, 0)
  const upcoming = monthRecords.filter((record) => record.type === 'bill' && !record.paid).reduce((sum, record) => sum + record.amountPence, 0)
  const forecast = income - spent - upcoming
  const outgoings = spent + upcoming
  const usedPercent = income > 0 ? Math.min(100, Math.round((outgoings / income) * 100)) : 0

  const visibleRecords = monthRecords.filter((record) => filter === 'all' || record.type === filter)
  const upcomingBills = monthRecords.filter((record) => record.type === 'bill' && !record.paid).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5)
  const categoryTotals = useMemo(() => {
    const totals = new Map()
    for (const record of monthRecords.filter((item) => item.type === 'expense' || (item.type === 'bill' && item.paid))) {
      totals.set(record.category, (totals.get(record.category) || 0) + record.amountPence)
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [monthRecords])

  const budgetsForMonth = budgets.filter((budget) => budget.month === selectedMonth)
  const previousMonth = offsetMonth(selectedMonth, -1)
  const spendingByCategory = new Map()
  for (const record of monthRecords.filter((item) => item.type === 'expense' || (item.type === 'bill' && item.paid))) {
    spendingByCategory.set(record.category, (spendingByCategory.get(record.category) || 0) + record.amountPence)
  }
  const budgetProgress = budgetsForMonth.map((budget) => {
    const previousBudget = budgets.find((item) => item.month === previousMonth && item.category === budget.category)
    const previousSpent = records.filter((item) => item.date.startsWith(previousMonth) && item.category === budget.category && (item.type === 'expense' || (item.type === 'bill' && item.paid))).reduce((sum, item) => sum + item.amountPence, 0)
    const carriedPence = budget.rollover && previousBudget ? Math.max(0, previousBudget.limitPence - previousSpent) : 0
    const effectiveLimit = budget.limitPence + carriedPence
    const categorySpent = spendingByCategory.get(budget.category) || 0
    return { ...budget, effectiveLimit, categorySpent, carriedPence, percent: effectiveLimit ? Math.round((categorySpent / effectiveLimit) * 100) : 0 }
  })
  const totalBudgetRemaining = budgetProgress.reduce((sum, budget) => sum + Math.max(0, budget.effectiveLimit - budget.categorySpent), 0)
  const selectedDate = new Date(`${selectedMonth}-01T12:00:00`)
  const daysInSelectedMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate()
  const daysRemaining = selectedMonth === currentMonth ? daysInSelectedMonth - Number(today.slice(8, 10)) + 1 : selectedMonth > currentMonth ? daysInSelectedMonth : 0
  const safePool = budgetsForMonth.length ? Math.min(Math.max(0, forecast), totalBudgetRemaining) : Math.max(0, forecast)
  const safeToSpend = daysRemaining > 0 ? Math.floor(safePool / daysRemaining) : 0

  function money(pence, showSign = false) {
    if (privateMode) return '••••'
    const value = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Math.abs(pence) / 100)
    return pence < 0 ? `−${value}` : showSign && pence > 0 ? `+${value}` : value
  }

  function updateForm(event) {
    const { name, type, checked, value } = event.target
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }))
  }

  function updateBudgetForm(event) {
    const { name, type, checked, value } = event.target
    setBudgetForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }))
  }

  function changeMonth(amount) {
    const month = offsetMonth(selectedMonth, amount)
    setSelectedMonth(month)
    setForm((current) => ({ ...current, date: month === currentMonth ? today : `${month}-01` }))
    setBudgetMessage('')
  }

  function changeType(type) {
    setForm((current) => ({ ...current, type, category: type === 'income' ? 'Income' : current.category === 'Income' ? 'Groceries' : current.category, frequency: type === 'bill' ? current.frequency : 'Once', paid: type !== 'bill' }))
  }

  async function addRecord(event) {
    event.preventDefault()
    setError('')
    try {
      const { record } = await api('/api/money', { method: 'POST', body: JSON.stringify(form) })
      setRecords((current) => [record, ...current])
      setSelectedMonth(record.date.slice(0, 7))
      setForm({ ...emptyForm, date: record.date, type: form.type, category: form.type === 'income' ? 'Income' : emptyForm.category })
    } catch (requestError) { setError(requestError.message) }
  }

  async function togglePaid(record) {
    const { record: updated, nextRecord } = await api(`/api/money/${record.id}`, { method: 'PATCH', body: JSON.stringify({ paid: !record.paid }) })
    setRecords((current) => {
      const updatedRecords = current.map((item) => item.id === updated.id ? updated : item)
      return nextRecord ? [nextRecord, ...updatedRecords] : updatedRecords
    })
  }

  async function deleteRecord(record) {
    await api(`/api/money/${record.id}`, { method: 'DELETE' })
    setRecords((current) => current.filter((item) => item.id !== record.id))
  }

  async function saveBudget(event) {
    event.preventDefault()
    setBudgetMessage('')
    try {
      const { budget, created } = await api('/api/budgets', { method: 'POST', body: JSON.stringify({ ...budgetForm, month: selectedMonth }) })
      setBudgets((current) => created ? [...current, budget] : current.map((item) => item.id === budget.id ? budget : item))
      setBudgetForm((current) => ({ ...current, limit: '' }))
      setBudgetMessage(created ? `${budget.category} budget added.` : `${budget.category} budget updated.`)
    } catch (requestError) { setBudgetMessage(requestError.message) }
  }

  async function copyPreviousBudgets() {
    setBudgetMessage('')
    try {
      const { budgets: copied } = await api('/api/budgets/copy', { method: 'POST', body: JSON.stringify({ fromMonth: previousMonth, toMonth: selectedMonth }) })
      setBudgets((current) => [...current, ...copied])
      setBudgetMessage(copied.length ? `${copied.length} budget${copied.length === 1 ? '' : 's'} copied from ${labelMonth(previousMonth)}.` : `Nothing new to copy from ${labelMonth(previousMonth)}.`)
    } catch (requestError) { setBudgetMessage(requestError.message) }
  }

  async function deleteBudget(budget) {
    await api(`/api/budgets/${budget.id}`, { method: 'DELETE' })
    setBudgets((current) => current.filter((item) => item.id !== budget.id))
  }

  function openRecordEditor(record) {
    setEditError('')
    setEditingRecord({ ...record, amount: (record.amountPence / 100).toFixed(2) })
  }

  function openBudgetEditor(budget) {
    setEditError('')
    setEditingBudget({ ...budget, limit: (budget.limitPence / 100).toFixed(2) })
  }

  function updateEditingRecord(event) {
    const { name, type, checked, value } = event.target
    setEditingRecord((current) => {
      const updated = { ...current, [name]: type === 'checkbox' ? checked : value }
      if (name === 'type') {
        if (value === 'income') updated.category = 'Income'
        else if (updated.category === 'Income') updated.category = 'Other'
        if (value !== 'bill') { updated.frequency = 'Once'; updated.paid = true }
      }
      return updated
    })
  }

  async function saveRecordEdit(event) {
    event.preventDefault()
    setSavingEdit(true)
    setEditError('')
    try {
      const { record: updated, nextRecord } = await api(`/api/money/${editingRecord.id}`, { method: 'PATCH', body: JSON.stringify(editingRecord) })
      setRecords((current) => {
        const updatedRecords = current.map((item) => item.id === updated.id ? updated : item)
        return nextRecord ? [nextRecord, ...updatedRecords] : updatedRecords
      })
      setEditingRecord(null)
    } catch (requestError) { setEditError(requestError.message) }
    finally { setSavingEdit(false) }
  }

  async function saveBudgetEdit(event) {
    event.preventDefault()
    setSavingEdit(true)
    setEditError('')
    try {
      const { budget: updated } = await api(`/api/budgets/${editingBudget.id}`, { method: 'PATCH', body: JSON.stringify(editingBudget) })
      setBudgets((current) => current.map((item) => item.id === updated.id ? updated : item))
      setEditingBudget(null)
    } catch (requestError) { setEditError(requestError.message) }
    finally { setSavingEdit(false) }
  }

  function dateLabel(date) {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00`))
  }

  return (
    <div className="app-shell" id="top">
      <Sidebar />
      <main className="dashboard money-page">
        <Header firstName={user.firstName} title="Finances" subtitle="Understand what came in, what went out, and what is still ahead." />
        <div className="money-workspace">
          <nav className="money-month-nav" aria-label="Choose financial month">
            <button aria-label="Previous month" onClick={() => changeMonth(-1)} type="button"><Icon name="arrow" size={16} /></button>
            <div><small>Viewing</small><strong>{labelMonth(selectedMonth)}</strong></div>
            <button aria-label="Next month" onClick={() => changeMonth(1)} type="button"><Icon name="arrow" size={16} /></button>
            {selectedMonth !== currentMonth && <button className="money-today-button" onClick={() => { setSelectedMonth(currentMonth); setForm((current) => ({ ...current, date: today })) }} type="button">This month</button>}
          </nav>
          <section className="money-hero" aria-labelledby="money-position-title">
            <div className="money-position">
              <div className="money-position__heading"><div><p className="eyebrow">{labelMonth(selectedMonth)}</p><h2 id="money-position-title">Available after bills</h2></div><button className="privacy-button" onClick={() => setPrivateMode((current) => !current)} type="button"><Icon name="eye" size={16} /> {privateMode ? 'Show amounts' : 'Hide amounts'}</button></div>
              <strong className={`money-position__value${forecast < 0 ? ' money-position__value--negative' : ''}`}>{money(forecast)}</strong>
              <p>{forecast >= 0 ? 'Your recorded income covers this month’s spending and upcoming bills.' : 'Your recorded outgoings are currently higher than your income.'}</p>
              <div className="cashflow-bar" aria-label={`${usedPercent}% of income allocated`}><span style={{ width: `${usedPercent}%` }} /></div>
              <div className="cashflow-legend"><span>{usedPercent}% allocated</span><span>{money(upcoming)} still due</span></div>
            </div>
            <div className="money-metrics">
              <article><span className="money-metric__icon money-metric__icon--income"><Icon name="trend" size={19} /></span><div><small>Income</small><strong>{money(income)}</strong></div></article>
              <article><span className="money-metric__icon money-metric__icon--spent"><Icon name="wallet" size={19} /></span><div><small>Spent</small><strong>{money(spent)}</strong></div></article>
              <article><span className="money-metric__icon money-metric__icon--bills"><Icon name="clock" size={19} /></span><div><small>Upcoming bills</small><strong>{money(upcoming)}</strong></div></article>
              <article><span className="money-metric__icon money-metric__icon--safe"><Icon name="check" size={19} /></span><div><small>Safe to spend / day</small><strong>{money(safeToSpend)}</strong></div></article>
            </div>
          </section>

          <form className="money-creator panel" onSubmit={addRecord}>
            <div className="money-creator__intro"><p className="eyebrow">Quick entry</p><h2>Add financial activity</h2><p>Record income, spending, or an upcoming bill.</p></div>
            <div className="money-type-tabs" aria-label="Financial record type">
              {['expense', 'bill', 'income'].map((type) => <button className={form.type === type ? 'active' : ''} key={type} onClick={() => changeType(type)} type="button">{type === 'expense' ? 'Spending' : type}</button>)}
            </div>
            <div className="money-creator__fields">
              <label className="money-title-field">Name<input maxLength={100} name="title" onChange={updateForm} placeholder={form.type === 'bill' ? 'e.g. Electricity bill' : form.type === 'income' ? 'e.g. Salary' : 'e.g. Weekly shop'} required value={form.title} /></label>
              <label>Amount (£)<input min="0.01" name="amount" onChange={updateForm} placeholder="0.00" required step="0.01" type="number" value={form.amount} /></label>
              <label>Category<select name="category" onChange={updateForm} value={form.category}>{categories.filter((item) => form.type === 'income' ? item === 'Income' : item !== 'Income').map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>Date<input name="date" onChange={updateForm} required type="date" value={form.date} /></label>
              {form.type === 'bill' && <label>Repeats<select name="frequency" onChange={updateForm} value={form.frequency}>{frequencies.map((item) => <option key={item}>{item}</option>)}</select></label>}
              {form.type === 'bill' && <label className="money-paid-field"><input checked={form.paid} name="paid" onChange={updateForm} type="checkbox" /> Already paid</label>}
              <button className="primary-button" type="submit"><Icon name="plus" size={17} /> Add record</button>
            </div>
            {error && <p className="form-error money-form-error" role="alert">{error}</p>}
          </form>

          <section className="budget-panel panel" aria-labelledby="budgets-title">
            <div className="budget-panel__header"><div><p className="eyebrow">Plan with confidence</p><h2 id="budgets-title">Monthly budgets</h2><p>Set category limits and see whether your spending pace is on track.</p></div><button className="copy-budget-button" onClick={copyPreviousBudgets} type="button">Copy {labelMonth(previousMonth)}</button></div>
            <form className="budget-form" onSubmit={saveBudget}>
              <label>Category<select name="category" onChange={updateBudgetForm} value={budgetForm.category}>{categories.filter((item) => item !== 'Income').map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>Monthly limit (£)<input min="0.01" name="limit" onChange={updateBudgetForm} placeholder="0.00" required step="0.01" type="number" value={budgetForm.limit} /></label>
              <label className="budget-rollover"><input checked={budgetForm.rollover} name="rollover" onChange={updateBudgetForm} type="checkbox" /> Include last month’s unused limit</label>
              <button className="primary-button" type="submit">Save budget</button>
              <p className="budget-explanation">Choose a category and the most you want to spend in {labelMonth(selectedMonth)}. For example, a £300 groceries limit with £80 of recorded spending leaves £220. Spending and paid bills update your progress automatically; unpaid bills are reserved in “Available after bills”. Budgets do not create transactions. Copy a previous month’s plan to reuse its limits.</p>
              {budgetMessage && <p className="budget-message" role="status">{budgetMessage}</p>}
            </form>
            <div className="budget-list">
              {budgetProgress.map((budget) => (
                <article className={`budget-card${budget.percent > 100 ? ' budget-card--over' : budget.percent >= 80 ? ' budget-card--close' : ''}`} key={budget.id}>
                  <div className="budget-card__heading"><span><strong>{budget.category}</strong><small>{budget.percent > 100 ? 'Over budget' : budget.percent >= 80 ? 'Close to limit' : 'On track'}{budget.carriedPence ? ` · ${money(budget.carriedPence)} rolled over` : ''}</small></span><div className="row-actions"><button aria-label={`Edit ${budget.category} budget`} className="edit-button" onClick={() => openBudgetEditor(budget)} type="button"><Icon name="edit" size={14} /></button><ConfirmDeleteButton className="delete-button" label={`${budget.category} budget`} onConfirm={() => deleteBudget(budget)} /></div></div>
                  <div className="budget-progress"><span style={{ width: `${Math.min(100, budget.percent)}%` }} /></div>
                  <div className="budget-card__figures"><span><strong>{money(budget.categorySpent)}</strong> spent</span><span>{money(budget.effectiveLimit)} limit</span></div>
                </article>
              ))}
              {!budgetProgress.length && <div className="budget-empty"><Icon name="trend" size={21} /><span><strong>Build your plan for {labelMonth(selectedMonth)}</strong><small>Add a category limit or copy last month’s plan.</small></span></div>}
            </div>
          </section>

          <div className="money-grid">
            <section className="panel money-activity" aria-labelledby="money-activity-title">
              <div className="money-section-header"><div><p className="eyebrow">Ledger</p><h2 id="money-activity-title">Recent activity</h2></div><div className="filter-tabs">{filters.map((item) => <button className={filter === item ? 'active' : ''} key={item} onClick={() => setFilter(item)} type="button">{item === 'expense' ? 'spending' : item}</button>)}</div></div>
              <div className="money-record-list">
                {visibleRecords.map((record) => (
                  <article className={`money-record money-record--${record.type}`} key={record.id}>
                    <span className="money-record__icon"><Icon name={record.type === 'income' ? 'trend' : record.type === 'bill' ? 'clock' : 'wallet'} size={18} /></span>
                    <div className="money-record__main"><h3>{record.title}</h3><p>{record.category} · {dateLabel(record.date)}{record.frequency !== 'Once' ? ` · ${record.frequency} · renews when paid` : ''}</p></div>
                    {record.type === 'bill' && <button className={`bill-status${record.paid ? ' bill-status--paid' : ''}`} onClick={() => togglePaid(record)} type="button">{record.paid ? 'Paid' : 'Mark paid'}</button>}
                    <strong className={`money-record__amount money-record__amount--${record.type}`}>{money(record.type === 'income' ? record.amountPence : -record.amountPence, true)}</strong>
                    <div className="row-actions"><button aria-label={`Edit ${record.title}`} className="edit-button" onClick={() => openRecordEditor(record)} type="button"><Icon name="edit" size={15} /></button><ConfirmDeleteButton className="delete-button" label={record.title} onConfirm={() => deleteRecord(record)} /></div>
                  </article>
                ))}
                {!visibleRecords.length && <div className="empty-state"><span><Icon name="wallet" size={24} /></span><h3>No records here yet</h3><p>Add your first income, purchase, or bill above.</p></div>}
              </div>
            </section>

            <aside className="money-side-column">
              <section className="panel spending-panel">
                <div><p className="eyebrow">{labelMonth(selectedMonth)}</p><h2>Spending breakdown</h2></div>
                <div className="spending-visual">
                  <div className="spending-ring" style={{ '--spent-angle': `${income > 0 ? Math.min(360, (spent / income) * 360) : 0}deg` }}><span><strong>{income ? Math.round((spent / income) * 100) : 0}%</strong><small>of income</small></span></div>
                  <div className="category-totals">{categoryTotals.map(([category, amount]) => <div key={category}><span><i />{category}</span><strong>{money(amount)}</strong></div>)}{!categoryTotals.length && <p>No spending recorded this month.</p>}</div>
                </div>
              </section>
              <section className="panel upcoming-bills-panel">
                <div><p className="eyebrow">On the horizon</p><h2>Upcoming bills</h2></div>
                <div>{upcomingBills.map((bill) => <article key={bill.id}><time dateTime={bill.date}>{dateLabel(bill.date)}</time><span><strong>{bill.title}</strong><small>{bill.frequency}</small></span><b>{money(bill.amountPence)}</b></article>)}{!upcomingBills.length && <div className="money-mini-empty"><Icon name="check" size={18} /><span><strong>You’re all clear</strong><small>No unpaid bills recorded.</small></span></div>}</div>
              </section>
            </aside>
          </div>
        </div>
        <EditDialog error={editError} onClose={() => setEditingRecord(null)} onSubmit={saveRecordEdit} open={Boolean(editingRecord)} saving={savingEdit} title="Financial record">
          {editingRecord && <>
            <label>Type<select name="type" onChange={updateEditingRecord} value={editingRecord.type}><option value="expense">Spending</option><option value="bill">Bill</option><option value="income">Income</option></select></label>
            <label className="edit-field--wide">Name<input maxLength={100} name="title" onChange={updateEditingRecord} required value={editingRecord.title} /></label>
            <label>Amount (£)<input min="0.01" name="amount" onChange={updateEditingRecord} required step="0.01" type="number" value={editingRecord.amount} /></label>
            <label>Category<select name="category" onChange={updateEditingRecord} value={editingRecord.category}>{categories.filter((item) => editingRecord.type === 'income' ? item === 'Income' : item !== 'Income').map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Date<input name="date" onChange={updateEditingRecord} required type="date" value={editingRecord.date} /></label>
            {editingRecord.type === 'bill' && <label>Repeats<select name="frequency" onChange={updateEditingRecord} value={editingRecord.frequency}>{frequencies.map((item) => <option key={item}>{item}</option>)}</select></label>}
            {editingRecord.type === 'bill' && <label className="edit-checkbox"><input checked={editingRecord.paid} name="paid" onChange={updateEditingRecord} type="checkbox" /> This bill has been paid</label>}
            <label className="edit-field--full">Notes<textarea maxLength={500} name="notes" onChange={updateEditingRecord} placeholder="Optional details" rows={3} value={editingRecord.notes || ''} /></label>
          </>}
        </EditDialog>
        <EditDialog error={editError} onClose={() => setEditingBudget(null)} onSubmit={saveBudgetEdit} open={Boolean(editingBudget)} saving={savingEdit} title="Monthly budget">
          {editingBudget && <>
            <label>Category<select name="category" onChange={(event) => setEditingBudget((current) => ({ ...current, category: event.target.value }))} value={editingBudget.category}>{categories.filter((item) => item !== 'Income').map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Monthly limit (£)<input min="0.01" name="limit" onChange={(event) => setEditingBudget((current) => ({ ...current, limit: event.target.value }))} required step="0.01" type="number" value={editingBudget.limit} /></label>
            <label className="edit-checkbox edit-field--full"><input checked={editingBudget.rollover} onChange={(event) => setEditingBudget((current) => ({ ...current, rollover: event.target.checked }))} type="checkbox" /> Include last month’s unused limit</label>
            <p className="edit-context edit-field--full">Changes apply to {labelMonth(editingBudget.month)}.</p>
          </>}
        </EditDialog>
      </main>
    </div>
  )
}

export default MoneyPage
