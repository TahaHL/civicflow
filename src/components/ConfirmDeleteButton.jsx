import { useState } from 'react'
import Icon from './Icon'

function ConfirmDeleteButton({ label, onConfirm, className = '' }) {
  const [armed, setArmed] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleClick() {
    if (!armed) {
      setArmed(true)
      return
    }

    setDeleting(true)
    try {
      await onConfirm()
    } finally {
      setDeleting(false)
      setArmed(false)
    }
  }

  return (
    <button
      aria-label={armed ? `Confirm delete ${label}` : `Delete ${label}`}
      className={`confirm-delete ${armed ? 'confirm-delete--armed ' : ''}${className}`.trim()}
      disabled={deleting}
      onBlur={() => setArmed(false)}
      onClick={handleClick}
      type="button"
    >
      {armed ? (deleting ? 'Deleting…' : 'Delete?') : <Icon name="trash" size={16} />}
    </button>
  )
}

export default ConfirmDeleteButton
