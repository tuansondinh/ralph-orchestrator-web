import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'

export interface BranchInfo {
  name: string
  current: boolean
  remote?: string
  lastCommit?: string
}

export interface PushResult {
  branch: string
  remote: string
}

export interface CreatePROptions {
  owner: string
  repo: string
  title: string
  body: string
  head: string
  base: string
  draft?: boolean
  token: string
}

export interface PRResult {
  number: number
  url: string
  title: string
}

type ExecFileResult = {
  stdout: string
  stderr: string
}

type ExecFile = (
  args: string[],
  options: {
    cwd: string
    encoding: 'utf8'
  }
) => Promise<ExecFileResult>

const execGitFile = promisify(execFileCallback)

const defaultExecFile: ExecFile = async (args, options) =>
  await execGitFile('git', args, options)

export interface GitServiceOptions {
  execFile?: ExecFile
  fetch?: typeof fetch
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'stderr' in error) {
    const stderr = error.stderr
    if (typeof stderr === 'string' && stderr.trim()) {
      return stderr.trim()
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return 'Unknown error'
}

function parseBranchLine(line: string): BranchInfo | null {
  const trimmed = line.trim()
  if (!trimmed) {
    return null
  }

  const current = trimmed.startsWith('* ')
  const branch = (current ? trimmed.slice(2) : trimmed).trim()
  if (!branch || branch.includes('->')) {
    return null
  }

  if (!branch.startsWith('remotes/')) {
    return {
      name: branch,
      current
    }
  }

  const parts = branch.split('/')
  if (parts.length < 3) {
    return null
  }

  return {
    name: parts.slice(2).join('/'),
    current: false,
    remote: parts[1]
  }
}

export class GitService {
  private readonly execFile: ExecFile
  private readonly fetchImpl: typeof fetch

  constructor(options: GitServiceOptions = {}) {
    this.execFile = options.execFile ?? defaultExecFile
    this.fetchImpl = options.fetch ?? fetch
  }

  async listBranches(projectPath: string): Promise<BranchInfo[]> {
    try {
      const result = await this.execFile(['branch', '-a', '--no-color'], {
        cwd: projectPath,
        encoding: 'utf8'
      })

      return result.stdout
        .split('\n')
        .map((line) => parseBranchLine(line))
        .filter((branch): branch is BranchInfo => branch !== null)
    } catch (error) {
      throw new Error(`Failed to list branches: ${getErrorMessage(error)}`)
    }
  }

  async getCurrentBranch(projectPath: string): Promise<string> {
    try {
      const result = await this.execFile(['branch', '--show-current'], {
        cwd: projectPath,
        encoding: 'utf8'
      })
      return result.stdout.trim()
    } catch (error) {
      throw new Error(`Failed to get current branch: ${getErrorMessage(error)}`)
    }
  }

  async createBranch(projectPath: string, name: string, baseBranch: string): Promise<void> {
    try {
      await this.execFile(['checkout', '-b', name, baseBranch], {
        cwd: projectPath,
        encoding: 'utf8'
      })
    } catch (error) {
      throw new Error(getErrorMessage(error))
    }
  }

  async checkoutBranch(projectPath: string, name: string): Promise<void> {
    try {
      await this.execFile(['checkout', name], {
        cwd: projectPath,
        encoding: 'utf8'
      })
    } catch (error) {
      throw new Error(`Failed to checkout branch: ${getErrorMessage(error)}`)
    }
  }

  async push(projectPath: string, branch: string, remote = 'origin'): Promise<PushResult> {
    try {
      await this.execFile(['push', '--set-upstream', remote, branch], {
        cwd: projectPath,
        encoding: 'utf8'
      })
      return { branch, remote }
    } catch (error) {
      throw new Error(`Failed to push branch: ${getErrorMessage(error)}`)
    }
  }

  async createPullRequest(options: CreatePROptions): Promise<PRResult> {
    const response = await this.fetchImpl(
      `https://api.github.com/repos/${options.owner}/${options.repo}/pulls`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: options.title,
          body: options.body,
          head: options.head,
          base: options.base,
          draft: options.draft ?? false
        })
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to create pull request: ${errorText || response.status}`)
    }

    const data = (await response.json()) as {
      number: number
      html_url: string
      title: string
    }

    return {
      number: data.number,
      url: data.html_url,
      title: data.title
    }
  }
}
