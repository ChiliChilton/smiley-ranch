import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const styles: Record<Variant, string> = {
  primary: 'bg-clay-900 text-cream active:bg-clay-800 disabled:bg-clay-900/40',
  secondary: 'bg-tan-200 text-clay-950 active:bg-tan-300 disabled:opacity-50',
  danger: 'bg-alert text-white active:opacity-90 disabled:opacity-50',
  ghost: 'bg-transparent text-clay-800 underline-offset-4 active:bg-tan-100 disabled:opacity-50',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  busy?: boolean
  full?: boolean
  children: ReactNode
}

export function Button({ variant = 'primary', busy, full, className = '', children, disabled, ...rest }: Props) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      className={`tap inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-[15px] font-semibold transition-colors ${styles[variant]} ${full ? 'w-full' : ''} ${className}`}
    >
      {busy && <Spinner small />}
      {children}
    </button>
  )
}

export function Spinner({ small }: { small?: boolean }) {
  const size = small ? 'h-4 w-4 border-2' : 'h-8 w-8 border-4'
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block ${size} animate-spin rounded-full border-current border-r-transparent`}
    />
  )
}
