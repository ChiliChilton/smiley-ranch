import { useEffect, type ReactNode } from 'react'

/** Bottom sheet. Tap the scrim or the Close button to dismiss. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/40" />
      <div
        className="relative w-full max-w-lg rounded-t-3xl bg-cream px-5 pt-3 shadow-2xl"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 20px)' }}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-tan-500" />
        <div className="mb-3 flex items-center justify-between">
          {title && <h2 className="text-lg font-bold text-clay-950">{title}</h2>}
          <button type="button" onClick={onClose} className="tap -mr-2 px-3 text-base font-semibold text-clay-800">
            Close
          </button>
        </div>
        <div className="max-h-[70dvh] overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
