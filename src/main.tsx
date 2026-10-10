import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { DEMO } from './lib/demo'

// Service worker: caches the app shell so it opens with no signal.
// autoUpdate: new versions take over on the next launch.
if (!DEMO) {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      window.dispatchEvent(new CustomEvent('back40:update', { detail: () => updateSW(true) }))
    },
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
