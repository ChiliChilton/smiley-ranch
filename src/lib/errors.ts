/** Turn a Supabase / fetch error into a short sentence a person can act on. */
export function friendlyError(err: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (!err) return fallback
  const e = err as { message?: string; code?: string; name?: string }
  const msg = e.message ?? ''
  if (e.name === 'AuthRetryableFetchError' || /Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    return "Can't reach the server. Check your signal and try again."
  }
  if (/anonymous sign-ins are disabled/i.test(msg)) {
    return 'Anonymous sign-ins are turned off in Supabase. The admin needs to enable them.'
  }
  // Messages we raise ourselves in SQL are already plain language.
  if (msg && /^[A-Z]/.test(msg) && msg.length < 120 && !/^(JSON|TypeError|Invalid)/.test(msg)) {
    return msg
  }
  return fallback
}
