import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button, Spinner } from '../components/Button'
import { Card } from '../components/Card'
import { TextInput } from '../components/Input'
import { Note } from '../components/Note'
import { Screen } from '../components/Screen'
import { Sheet } from '../components/Sheet'
import type { FeederFillRow, PinRow } from '../lib/database.types'
import { fmtDateTime } from '../lib/dates'
import { friendlyError } from '../lib/errors'
import { feederStatus, lastFeedType, loadFeeders, recordFill, rememberFeedType, STATUS_STYLE, updateFill } from '../lib/feeders'
import { useMembers } from '../lib/members'
import { useRealtime } from '../lib/realtime'
import { useMe } from '../lib/session'
import { supabase } from '../lib/supabase'

export function Feeders() {
  const me = useMe()
  const navigate = useNavigate()
  const [data, setData] = useState<{ feeders: PinRow[]; lastFill: Map<string, FeederFillRow> } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [justFilled, setJustFilled] = useState<{ feeder: PinRow; fill: FeederFillRow } | null>(null)
  const [history, setHistory] = useState<PinRow | null>(null)

  const reload = useCallback(async () => {
    try {
      setData(await loadFeeders())
    } catch (err) {
      setError(friendlyError(err))
    }
  }, [])
  useEffect(() => { void reload() }, [reload])
  useRealtime(['feeder_fills', 'pins'], reload)

  async function filled(feeder: PinRow) {
    setError(null)
    try {
      const fill = await recordFill(feeder.id, { feed_type: lastFeedType() || null })
      setJustFilled({ feeder, fill })
      await reload()
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <Screen title="Feeders" back="/more">
      {error && <Note kind="error" className="mb-3">{error}</Note>}
      {!data ? (
        <div className="flex justify-center py-8 text-clay-900"><Spinner /></div>
      ) : data.feeders.length === 0 ? (
        <Note>
          No feeders on the map yet. {me.is_admin ? <button type="button" className="font-semibold underline" onClick={() => navigate('/map')}>Add them on the map.</button> : 'Ask the admin to add them.'}
        </Note>
      ) : (
        <ul className="space-y-3">
          {data.feeders.map((f) => (
            <li key={f.id}>
              <FeederCard feeder={f} fill={data.lastFill.get(f.id)} onFilled={() => filled(f)} onHistory={() => setHistory(f)} />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-ink-muted">Green is fine, yellow is due, red is overdue. The admin sets how many days between fills on each feeder's pin.</p>

      <FillDetailsSheet entry={justFilled} onClose={() => setJustFilled(null)} onSaved={async () => { setJustFilled(null); await reload() }} />
      <HistorySheet feeder={history} onClose={() => setHistory(null)} />
    </Screen>
  )
}

export function FeederCard({ feeder, fill, onFilled, onHistory, compact }: { feeder: PinRow; fill: FeederFillRow | undefined; onFilled: () => void; onHistory?: () => void; compact?: boolean }) {
  const { nameOf } = useMembers()
  const { status, days } = feederStatus(feeder, fill)
  const st = STATUS_STYLE[status]
  const [busy, setBusy] = useState(false)
  return (
    <Card className={compact ? '!p-3' : ''}>
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full ${st.dot}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-clay-950">{feeder.name}</span>
            <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${st.chip}`}>{st.label}{days != null && status !== 'fresh' ? ` · ${days} days` : ''}</span>
          </div>
          {fill ? (
            <p className="text-sm text-ink">
              Filled {fmtDateTime(fill.filled_at)} by {nameOf(fill.created_by)}
              {fill.amount || fill.feed_type ? <span className="text-ink-muted"> · {[fill.amount, fill.feed_type].filter(Boolean).join(' ')}</span> : null}
            </p>
          ) : (
            <p className="text-sm text-ink-muted">No fills recorded yet.</p>
          )}
          {feeder.fill_interval_days && <p className="text-xs text-ink-muted">Every {feeder.fill_interval_days} days{days != null && status === 'fresh' ? ` · ${days} days ago` : ''}</p>}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button busy={busy} onClick={async () => { setBusy(true); try { await onFilled() } finally { setBusy(false) } }}>Filled it</Button>
        {onHistory && <Button variant="ghost" onClick={onHistory}>History</Button>}
      </div>
    </Card>
  )
}

/** After the one-tap fill: optional amount and feed type. */
export function FillDetailsSheet({ entry, onClose, onSaved }: { entry: { feeder: PinRow; fill: FeederFillRow } | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [amount, setAmount] = useState('')
  const [feed, setFeed] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setAmount(entry?.fill.amount ?? ''); setFeed(entry?.fill.feed_type ?? lastFeedType()) }, [entry])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!entry) return
    setBusy(true)
    rememberFeedType(feed.trim() || null)
    await updateFill(entry.fill.id, { amount: amount.trim() || null, feed_type: feed.trim() || null })
    setBusy(false)
    await onSaved()
  }

  return (
    <Sheet open={entry !== null} onClose={onClose} title={entry ? `Filled ${entry.feeder.name}` : ''}>
      {entry && (
        <form onSubmit={save} className="space-y-3">
          <Note kind="ok">Got it. {fmtDateTime(entry.fill.filled_at)}.{(entry.fill as { queued?: boolean }).queued ? ' No signal right now, it will sync later.' : ''}</Note>
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="How much (optional)" name="amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="200 lb, 2 bags…" />
            <TextInput label="Feed (optional)" name="feed" value={feed} onChange={(e) => setFeed(e.target.value)} placeholder="corn, protein…" list="feedTypes" />
          </div>
          <datalist id="feedTypes"><option value="corn" /><option value="protein" /><option value="mix" /></datalist>
          <div className="flex gap-2">
            <Button type="submit" busy={busy}>Save</Button>
            <Button variant="ghost" onClick={onClose}>Skip</Button>
          </div>
        </form>
      )}
    </Sheet>
  )
}

function HistorySheet({ feeder, onClose }: { feeder: PinRow | null; onClose: () => void }) {
  const { nameOf } = useMembers()
  const [fills, setFills] = useState<FeederFillRow[] | null>(null)
  useEffect(() => {
    setFills(null)
    if (!feeder) return
    supabase.from('feeder_fills').select('*').eq('feeder_id', feeder.id).is('deleted_at', null).order('filled_at', { ascending: false }).limit(30)
      .then(({ data }) => setFills(data ?? []))
  }, [feeder])
  return (
    <Sheet open={feeder !== null} onClose={onClose} title={feeder ? `${feeder.name} fills` : ''}>
      {!fills ? <div className="flex justify-center py-6 text-clay-900"><Spinner /></div> : fills.length === 0 ? <p className="text-sm text-ink-muted">No fills yet.</p> : (
        <ul className="divide-y divide-tan-200">
          {fills.map((f) => (
            <li key={f.id} className="py-2 text-sm text-ink">
              {fmtDateTime(f.filled_at)} · {nameOf(f.created_by)}
              {f.amount || f.feed_type ? <span className="text-ink-muted"> · {[f.amount, f.feed_type].filter(Boolean).join(' ')}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}
