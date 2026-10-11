import { NavLink } from 'react-router'

const tabs = [
  { to: '/checkout', label: 'Check out', icon: LeaveIcon },
  { to: '/', label: 'Home', icon: HomeIcon },
  { to: '/calendar', label: 'Calendar', icon: CalendarIcon },
  { to: '/todos', label: 'Projects', icon: ProjectsIcon },
  { to: '/supplies', label: 'Needs', icon: NeedsIcon },
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
                `flex h-full flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${
                  isActive ? 'text-clay-900' : 'text-ink-muted'
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

function LeaveIcon({ active }: IconProps) {
  return (
    <svg {...base(false)}>
      <path d="M10 4H5a1 1 0 00-1 1v14a1 1 0 001 1h5" />
      <path d="M14 8l4 4-4 4M18 12H9" stroke={active ? 'currentColor' : 'currentColor'} strokeWidth={active ? 2.6 : 1.8} />
    </svg>
  )
}
function HomeIcon({ active }: IconProps) {
  return (
    <svg {...base(active)}>
      <path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" />
    </svg>
  )
}
function ProjectsIcon({ active }: IconProps) {
  return (
    <svg {...base(false)}>
      <rect x="4" y="4" width="16" height="16" rx="2" fill={active ? 'currentColor' : 'none'} />
      <path d="M8 12l3 3 5-6" stroke={active ? '#f8f2e8' : 'currentColor'} strokeWidth="2.2" />
    </svg>
  )
}
function NeedsIcon({ active }: IconProps) {
  return (
    <svg {...base(false)}>
      <path d="M3 5h2l2.5 11h11L21 8H7" fill={active ? 'currentColor' : 'none'} />
      <circle cx="10" cy="20" r="1.3" fill="currentColor" />
      <circle cx="17" cy="20" r="1.3" fill="currentColor" />
    </svg>
  )
}
function CalendarIcon({ active }: IconProps) {
  return (
    <svg {...base(active)}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" stroke={active ? '#f8f2e8' : 'currentColor'} />
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
