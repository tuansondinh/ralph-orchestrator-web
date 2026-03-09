import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const defaultExec = promisify(execFile);

type ExecFunction = typeof defaultExec;

export interface WorkspaceManager {
  prepare(params: {
    projectId: string;
    githubOwner: string;
    githubRepo: string;
    branch: string;
    token: string;
  }): Promise<string>;

  pushBranch(params: {
    workspacePath: string;
    branchName: string;
    token: string;
    githubOwner: string;
    githubRepo: string;
  }): Promise<void>;

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

  async prepare(params: {
    projectId: string;
    githubOwner: string;
    githubRepo: string;
    branch: string;
    token: string;
  }): Promise<string> {
    const workspacePath = path.join(this.baseDir, params.projectId);

    if (await this.exists(workspacePath)) {
      try {
        await this.setRemoteToken(workspacePath, params.token, params.githubOwner, params.githubRepo);
        await this.exec('git', ['fetch', 'origin'], { cwd: workspacePath });
        await this.exec('git', ['checkout', params.branch], { cwd: workspacePath });
        await this.exec('git', ['reset', '--hard', `origin/${params.branch}`], { cwd: workspacePath });
      } catch (err) {
        console.warn(`Workspace pull failed for ${params.projectId}, using existing state:`, err);
      }
    } else {
      await fs.mkdir(this.baseDir, { recursive: true });
      const cloneUrl = this.buildCloneUrl(params.token, params.githubOwner, params.githubRepo);
      await this.exec('git', ['clone', '--branch', params.branch, cloneUrl, workspacePath]);
    }

    return workspacePath;
  }

  async pushBranch(params: {
    workspacePath: string;
    branchName: string;
    token: string;
    githubOwner: string;
    githubRepo: string;
  }): Promise<void> {
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
