// Bundles dist-demo/ into one self-contained HTML file (docs/demo/smiley-ranch-demo.html)
// that runs from a phone's Files app with no server. Run after scripts/build-demo.mjs.
import fs from 'node:fs'
const html = fs.readFileSync('dist-demo/index.html', 'utf8')
const js = fs.readFileSync('dist-demo/assets/' + html.match(/assets\/(index-[^"]+\.js)/)[1], 'utf8')
const css = fs.readFileSync('dist-demo/assets/' + html.match(/assets\/(index-[^"]+\.css)/)[1], 'utf8')
const b64 = (p, t) => `data:${t};base64,` + fs.readFileSync(p).toString('base64')
const banner = b64('dist-demo/banner.jpg', 'image/jpeg')
const icon = b64('dist-demo/icons/icon-192.png', 'image/png')
// Vite inlines import.meta.env.BASE_URL as "./" so asset paths appear as "./banner.jpg" style literals.
const out = js
  .replaceAll('./banner-small.jpg', banner).replaceAll('./banner.jpg', banner)
  .replaceAll('./icons/icon-192.png', icon).replaceAll('./icons/icon-512.png', icon)
const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>Smiley Ranch</title>
<link rel="icon" href="${b64('dist-demo/favicon.png', 'image/png')}">
<link rel="apple-touch-icon" href="${icon}">
<style>html,body{height:100%}</style>
<style>${css.replaceAll('</style', '<\\/style')}</style>
</head><body><div id="root"></div>
<script type="module">${out.replaceAll('</script', '<\\/script')}</script>
</body></html>`
fs.mkdirSync('docs/demo', { recursive: true })
fs.writeFileSync('docs/demo/smiley-ranch-demo.html', page)
console.log('docs/demo/smiley-ranch-demo.html', Math.round(page.length / 1024), 'KB')
