// Pornește backend + frontend cu o singură comandă, fără dependențe externe.
// Folosit de `npm start`.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function run(name, cmd, args, color) {
  const child = spawn(cmd, args, { cwd: __dirname, env: process.env })
  const tag = `\x1b[${color}m[${name}]\x1b[0m`
  child.stdout.on('data', d => process.stdout.write(`${tag} ${d}`))
  child.stderr.on('data', d => process.stderr.write(`${tag} ${d}`))
  child.on('exit', code => {
    console.log(`${tag} s-a oprit (cod ${code})`)
    process.exit(code ?? 0)
  })
  return child
}

const backend = run('BACKEND', 'node', ['backend/server.js'], '34')
const frontend = run('FRONTEND', npmCmd, ['run', 'dev'], '32')

function shutdown() {
  backend.kill('SIGINT')
  frontend.kill('SIGINT')
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
