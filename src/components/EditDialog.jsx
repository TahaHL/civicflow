import { useEffect, useEffectEvent, useRef } from 'react'
import Icon from './Icon'

function EditDialog({ children, error, onClose, onSubmit, open, saving = false, title }) {
  const dialogRef = useRef(null)
  const handleKeyDown = useEffectEvent((event) => {
    if (event.key === 'Escape' && !saving) { event.stopImmediatePropagation(); onClose() }
    if (event.key !== 'Tab') return
    const controls = [...dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')]
      .filter((element) => element.getClientRects().length)
    const first = controls[0]
    const last = controls.at(-1)
    if (!first) { event.preventDefault(); return }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  })

  useEffect(() => {
    if (!open) return undefined
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    const onKeyDown = (event) => handleKeyDown(event)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown, true)
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="edit-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
      <section aria-labelledby="edit-dialog-title" aria-modal="true" className="edit-dialog" ref={dialogRef} role="dialog" tabIndex={-1}>
        <header className="edit-dialog__header">
          <div><p className="eyebrow">Edit details</p><h2 id="edit-dialog-title">{title}</h2></div>
          <button aria-label="Close edit dialog" disabled={saving} onClick={onClose} type="button"><Icon name="close" size={18} /></button>
        </header>
        <form onSubmit={onSubmit}>
          <div className="edit-dialog__fields">{children}</div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <footer className="edit-dialog__footer">
            <button className="secondary-button" disabled={saving} onClick={onClose} type="button">Cancel</button>
            <button className="primary-button" disabled={saving} type="submit">{saving ? 'Saving…' : 'Save changes'}</button>
          </footer>
        </form>
      </section>
    </div>
  )
}

export default EditDialog
