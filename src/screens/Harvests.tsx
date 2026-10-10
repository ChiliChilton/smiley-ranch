import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button, Spinner } from '../components/Button'
import { Card } from '../components/Card'
import { Note } from '../components/Note'
import { PhotoStrip } from '../components/Photos'
import { Screen } from '../components/Screen'
import { Sheet } from '../components/Sheet'
import type { HarvestRow, PhotoRow, PinRow } from '../lib/database.types'
import { fmtDate, todayISO } from '../lib/dates'
import { friendlyError } from '../lib/errors'
import { useMembers } from '../lib/members'
import { fmtCoords, loadPins } from '../lib/pins'
import { loadPhotosFor, removePhoto } from '../lib/photos'
import { useRealtime } from '../lib/realtime'
import { useMe } from '../lib/session'
import { seasonLabel, seasonOf, SEXES } from '../lib/species'
import { supabase } from '../lib/supabase'

export function Harvests() {
  const navigate = useNavigate()
  const me = useMe()
  const { nameOf } = useMembers()
  const [rows, setRows] = useState<HarvestRow[] | null>(null)
  const [photos, setPhotos] = useState<Map<string, PhotoRow[]>>(new Map())
  const [pins, setPins] = useState<PinRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [season, setSeason] = useState(seasonOf(todayISO()))
  const [open, setOpen] = useState<HarvestRow | null>(null)

  const reload = useCallback(async () => {
    try {
      const [{ data, error }, allPins] = await Promise.all([
        supabase.from('harvests').select('*').is('deleted_at', null).order('harvested_on', { ascending: false }).limit(500),
        loadPins(),
      ])
      if (error) throw error
      setRows(data ?? [])
      setPins(allPins)
      setPhotos(await loadPhotosFor('harvest', (data ?? []).map((r) => r.id)))
    } catch (err) {
      setError(friendlyError(err))
    }
  }, [])
  useEffect(() => { void reload() }, [reload])
  useRealtime(['harvests', 'photos'], reload)

  const seasons = useMemo(() => {
    const set = new Set((rows ?? []).map((r) => seasonOf(r.harvested_on)))
    set.add(seasonOf(todayISO()))
    return Array.from(set).sort((a, b) => b - a)
  }, [rows])
  const inSeason = useMemo(() => (rows ?? []).filter((r) => seasonOf(r.harvested_on) === season), [rows, season])

  const totals = useMemo(() => {
    const byPerson = new Map<string, Map<string, number>>()
    const bySpecies = new Map<string, number>()
    for (const r of inSeason) {
      const p = byPerson.get(r.member_id) ?? new Map<string, number>()
      p.set(r.species, (p.get(r.species) ?? 0) + 1)
      byPerson.set(r.member_id, p)
      bySpecies.set(r.species, (bySpecies.get(r.species) ?? 0) + 1)
    }
    return { byPerson, bySpecies }
  }, [inSeason])

  const pinName = (id: string | null) => pins.find((p) => p.id === id)?.name
  const sexLabel = (s: string | null) => SEXES.find((x) => x.value === s)?.label

  async function remove(row: HarvestRow) {
    const { error } = await supabase.from('harvests').update({ deleted_at: new Date().toISOString() }).eq('id', row.id)
    if (error) return setError(friendlyError(error))
    setOpen(null)
    await reload()
  }

  return (
    <Screen
      title="Harvests"
      back="/more"
      right={
        <button type="button" onClick={() => navigate('/harvests/new')} className="tap flex items-center gap-1 rounded-lg px-3 font-semibold active:bg-clay-800">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
          Add
        </button>
      }
    >
      {error && <Note kind="error" className="mb-3">{error}</Note>}

      <div className="mb-3 flex flex-wrap gap-2">
        {seasons.map((s) => (
          <button key={s} type="button" onClick={() => setSeason(s)} aria-pressed={season === s} className={`tap rounded-full px-4 py-1.5 text-sm font-bold ring-1 ${season === s ? 'bg-clay-900 text-cream ring-clay-900' : 'bg-white text-clay-950 ring-tan-500'}`}>
            {seasonLabel(s)}
          </button>
        ))}
      </div>

      {!rows ? (
        <div className="flex justify-center py-8 text-clay-900"><Spinner /></div>
      ) : (
        <>
          <Card title={`${seasonLabel(season)} season`} className="mb-4">
            {inSeason.length === 0 ? (
              <p className="text-sm text-ink-muted">Nothing taken yet this season.</p>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {Array.from(totals.bySpecies.entries()).sort((a, b) => b[1] - a[1]).map(([sp, n]) => (
                    <span key={sp} className="rounded-md bg-clay-100 px-2 py-0.5 text-sm font-bold text-clay-900">{n} {sp}</span>
                  ))}
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {Array.from(totals.byPerson.entries())
                      .sort((a, b) => sum(b[1]) - sum(a[1]))
                      .map(([mid, m]) => (
                        <tr key={mid} className="border-t border-tan-200">
                          <td className="py-1.5 font-semibold text-clay-950">{nameOf(mid)}</td>
                          <td className="py-1.5 text-right text-ink">{Array.from(m.entries()).map(([sp, n]) => `${n} ${sp}`).join(', ')}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {inSeason.length === 0 ? (
            <div><Button variant="secondary" onClick={() => navigate('/harvests/new')}>Post a harvest</Button></div>
          ) : (
            <ul className="space-y-2">
              {inSeason.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setOpen(r)} className="tap w-full rounded-2xl bg-white p-4 text-left ring-1 ring-tan-200 active:bg-tan-100">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-clay-950">{nameOf(r.member_id)}</span>
                      <span className="text-ink">· {[sexLabel(r.sex), r.species].filter(Boolean).join(' ')}</span>
                      {r.description && <span className="truncate text-ink-muted">· {r.description}</span>}
                    </div>
                    <div className="text-sm text-ink-muted">
                      {fmtDate(r.harvested_on)} · {pinName(r.pin_id) ?? (r.lat != null ? 'GPS spot' : 'somewhere')}
                      {(photos.get(r.id)?.length ?? 0) > 0 && ` · ${photos.get(r.id)!.length} photo${photos.get(r.id)!.length > 1 ? 's' : ''}`}
                      {!r.logged_on_license && r.species === 'Deer' && <span className="text-warn"> · not logged on license</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Sheet open={open !== null} onClose={() => setOpen(null)} title={open ? `${nameOf(open.member_id)} · ${[sexLabel(open.sex), open.species].filter(Boolean).join(' ')}` : ''}>
        {open && (
          <div className="space-y-3">
            {open.description && <p className="text-lg font-bold text-clay-950">{open.description}</p>}
            <p className="text-sm text-ink">
              {fmtDate(open.harvested_on)}<br />
              {pinName(open.pin_id) ?? (open.lat != null ? fmtCoords(open.lat, open.lng!) : 'Location not given')}<br />
              {open.tag_number ? `Tag ${open.tag_number} · ` : ''}{open.logged_on_license ? 'Logged on license' : 'Not logged on license yet'}
            </p>
            {open.notes && <p className="whitespace-pre-wrap text-ink">{open.notes}</p>}
            <PhotoStrip photos={photos.get(open.id) ?? []} size="md" onRemove={(open.created_by === me.member_id || me.is_admin) ? async (p) => { await removePhoto(p); await reload() } : undefined} />
            <p className="text-xs text-ink-muted">Posted by {nameOf(open.created_by)}</p>
            {(open.created_by === me.member_id || open.member_id === me.member_id || me.is_admin) && (
              <div className="flex gap-2 pt-1">
                <Button variant="secondary" onClick={() => navigate(`/harvests/${open.id}/edit`)}>Edit</Button>
                <Button variant="ghost" onClick={() => remove(open)}>Remove</Button>
              </div>
            )}
          </div>
        )}
      </Sheet>
    </Screen>
  )
}

const sum = (m: Map<string, number>) => Array.from(m.values()).reduce((a, b) => a + b, 0)
