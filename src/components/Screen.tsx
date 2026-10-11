import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'

type Props = {
  title: string
  back?: boolean | string
  right?: ReactNode
  /** Something to show before the title, like the brand mark. */
  leading?: ReactNode
  /** Photo to run behind the header. Makes it a tall, non-sticky banner. */
  hero?: string
  children: ReactNode
  /** Leave room for the bottom tab bar. Default true. */
  tabs?: boolean
}

/** Page frame: sticky header that respects the notch, scrollable content, room for the tab bar. */
export function Screen({ title, back, right, leading, hero, children, tabs = true }: Props) {
  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <Header title={title} back={back} right={right} leading={leading} hero={hero} />
      <main
        className="flex-1 px-4 pt-4"
        style={{
          paddingBottom: tabs ? 'calc(var(--tab-bar-height) + var(--safe-bottom) + 24px)' : 'calc(var(--safe-bottom) + 24px)',
          paddingLeft: 'max(16px, var(--safe-left))',
          paddingRight: 'max(16px, var(--safe-right))',
        }}
      >
        {children}
      </main>
    </div>
  )
}

export function Header({ title, back, right, leading, hero }: Pick<Props, 'title' | 'back' | 'right' | 'leading' | 'hero'>) {
  const navigate = useNavigate()
  if (hero) {
    return (
      <header
        className="relative bg-clay-900 text-cream"
        style={{
          backgroundImage: `linear-gradient(to bottom, rgba(40,16,6,0.25) 0%, rgba(40,16,6,0.05) 35%, rgba(40,16,6,0.72) 100%), url(${hero})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center 40%',
          paddingTop: 'calc(var(--safe-top) + 92px)',
        }}
      >
        <div className="flex items-end gap-3 px-4 pb-3">
          {leading && <span className="flex shrink-0 items-center text-cream drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">{leading}</span>}
          <h1 className="min-w-0 flex-1 truncate text-xl font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]">{title}</h1>
          {right}
        </div>
      </header>
    )
  }
  return (
      <header
        className="sticky top-0 z-10 bg-clay-900 text-cream"
        style={{ paddingTop: 'var(--safe-top)' }}
      >
        <div className="flex h-14 items-center gap-1 px-2">
          {back ? (
            <button
              type="button"
              onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
              className="tap -ml-1 flex items-center rounded-lg px-2 text-base font-medium active:bg-clay-800"
              aria-label="Back"
            >
              <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back
            </button>
          ) : (
            <span className="w-2" />
          )}
          {leading && <span className="mr-1 flex shrink-0 items-center text-cream">{leading}</span>}
          <h1 className="min-w-0 flex-1 truncate px-1 text-lg font-bold">{title}</h1>
          {right}
        </div>
      </header>
  )
}

/** Full-bleed centered layout for onboarding screens (no tab bar). */
export function Centered({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex min-h-dvh flex-col bg-cream"
      style={{
        paddingTop: 'calc(var(--safe-top) + 24px)',
        paddingBottom: 'calc(var(--safe-bottom) + 24px)',
        paddingLeft: 'max(20px, var(--safe-left))',
        paddingRight: 'max(20px, var(--safe-right))',
      }}
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">{children}</div>
    </div>
  )
}
