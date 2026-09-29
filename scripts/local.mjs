// Portable local setup and launcher. No activation script or machine-specific paths.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, copyFileSync, renameSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import net from 'node:net'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(root)
const windows = process.platform === 'win32'
const python = resolve(root, 'backend/.venv', windows ? 'Scripts/python.exe' : 'bin/python')
const action = process.argv[2] ?? 'start'
const [major, minor] = process.versions.node.split('.').map(Number)
function fail(message) { throw new Error(message) }
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options })
  if (result.error || result.status !== 0) fail(`Command failed: ${command}. ${result.error?.message ?? 'See the error above.'}`)
}
function npm(args) {
  if (process.env.npm_execpath) run(process.execPath, [process.env.npm_execpath, ...args])
  else run(windows ? 'npm.cmd' : 'npm', args, { shell: windows })
}
function readEnv(path) {
  return Object.fromEntries(readFileSync(path, 'utf8').split(/\r?\n/).map(line => {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)
    return match ? [match[1], match[2].replace(/^(['"])(.*)\1$/, '$2')] : null
  }).filter(Boolean))
}
function config() {
  for (const [source, target] of [['.env.example', '.env.local'], ['backend/.env.example', 'backend/.env']]) {
    if (process.argv.includes('--local-config') && existsSync(target)) {
      copyFileSync(target, `${target}.backup-${Date.now()}`)
      copyFileSync(source, target)
    } else if (!existsSync(target)) copyFileSync(source, target)
  }
}
function python311(command, args) {
  const result = spawnSync(command, [...args, '-c', 'import sys,struct; assert sys.version_info[:2] == (3,11) and struct.calcsize("P") == 8; print(sys.executable)'], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } })
  return result.status === 0 ? result.stdout.trim() : null
}
function setup() {
  let base
  for (const [command, args] of [['py', ['-3.11']], ['python3.11', []], ['python', []], ['python3', []]]) {
    base = python311(command, args)
    if (base) break
  }
  if (!base) fail('Install Python 3.11 (64-bit), then reopen VS Code and run setup again.')
  // A copied venv may run but still reference packages from the previous location.
  const marker = resolve(root, 'backend/.venv/.sketch2spec-location')
  const owned = existsSync(marker) && readFileSync(marker, 'utf8') === python
  if (existsSync('backend/.venv') && (!owned || !python311(python, []))) {
    const backup = `backend/.venv.backup-${Date.now()}`
    renameSync('backend/.venv', backup)
    console.log(`Previous virtual environment preserved at ${backup}`)
  }
  if (!existsSync(python)) run(base, ['-m', 'venv', 'backend/.venv'])
  writeFileSync(marker, python)
  run(python, ['-m', 'pip', 'install', '--upgrade', 'pip'])
  if (process.platform === 'darwin') {
    run(python, ['-m', 'pip', 'install', 'torch==2.6.0', 'torchvision==0.21.0'])
  } else {
    run(python, ['-m', 'pip', 'install', 'torch==2.6.0', 'torchvision==0.21.0', '--index-url', 'https://download.pytorch.org/whl/cpu'])
  }
  run(python, ['-m', 'pip', 'install', '-r', 'backend/requirements.txt'])
  run(python, ['-m', 'pip', 'check'])
  npm(['ci'])
  config()
  run(python, ['backend/check_install.py'])
  console.log('\nSetup complete. Run: npm.cmd run local (Windows) or npm run local (macOS/Linux).')
}
async function freePort(port) {
  await new Promise((ok, reject) => {
    const server = net.createServer()
    server.once('error', () => reject(new Error(`Port ${port} is busy. Close the previous server and retry. No process was stopped.`)))
    server.listen(port, '127.0.0.1', () => server.close(ok))
  })
}
async function start() {
  if (!existsSync(python) || !existsSync('node_modules/next/dist/bin/next')) fail('Run setup first: npm.cmd run setup')
  config()
  const front = { ...readEnv('.env.local'), ...process.env }
  const back = { ...readEnv('backend/.env'), ...process.env }
  if (front.DETECTION_API_URL !== 'http://127.0.0.1:8001' || back.AUTH_ENV !== 'development') {
    fail('Local launcher requires local development settings. To back up and reset the two .env files, run: npm.cmd run setup -- --local-config')
  }
  for (const settings of [front, back]) {
    if (!(settings.AUTH_ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).includes('http://localhost:3000')) fail('Add http://localhost:3000 to AUTH_ALLOWED_ORIGINS in both .env files.')
  }
  if (back.AUTH_COOKIE_SECURE !== 'false') fail('Local HTTP login needs AUTH_COOKIE_SECURE=false in backend/.env.')
  await freePort(3000)
  await freePort(8001)
  run(python, ['backend/check_install.py'])
  const children = []
  let stopping = false
  function stop(code = 0) {
    if (stopping) return
    stopping = true
    for (const child of children) {
      if (windows && child.pid && child.exitCode === null) {
        spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
      } else child.kill()
    }
    process.exitCode = code
  }
  process.on('SIGINT', () => stop())
  process.on('SIGTERM', () => stop())
  function launch(command, args) {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit' })
    children.push(child)
    child.on('error', error => { console.error(error.message); stop(1) })
    child.on('exit', code => { if (!stopping) stop(code ?? 1) })
    return child
  }
  launch(python, ['-m', 'uvicorn', 'main:app', '--app-dir', 'backend', '--env-file', 'backend/.env', '--host', '127.0.0.1', '--port', '8001'])
  let ready = false
  for (let attempt = 0; attempt < 120 && !stopping; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:8001/health', { signal: AbortSignal.timeout(1000) })
      if (response.ok) { ready = true; break }
    } catch { /* Backend still starting. */ }
    await new Promise(ok => setTimeout(ok, 500))
  }
  if (!ready) { stop(1); fail('Backend did not start. Check its error above.') }
  if (!stopping) {
    launch(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3000'])
    console.log('\nOpen http://localhost:3000/login after Next.js says Ready. Press Ctrl+C to stop both servers.')
  }
}
try {
  if (!(major === 22 && minor >= 13 || major >= 24)) fail('Use Node.js 22.13+ (22.x) or 24+. The included PDF library requires it.')
  if (action === 'setup') setup()
  else if (action === 'start') await start()
  else fail(`Unknown action: ${action}`)
} catch (error) {
  console.error(`\nSketch2Spec: ${error.message}`)
  process.exitCode = 1
}
