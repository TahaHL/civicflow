import { useEffect, useMemo, useRef, useState } from 'react'
import Header from '../components/Header'
import ConfirmDeleteButton from '../components/ConfirmDeleteButton'
import EditDialog from '../components/EditDialog'
import Icon from '../components/Icon'
import Sidebar from '../components/Sidebar'
import SummaryCard from '../components/SummaryCard'
import { useAuth } from '../hooks/useAuth'
import { api } from '../lib/api'
import './Dashboard.css'

const categories = ['All', 'Identity', 'Home', 'Vehicle', 'Finance', 'Health', 'Other']
const emptyForm = { name: '', category: 'Identity', issuer: '', expiryDate: '', notes: '' }

function expiryDetails(expiryDate) {
  if (!expiryDate) return { label: 'No expiry date', state: 'none', days: null }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(`${expiryDate}T00:00:00`)
  const days = Math.ceil((expiry - today) / 86400000)
  if (days < 0) return { label: `Expired ${Math.abs(days)} days ago`, state: 'expired', days }
  if (days === 0) return { label: 'Expires today', state: 'warning', days }
  if (days <= 60) return { label: `Expires in ${days} days`, state: 'warning', days }
  return { label: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(expiry), state: 'valid', days }
}

function DocumentsPage() {
  const { user } = useAuth()
  const [documents, setDocuments] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [editingDocument, setEditingDocument] = useState(null)
  const [editError, setEditError] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const nameRef = useRef(null)

  useEffect(() => { api('/api/documents').then((data) => setDocuments(data.documents)).catch(console.error) }, [])

  const visibleDocuments = useMemo(() => documents.filter((document) => {
    const matchesSearch = `${document.name} ${document.issuer}`.toLowerCase().includes(search.toLowerCase())
    return matchesSearch && (category === 'All' || document.category === category)
  }), [documents, search, category])

  const expiringCount = documents.filter((document) => {
    const { days } = expiryDetails(document.expiryDate)
    return days !== null && days <= 60
  }).length

  const summaryItems = [
    { id: 1, number: documents.length, label: 'Documents', detail: 'Saved records', icon: 'file', tone: 'blue' },
    { id: 2, number: expiringCount, label: 'Need attention', detail: 'Within 60 days', icon: 'clock', tone: 'amber' },
    { id: 3, number: new Set(documents.map((document) => document.category)).size, label: 'Categories', detail: 'Organised clearly', icon: 'shield', tone: 'violet' },
  ]

  async function addDocument(event) {
    event.preventDefault()
    const { document } = await api('/api/documents', { method: 'POST', body: JSON.stringify(form) })
    setDocuments((current) => [...current, document])
    setForm(emptyForm)
  }

  async function deleteDocument(id) {
    await api(`/api/documents/${id}`, { method: 'DELETE' })
    setDocuments((current) => current.filter((document) => document.id !== id))
  }

  function updateForm(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  async function saveDocumentEdit(event) {
    event.preventDefault()
    setSavingEdit(true)
    setEditError('')
    try {
      const { document } = await api(`/api/documents/${editingDocument.id}`, { method: 'PATCH', body: JSON.stringify(editingDocument) })
      setDocuments((current) => current.map((item) => item.id === document.id ? document : item))
      setEditingDocument(null)
    } catch (error) { setEditError(error.message) }
    finally { setSavingEdit(false) }
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="dashboard documents-page">
        <Header firstName={user.firstName} title="Documents" onAddItem={() => nameRef.current?.focus()} />
        <section className="documents-workspace">
          <div className="summary-grid documents-summary">
            {summaryItems.map((item) => <SummaryCard key={item.id} {...item} />)}
          </div>

          <form className="document-creator panel" onSubmit={addDocument}>
            <div><p className="eyebrow">New record</p><h2>Add a document reminder</h2><p>Track important details and know before something expires.</p></div>
            <div className="document-creator__fields">
              <label className="document-name-field">Document name<input name="name" onChange={updateForm} placeholder="e.g. Passport" ref={nameRef} required value={form.name} /></label>
              <label>Category<select name="category" onChange={updateForm} value={form.category}>{categories.slice(1).map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>Issuer<input name="issuer" onChange={updateForm} placeholder="Optional" value={form.issuer} /></label>
              <label>Expiry date<input name="expiryDate" onChange={updateForm} type="date" value={form.expiryDate} /></label>
              <button className="primary-button" type="submit"><Icon name="plus" size={18} /> Add document</button>
            </div>
          </form>

          <section className="documents-library panel" aria-labelledby="document-library-title">
            <div className="document-library__header">
              <div><p className="eyebrow">Your records</p><h2 id="document-library-title">Document library</h2></div>
              <label className="document-search"><Icon name="search" size={17} /><input aria-label="Search documents" onChange={(event) => setSearch(event.target.value)} placeholder="Search documents" value={search} /></label>
            </div>
            <div className="category-filters" aria-label="Filter documents by category">
              {categories.map((item) => <button className={category === item ? 'active' : ''} key={item} onClick={() => setCategory(item)} type="button">{item}</button>)}
            </div>
            <div className="document-list">
              {visibleDocuments.map((document) => {
                const expiry = expiryDetails(document.expiryDate)
                return (
                  <article className="document-row" key={document.id}>
                    <span className={`document-icon document-icon--${document.category.toLowerCase()}`}><Icon name="file" size={20} /></span>
                    <div className="document-row__main"><h3>{document.name}</h3><p>{document.issuer || 'No issuer'} · {document.category}</p></div>
                    <span className={`expiry-badge expiry-badge--${expiry.state}`}>{expiry.label}</span>
                    <div className="row-actions"><button aria-label={`Edit ${document.name}`} className="edit-button" onClick={() => { setEditError(''); setEditingDocument({ ...document }) }} type="button"><Icon name="edit" size={15} /></button><ConfirmDeleteButton className="delete-button" label={document.name} onConfirm={() => deleteDocument(document.id)} /></div>
                  </article>
                )
              })}
              {!visibleDocuments.length && <div className="empty-state"><span><Icon name="file" size={25} /></span><h3>{documents.length ? 'No matching documents' : 'Your library is ready'}</h3><p>{documents.length ? 'Try another search or category.' : 'Add your first document reminder above.'}</p></div>}
            </div>
          </section>

          <aside className="privacy-note"><Icon name="shield" size={20} /><div><strong>Private by design</strong><p>This phase stores reminder details only—not copies of your documents.</p></div></aside>
        </section>
        <EditDialog error={editError} onClose={() => setEditingDocument(null)} onSubmit={saveDocumentEdit} open={Boolean(editingDocument)} saving={savingEdit} title="Document reminder">
          {editingDocument && <>
            <label className="edit-field--full">Document name<input maxLength={120} onChange={(event) => setEditingDocument({ ...editingDocument, name: event.target.value })} required value={editingDocument.name} /></label>
            <label>Category<select onChange={(event) => setEditingDocument({ ...editingDocument, category: event.target.value })} value={editingDocument.category}>{categories.slice(1).map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Expiry date<input onChange={(event) => setEditingDocument({ ...editingDocument, expiryDate: event.target.value })} type="date" value={editingDocument.expiryDate || ''} /></label>
            <label className="edit-field--full">Issuer<input maxLength={150} onChange={(event) => setEditingDocument({ ...editingDocument, issuer: event.target.value })} placeholder="Optional" value={editingDocument.issuer || ''} /></label>
            <label className="edit-field--full">Notes<textarea maxLength={500} onChange={(event) => setEditingDocument({ ...editingDocument, notes: event.target.value })} placeholder="Reference numbers or renewal details" rows={3} value={editingDocument.notes || ''} /></label>
          </>}
        </EditDialog>
      </main>
    </div>
  )
}

export default DocumentsPage
