// Boundary and area shapes are GeoJSON Polygon / MultiPolygon geometries in `areas.geometry`.

export type Position = [number, number] // [lng, lat]
export type PolygonGeometry = { type: 'Polygon'; coordinates: Position[][] }
export type MultiPolygonGeometry = { type: 'MultiPolygon'; coordinates: Position[][][] }
export type AreaGeometry = PolygonGeometry | MultiPolygonGeometry

export type ImportedShape = { name: string; geometry: AreaGeometry }
export type ImportedPoint = { name: string; lat: number; lng: number; description: string }
export type Imported = { shapes: ImportedShape[]; points: ImportedPoint[] }

export function isAreaGeometry(g: unknown): g is AreaGeometry {
  const x = g as { type?: string; coordinates?: unknown }
  return !!x && (x.type === 'Polygon' || x.type === 'MultiPolygon') && Array.isArray(x.coordinates)
}

/** [[south, west], [north, east]] for Leaflet's fitBounds. */
export function geometryBounds(geoms: AreaGeometry[]): [[number, number], [number, number]] | null {
  let s = 90, w = 180, n = -90, e = -180
  let any = false
  const visit = (p: Position) => {
    any = true
    if (p[1] < s) s = p[1]
    if (p[1] > n) n = p[1]
    if (p[0] < w) w = p[0]
    if (p[0] > e) e = p[0]
  }
  for (const g of geoms) {
    if (g.type === 'Polygon') g.coordinates.forEach((ring) => ring.forEach(visit))
    else g.coordinates.forEach((poly) => poly.forEach((ring) => ring.forEach(visit)))
  }
  return any ? [[s, w], [n, e]] : null
}

/** Rough area in acres (good enough for a label). */
export function acres(g: AreaGeometry): number {
  const ringArea = (ring: Position[]) => {
    // Shoelace on an equirectangular projection around the ring's mean latitude.
    const lat0 = (ring.reduce((a, p) => a + p[1], 0) / ring.length) * (Math.PI / 180)
    const kx = 111320 * Math.cos(lat0)
    const ky = 110540
    let sum = 0
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i]
      const [x2, y2] = ring[(i + 1) % ring.length]
      sum += x1 * kx * (y2 * ky) - x2 * kx * (y1 * ky)
    }
    return Math.abs(sum) / 2
  }
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates
  let m2 = 0
  for (const poly of polys) {
    m2 += ringArea(poly[0])
    for (const hole of poly.slice(1)) m2 -= ringArea(hole)
  }
  return m2 / 4046.856
}

/** Parse a GeoJSON or KML file into named polygon shapes and named points. */
export function parseShapes(filename: string, text: string): Imported {
  if (/\.kml$/i.test(filename) || text.trimStart().startsWith('<')) return parseKml(text)
  return parseGeoJson(text)
}

function parseGeoJson(text: string): Imported {
  const json = JSON.parse(text) as { type?: string; features?: unknown[]; geometry?: unknown; properties?: Record<string, unknown> }
  const out: ImportedShape[] = []
  const points: ImportedPoint[] = []
  const push = (geometry: unknown, props?: Record<string, unknown>) => {
    const name = String(props?.name ?? props?.Name ?? props?.NAME ?? '').trim()
    if (isAreaGeometry(geometry)) {
      out.push({ name: name || `Area ${out.length + 1}`, geometry })
    } else {
      const g = geometry as { type?: string; coordinates?: unknown }
      if (g?.type === 'Point' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
        const [lng, lat] = g.coordinates as number[]
        if (Number.isFinite(lat) && Number.isFinite(lng))
          points.push({ name: name || `Point ${points.length + 1}`, lat, lng, description: String(props?.description ?? '') })
      }
    }
  }
  if (json.type === 'FeatureCollection') {
    for (const f of json.features ?? []) {
      const feat = f as { geometry?: unknown; properties?: Record<string, unknown> }
      push(feat.geometry, feat.properties)
    }
  } else if (json.type === 'Feature') {
    push(json.geometry, json.properties)
  } else {
    push(json)
  }
  return { shapes: out, points }
}

function parseKml(text: string): Imported {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  const out: ImportedShape[] = []
  const points: ImportedPoint[] = []
  const placemarks = Array.from(doc.getElementsByTagName('Placemark'))
  for (const pm of placemarks) {
    const name = pm.getElementsByTagName('name')[0]?.textContent?.trim() ?? ''
    const description = pm.getElementsByTagName('description')[0]?.textContent?.trim() ?? ''
    const pt = pm.getElementsByTagName('Point')[0]?.getElementsByTagName('coordinates')[0]?.textContent
    if (pt) {
      const [c] = parseKmlCoords(pt)
      if (c) points.push({ name: name || `Point ${points.length + 1}`, lat: c[1], lng: c[0], description })
      continue
    }
    const polys = Array.from(pm.getElementsByTagName('Polygon'))
    const rings: Position[][][] = []
    for (const poly of polys) {
      const outer = poly.getElementsByTagName('outerBoundaryIs')[0]?.getElementsByTagName('coordinates')[0]?.textContent
      if (!outer) continue
      const ringList: Position[][] = [parseKmlCoords(outer)]
      for (const inner of Array.from(poly.getElementsByTagName('innerBoundaryIs'))) {
        const c = inner.getElementsByTagName('coordinates')[0]?.textContent
        if (c) ringList.push(parseKmlCoords(c))
      }
      rings.push(ringList)
    }
    if (rings.length === 1) out.push({ name: name || `Area ${out.length + 1}`, geometry: { type: 'Polygon', coordinates: rings[0] } })
    else if (rings.length > 1) out.push({ name: name || `Area ${out.length + 1}`, geometry: { type: 'MultiPolygon', coordinates: rings } })
  }
  return { shapes: out, points }
}

function parseKmlCoords(text: string): Position[] {
  return text
    .trim()
    .split(/\s+/)
    .map((t) => t.split(',').map(Number))
    .filter((p) => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map((p) => [p[0], p[1]] as Position)
}
