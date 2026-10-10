import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { DEMO } from './lib/demo'

// Service worker: caches the app shell so it opens with no signal.
// autoUpdate: new versions take over on the next launch.
if (!DEMO) registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
