import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const defaultExec = promisify(execFile);

type ExecFunction = typeof defaultExec;

function formatExecError(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return '';
  }

  const parts = [
    'message' in error && typeof error.message === 'string' ? error.message : '',
    'stdout' in error && typeof error.stdout === 'string' ? error.stdout : '',
    'stderr' in error && typeof error.stderr === 'string' ? error.stderr : '',
  ];

  return parts.filter(Boolean).join('\n');
}

export interface PrepareWorkspaceParams {
  projectId: string;
  githubOwner: string;
  githubRepo: string;
  branch: string;
  token: string;
}

export interface PushBranchParams {
  workspacePath: string;
  branchName: string;
  token: string;
  githubOwner: string;
  githubRepo: string;
}

export interface WorkspaceManager {
  prepare(params: PrepareWorkspaceParams): Promise<string>;

  pushBranch(params: PushBranchParams): Promise<void>;

  cleanup(workspacePath: string): Promise<void>;

  exists(workspacePath: string): Promise<boolean>;
}

export class LocalWorkspaceManager implements WorkspaceManager {
  private exec: ExecFunction;

  constructor(
    private baseDir: string,
    exec?: ExecFunction
  ) {
    this.exec = exec || defaultExec;
  }

  async prepare(params: PrepareWorkspaceParams): Promise<string> {
    const workspacePath = this.resolveWorkspacePath(params);

    if (await this.exists(workspacePath)) {
      try {
        return await this.pull(params);
      } catch (err) {
        console.warn(`Workspace pull failed for ${params.projectId}, using existing state:`, err);
      }
    } else {
      return await this.clone(params);
    }

    return workspacePath;
  }

  async clone(params: PrepareWorkspaceParams): Promise<string> {
    const workspacePath = this.resolveWorkspacePath(params);
    await fs.mkdir(path.dirname(workspacePath), { recursive: true });
    const cloneUrl = this.buildCloneUrl(params.token, params.githubOwner, params.githubRepo);
    try {
      await this.exec('git', ['clone', '--branch', params.branch, cloneUrl, workspacePath]);
    } catch (error) {
      const formattedError = formatExecError(error);
      if (
        !formattedError.includes('Remote branch') ||
        !formattedError.includes('not found in upstream origin')
      ) {
        throw error;
      }

      await this.exec('git', ['clone', cloneUrl, workspacePath]);
    }
    return workspacePath;
  }

  async pull(params: PrepareWorkspaceParams): Promise<string> {
    const workspacePath = this.resolveWorkspacePath(params);
    await this.setRemoteToken(workspacePath, params.token, params.githubOwner, params.githubRepo);
    await this.exec('git', ['fetch', 'origin'], { cwd: workspacePath });
    await this.exec('git', ['checkout', params.branch], { cwd: workspacePath });
    await this.exec('git', ['reset', '--hard', `origin/${params.branch}`], { cwd: workspacePath });
    return workspacePath;
  }

  async pushBranch(params: PushBranchParams): Promise<void> {
    await this.setRemoteToken(params.workspacePath, params.token, params.githubOwner, params.githubRepo);
    
    await this.exec('git', ['checkout', '-b', params.branchName], { cwd: params.workspacePath }).catch(() => {
      return this.exec('git', ['checkout', params.branchName], { cwd: params.workspacePath });
    });
    
    await this.exec('git', ['push', '-u', 'origin', params.branchName], { cwd: params.workspacePath });
  }

  async cleanup(workspacePath: string): Promise<void> {
    await fs.rm(workspacePath, { recursive: true, force: true });
  }

  async exists(workspacePath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(path.join(workspacePath, '.git'));
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  buildCloneUrl(token: string, owner: string, repo: string): string {
    return `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
  }

  private resolveWorkspacePath(params: Pick<PrepareWorkspaceParams, 'projectId' | 'githubOwner' | 'githubRepo'>): string {
    return path.join(this.baseDir, params.githubOwner, params.githubRepo, params.projectId);
  }

  private async setRemoteToken(
    workspacePath: string,
    token: string,
    owner: string,
    repo: string
  ): Promise<void> {
    const url = this.buildCloneUrl(token, owner, repo);
    await this.exec('git', ['remote', 'set-url', 'origin', url], { cwd: workspacePath });
  }
}
