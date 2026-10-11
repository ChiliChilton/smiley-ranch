// Pulled into the generated service worker (workbox importScripts). Shows pushes and opens the app on tap.
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data && event.data.text() } }
  const title = data.title || 'Smiley Ranch'
  const base = self.registration.scope
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: base + 'icons/icon-192.png',
      badge: base + 'icons/icon-192.png',
      tag: data.kind || undefined,
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const scope = self.registration.scope
  const target = new URL((event.notification.data && event.notification.data.url) || '/', scope)
  // Keep deep links inside the app's base path (GitHub Pages serves from /repo/).
  const url = target.pathname.startsWith(new URL(scope).pathname) ? target.href : scope.replace(/\/$/, '') + target.pathname
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => 'focus' in c)
      if (open) { open.navigate(url); return open.focus() }
      return self.clients.openWindow(url)
    }),
  )
})
