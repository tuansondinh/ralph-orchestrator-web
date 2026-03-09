import crypto from 'crypto';
import type { GitHubConnectionRepository, GitHubConnectionRecord } from '../db/repositories/contracts.js';

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

export class GitHubService {
  constructor(
    private githubConnectionRepo: GitHubConnectionRepository,
    private clientId: string,
    private clientSecret: string,
    private callbackUrl: string,
    private encryptionKey: Buffer,
  ) {}

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.callbackUrl,
      scope: 'repo',
      state,
    });
    return `https://github.com/login/oauth/authorize?${params}`;
  }

  async exchangeCodeForToken(code: string): Promise<{
    accessToken: string;
    scope: string;
  }> {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
      }),
    });
    const data = await response.json() as any;
    if (data.error) throw new Error(`GitHub OAuth error: ${data.error_description}`);
    return { accessToken: data.access_token, scope: data.scope };
  }

  async getAuthenticatedUser(token: string): Promise<{ id: number; login: string }> {
    const response = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) throw new Error('Failed to fetch GitHub user');
    const data = await response.json() as any;
    return { id: data.id, login: data.login };
  }

  async listRepos(token: string, page = 1, perPage = 30): Promise<{
    repos: Array<{ id: number; fullName: string; private: boolean; defaultBranch: string; htmlUrl: string }>;
    hasMore: boolean;
  }> {
    const response = await fetch(
      `https://api.github.com/user/repos?sort=updated&per_page=${perPage}&page=${page}&type=all`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }
    );
    if (!response.ok) throw new Error('Failed to list repos');
    const data = await response.json() as any[];
    return {
      repos: data.map((r: any) => ({
        id: r.id,
        fullName: r.full_name,
        private: r.private,
        defaultBranch: r.default_branch,
        htmlUrl: r.html_url,
      })),
      hasMore: data.length === perPage,
    };
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  decrypt(ciphertext: string): string {
    const [ivHex, authTagHex, encrypted] = ciphertext.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  async connect(userId: string, code: string): Promise<GitHubConnectionRecord> {
    const { accessToken, scope } = await this.exchangeCodeForToken(code);
    const ghUser = await this.getAuthenticatedUser(accessToken);
    const record: GitHubConnectionRecord = {
      id: crypto.randomUUID(),
      userId,
      githubUserId: ghUser.id,
      githubUsername: ghUser.login,
      accessToken: this.encrypt(accessToken),
      scope,
      connectedAt: Date.now(),
    };
    await this.githubConnectionRepo.delete(userId);
    await this.githubConnectionRepo.create(record);
    return record;
  }

  async getConnection(userId: string): Promise<GitHubConnectionRecord | null> {
    return this.githubConnectionRepo.findByUserId(userId);
  }

  async getDecryptedToken(userId: string): Promise<string> {
    const conn = await this.githubConnectionRepo.findByUserId(userId);
    if (!conn) throw new Error('No GitHub connection found');
    return this.decrypt(conn.accessToken);
  }

  async disconnect(userId: string): Promise<void> {
    await this.githubConnectionRepo.delete(userId);
  }
}
