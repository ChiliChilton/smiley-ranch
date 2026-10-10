import { NavLink } from 'react-router'

const tabs = [
  { to: '/', label: 'Home', icon: HomeIcon },
  { to: '/calendar', label: 'Calendar', icon: CalendarIcon },
  { to: '/stands', label: 'Stands', icon: StandIcon },
  { to: '/map', label: 'Map', icon: MapIcon },
  { to: '/more', label: 'More', icon: MoreIcon },
]

export function TabBar() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-tan-300 bg-cream-dark"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <ul className="flex" style={{ height: 'var(--tab-bar-height)' }}>
        {tabs.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
                  isActive ? 'text-pine-900' : 'text-ink-muted'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon active={isActive} />
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

type IconProps = { active: boolean }
const base = (active: boolean) => ({
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: active ? 'currentColor' : 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
})

function HomeIcon({ active }: IconProps) {
  return (
    <svg {...base(active)}>
      <path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" />
    </svg>
  )
}
function StandIcon({ active }: IconProps) {
  return (
    <svg {...base(false)}>
      <path d="M6 21V7l6-4 6 4v14" />
      <path d="M6 12h12M9 21v-6h6v6" fill={active ? 'currentColor' : 'none'} />
    </svg>
  )
}
function MapIcon({ active }: IconProps) {
  return (
    <svg {...base(active)}>
      <path d="M9 4l6 2 6-2v14l-6 2-6-2-6 2V6z" />
      <path d="M9 4v14M15 6v14" stroke={active ? '#f3efe4' : 'currentColor'} />
    </svg>
  )
}
function CalendarIcon({ active }: IconProps) {
  return (
    <svg {...base(active)}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" stroke={active ? '#f3efe4' : 'currentColor'} />
      <path d="M8 3v4M16 3v4" />
    </svg>
  )
}
function MoreIcon({ active }: IconProps) {
  return (
    <svg {...base(active)}>
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  )
}
