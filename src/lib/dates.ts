// All calendar dates are plain 'YYYY-MM-DD' strings in the phone's local time.

const pad = (n: number) => String(n).padStart(2, '0')

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const todayISO = () => toISODate(new Date())

export function addDays(iso: string, n: number): string {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86400000)
}

/** Inclusive overlap of two date ranges. */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const WEEKDAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function monthName(year: number, month: number): string {
  return `${MONTHS_LONG[month]} ${year}`
}

/** 'Sat, Oct 17' (adds the year if it isn't this year). */
export function fmtDate(iso: string, opts: { weekday?: boolean } = { weekday: true }): string {
  const d = parseISODate(iso)
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`
  const year = d.getFullYear() !== new Date().getFullYear() ? `, ${d.getFullYear()}` : ''
  return (opts.weekday ? `${DAYS[d.getDay()]}, ` : '') + base + year
}

/** 'Sat, Oct 17' | 'Oct 17–19' | 'Oct 31 – Nov 2' */
export function fmtRange(start: string, end: string): string {
  if (start === end) return fmtDate(start)
  const a = parseISODate(start)
  const b = parseISODate(end)
  const year = b.getFullYear() !== new Date().getFullYear() ? `, ${b.getFullYear()}` : ''
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${MONTHS[a.getMonth()]} ${a.getDate()}–${b.getDate()}${year}`
  }
  return `${MONTHS[a.getMonth()]} ${a.getDate()} – ${MONTHS[b.getMonth()]} ${b.getDate()}${year}`
}

/** 'Sun, Oct 12, 2:14 PM' from a timestamptz. */
export function fmtDateTime(ts: string): string {
  const d = new Date(ts)
  const date = fmtDate(toISODate(d))
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${date}, ${time}`
}

/** 'today' | 'tomorrow' | 'in 3 days' | '2 days ago' */
export function relativeDay(iso: string): string {
  const n = daysBetween(todayISO(), iso)
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n === -1) return 'yesterday'
  if (n > 0) return `in ${n} days`
  return `${-n} days ago`
}

/** 6 rows x 7 days of ISO dates covering the month, weeks starting Sunday. */
export function monthGrid(year: number, month: number): string[][] {
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay())
  const rows: string[][] = []
  for (let r = 0; r < 6; r++) {
    const row: string[] = []
    for (let c = 0; c < 7; c++) {
      row.push(toISODate(start))
      start.setDate(start.getDate() + 1)
    }
    rows.push(row)
    // Stop early if the next row is entirely in the next month.
    if (start.getMonth() !== month && r >= 3) break
  }
  return rows
}
