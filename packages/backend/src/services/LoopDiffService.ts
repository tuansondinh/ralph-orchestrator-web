import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { projects, schema, type LoopRun } from '../db/schema.js'
import { parseDiff, type DiffFile } from '../lib/parseDiff.js'
import { ServiceError } from '../lib/ServiceError.js'
import { parsePersistedConfig } from './loopUtils.js'

type Database = BetterSQLite3Database<typeof schema>

const execFile = promisify(execFileCallback)

export interface LoopDiffStats {
  filesChanged: number
  additions: number
  deletions: number
}

export interface LoopDiff {
  available: boolean
  reason?: string
  baseBranch?: string
  worktreeBranch?: string
  files?: DiffFile[]
  stats?: LoopDiffStats
}

function isMissingGitRevisionError(output: string): boolean {
  return /\b(invalid revision range|bad revision|unknown revision|bad object|ambiguous argument)\b/i.test(
    output
  )
}

function getErrorOutput(error: unknown): string {
  if (error && typeof error === 'object' && 'stderr' in error) {
    const stderr = error.stderr
    if (typeof stderr === 'string' && stderr.trim()) {
      return stderr.trim()
    }
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown error'
}

function summarizeDiff(files: DiffFile[]): LoopDiffStats {
  return files.reduce(
    (summary, file) => ({
      filesChanged: summary.filesChanged + 1,
      additions: summary.additions + file.additions,
      deletions: summary.deletions + file.deletions
    }),
    {
      filesChanged: 0,
      additions: 0,
      deletions: 0
    } satisfies LoopDiffStats
  )
}

export class LoopDiffService {
  constructor(private readonly db: Database) {}

  async getDiff(run: LoopRun, project: { id: string; path: string }): Promise<LoopDiff> {
    const persistedConfig = parsePersistedConfig(run.config)

    if (run.worktree) {
      const baseBranch = await this.resolveDefaultBaseBranch(project.path)

      let rawDiff = ''
      try {
        const worktreePath = await this.resolveWorktreePath(project.path, run.worktree)
        if (worktreePath) {
          const hasStartCommit = persistedConfig.startCommit
            ? await this.commitExists(worktreePath, persistedConfig.startCommit)
            : false
          const diffBase =
            hasStartCommit
              ? persistedConfig.startCommit
              : await this.resolveMergeBase(worktreePath, baseBranch, 'HEAD')

          if (diffBase) {
            const result = await execFile('git', ['diff', diffBase, '--'], {
              cwd: worktreePath,
              encoding: 'utf8'
            })
            rawDiff = result.stdout
          } else {
            const result = await execFile(
              'git',
              ['diff', `${baseBranch}...${run.worktree}`, '--'],
              {
                cwd: project.path,
                encoding: 'utf8'
              }
            )
            rawDiff = result.stdout
          }
        } else {
          const result = await execFile(
            'git',
            ['diff', `${baseBranch}...${run.worktree}`, '--'],
            {
              cwd: project.path,
              encoding: 'utf8'
            }
          )
          rawDiff = result.stdout
        }
      } catch (error) {
        throw new ServiceError(
          'BAD_REQUEST',
          `Unable to load diff for loop: ${getErrorOutput(error)}`
        )
      }

      const files = parseDiff(rawDiff)
      return {
        available: true,
        baseBranch,
        worktreeBranch: run.worktree,
        files,
        stats: summarizeDiff(files)
      }
    }

    if (!persistedConfig.startCommit || !persistedConfig.endCommit) {
      return {
        available: false,
        reason: 'No worktree configured and commit-range metadata is unavailable for this loop.'
      }
    }

    const [hasStartCommit, hasEndCommit] = await Promise.all([
      this.commitExists(project.path, persistedConfig.startCommit),
      this.commitExists(project.path, persistedConfig.endCommit)
    ])
    if (!hasEndCommit) {
      const missing = !hasStartCommit ? 'start and end commits' : 'end commit'
      return {
        available: false,
        reason: `Stored commit-range metadata is no longer available in this repository (missing ${missing}).`
      }
    }

    let diffStartCommit = persistedConfig.startCommit
    if (!hasStartCommit) {
      const fallbackStartCommit = await this.resolveParentCommit(
        project.path,
        persistedConfig.endCommit
      )
      if (!fallbackStartCommit) {
        return {
          available: false,
          reason:
            'Stored commit-range metadata is no longer available in this repository (missing start commit).'
        }
      }
      diffStartCommit = fallbackStartCommit
    }

    let rawDiff = ''
    try {
      const result = await execFile(
        'git',
        ['diff', `${diffStartCommit}..${persistedConfig.endCommit}`, '--'],
        {
          cwd: project.path,
          encoding: 'utf8'
        }
      )
      rawDiff = result.stdout
    } catch (error) {
      const output = getErrorOutput(error)
      if (isMissingGitRevisionError(output)) {
        return {
          available: false,
          reason: 'Stored commit-range metadata is no longer available in this repository.'
        }
      }
      throw new ServiceError(
        'BAD_REQUEST',
        `Unable to load commit-range diff for loop: ${output}`
      )
    }

    const files = parseDiff(rawDiff)
    return {
      available: true,
      baseBranch: diffStartCommit,
      worktreeBranch: persistedConfig.endCommit,
      files,
      stats: summarizeDiff(files)
    }
  }

  async resolveWorktreePath(projectPath: string, branch: string): Promise<string | null> {
    try {
      const result = await execFile('git', ['worktree', 'list', '--porcelain'], {
        cwd: projectPath,
        encoding: 'utf8'
      })
      const expectedRefs = new Set([
        branch,
        `refs/heads/${branch}`,
        `refs/remotes/origin/${branch}`
      ])
      const blocks = result.stdout.trim().split(/\n{2,}/)
      for (const block of blocks) {
        if (!block.trim()) {
          continue
        }
        let candidatePath: string | null = null
        let candidateBranch: string | null = null
        for (const rawLine of block.split('\n')) {
          const line = rawLine.trim()
          if (line.startsWith('worktree ')) {
            candidatePath = line.slice('worktree '.length).trim()
          } else if (line.startsWith('branch ')) {
            candidateBranch = line.slice('branch '.length).trim()
          }
        }

        if (candidatePath && candidateBranch && expectedRefs.has(candidateBranch)) {
          return candidatePath
        }
      }
    } catch {
      return null
    }

    return null
  }

  private async resolveDefaultBaseBranch(projectPath: string): Promise<string> {
    let baseBranch = 'main'
    try {
      const result = await execFile(
        'git',
        ['symbolic-ref', 'refs/remotes/origin/HEAD'],
        {
          cwd: projectPath,
          encoding: 'utf8'
        }
      )
      const resolvedBranch = result.stdout
        .trim()
        .replace(/^refs\/remotes\/origin\//, '')
      if (resolvedBranch) {
        baseBranch = resolvedBranch
      }
    } catch {
      // Fall back to "main" when origin/HEAD is unavailable.
    }

    return baseBranch
  }

  private async commitExists(projectPath: string, commit: string): Promise<boolean> {
    try {
      await execFile('git', ['cat-file', '-e', `${commit}^{commit}`], {
        cwd: projectPath
      })
      return true
    } catch {
      return false
    }
  }

  private async resolveParentCommit(
    projectPath: string,
    commit: string
  ): Promise<string | null> {
    try {
      const result = await execFile('git', ['rev-parse', `${commit}^`], {
        cwd: projectPath,
        encoding: 'utf8'
      })
      const resolved = result.stdout.trim()
      return resolved.length > 0 ? resolved : null
    } catch {
      return null
    }
  }

  private async resolveMergeBase(
    projectPath: string,
    baseRef: string,
    headRef: string
  ): Promise<string | null> {
    try {
      const result = await execFile('git', ['merge-base', baseRef, headRef], {
        cwd: projectPath,
        encoding: 'utf8'
      })
      const commit = result.stdout.trim()
      return commit.length > 0 ? commit : null
    } catch {
      return null
    }
  }
}
