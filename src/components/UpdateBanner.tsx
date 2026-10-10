import { useEffect, useState } from 'react'

/** Shows when a new build is installed and waiting. main.tsx dispatches the event. */
export function UpdateBanner() {
  const [update, setUpdate] = useState<(() => Promise<void>) | null>(null)
  useEffect(() => {
    const on = (e: Event) => setUpdate(() => (e as CustomEvent<() => Promise<void>>).detail)
    window.addEventListener('back40:update', on)
    return () => window.removeEventListener('back40:update', on)
  }, [])
  if (!update) return null
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-sage-900 px-4 py-2 text-sm text-cream" style={{ paddingTop: 'calc(var(--safe-top) + 8px)' }}>
      <span>A new version is ready.</span>
      <button type="button" onClick={() => void update()} className="tap rounded-lg bg-cream px-3 py-1.5 font-semibold text-sage-900">Reload</button>
    </div>
  )
}
