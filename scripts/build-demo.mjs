// Builds the demo (fake backend, sample data) and writes an artifact-ready copy to dist-demo/.
// The artifact host wraps the page in its own <html>/<head>/<body>, so we keep only what goes inside.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

execSync('npm run build', { stdio: 'inherit', env: { ...process.env, VITE_DEMO: '1', VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' } })

const html = fs.readFileSync('dist/index.html', 'utf8')
const tags = [...html.matchAll(/<(script|link)\b[^>]*>(?:<\/script>)?/g)].map((m) => m[0]).filter((t) => !/rel="(icon|apple-touch-icon)"/.test(t))
// The host puts this inside <body>, so the icon links are moved up into <head> at runtime
// (Safari only reads apple-touch-icon from <head>).
const page = `<title>Smiley Ranch</title>
<link rel="icon" type="image/png" href="./favicon.png">
<link rel="apple-touch-icon" sizes="180x180" href="./icons/icon-192.png">
<meta name="apple-mobile-web-app-title" content="Smiley">
<meta name="apple-mobile-web-app-capable" content="yes">
<script>for (const el of document.querySelectorAll('link[rel="icon"],link[rel="apple-touch-icon"],meta[name^="apple-mobile"]')) document.head.appendChild(el)</script>
<style>html,body{height:100%}</style>
${tags.join('\n')}
<div id="root"></div>
`
fs.rmSync('dist-demo', { recursive: true, force: true })
fs.mkdirSync('dist-demo', { recursive: true })
fs.writeFileSync('dist-demo/index.html', page)
for (const dir of ['assets', 'icons']) fs.cpSync(path.join('dist', dir), path.join('dist-demo', dir), { recursive: true })
fs.copyFileSync('dist/favicon.png', 'dist-demo/favicon.png')
for (const f of ['banner.jpg', 'banner-small.jpg']) fs.copyFileSync(path.join('dist', f), path.join('dist-demo', f))
console.log('dist-demo ready:', fs.readdirSync('dist-demo/assets').join(', '))
