import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { LocalWorkspaceManager } from '../src/services/WorkspaceManager.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('WorkspaceManager', () => {
  let workspaceManager: LocalWorkspaceManager;
  let tempDir: string;
  let mockExec: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = path.join(os.tmpdir(), `workspace-test-${Date.now()}`);
    mockExec = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    workspaceManager = new LocalWorkspaceManager(tempDir, mockExec as any);
  });

  describe('prepare()', () => {
    it('clones repository when workspace does not exist', async () => {
      const projectId = 'test-project-1';
      const params = {
        projectId,
        githubOwner: 'owner',
        githubRepo: 'repo',
        branch: 'main',
        token: 'test-token',
      };

      mockExec.mockResolvedValue({ stdout: '', stderr: '' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(workspaceManager as any, 'exists').mockResolvedValueOnce(false);
      vi.spyOn(fs, 'mkdir').mockResolvedValueOnce(undefined);

      const workspacePath = await workspaceManager.prepare(params);

      expect(workspacePath).toBe(path.join(tempDir, projectId));
      expect(mockExec).toHaveBeenCalledWith(
        'git',
        ['clone', '--branch', 'main', 'https://x-access-token:test-token@github.com/owner/repo.git', workspacePath]
      );
    });

    it('pulls latest changes when workspace exists', async () => {
      const projectId = 'test-project-2';
      const params = {
        projectId,
        githubOwner: 'owner',
        githubRepo: 'repo',
        branch: 'main',
        token: 'test-token',
      };

      mockExec.mockResolvedValue({ stdout: '', stderr: '' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(workspaceManager as any, 'exists').mockResolvedValueOnce(true);

      const workspacePath = await workspaceManager.prepare(params);

      expect(workspacePath).toBe(path.join(tempDir, projectId));
      expect(mockExec).toHaveBeenCalledWith('git', ['fetch', 'origin'], { cwd: workspacePath });
      expect(mockExec).toHaveBeenCalledWith('git', ['checkout', 'main'], { cwd: workspacePath });
      expect(mockExec).toHaveBeenCalledWith(
        'git',
        ['reset', '--hard', 'origin/main'],
        { cwd: workspacePath }
      );
    });

    it('builds clone URL with token correctly', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const manager = workspaceManager as any;
      const url = manager.buildCloneUrl('my-token', 'owner', 'repo');
      expect(url).toBe('https://x-access-token:my-token@github.com/owner/repo.git');
    });
  });

  describe('pushBranch()', () => {
    it('creates and pushes a new branch', async () => {
      const workspacePath = path.join(tempDir, 'test-workspace');
      const params = {
        workspacePath,
        branchName: 'feature-branch',
        token: 'test-token',
        githubOwner: 'owner',
        githubRepo: 'repo',
      };

      mockExec.mockResolvedValue({ stdout: '', stderr: '' });

      await workspaceManager.pushBranch(params);

      expect(mockExec).toHaveBeenCalledWith(
        'git',
        ['checkout', '-b', 'feature-branch'],
        { cwd: workspacePath }
      );
      expect(mockExec).toHaveBeenCalledWith(
        'git',
        ['push', '-u', 'origin', 'feature-branch'],
        { cwd: workspacePath }
      );
    });
  });

  describe('cleanup()', () => {
    it('removes workspace directory', async () => {
      const workspacePath = path.join(tempDir, 'test-workspace');
      
      vi.spyOn(fs, 'rm').mockResolvedValueOnce(undefined);

      await workspaceManager.cleanup(workspacePath);

      expect(fs.rm).toHaveBeenCalledWith(workspacePath, { recursive: true, force: true });
    });
  });

  describe('exists()', () => {
    it('returns false for non-existent path', async () => {
      vi.spyOn(fs, 'stat').mockRejectedValueOnce(new Error('ENOENT'));

      const result = await workspaceManager.exists('/non/existent/path');
      expect(result).toBe(false);
    });

    it('returns true for valid git directory', async () => {
      const workspacePath = path.join(tempDir, 'test-workspace');
      
      vi.spyOn(fs, 'stat').mockResolvedValueOnce({
        isDirectory: () => true,
      } as import('fs').Stats);

      const result = await workspaceManager.exists(workspacePath);
      expect(result).toBe(true);
    });

    it('returns false for directory without .git', async () => {
      const testDir = path.join(tempDir, 'no-git-dir');
      
      vi.spyOn(fs, 'stat').mockRejectedValueOnce(new Error('ENOENT'));

      const result = await workspaceManager.exists(testDir);
      expect(result).toBe(false);
    });
  });
});
