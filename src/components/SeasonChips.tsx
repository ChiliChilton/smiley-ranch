import type { SeasonRow } from '../lib/database.types'
import { fmtDate, fmtRange, todayISO } from '../lib/dates'
import { SPECIES, endsText, seasonLabel, seasonStatus } from '../lib/seasons'

export function SeasonChip({ season, suffix }: { season: SeasonRow; suffix?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-xs font-semibold text-ink ring-1 ring-tan-300">
      <span className={`inline-block h-2 w-2 rounded-full ${SPECIES[season.species].bar}`} />
      {seasonLabel(season)}
      {suffix && <span className="font-normal text-ink-muted">{suffix}</span>}
    </span>
  )
}

/** "Open now" and "Next" in two short rows. Compact mode is one line for the Home board. */
export function SeasonSummary({ seasons, compact = false }: { seasons: SeasonRow[]; compact?: boolean }) {
  const today = todayISO()
  const { open, next, inDays } = seasonStatus(seasons, today)
  if (!open.length && !next.length) return null
  if (compact) {
    const openText = open.map((s) => `${seasonLabel(s)} (${endsText(s, today)})`).join(', ')
    const nextText = next.length ? `${next.map(seasonLabel).join(', ')} ${inDays === 1 ? 'tomorrow' : `in ${inDays} days`}` : ''
    return (
      <p className="text-sm text-ink-muted">
        {open.length > 0 && <><span className="font-semibold text-ink">In season:</span> {openText}</>}
        {open.length > 0 && next.length > 0 && ' · '}
        {next.length > 0 && <><span className="font-semibold text-ink">Next:</span> {nextText}</>}
      </p>
    )
  }
  return (
    <div className="space-y-2">
      <div>
        <div className="mb-1 text-xs font-bold uppercase tracking-wide text-clay-800">Open now</div>
        {open.length === 0 ? <p className="text-sm text-ink-muted">Nothing open today.</p> : (
          <div className="flex flex-wrap gap-1.5">{open.map((s) => <SeasonChip key={s.id} season={s} suffix={endsText(s, today)} />)}</div>
        )}
      </div>
      {next.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-clay-800">
            Next · {fmtDate(next[0].starts_on)} · {inDays === 1 ? 'tomorrow' : `in ${inDays} days`}
          </div>
          <div className="flex flex-wrap gap-1.5">{next.map((s) => <SeasonChip key={s.id} season={s} suffix={fmtRange(s.starts_on, s.ends_on)} />)}</div>
        </div>
      )}
    </div>
  )
}
