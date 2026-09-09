import Icon from './Icon'

function Header({ firstName, onAddItem, title, subtitle = 'Here’s what needs your attention today.' }) {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const currentDate = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date())

  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{currentDate}</p>
        <h1>{title || `${greeting}, ${firstName}`}</h1>
        <p className="page-header__subtitle">{subtitle}</p>
      </div>
      {onAddItem && (
        <button className="primary-button" type="button" onClick={onAddItem}>
          <Icon name="plus" size={18} />
          Add an item
        </button>
      )}
    </header>
  )
}

export default Header
