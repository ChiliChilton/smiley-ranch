// Builds the demo (fake backend, sample data) and writes an artifact-ready copy to dist-demo/.
// The artifact host wraps the page in its own <html>/<head>/<body>, so we keep only what goes inside.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

execSync('npm run build', { stdio: 'inherit', env: { ...process.env, VITE_DEMO: '1', VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' } })

const html = fs.readFileSync('dist/index.html', 'utf8')
const tags = [...html.matchAll(/<(script|link)\b[^>]*>(?:<\/script>)?/g)].map((m) => m[0]).filter((t) => !/rel="(icon|apple-touch-icon)"/.test(t))
const page = `<title>Back 40</title>
<style>html,body{height:100%}</style>
${tags.join('\n')}
<div id="root"></div>
`
fs.rmSync('dist-demo', { recursive: true, force: true })
fs.mkdirSync('dist-demo', { recursive: true })
fs.writeFileSync('dist-demo/index.html', page)
for (const dir of ['assets', 'icons']) fs.cpSync(path.join('dist', dir), path.join('dist-demo', dir), { recursive: true })
fs.copyFileSync('dist/favicon.png', 'dist-demo/favicon.png')
console.log('dist-demo ready:', fs.readdirSync('dist-demo/assets').join(', '))
