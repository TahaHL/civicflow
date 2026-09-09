/* global process */
import { spawn } from 'node:child_process'

const processes = [
  spawn(process.execPath, ['--env-file-if-exists=.env', '--watch', 'server/server.js'], { stdio: 'inherit' }),
  spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev:client'], { stdio: 'inherit' }),
]

function stop() {
  processes.forEach((process) => process.kill())
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
processes.forEach((child) => child.on('exit', (code) => {
  if (code && code !== 0) process.exitCode = code
}))
