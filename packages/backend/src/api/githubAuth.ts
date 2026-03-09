import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';

export function registerGitHubAuthRoutes(app: FastifyInstance): void {
  const githubService = (app as any).githubService;

  app.get('/auth/github', async (request, reply) => {
    const state = crypto.randomBytes(16).toString('hex');
    reply.setCookie('github_oauth_state', state, {
      path: '/',
      httpOnly: true,
      maxAge: 600,
      sameSite: 'lax',
    });
    const url = githubService.getAuthorizationUrl(state);
    reply.redirect(url);
  });

  app.get('/auth/github/callback', async (request, reply) => {
    const { code, state } = request.query as { code?: string; state?: string };
    const cookies = request.cookies as Record<string, string>;
    const expectedState = cookies?.github_oauth_state;

    if (!code || !state || state !== expectedState) {
      reply.redirect('/?github_error=invalid_state');
      return;
    }

    try {
      const userId = (request as any).userId;
      if (!userId) {
        reply.redirect('/?github_error=unauthorized');
        return;
      }
      await githubService.connect(userId, code);
      reply.clearCookie('github_oauth_state');
      reply.redirect('/settings?github=connected');
    } catch (error) {
      reply.redirect(`/settings?github_error=${encodeURIComponent(String(error))}`);
    }
  });
}
