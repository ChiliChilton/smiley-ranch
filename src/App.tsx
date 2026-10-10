import { lazy, Suspense, useState } from 'react'
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes, useNavigate } from 'react-router'
import { DEMO } from './lib/demo'
import { TabBar } from './components/TabBar'
import { MembersProvider } from './lib/members'
import { SessionProvider, useSession } from './lib/session'
import { isStandalone, setSkippedInstall, skippedInstall } from './lib/standalone'
import { readJSON, writeJSON } from './lib/storage'
import { ErrorScreen, LoadingScreen } from './screens/ErrorScreen'
import { Home } from './screens/Home'
import { Calendar } from './screens/Calendar'
import { Checkout } from './screens/Checkout'
import { EventDetail } from './screens/EventDetail'
import { EventForm } from './screens/EventForm'
import { Checklist } from './screens/admin/Checklist'
import { Emergency } from './screens/admin/Emergency'
import { Members } from './screens/admin/Members'
import { Security } from './screens/admin/Security'
import { More } from './screens/More'
import { InactiveScreen } from './screens/onboarding/InactiveScreen'
import { InstallScreen } from './screens/onboarding/InstallScreen'
import { JoinScreen } from './screens/onboarding/JoinScreen'
import { NotificationsScreen } from './screens/onboarding/NotificationsScreen'
import { Placeholder } from './screens/Placeholder'
import { Stands } from './screens/Stands'

// Leaflet and the drawing tools only load when the map is opened.
const MapScreen = lazy(() => import('./screens/MapScreen'))
import { SwitchPerson } from './screens/SwitchPerson'

const NOTIF_KEY = 'back40.notifPrompted'

export default function App() {
  return (
    <SessionProvider>
      {DEMO ? (
        <MemoryRouter>
          <Gate />
        </MemoryRouter>
      ) : (
        <BrowserRouter>
          <Gate />
        </BrowserRouter>
      )}
    </SessionProvider>
  )
}

/**
 * Decides what the person sees, in order:
 *   not installed -> Add to Home Screen steps
 *   loading / error
 *   not joined    -> family code + pick name
 *   deactivated   -> access turned off
 *   first time    -> notifications (optional)
 *   otherwise     -> the app
 */
function Gate() {
  const session = useSession()
  const [skipInstall, setSkipInstall] = useState(() => DEMO || skippedInstall())
  const [notifDone, setNotifDone] = useState(() => readJSON<boolean>(NOTIF_KEY) === true)

  if (!isStandalone() && !skipInstall) {
    return (
      <InstallScreen
        onContinue={() => {
          setSkippedInstall(true)
          setSkipInstall(true)
        }}
      />
    )
  }

  if (session.status === 'loading') return <LoadingScreen />
  if (session.status === 'error') return <ErrorScreen message={session.message} onRetry={() => void session.refresh()} />

  const { me } = session
  if (!me.member_id) return <JoinScreen />
  if (!me.is_active) return <InactiveScreen name={me.name} />
  if (!notifDone) {
    return (
      <NotificationsScreen
        onDone={() => {
          writeJSON(NOTIF_KEY, true)
          setNotifDone(true)
        }}
      />
    )
  }

  return <Shell />
}

function Shell() {
  return (
    <MembersProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/calendar/new" element={<EventForm />} />
        <Route path="/calendar/:id" element={<EventDetail />} />
        <Route path="/calendar/:id/edit" element={<EventForm />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/stands" element={<Stands />} />
        <Route path="/map" element={<Suspense fallback={<LoadingScreen />}><MapScreen /></Suspense>} />
        <Route path="/log" element={<Placeholder title="Log" phase={5} what="What's happening on the place." />} />
        <Route path="/more" element={<More />} />
        <Route path="/more/switch" element={<SwitchPerson />} />
        <Route path="/more/install" element={<InstallHelp />} />
        <Route path="/more/members" element={<AdminOnly><Members /></AdminOnly>} />
        <Route path="/more/security" element={<AdminOnly><Security /></AdminOnly>} />
        <Route path="/more/checklist" element={<AdminOnly><Checklist /></AdminOnly>} />
        <Route path="/more/emergency" element={<AdminOnly><Emergency /></AdminOnly>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TabBar />
    </MembersProvider>
  )
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const session = useSession()
  const isAdmin = session.status === 'ready' && session.me.is_admin
  return isAdmin ? <>{children}</> : <Navigate to="/more" replace />
}

function InstallHelp() {
  const navigate = useNavigate()
  return <InstallScreen onContinue={() => navigate('/more')} />
}
