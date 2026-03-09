import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { GitHubService } from '../src/services/GitHubService.js';
import type { GitHubConnectionRepository } from '../src/db/repositories/contracts.js';

describe('GitHubService', () => {
  let service: GitHubService;
  let mockRepo: GitHubConnectionRepository;
  const encryptionKey = crypto.randomBytes(32);
  const clientId = 'test-client-id';
  const clientSecret = 'test-client-secret';
  const callbackUrl = 'http://localhost:3003/auth/github/callback';

  beforeEach(() => {
    mockRepo = {
      create: vi.fn(),
      findByUserId: vi.fn(),
      delete: vi.fn(),
    };
    service = new GitHubService(
      mockRepo,
      clientId,
      clientSecret,
      callbackUrl,
      encryptionKey
    );
    vi.clearAllMocks();
  });

  describe('encrypt/decrypt', () => {
    it('should round-trip correctly', () => {
      const plaintext = 'ghp_testtoken123456';
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext', () => {
      const plaintext = 'ghp_testtoken123456';
      const encrypted1 = service.encrypt(plaintext);
      const encrypted2 = service.encrypt(plaintext);
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should include IV and auth tag in ciphertext', () => {
      const plaintext = 'ghp_testtoken123456';
      const encrypted = service.encrypt(plaintext);
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toMatch(/^[0-9a-f]{32}$/);
      expect(parts[1]).toMatch(/^[0-9a-f]{32}$/);
      expect(parts[2]).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('getAuthorizationUrl', () => {
    it('should produce correct URL with all params', () => {
      const state = 'test-state-123';
      const url = service.getAuthorizationUrl(state);
      
      expect(url).toContain('https://github.com/login/oauth/authorize');
      expect(url).toContain(`client_id=${clientId}`);
      expect(url).toContain(`redirect_uri=${encodeURIComponent(callbackUrl)}`);
      expect(url).toContain('scope=repo');
      expect(url).toContain(`state=${state}`);
    });
  });

  describe('connect', () => {
    it('should exchange code for token and store encrypted connection', async () => {
      const userId = 'user-123';
      const code = 'test-code';
      const accessToken = 'ghp_testtoken123456';
      const scope = 'repo';
      const githubUserId = 12345;
      const githubUsername = 'testuser';

      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: accessToken, scope }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: githubUserId, login: githubUsername }),
        });

      const record = await service.connect(userId, code);

      expect(record.userId).toBe(userId);
      expect(record.githubUserId).toBe(githubUserId);
      expect(record.githubUsername).toBe(githubUsername);
      expect(record.scope).toBe(scope);
      expect(record.accessToken).not.toBe(accessToken);
      expect(service.decrypt(record.accessToken)).toBe(accessToken);
      expect(mockRepo.delete).toHaveBeenCalledWith(userId);
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('should throw on OAuth error', async () => {
      const userId = 'user-123';
      const code = 'invalid-code';

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ error: 'bad_verification_code', error_description: 'The code passed is incorrect or expired.' }),
      });

      await expect(service.connect(userId, code)).rejects.toThrow('GitHub OAuth error');
    });

    it('should throw on user fetch error', async () => {
      const userId = 'user-123';
      const code = 'test-code';

      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'token', scope: 'repo' }),
        })
        .mockResolvedValueOnce({
          ok: false,
        });

      await expect(service.connect(userId, code)).rejects.toThrow('Failed to fetch GitHub user');
    });
  });

  describe('getConnection', () => {
    it('should return connection for user', async () => {
      const userId = 'user-123';
      const mockConnection = {
        id: 'conn-1',
        userId,
        githubUserId: 12345,
        githubUsername: 'testuser',
        accessToken: 'encrypted-token',
        scope: 'repo',
        connectedAt: Date.now(),
      };

      mockRepo.findByUserId = vi.fn().mockResolvedValue(mockConnection);

      const conn = await service.getConnection(userId);
      expect(conn).toEqual(mockConnection);
      expect(mockRepo.findByUserId).toHaveBeenCalledWith(userId);
    });

    it('should return null if no connection exists', async () => {
      mockRepo.findByUserId = vi.fn().mockResolvedValue(null);

      const conn = await service.getConnection('user-123');
      expect(conn).toBeNull();
    });
  });

  describe('getDecryptedToken', () => {
    it('should return decrypted token for user', async () => {
      const userId = 'user-123';
      const plaintext = 'ghp_testtoken123456';
      const encrypted = service.encrypt(plaintext);

      mockRepo.findByUserId = vi.fn().mockResolvedValue({
        id: 'conn-1',
        userId,
        githubUserId: 12345,
        githubUsername: 'testuser',
        accessToken: encrypted,
        scope: 'repo',
        connectedAt: Date.now(),
      });

      const token = await service.getDecryptedToken(userId);
      expect(token).toBe(plaintext);
    });

    it('should throw if no connection exists', async () => {
      mockRepo.findByUserId = vi.fn().mockResolvedValue(null);

      await expect(service.getDecryptedToken('user-123')).rejects.toThrow('No GitHub connection found');
    });
  });

  describe('disconnect', () => {
    it('should delete connection for user', async () => {
      const userId = 'user-123';
      await service.disconnect(userId);
      expect(mockRepo.delete).toHaveBeenCalledWith(userId);
    });
  });

  describe('listRepos', () => {
    it('should return repos with pagination', async () => {
      const token = 'ghp_testtoken123456';
      const mockRepos = [
        { id: 1, full_name: 'owner/repo1', private: false, default_branch: 'main', html_url: 'https://github.com/owner/repo1' },
        { id: 2, full_name: 'owner/repo2', private: true, default_branch: 'develop', html_url: 'https://github.com/owner/repo2' },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockRepos,
      });

      const result = await service.listRepos(token);

      expect(result.repos).toHaveLength(2);
      expect(result.repos[0]).toEqual({
        id: 1,
        fullName: 'owner/repo1',
        private: false,
        defaultBranch: 'main',
        htmlUrl: 'https://github.com/owner/repo1',
      });
      expect(result.hasMore).toBe(false);
    });

    it('should detect hasMore when page is full', async () => {
      const token = 'ghp_testtoken123456';
      const mockRepos = Array(30).fill(null).map((_, i) => ({
        id: i,
        full_name: `owner/repo${i}`,
        private: false,
        default_branch: 'main',
        html_url: `https://github.com/owner/repo${i}`,
      }));

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockRepos,
      });

      const result = await service.listRepos(token, 1, 30);
      expect(result.hasMore).toBe(true);
    });

    it('should throw on API error', async () => {
      const token = 'invalid-token';

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
      });

      await expect(service.listRepos(token)).rejects.toThrow('Failed to list repos');
    });
  });

  describe('getAuthenticatedUser', () => {
    it('should return user info', async () => {
      const token = 'ghp_testtoken123456';

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 12345, login: 'testuser' }),
      });

      const user = await service.getAuthenticatedUser(token);
      expect(user).toEqual({ id: 12345, login: 'testuser' });
    });

    it('should throw on API error', async () => {
      const token = 'invalid-token';

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
      });

      await expect(service.getAuthenticatedUser(token)).rejects.toThrow('Failed to fetch GitHub user');
    });
  });
});
