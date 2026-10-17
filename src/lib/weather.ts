// Current conditions at the ranch from Open-Meteo: free, no key, no account. Cached for
// 30 minutes per phone. If the call fails (no signal, blocked), the app just shows nothing.
export type Weather = { tempF: number; windMph: number; code: number; at: number }

export const RANCH_LAT = 29.2273
export const RANCH_LNG = -97.6519
const KEY = 'back40.weather'
const TTL = 30 * 60 * 1000

export async function currentWeather(lat = RANCH_LAT, lng = RANCH_LNG): Promise<Weather | null> {
  try {
    const cached = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Weather | null
    if (cached && Date.now() - cached.at < TTL) return cached
  } catch { /* ignore */ }
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FChicago`
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!r.ok) return null
    const j = (await r.json()) as { current?: { temperature_2m: number; wind_speed_10m: number; weather_code: number } }
    if (!j.current) return null
    const w: Weather = { tempF: Math.round(j.current.temperature_2m), windMph: Math.round(j.current.wind_speed_10m), code: j.current.weather_code, at: Date.now() }
    try { localStorage.setItem(KEY, JSON.stringify(w)) } catch { /* ignore */ }
    return w
  } catch {
    return null
  }
}

/** WMO weather code -> plain words and which icon to draw. */
export function describe(code: number): { label: string; icon: 'sun' | 'cloud' | 'partly' | 'fog' | 'rain' | 'storm' | 'snow' } {
  if (code === 0) return { label: 'Clear', icon: 'sun' }
  if (code <= 2) return { label: 'Partly cloudy', icon: 'partly' }
  if (code === 3) return { label: 'Cloudy', icon: 'cloud' }
  if (code <= 48) return { label: 'Fog', icon: 'fog' }
  if (code <= 67 || (code >= 80 && code <= 82)) return { label: 'Rain', icon: 'rain' }
  if (code <= 77 || code === 85 || code === 86) return { label: 'Snow', icon: 'snow' }
  return { label: 'Storms', icon: 'storm' }
}

export const forecastUrl = (lat = RANCH_LAT, lng = RANCH_LNG) => `https://forecast.weather.gov/MapClick.php?lat=${lat}&lon=${lng}`
