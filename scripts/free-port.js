const { execSync } = require('child_process')

const port = process.argv[2] || process.env.PORT || '5000'

function freePortWindows() {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' })
    const pids = new Set()

    for (const line of out.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.includes('LISTENING')) continue
      const pid = trimmed.split(/\s+/).pop()
      if (pid && /^\d+$/.test(pid) && pid !== String(process.pid)) pids.add(pid)
    }

    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' })
        console.log(`Freed port ${port} (stopped PID ${pid})`)
      } catch {
        /* already gone */
      }
    }
  } catch {
    /* port already free */
  }
}

function freePortUnix() {
  try {
    execSync(`lsof -ti tcp:${port} | xargs -r kill -9`, { stdio: 'ignore' })
    console.log(`Freed port ${port}`)
  } catch {
    /* port already free */
  }
}

if (process.platform === 'win32') {
  freePortWindows()
} else {
  freePortUnix()
}
