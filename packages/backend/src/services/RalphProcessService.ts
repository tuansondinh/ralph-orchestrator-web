import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)
const SHELL_WRAPPERS = new Set(['node', 'nodejs', 'bun', 'tsx', 'bash', 'sh', 'zsh'])
const WRAPPER_OPTIONS_WITH_VALUE = new Set([
  '--conditions',
  '--require',
  '-r',
  '--loader',
  '--experimental-loader',
  '--import',
  '-c'
])

function stripQuotes(token: string) {
  return token.replace(/^['"]+|['"]+$/g, '')
}

function isRalphExecutableToken(token: string) {
  const normalized = stripQuotes(token).toLowerCase()
  if (normalized === 'ralph') {
    return true
  }

  return /(^|[\\/])ralph(\.cmd|\.exe)?$/i.test(normalized)
}

function extractInvokedToken(tokens: string[]) {
  if (tokens.length === 0) {
    return null
  }

  const executable = stripQuotes(tokens[0]).toLowerCase()
  if (!SHELL_WRAPPERS.has(executable)) {
    return stripQuotes(tokens[0])
  }

  for (let index = 1; index < tokens.length; index += 1) {
    const token = stripQuotes(tokens[index] ?? '')
    if (!token) {
      continue
    }

    if (token === '--' && index + 1 < tokens.length) {
      return stripQuotes(tokens[index + 1] ?? '')
    }

    if (WRAPPER_OPTIONS_WITH_VALUE.has(token)) {
      index += 1
      continue
    }

    if (token.startsWith('-')) {
      continue
    }

    return token
  }

  return null
}

export function isLikelyRalphCommand(command: string) {
  const tokens = command.trim().split(/\s+/).filter(Boolean)
  const invoked = extractInvokedToken(tokens)
  return Boolean(invoked && isRalphExecutableToken(invoked))
}

function parseProcessLine(line: string): RalphProcess | null {
  const parts = line.trim().split(/\s+/)
  if (parts.length < 10) {
    return null
  }

  const pid = Number.parseInt(parts[1] ?? '', 10)
  if (!Number.isFinite(pid)) {
    return null
  }

  return {
    user: parts[0] ?? 'unknown',
    pid,
    cpu: parts[2] ?? '0',
    mem: parts[3] ?? '0',
    startedAt: parts.slice(4, 9).join(' '),
    command: parts.slice(9).join(' ')
  }
}

export interface RalphProcess {
  pid: number
  user: string
  cpu: string
  mem: string
  command: string
  startedAt: string
}

export class RalphProcessService {
  async list(): Promise<RalphProcess[]> {
    try {
      const { stdout } = await execAsync('ps -axo user,pid,pcpu,pmem,lstart,command')

      return stdout
        .split(/\r?\n/)
        .slice(1)
        .map((line) => parseProcessLine(line))
        .filter((proc): proc is RalphProcess => Boolean(proc))
        .filter((proc) => isLikelyRalphCommand(proc.command))
    } catch (error) {
      return []
    }
  }

  async kill(pid: number): Promise<void> {
    try {
      await execAsync(`kill -9 ${pid}`)
    } catch (error) {
      throw new Error(`Failed to kill process ${pid}: ${(error as Error).message}`)
    }
  }

  async killAll(): Promise<void> {
    try {
      // Get all Ralph pids first, then filter out the dev server pids before killing
      const processes = await this.list()
      const pidsToKill = processes.map(p => p.pid)
      
      if (pidsToKill.length > 0) {
        await execAsync(`kill -9 ${pidsToKill.join(' ')}`)
      }
    } catch (error) {
      // If no processes found or kill fails
    }
  }
}
