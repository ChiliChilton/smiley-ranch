import { Button } from '../../components/Button'
import { Centered } from '../../components/Screen'
import { Note } from '../../components/Note'
import { isAndroid, isIOS, isSafari } from '../../lib/standalone'

/** Shown when the app isn't running from the home screen. */
export function InstallScreen({ onContinue }: { onContinue: () => void }) {
  const ios = isIOS()
  const safari = isSafari()

  return (
    <Centered>
      <div className="mb-6 flex items-center gap-3">
        <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width={56} height={56} className="rounded-xl" />
        <div>
          <h1 className="text-2xl font-bold text-clay-950">Back 40</h1>
          <p className="text-ink-muted">Put it on your home screen</p>
        </div>
      </div>

      {ios ? (
        <>
          {!safari && (
            <Note kind="warn" className="mb-4">
              You're not in Safari. On iPhone, only Safari can add this to your home screen. Copy the link and open it in Safari first.
            </Note>
          )}
          <ol className="space-y-4">
            <Step n={1} title="Tap the Share button" icon={<ShareIcon />}>
              It's the square with an arrow at the bottom of Safari.
            </Step>
            <Step n={2} title='Tap "Add to Home Screen"' icon={<PlusSquareIcon />}>
              Scroll down the list a little if you don't see it.
            </Step>
            <Step n={3} title='Tap "Add"' icon={<CheckIcon />}>
              Then open Back 40 from your home screen like any other app.
            </Step>
          </ol>
          <Note className="mt-6">
            Why bother? Installed, it opens full screen, works better with weak signal, and can send you notifications when someone claims a stand or posts a harvest.
          </Note>
        </>
      ) : isAndroid() ? (
        <ol className="space-y-4">
          <Step n={1} title="Open the browser menu" icon={<DotsIcon />}>
            The three dots in the corner of Chrome.
          </Step>
          <Step n={2} title='Tap "Add to Home screen" or "Install app"' icon={<PlusSquareIcon />}>
            Then open Back 40 from your home screen.
          </Step>
        </ol>
      ) : (
        <Note>
          This app is built for phones. On an iPhone, open this link in Safari, tap Share, then "Add to Home Screen". You can keep going here in the browser to look around.
        </Note>
      )}

      <div className="mt-auto pt-8">
        <Button variant="ghost" full onClick={onContinue}>
          {ios ? 'Skip for now, keep going in Safari' : 'Continue in the browser'}
        </Button>
      </div>
    </Centered>
  )
}

function Step({ n, title, icon, children }: { n: number; title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex gap-4 rounded-2xl bg-white p-4 ring-1 ring-tan-200">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-clay-100 text-clay-900">{icon}</div>
      <div>
        <div className="font-bold text-clay-950">
          <span className="mr-2 text-tan-700">{n}.</span>
          {title}
        </div>
        <div className="text-sm text-ink-muted">{children}</div>
      </div>
    </li>
  )
}

const svg = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
function ShareIcon() {
  return (
    <svg {...svg}>
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M5 11v8a2 2 0 002 2h10a2 2 0 002-2v-8" />
    </svg>
  )
}
function PlusSquareIcon() {
  return (
    <svg {...svg}>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  )
}
function CheckIcon() {
  return (
    <svg {...svg}>
      <path d="M5 13l4 4L19 7" />
    </svg>
  )
}
function DotsIcon() {
  return (
    <svg {...svg}>
      <circle cx="12" cy="5" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="19" r="1.5" fill="currentColor" />
    </svg>
  )
}
