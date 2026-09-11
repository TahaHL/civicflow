import { useEffect, useEffectEvent } from 'react'

// Keep mounted pages current when another tab changes a record or the user returns.
export function useDataRefresh(load) {
  const refresh = useEffectEvent(load)
  useEffect(() => {
    refresh()
    const onFocus = () => refresh()
    const onStorage = (event) => {
      if (event.key === 'civicflow:data-updated') refresh()
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('storage', onStorage)
    }
  }, [])
}
