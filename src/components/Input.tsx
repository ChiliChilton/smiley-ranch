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
    <label htmlFor={inputId} className="block min-w-0">
      {label && <span className="mb-1 block text-sm font-semibold text-clay-900">{label}</span>}
      <span className="relative block">
        <input
          id={inputId}
          {...rest}
          className={`tap w-full rounded-md border bg-white px-3 py-2.5 text-ink outline-none placeholder:text-ink-muted/60 focus:border-clay-700 focus:ring-2 focus:ring-clay-700/30 ${
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

type AreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string }

export function TextArea({ label, hint, id, className = '', ...rest }: AreaProps) {
  const inputId = id ?? rest.name
  return (
    <label htmlFor={inputId} className="block">
      {label && <span className="mb-1 block text-sm font-semibold text-clay-900">{label}</span>}
      <textarea
        id={inputId}
        rows={3}
        {...rest}
        className={`w-full rounded-md border border-tan-500 bg-white px-3 py-2.5 text-ink outline-none placeholder:text-ink-muted/60 focus:border-clay-700 focus:ring-2 focus:ring-clay-700/30 ${className}`}
      />
      {hint && <span className="mt-1 block text-sm text-ink-muted">{hint}</span>}
    </label>
  )
}
