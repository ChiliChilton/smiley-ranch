import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

const CLOSE_DISTANCE = 80 // px pulled down before letting go closes it
const CLOSE_SPEED = 0.35 // px per ms: a quick flick closes it too
const SLIDE_MS = 180

/**
 * Bottom sheet. Dismiss it by tapping the scrim or Close, pressing Escape,
 * or dragging it down. A drag that starts inside the scrolling content only
 * counts when that content is already scrolled to the top.
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y0: number; t0: number; active: boolean; pointerId?: number } | null>(null)
  const dyRef = useRef(0)
  const [dy, setDyState] = useState(0)
  const [animated, setAnimated] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const closeTimer = useRef<number | null>(null)

  const setDy = useCallback((v: number) => { dyRef.current = v; setDyState(v) }, [])

  // Reset between openings.
  useEffect(() => {
    if (open) return
    setDy(0); setAnimated(false); setLeaving(false)
    if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null }
  }, [open, setDy])

  const dismiss = useCallback(() => {
    if (leaving) return
    setLeaving(true); setAnimated(true)
    setDy(panel.current?.offsetHeight ?? 600)
    closeTimer.current = window.setTimeout(() => { closeTimer.current = null; onClose() }, SLIDE_MS)
  }, [leaving, onClose, setDy])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismiss()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, dismiss])

  const finish = useCallback(() => {
    const d = drag.current
    drag.current = null
    if (!d || !d.active) return
    const pulled = dyRef.current
    const speed = pulled / Math.max(1, Date.now() - d.t0)
    if (pulled > CLOSE_DISTANCE || (pulled > 24 && speed > CLOSE_SPEED)) dismiss()
    else { setAnimated(true); setDy(0) }
  }, [dismiss, setDy])

  // Touch: works anywhere on the sheet. Native listeners so we can preventDefault the scroll.
  useEffect(() => {
    const el = panel.current
    if (!open || !el) return
    const start = (e: TouchEvent) => {
      if (leaving || e.touches.length !== 1) return
      const inScroller = scroller.current?.contains(e.target as Node) ?? false
      const atTop = (scroller.current?.scrollTop ?? 0) <= 0
      drag.current = { y0: e.touches[0].clientY, t0: Date.now(), active: !inScroller || atTop }
      setAnimated(false)
    }
    const move = (e: TouchEvent) => {
      const d = drag.current
      if (!d || !d.active) return
      const delta = e.touches[0].clientY - d.y0
      if (delta < 0 && dyRef.current === 0) { d.active = false; return } // they're scrolling up, leave it alone
      if (e.cancelable) e.preventDefault()
      setDy(Math.max(0, delta))
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', finish)
    el.addEventListener('touchcancel', finish)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', finish)
      el.removeEventListener('touchcancel', finish)
    }
  }, [open, leaving, finish, setDy])

  // Mouse (desktop): drag from the handle or title row.
  function onHandlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'mouse' || leaving) return
    if ((e.target as HTMLElement).closest('button')) return // let Close be a plain click
    drag.current = { y0: e.clientY, t0: Date.now(), active: true, pointerId: e.pointerId }
    setAnimated(false)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onHandlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d || !d.active || d.pointerId !== e.pointerId) return
    setDy(Math.max(0, e.clientY - d.y0))
  }
  function onHandlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== e.pointerId) return
    finish()
  }

  if (!open) return null
  const scrimOpacity = Math.max(0, 1 - dy / 400)
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="Close"
        onClick={dismiss}
        className="absolute inset-0 bg-ink/40"
        style={{ opacity: scrimOpacity, transition: animated ? `opacity ${SLIDE_MS}ms ease-out` : undefined }}
      />
      <div
        ref={panel}
        className="relative w-full max-w-lg rounded-t-3xl bg-cream px-5 pt-3 shadow-2xl"
        style={{
          paddingBottom: 'calc(var(--safe-bottom) + 20px)',
          transform: dy ? `translateY(${dy}px)` : undefined,
          transition: animated ? `transform ${SLIDE_MS}ms ease-out` : undefined,
          touchAction: 'pan-y',
        }}
      >
        <div
          className="-mx-5 cursor-grab px-5 active:cursor-grabbing"
          style={{ touchAction: 'none' }}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
        >
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-tan-500" />
          <div className="mb-3 flex items-center justify-between">
            {title && <h2 className="text-lg font-bold text-clay-950">{title}</h2>}
            <button type="button" onClick={dismiss} className="tap -mr-2 px-3 text-base font-semibold text-clay-800">
              Close
            </button>
          </div>
        </div>
        <div ref={scroller} className="max-h-[70dvh] overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
