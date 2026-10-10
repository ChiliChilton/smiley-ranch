import { useState } from 'react'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Note } from '../../components/Note'
import { Screen } from '../../components/Screen'
import { DEMO } from '../../lib/demo'
import { friendlyError } from '../../lib/errors'
import { deliverFile, EXPORT_TABLES, fetchAll, fetchTable, stamp, toCSV, toKML, type ExportTable } from '../../lib/export'

/** Admin: get everything out, in formats other tools read. Nothing is locked in. */
export function Export() {
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [table, setTable] = useState<ExportTable>('harvests')

  async function run(label: string, fn: () => Promise<'shared' | 'downloaded'>) {
    setBusy(label); setError(null); setMsg(null)
    try {
      const how = await fn()
      setMsg(how === 'shared' ? 'Sent to the share sheet.' : 'Downloaded. Check your Files app or Downloads.')
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(null)
    }
  }

  const json = () => run('json', async () => deliverFile(`back40-${stamp()}.json`, JSON.stringify({ exported_at: new Date().toISOString(), ...(await fetchAll()) }, null, 2), 'application/json'))
  const csv = () => run('csv', async () => deliverFile(`back40-${table}-${stamp()}.csv`, toCSV(await fetchTable(table)), 'text/csv'))
  const kml = () => run('kml', async () => { const [pins, areas] = await Promise.all([fetchTable('pins'), fetchTable('areas')]); return deliverFile(`back40-map-${stamp()}.kml`, toKML(pins, areas), 'application/vnd.google-earth.kml+xml') })

  return (
    <Screen title="Export" back="/more">
      {DEMO && <Note className="mb-3">Demo: the files are built, but this page can't save or share them. In the real app they go to your Files app or the share sheet.</Note>}
      {error && <Note kind="error" className="mb-3">{error}</Note>}
      {msg && <Note kind="ok" className="mb-3">{msg}</Note>}
      <div className="space-y-4">
        <Card title="Everything">
          <p className="mb-3 text-sm text-ink-muted">One JSON file with every table, including removed entries. This is the full backup.</p>
          <Button busy={busy === 'json'} onClick={json}>Export everything (JSON)</Button>
        </Card>
        <Card title="One table as a spreadsheet">
          <div className="mb-3 flex gap-2">
            <select value={table} onChange={(e) => setTable(e.target.value as ExportTable)} className="tap min-w-0 flex-1 rounded-xl border border-tan-500 bg-white px-3 py-3">
              {EXPORT_TABLES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <Button busy={busy === 'csv'} onClick={csv}>Export CSV</Button>
        </Card>
        <Card title="The map">
          <p className="mb-3 text-sm text-ink-muted">Boundary, areas, and every pin as a KML file. Opens in Google Earth, onX, Gaia, and most GPS apps.</p>
          <Button busy={busy === 'kml'} onClick={kml}>Export map (KML)</Button>
        </Card>
      </div>
    </Screen>
  )
}
