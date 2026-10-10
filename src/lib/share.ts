/** Share text through the phone's share sheet, else Messages, else the clipboard. */
export async function shareText(title: string, text: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share) {
      await navigator.share({ title, text })
      return 'shared'
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return 'failed'
  }
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}

export function smsLink(text: string): string {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
  return `sms:${ios ? '&' : '?'}body=${encodeURIComponent(text)}`
}

export function mapsLink(lat: string, lng: string, label = 'Back 40'): string {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
  return ios
    ? `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(label)}`
    : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}
