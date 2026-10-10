import type { InputHTMLAttributes, ReactNode } from 'react'

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  hint?: string
  error?: string | null
  right?: ReactNode
}

export function TextInput({ label, hint, error, right, id, className = '', ...rest }: Props) {
  const inputId = id ?? rest.name
  return (
    <label htmlFor={inputId} className="block">
      {label && <span className="mb-1 block text-sm font-semibold text-pine-900">{label}</span>}
      <span className="relative block">
        <input
          id={inputId}
          {...rest}
          className={`tap w-full rounded-xl border bg-white px-4 py-3 text-ink outline-none placeholder:text-ink-muted/60 focus:border-pine-700 focus:ring-2 focus:ring-pine-700/30 ${
            error ? 'border-alert' : 'border-tan-500'
          } ${right ? 'pr-12' : ''} ${className}`}
        />
        {right && <span className="absolute inset-y-0 right-2 flex items-center">{right}</span>}
      </span>
      {error ? (
        <span className="mt-1 block text-sm text-alert">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-sm text-ink-muted">{hint}</span>
      ) : null}
    </label>
  )
}
