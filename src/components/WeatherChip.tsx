import { useEffect, useState } from 'react'
import { currentWeather, describe, forecastUrl, type Weather } from '../lib/weather'

function Icon({ kind }: { kind: ReturnType<typeof describe>['icon'] }) {
  const p = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  switch (kind) {
    case 'sun': return <svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
    case 'partly': return <svg {...p}><circle cx="8" cy="8" r="3" /><path d="M8 2v1.5M2 8h1.5M3.8 3.8l1 1" /><path d="M9 20h8.5a3.5 3.5 0 0 0 .5-7 5 5 0 0 0-9.6-1.3A4 4 0 0 0 9 20z" /></svg>
    case 'cloud': return <svg {...p}><path d="M7 19h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.5-1.6A4.5 4.5 0 0 0 7 19z" /></svg>
    case 'fog': return <svg {...p}><path d="M4 10h16M3 14h18M5 18h14" /></svg>
    case 'rain': return <svg {...p}><path d="M7 15h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.5-1.6A4.5 4.5 0 0 0 7 15z" /><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" /></svg>
    case 'storm': return <svg {...p}><path d="M7 14h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.5-1.6A4.5 4.5 0 0 0 7 14z" /><path d="M13 14l-2.5 5h3L11 23" /></svg>
    case 'snow': return <svg {...p}><path d="M7 15h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.5-1.6A4.5 4.5 0 0 0 7 15z" /><path d="M8 19v.01M12 21v.01M16 19v.01M10 22v.01M14 23v.01" /></svg>
  }
}

/** Right now at the ranch: icon, temperature, wind. Tap for the NWS forecast. Hidden when it can't load. */
export function WeatherChip() {
  const [w, setW] = useState<Weather | null>(null)
  useEffect(() => { currentWeather().then(setW) }, [])
  if (!w) return null
  const d = describe(w.code)
  return (
    <a href={forecastUrl()} target="_blank" rel="noreferrer" aria-label={`${d.label}, ${w.tempF} degrees, wind ${w.windMph} miles an hour. Opens the forecast.`} className="tap flex items-center gap-1.5 rounded-md px-2 text-cream drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]">
      <Icon kind={d.icon} />
      <span className="text-sm font-bold leading-none">{w.tempF}°<span className="ml-1 text-xs font-semibold opacity-90">{w.windMph} mph</span></span>
    </a>
  )
}
