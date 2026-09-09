import Icon from './Icon'
import { Link } from 'react-router-dom'

function SummaryCard({ number, label, detail, action, icon, tone, to }) {
  const content = (
    <>
      <div className="summary-card__topline">
        <span className="summary-card__icon"><Icon name={icon} size={20} /></span>
        <span className="summary-card__detail">{detail}</span>
      </div>
      <p className="summary-card__number">{number}</p>
      <p className="summary-card__label">{label}</p>
      {action && <span className="summary-card__action">{action}<Icon name="arrow" size={14} /></span>}
    </>
  )
  if (to) return <Link aria-label={`${action || `View ${label}`} — ${label}`} className={`summary-card summary-card--${tone}`} to={to}>{content}</Link>
  return <article className={`summary-card summary-card--${tone}`}>{content}</article>
}

export default SummaryCard
