import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import '../lib/leaflet-global'
import '@geoman-io/leaflet-geoman-free'
import L from 'leaflet'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CircleMarker, MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import { useSearchParams } from 'react-router'
import { Button, Spinner } from '../components/Button'
import { Header } from '../components/Screen'
import { Note } from '../components/Note'
import { Sheet } from '../components/Sheet'
import { TextArea, TextInput } from '../components/Input'
import type { AreaRow, PinRow, PinType, StandClaimRow, StandType } from '../lib/database.types'
import { fmtDate, todayISO } from '../lib/dates'
import { friendlyError } from '../lib/errors'
import { acres, geometryBounds, isAreaGeometry, parseShapes, type AreaGeometry, type ImportedShape } from '../lib/geo'
import { useMembers } from '../lib/members'
import { ADMIN_ONLY_TYPES, canEditPin, fmtCoords, loadPins, MEMBER_TYPES, PIN_TYPE_ORDER, PIN_TYPES, STAND_TYPES } from '../lib/pins'
import { useRealtime } from '../lib/realtime'
import { useMe } from '../lib/session'
import { emergencyFrom, useSettings } from '../lib/settings'
import { mapsLink } from '../lib/share'
import { supabase } from '../lib/supabase'
import { SIT_LABEL } from '../lib/claims'

const ESRI_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const ESRI_ATTR = '&copy; Esri, Maxar, Earthstar Geographics, GIS User Community'
const FALLBACK_CENTER: [number, number] = [29.231, -97.635]

type Mode =
  | { kind: 'view' }
  | { kind: 'place' }
  | { kind: 'move'; pin: PinRow }
  | { kind: 'draw'; what: 'boundary' | 'area' }
  | { kind: 'edit' }

/** Satellite map with pins, the property boundary, and named areas. */
export default function MapScreen() {
  const me = useMe()
  const { values: settings } = useSettings()
  const [params, setParams] = useSearchParams()
  const [pins, setPins] = useState<PinRow[] | null>(null)
  const [areas, setAreas] = useState<AreaRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>({ kind: 'view' })
  const [selectedPin, setSelectedPin] = useState<PinRow | null>(null)
  const [selectedArea, setSelectedArea] = useState<AreaRow | null>(null)
  const [pinForm, setPinForm] = useState<{ lat: number; lng: number; pin?: PinRow } | null>(null)
  const [pendingArea, setPendingArea] = useState<AreaGeometry | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [locating, setLocating] = useState(false)
  const [myPos, setMyPos] = useState<[number, number] | null>(null)
  const [busy, setBusy] = useState(false)
  const mapRef = useRef<L.Map | null>(null)
  const editedRef = useRef<Map<string, AreaGeometry>>(new Map())

  const reload = useCallback(async () => {
    try {
      const [p, { data: a, error: e2 }] = await Promise.all([
        loadPins(),
        supabase.from('areas').select('*').is('deleted_at', null).order('is_boundary', { ascending: false }).order('name'),
      ])
      if (e2) throw e2
      setPins(p)
      setAreas(a ?? [])
      setSelectedPin((cur) => (cur ? (p.find((x) => x.id === cur.id) ?? null) : null))
    } catch (err) {
      setError(friendlyError(err))
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])
  useRealtime(['pins', 'areas'], reload)

  const boundary = areas?.find((a) => a.is_boundary) ?? null
  const emergency = emergencyFrom(settings)
  const initialCenter = useMemo<[number, number]>(() => {
    if (emergency.lat && emergency.lng) return [Number(emergency.lat), Number(emergency.lng)]
    return FALLBACK_CENTER
  }, [emergency.lat, emergency.lng])
  const fitBounds = useMemo(() => {
    const geoms = (areas ?? []).map((a) => a.geometry).filter(isAreaGeometry)
    const b = geometryBounds(geoms)
    if (b) return b
    if (pins && pins.length > 1) {
      const lats = pins.map((p) => p.lat)
      const lngs = pins.map((p) => p.lng)
      return [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]] as [[number, number], [number, number]]
    }
    return null
  }, [areas, pins])

  // ?drop=1 from Home's + button: go straight to "drop pin at my location".
  useEffect(() => {
    if (params.get('drop') && pins) {
      setParams({}, { replace: true })
      void dropAtMyLocation()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, pins])

  function dropAtMyLocation() {
    if (!navigator.geolocation) return setError("This phone can't share its location.")
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const here: [number, number] = [pos.coords.latitude, pos.coords.longitude]
        setMyPos(here)
        mapRef.current?.setView(here, Math.max(mapRef.current.getZoom(), 17), { animate: false })
        setPinForm({ lat: here[0], lng: here[1] })
      },
      () => {
        setLocating(false)
        setError("Couldn't get your location. Check Location Services for Back 40.")
      },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  function locateMe() {
    if (!navigator.geolocation) return setError("This phone can't share its location.")
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const here: [number, number] = [pos.coords.latitude, pos.coords.longitude]
        setMyPos(here)
        mapRef.current?.setView(here, Math.max(mapRef.current.getZoom(), 16), { animate: false })
      },
      () => {
        setLocating(false)
        setError("Couldn't get your location. Check Location Services for Back 40.")
      },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  async function savePin(form: PinFormValues, existing?: PinRow) {
    setBusy(true)
    setError(null)
    try {
      const row = {
        name: form.name.trim(),
        type: form.type,
        notes: form.notes.trim() || null,
        stand_type: form.type === 'stand' ? form.stand_type : null,
        fill_interval_days: form.type === 'feeder' && form.fill_interval_days ? Number(form.fill_interval_days) : null,
      }
      if (existing) {
        const { error } = await supabase.from('pins').update(row).eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('pins').insert({ ...row, lat: form.lat, lng: form.lng })
        if (error) throw error
      }
      setPinForm(null)
      await reload()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  async function movePinHere() {
    if (mode.kind !== 'move' || !mapRef.current) return
    const c = mapRef.current.getCenter()
    setBusy(true)
    const { error } = await supabase.from('pins').update({ lat: c.lat, lng: c.lng }).eq('id', mode.pin.id)
    setBusy(false)
    if (error) return setError(friendlyError(error))
    setMode({ kind: 'view' })
    await reload()
  }

  async function removePin(pin: PinRow) {
    setBusy(true)
    const { error } = await supabase.from('pins').update({ deleted_at: new Date().toISOString() }).eq('id', pin.id)
    setBusy(false)
    if (error) return setError(friendlyError(error))
    setSelectedPin(null)
    await reload()
  }

  async function saveArea(geometry: AreaGeometry, name: string, isBoundary: boolean) {
    setBusy(true)
    setError(null)
    try {
      if (isBoundary && boundary) {
        const { error } = await supabase.from('areas').update({ geometry }).eq('id', boundary.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('areas').insert({ name, geometry, is_boundary: isBoundary })
        if (error) throw error
      }
      await reload()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  async function finishEdit() {
    setBusy(true)
    try {
      for (const [id, geometry] of editedRef.current) {
        const { error } = await supabase.from('areas').update({ geometry }).eq('id', id)
        if (error) throw error
      }
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      editedRef.current.clear()
      setBusy(false)
      setMode({ kind: 'view' })
      await reload()
    }
  }

  async function updateArea(area: AreaRow, patch: { name?: string; is_boundary?: boolean; deleted_at?: string }) {
    setBusy(true)
    setError(null)
    try {
      if (patch.is_boundary && boundary && boundary.id !== area.id) {
        const { error } = await supabase.from('areas').update({ is_boundary: false }).eq('id', boundary.id)
        if (error) throw error
      }
      const { error } = await supabase.from('areas').update(patch).eq('id', area.id)
      if (error) throw error
      setSelectedArea(null)
      await reload()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  async function importShapes(shapes: ImportedShape[]) {
    setBusy(true)
    setError(null)
    try {
      let first = !boundary
      for (const s of shapes) {
        const { error } = await supabase.from('areas').insert({ name: first ? 'Property' : s.name, geometry: s.geometry, is_boundary: first })
        if (error) throw error
        first = false
      }
      setImportOpen(false)
      await reload()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  const crosshair = mode.kind === 'place' || mode.kind === 'move'
  const loading = !pins || !areas

  return (
    <div className="flex h-dvh flex-col bg-cream">
      <Header
        title="Map"
        right={
          <button type="button" onClick={locateMe} aria-label="My location" className="tap flex items-center justify-center rounded-lg px-2 active:bg-clay-800">
            {locating ? <Spinner small /> : <LocateIcon />}
          </button>
        }
      />
      <div className="relative isolate flex-1" style={{ marginBottom: 'calc(var(--tab-bar-height) + var(--safe-bottom))' }}>
        <MapContainer
          center={initialCenter}
          zoom={15}
          zoomControl={false}
          attributionControl={true}
          className="absolute inset-0"
          ref={mapRef}
        >
          <TileLayer url={ESRI_URL} attribution={ESRI_ATTR} maxZoom={19} maxNativeZoom={18} />
          {fitBounds && <FitOnce bounds={fitBounds} />}
          {areas && (
            <AreasLayer
              areas={areas}
              editing={mode.kind === 'edit'}
              onEdited={(id, g) => editedRef.current.set(id, g)}
              onClick={(a) => mode.kind === 'view' && setSelectedArea(a)}
            />
          )}
          {pins?.map((p) => (
            <Marker
              key={p.id}
              position={[p.lat, p.lng]}
              icon={pinIcon(p, selectedPin?.id === p.id)}
              eventHandlers={{ click: () => mode.kind === 'view' && setSelectedPin(p) }}
            />
          ))}
          {myPos && <CircleMarker center={myPos} radius={8} pathOptions={{ color: '#fff', weight: 2, fillColor: '#2b6cb0', fillOpacity: 1 }} />}
          <DrawTool
            active={mode.kind === 'draw'}
            onCreate={(g) => {
              if (mode.kind !== 'draw') return
              if (mode.what === 'boundary') void saveArea(g, 'Property', true)
              else setPendingArea(g)
              setMode({ kind: 'view' })
            }}
          />
        </MapContainer>

        {crosshair && (
          <div className="pointer-events-none absolute inset-0 z-[1001] flex items-center justify-center" aria-hidden>
            <div className="h-10 w-10 rounded-full border-2 border-cream shadow-[0_0_0_2px_rgba(0,0,0,.5)]">
              <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-alert" />
            </div>
          </div>
        )}

        {loading && (
          <div className="absolute inset-x-0 top-3 z-[1001] flex justify-center">
            <span className="rounded-full bg-cream/90 px-3 py-1 text-sm text-clay-900"><Spinner small /> Loading…</span>
          </div>
        )}
        {error && (
          <div className="absolute inset-x-3 top-3 z-[1001]">
            <Note kind="error">{error} <button type="button" className="ml-2 font-semibold underline" onClick={() => setError(null)}>OK</button></Note>
          </div>
        )}

        {mode.kind === 'view' && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            aria-label="Add to the map"
            className="absolute bottom-8 right-4 z-[1001] flex h-16 w-16 items-center justify-center rounded-full bg-clay-900 text-cream shadow-lg active:bg-clay-800"
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}

        {mode.kind !== 'view' && (
          <div className="absolute inset-x-3 bottom-8 z-[1001] rounded-2xl bg-cream p-3 shadow-xl ring-1 ring-tan-300">
            {mode.kind === 'place' && (
              <ModeBar text="Move the map so the circle is on the spot." busy={busy} okLabel="Put pin here" onOk={() => { const c = mapRef.current?.getCenter(); if (c) setPinForm({ lat: c.lat, lng: c.lng }) }} onCancel={() => setMode({ kind: 'view' })} />
            )}
            {mode.kind === 'move' && (
              <ModeBar text={`Move the map so the circle is where ${mode.pin.name} should be.`} busy={busy} okLabel="Move it here" onOk={movePinHere} onCancel={() => setMode({ kind: 'view' })} />
            )}
            {mode.kind === 'draw' && (
              <ModeBar
                text={mode.what === 'boundary' ? 'Tap each corner of the property. Tap the first corner again to finish.' : 'Tap each corner of the area. Tap the first corner again to finish.'}
                busy={busy}
                okLabel="Finish"
                onOk={() => finishDraw(mapRef.current)}
                onCancel={() => { mapRef.current?.pm.disableDraw(); setMode({ kind: 'view' }) }}
              />
            )}
            {mode.kind === 'edit' && (
              <ModeBar text="Drag the corners. Tap a corner to remove it." busy={busy} okLabel="Save shapes" onOk={finishEdit} onCancel={() => { editedRef.current.clear(); setMode({ kind: 'view' }); void reload() }} />
            )}
          </div>
        )}
      </div>

      {/* Add menu */}
      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Add to the map">
        <ul className="space-y-2">
          <MenuItem onClick={() => { setAddOpen(false); dropAtMyLocation() }}>Drop a pin at my location</MenuItem>
          <MenuItem onClick={() => { setAddOpen(false); setMode({ kind: 'place' }) }}>Put a pin somewhere on the map</MenuItem>
          {me.is_admin && (
            <>
              <MenuItem onClick={() => { setAddOpen(false); setMode({ kind: 'draw', what: 'boundary' }) }}>
                {boundary ? 'Redraw the property boundary' : 'Draw the property boundary'}
              </MenuItem>
              <MenuItem onClick={() => { setAddOpen(false); setMode({ kind: 'draw', what: 'area' }) }}>Draw a named area (pasture, food plot…)</MenuItem>
              {areas && areas.length > 0 && <MenuItem onClick={() => { setAddOpen(false); setMode({ kind: 'edit' }) }}>Adjust the shapes</MenuItem>}
              <MenuItem onClick={() => { setAddOpen(false); setImportOpen(true) }}>Import a KML or GeoJSON file</MenuItem>
            </>
          )}
        </ul>
        {!me.is_admin && <p className="mt-3 text-sm text-ink-muted">Members can add hazard and other pins. The admin adds stands, feeders, cameras, and the boundary.</p>}
      </Sheet>

      {/* Pin details */}
      <PinSheet
        pin={selectedPin}
        onClose={() => setSelectedPin(null)}
        canEdit={selectedPin ? canEditPin(selectedPin, me.member_id, me.is_admin) : false}
        busy={busy}
        onEdit={(p) => { setSelectedPin(null); setPinForm({ lat: p.lat, lng: p.lng, pin: p }) }}
        onMove={(p) => { setSelectedPin(null); mapRef.current?.setView([p.lat, p.lng], Math.max(mapRef.current.getZoom(), 17), { animate: false }); setMode({ kind: 'move', pin: p }) }}
        onRemove={removePin}
      />

      {/* Pin add/edit form */}
      <Sheet open={pinForm !== null} onClose={() => setPinForm(null)} title={pinForm?.pin ? 'Edit pin' : 'New pin'}>
        {pinForm && (
          <PinForm
            key={pinForm.pin?.id ?? 'new'}
            lat={pinForm.lat}
            lng={pinForm.lng}
            pin={pinForm.pin}
            isAdmin={me.is_admin}
            busy={busy}
            onSave={(v) => void savePin(v, pinForm.pin)}
          />
        )}
      </Sheet>

      {/* Area details */}
      <Sheet open={selectedArea !== null} onClose={() => setSelectedArea(null)} title={selectedArea?.is_boundary ? 'Property boundary' : selectedArea?.name}>
        {selectedArea && (
          <AreaDetails
            key={selectedArea.id}
            area={selectedArea}
            isAdmin={me.is_admin}
            busy={busy}
            onUpdate={(patch) => void updateArea(selectedArea, patch)}
          />
        )}
      </Sheet>

      {/* Name a freshly drawn area */}
      <Sheet open={pendingArea !== null} onClose={() => setPendingArea(null)} title="Name this area">
        {pendingArea && (
          <NameForm
            busy={busy}
            onSave={async (name) => {
              await saveArea(pendingArea, name, false)
              setPendingArea(null)
            }}
          />
        )}
      </Sheet>

      {/* Import */}
      <Sheet open={importOpen} onClose={() => setImportOpen(false)} title="Import shapes">
        <ImportForm busy={busy} hasBoundary={Boolean(boundary)} onImport={importShapes} />
      </Sheet>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Map helpers
// ---------------------------------------------------------------------------

function pinIcon(pin: PinRow, selected: boolean) {
  const t = PIN_TYPES[pin.type]
  return L.divIcon({
    className: 'pin-icon',
    html: `<div class="pin ${selected ? 'pin-selected' : ''}" style="background:${t.color}">${t.glyph}</div><div class="pin-label">${escapeHtml(pin.name)}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  })
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
}

function FitOnce({ bounds }: { bounds: [[number, number], [number, number]] }) {
  const map = useMap()
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17, animate: false })
  }, [map, bounds])
  return null
}

function AreasLayer({
  areas,
  editing,
  onEdited,
  onClick,
}: {
  areas: AreaRow[]
  editing: boolean
  onEdited: (id: string, geometry: AreaGeometry) => void
  onClick: (a: AreaRow) => void
}) {
  const map = useMap()
  const group = useRef<L.FeatureGroup | null>(null)
  const clickRef = useRef(onClick)
  const editedRef = useRef(onEdited)
  useEffect(() => {
    clickRef.current = onClick
    editedRef.current = onEdited
  })

  useEffect(() => {
    const g = new L.FeatureGroup().addTo(map)
    group.current = g
    for (const a of areas) {
      if (!isAreaGeometry(a.geometry)) continue
      const layer = L.geoJSON(a.geometry as never, {
        style: a.is_boundary
          ? { color: '#f8f2e8', weight: 3, dashArray: '8 6', fill: false }
          : { color: a.color ?? '#dcc9aa', weight: 2, fillColor: a.color ?? '#dcc9aa', fillOpacity: 0.18 },
      })
      layer.on('click', () => clickRef.current(a))
      if (!a.is_boundary) layer.bindTooltip(a.name, { permanent: true, direction: 'center', className: 'area-label' })
      layer.eachLayer((l) => {
        l.on('pm:edit', () => {
          const geo = (l as L.Polygon).toGeoJSON().geometry
          if (isAreaGeometry(geo)) editedRef.current(a.id, geo)
        })
      })
      g.addLayer(layer)
    }
    return () => {
      g.remove()
    }
  }, [map, areas])

  useEffect(() => {
    const g = group.current
    if (!g) return
    g.eachLayer((l) => {
      const inner = l as L.GeoJSON
      inner.eachLayer((poly) => {
        const p = poly as L.Polygon & { pm?: { enable: (o?: object) => void; disable: () => void } }
        if (editing) p.pm?.enable({ allowSelfIntersection: false })
        else p.pm?.disable()
      })
    })
  }, [editing, areas])

  return null
}

function DrawTool({ active, onCreate }: { active: boolean; onCreate: (g: AreaGeometry) => void }) {
  const map = useMap()
  const cb = useRef(onCreate)
  useEffect(() => {
    cb.current = onCreate
  })
  useEffect(() => {
    if (!active) return
    const handler = (e: { layer: L.Layer }) => {
      const geo = (e.layer as L.Polygon).toGeoJSON().geometry
      map.removeLayer(e.layer)
      if (isAreaGeometry(geo)) cb.current(geo)
    }
    map.on('pm:create', handler as L.LeafletEventHandlerFn)
    map.pm.enableDraw('Polygon', {
      snappable: false,
      allowSelfIntersection: false,
      finishOn: null,
      templineStyle: { color: '#f8f2e8', weight: 2 },
      hintlineStyle: { color: '#f8f2e8', dashArray: '6 6', weight: 2 },
      pathOptions: { color: '#f8f2e8', weight: 3, fillColor: '#dcc9aa', fillOpacity: 0.2 },
    })
    return () => {
      map.off('pm:create', handler as L.LeafletEventHandlerFn)
      map.pm.disableDraw()
    }
  }, [active, map])
  return null
}

/** Finish the polygon being drawn, if it has at least 3 corners. */
function finishDraw(map: L.Map | null) {
  if (!map) return
  const draw = map.pm.Draw as unknown as { Polygon?: { _finishShape?: () => void; _layer?: L.Polyline } }
  const poly = draw.Polygon
  const points = (poly?._layer?.getLatLngs() as L.LatLng[] | undefined) ?? []
  if (points.length >= 3) poly?._finishShape?.()
}

function LocateIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  )
}

function ModeBar({ text, okLabel, onOk, onCancel, busy }: { text: string; okLabel: string; onOk: () => void; onCancel: () => void; busy: boolean }) {
  return (
    <div>
      <p className="mb-2 text-sm text-ink">{text}</p>
      <div className="flex gap-2">
        <Button busy={busy} onClick={onOk} className="flex-1">{okLabel}</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="tap flex w-full items-center rounded-xl bg-white px-4 py-3 text-left text-base font-semibold text-ink ring-1 ring-tan-200 active:bg-tan-100">
        {children}
      </button>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

function PinSheet({
  pin,
  onClose,
  canEdit,
  busy,
  onEdit,
  onMove,
  onRemove,
}: {
  pin: PinRow | null
  onClose: () => void
  canEdit: boolean
  busy: boolean
  onEdit: (p: PinRow) => void
  onMove: (p: PinRow) => void
  onRemove: (p: PinRow) => void
}) {
  const { nameOf } = useMembers()
  const [confirm, setConfirm] = useState(false)
  const [claims, setClaims] = useState<StandClaimRow[] | null>(null)

  useEffect(() => {
    setConfirm(false)
    setClaims(null)
    if (!pin || pin.type !== 'stand') return
    let cancelled = false
    supabase
      .from('stand_claims')
      .select('*')
      .eq('stand_id', pin.id)
      .is('released_at', null)
      .gte('date', todayISO())
      .order('date')
      .order('sit')
      .limit(4)
      .then(({ data }) => {
        if (!cancelled) setClaims(data ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [pin])

  if (!pin) return null
  const t = PIN_TYPES[pin.type]
  return (
    <Sheet open={true} onClose={onClose} title={pin.name}>
      <div className="mb-3 flex items-center gap-2">
        <span className="pin" style={{ background: t.color, width: 26, height: 26, fontSize: 12 }}>{t.glyph}</span>
        <span className="font-semibold text-clay-950">{t.label}{pin.stand_type ? ` · ${STAND_TYPES[pin.stand_type]}` : ''}</span>
        {pin.type === 'feeder' && pin.fill_interval_days && <span className="text-sm text-ink-muted">· fill every {pin.fill_interval_days} days</span>}
      </div>
      {pin.notes && <p className="mb-3 whitespace-pre-wrap text-ink">{pin.notes}</p>}
      <p className="mb-3 text-sm text-ink-muted">
        <span className="font-mono">{fmtCoords(pin.lat, pin.lng)}</span> · added by {nameOf(pin.created_by)}
      </p>

      {pin.type === 'stand' && (
        <div className="mb-3 rounded-xl bg-white p-3 ring-1 ring-tan-200">
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-clay-800">Coming sits</div>
          {claims === null ? (
            <span className="text-sm text-ink-muted">Loading…</span>
          ) : claims.length === 0 ? (
            <span className="text-sm text-ink-muted">Nobody has claimed it yet.</span>
          ) : (
            <ul className="text-sm text-ink">
              {claims.map((c) => (
                <li key={c.id}>{fmtDate(c.date)} {SIT_LABEL[c.sit]} · {nameOf(c.member_id)}{c.note ? ` (${c.note})` : ''}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <a href={mapsLink(String(pin.lat), String(pin.lng), pin.name)} target="_blank" rel="noreferrer" className="tap inline-flex items-center rounded-xl bg-tan-200 px-5 py-3 font-semibold text-clay-950 active:bg-tan-300">
          Directions
        </a>
        {canEdit && (
          <>
            <Button variant="secondary" onClick={() => onEdit(pin)}>Edit</Button>
            <Button variant="secondary" onClick={() => onMove(pin)}>Move</Button>
            {confirm ? (
              <Button variant="danger" busy={busy} onClick={() => onRemove(pin)}>Yes, remove it</Button>
            ) : (
              <Button variant="ghost" onClick={() => setConfirm(true)}>Remove</Button>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}

type PinFormValues = { name: string; type: PinType; notes: string; stand_type: StandType; fill_interval_days: string; lat: number; lng: number }

function PinForm({ lat, lng, pin, isAdmin, busy, onSave }: { lat: number; lng: number; pin?: PinRow; isAdmin: boolean; busy: boolean; onSave: (v: PinFormValues) => void }) {
  const allowed = isAdmin ? PIN_TYPE_ORDER : PIN_TYPE_ORDER.filter((t) => !ADMIN_ONLY_TYPES.includes(t) && MEMBER_TYPES.includes(t))
  const [v, setV] = useState<PinFormValues>({
    name: pin?.name ?? '',
    type: pin?.type ?? (isAdmin ? 'stand' : 'hazard'),
    notes: pin?.notes ?? '',
    stand_type: pin?.stand_type ?? 'ladder',
    fill_interval_days: pin?.fill_interval_days ? String(pin.fill_interval_days) : '14',
    lat,
    lng,
  })
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(v) }} className="space-y-3">
      <TextInput label="Name" name="pinName" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="North ladder, cut fence, hog trap…" maxLength={80} autoFocus={!pin} />
      <div>
        <span className="mb-1 block text-sm font-semibold text-clay-900">What is it</span>
        <div className="grid grid-cols-4 gap-2">
          {allowed.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setV({ ...v, type: t })}
              aria-pressed={v.type === t}
              className={`tap flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-xs font-bold ring-1 ${v.type === t ? 'bg-clay-900 text-cream ring-clay-900' : 'bg-white text-clay-950 ring-tan-500'}`}
            >
              <span className="pin" style={{ background: PIN_TYPES[t].color, width: 24, height: 24, fontSize: 11 }}>{PIN_TYPES[t].glyph}</span>
              {PIN_TYPES[t].label}
            </button>
          ))}
        </div>
      </div>
      {v.type === 'stand' && (
        <div>
          <span className="mb-1 block text-sm font-semibold text-clay-900">Stand type</span>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(STAND_TYPES) as StandType[]).map((st) => (
              <button key={st} type="button" onClick={() => setV({ ...v, stand_type: st })} aria-pressed={v.stand_type === st} className={`tap rounded-xl px-2 py-2 text-sm font-bold ring-1 ${v.stand_type === st ? 'bg-clay-900 text-cream ring-clay-900' : 'bg-white text-clay-950 ring-tan-500'}`}>
                {STAND_TYPES[st]}
              </button>
            ))}
          </div>
        </div>
      )}
      {v.type === 'feeder' && (
        <TextInput label="Fill every (days)" name="fillDays" inputMode="numeric" value={v.fill_interval_days} onChange={(e) => setV({ ...v, fill_interval_days: e.target.value.replace(/\D/g, '') })} hint="Turns yellow when due, red when overdue." />
      )}
      <TextArea label="Notes" name="pinNotes" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} placeholder="Optional" rows={2} />
      <p className="text-xs text-ink-muted font-mono">{fmtCoords(lat, lng)}</p>
      <Button type="submit" full busy={busy} disabled={!v.name.trim()}>{pin ? 'Save' : 'Add pin'}</Button>
    </form>
  )
}

function AreaDetails({ area, isAdmin, busy, onUpdate }: { area: AreaRow; isAdmin: boolean; busy: boolean; onUpdate: (patch: { name?: string; is_boundary?: boolean; deleted_at?: string }) => void }) {
  const [name, setName] = useState(area.name)
  const [confirm, setConfirm] = useState(false)
  const ac = isAreaGeometry(area.geometry) ? acres(area.geometry) : 0
  return (
    <div className="space-y-3">
      <p className="text-ink">About {ac >= 10 ? Math.round(ac) : ac.toFixed(1)} acres.</p>
      {isAdmin && (
        <>
          {!area.is_boundary && (
            <form onSubmit={(e) => { e.preventDefault(); onUpdate({ name: name.trim() }) }} className="flex gap-2">
              <div className="flex-1"><TextInput label="Name" name="areaName" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></div>
              <div className="self-end"><Button type="submit" busy={busy} disabled={!name.trim() || name.trim() === area.name}>Rename</Button></div>
            </form>
          )}
          <div className="flex flex-wrap gap-2">
            {!area.is_boundary && <Button variant="secondary" busy={busy} onClick={() => onUpdate({ is_boundary: true })}>Make this the boundary</Button>}
            {confirm ? (
              <Button variant="danger" busy={busy} onClick={() => onUpdate({ deleted_at: new Date().toISOString() })}>Yes, remove it</Button>
            ) : (
              <Button variant="ghost" onClick={() => setConfirm(true)}>Remove</Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function NameForm({ busy, onSave }: { busy: boolean; onSave: (name: string) => void }) {
  const [name, setName] = useState('')
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(name.trim()) }} className="space-y-3">
      <TextInput label="Name" name="newAreaName" value={name} onChange={(e) => setName(e.target.value)} placeholder="North pasture, big food plot…" maxLength={80} autoFocus />
      <Button type="submit" full busy={busy} disabled={!name.trim()}>Save area</Button>
    </form>
  )
}

function ImportForm({ busy, hasBoundary, onImport }: { busy: boolean; hasBoundary: boolean; onImport: (shapes: ImportedShape[]) => void }) {
  const [shapes, setShapes] = useState<ImportedShape[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErr(null)
    try {
      const parsed = parseShapes(file.name, await file.text())
      if (parsed.length === 0) setErr('No polygons found in that file.')
      setShapes(parsed)
    } catch {
      setErr("Couldn't read that file. It should be a .kml or .geojson.")
      setShapes(null)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">
        Export the parcel from Google Earth, the appraisal district map, or any GIS app as KML or GeoJSON.
        {!hasBoundary && ' The first shape becomes the property boundary.'}
      </p>
      <label className="tap flex w-full cursor-pointer items-center justify-center rounded-xl bg-tan-200 px-5 py-3 font-semibold text-clay-950 active:bg-tan-300">
        Choose file
        <input type="file" accept=".kml,.geojson,.json,application/json,application/vnd.google-earth.kml+xml" className="sr-only" onChange={pick} data-testid="import-file" />
      </label>
      {err && <Note kind="error">{err}</Note>}
      {shapes && shapes.length > 0 && (
        <>
          <ul className="space-y-1 text-sm text-ink">
            {shapes.map((s, i) => (
              <li key={i}>• {s.name} · about {Math.round(acres(s.geometry))} acres{i === 0 && !hasBoundary ? ' (boundary)' : ''}</li>
            ))}
          </ul>
          <Button full busy={busy} onClick={() => onImport(shapes)}>Import {shapes.length === 1 ? 'shape' : `${shapes.length} shapes`}</Button>
        </>
      )}
    </div>
  )
}
