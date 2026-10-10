export const SPECIES = ['Deer', 'Hog', 'Turkey', 'Dove', 'Quail', 'Coyote', 'Bobcat', 'Rabbit', 'Other'] as const

export const SEXES: { value: string; label: string }[] = [
  { value: 'buck', label: 'Buck' },
  { value: 'doe', label: 'Doe' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'unknown', label: 'Not sure' },
]

/** Hunting seasons run Sept 1 to Aug 31. '2026-11-14' -> 2026, '2027-01-03' -> 2026. */
export function seasonOf(iso: string): number {
  const y = Number(iso.slice(0, 4))
  const m = Number(iso.slice(5, 7))
  return m >= 9 ? y : y - 1
}

export function seasonLabel(season: number): string {
  return `${season}–${String(season + 1).slice(2)}`
}
