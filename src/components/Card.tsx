import type { ReactNode } from 'react'

export function Card({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-tan-300 bg-white p-3 ${className}`}>
      {title && <h2 className="mb-2 text-xs font-extrabold uppercase tracking-[0.12em] text-clay-900">{title}</h2>}
      {children}
    </section>
  )
}

/** A tappable row inside a list card. */
export function Row({
  onClick,
  children,
  right,
  disabled,
}: {
  onClick?: () => void
  children: ReactNode
  right?: ReactNode
  disabled?: boolean
}) {
  const inner = (
    <>
      <span className="min-w-0 flex-1 text-left">{children}</span>
      {right !== undefined ? <span className="shrink-0 text-ink-muted">{right}</span> : onClick ? <Chevron /> : null}
    </>
  )
  const cls = 'tap flex w-full items-center gap-3 px-1 py-3 text-base'
  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={`${cls} active:bg-tan-100 disabled:opacity-50`}>
        {inner}
      </button>
    )
  }
  return <div className={cls}>{inner}</div>
}

export function Chevron() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden className="shrink-0 text-tan-600">
      <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Divider() {
  return <hr className="border-tan-200" />
}
