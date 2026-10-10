import type { ReactNode } from 'react'

type Kind = 'info' | 'error' | 'warn' | 'ok'

const styles: Record<Kind, string> = {
  info: 'bg-pine-100 text-pine-950',
  error: 'bg-alert/10 text-alert',
  warn: 'bg-warn/15 text-tan-700',
  ok: 'bg-ok/10 text-ok',
}

export function Note({ kind = 'info', children, className = '' }: { kind?: Kind; children: ReactNode; className?: string }) {
  return (
    <div role={kind === 'error' ? 'alert' : undefined} className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${styles[kind]} ${className}`}>
      {children}
    </div>
  )
}
