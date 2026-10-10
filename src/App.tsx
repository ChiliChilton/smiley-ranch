import { useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router'
import { TabBar } from './components/TabBar'
import { SessionProvider, useSession } from './lib/session'
import { isStandalone, setSkippedInstall, skippedInstall } from './lib/standalone'
import { readJSON, writeJSON } from './lib/storage'
import { ErrorScreen, LoadingScreen } from './screens/ErrorScreen'
import { Home } from './screens/Home'
import { Members } from './screens/admin/Members'
import { Security } from './screens/admin/Security'
import { More } from './screens/More'
import { InactiveScreen } from './screens/onboarding/InactiveScreen'
import { InstallScreen } from './screens/onboarding/InstallScreen'
import { JoinScreen } from './screens/onboarding/JoinScreen'
import { NotificationsScreen } from './screens/onboarding/NotificationsScreen'
import { Placeholder } from './screens/Placeholder'
import { SwitchPerson } from './screens/SwitchPerson'

const NOTIF_KEY = 'back40.notifPrompted'

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
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
  const [skipInstall, setSkipInstall] = useState(skippedInstall)
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
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/stands" element={<Placeholder title="Stands" phase={2} what="Claim a stand for a date and an AM or PM sit." />} />
        <Route path="/map" element={<Placeholder title="Map" phase={2} what="Satellite map with stands, feeders, cameras, and more." />} />
        <Route path="/log" element={<Placeholder title="Log" phase={4} what="What's happening on the place." />} />
        <Route path="/more" element={<More />} />
        <Route path="/more/switch" element={<SwitchPerson />} />
        <Route path="/more/install" element={<InstallHelp />} />
        <Route path="/more/members" element={<AdminOnly><Members /></AdminOnly>} />
        <Route path="/more/security" element={<AdminOnly><Security /></AdminOnly>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TabBar />
    </>
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
