import type { ReactNode } from 'react'

/** A board section: uppercase label with a count, an optional action on the right, a hairline, then the content. No box. */
export function Section({ title, count, action, children }: { title: string; count?: number | string; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="flex items-end justify-between border-b-2 border-clay-900/80 pb-1">
        <h2 className="text-xs font-extrabold uppercase tracking-[0.12em] text-clay-900">
          {title}
          {count !== undefined && <span className="ml-2 rounded bg-clay-900 px-1.5 py-0.5 text-[10px] font-bold text-cream">{count}</span>}
        </h2>
        {action}
      </div>
      <div className="pt-2">{children}</div>
    </section>
  )
}

export function SectionLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="tap -mb-1 px-1 text-xs font-bold text-clay-800 underline-offset-2 hover:underline">
      {children}
    </button>
  )
}
