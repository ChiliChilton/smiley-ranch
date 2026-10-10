// Detecting how the app was launched. iOS only lets a web app receive push and feel
// like an app when it's launched from the home screen (display-mode: standalone).

const SKIP_KEY = 'back40.skipInstall'

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true
}

export function isIOS(): boolean {
  const ua = navigator.userAgent
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return /iPhone|iPad|iPod/.test(ua) || iPadOS
}

export function isSafari(): boolean {
  const ua = navigator.userAgent
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Android/.test(ua)
}

export function isAndroid(): boolean {
  return /Android/.test(navigator.userAgent)
}

export function skippedInstall(): boolean {
  try {
    return localStorage.getItem(SKIP_KEY) === '1'
  } catch {
    return false
  }
}

export function setSkippedInstall(value: boolean) {
  try {
    if (value) localStorage.setItem(SKIP_KEY, '1')
    else localStorage.removeItem(SKIP_KEY)
  } catch {
    /* private mode: ignore */
  }
}

/** Push is only possible here if we're installed (iOS) or in a browser that supports it. */
export function pushSupported(): boolean {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false
  if (isIOS() && !isStandalone()) return false
  return true
}
