import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { supabaseAuthHook } from '../auth/supabaseAuth.js';

const GITHUB_OAUTH_SESSION_COOKIE = 'github_oauth_session';

async function requireAuthenticatedUser(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<string | null> {
  await supabaseAuthHook(request, reply);
  return reply.sent || !request.userId ? null : request.userId;
}

function parsePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== 'string') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function registerGitHubAuthRoutes(app: FastifyInstance): void {
  const githubService = app.githubService;
  if (!githubService) {
    throw new Error('GitHub service must be registered before GitHub auth routes');
  }

  app.get('/auth/github', async (request, reply) => {
    const userId = await requireAuthenticatedUser(request, reply);
    if (!userId) {
      return;
    }

    const session = githubService.createOauthSession(userId);
    reply.setCookie(GITHUB_OAUTH_SESSION_COOKIE, session.cookieValue, {
      path: '/',
      httpOnly: true,
      maxAge: session.maxAgeSeconds,
      sameSite: 'lax',
    });
    const url = githubService.getAuthorizationUrl(session.state);
    reply.redirect(url);
  });

  app.get('/auth/github/callback', async (request, reply) => {
    const { code, state } = request.query as { code?: string; state?: string };
    const session = githubService.readOauthSession(request.cookies?.[GITHUB_OAUTH_SESSION_COOKIE]);

    if (!code || !state || !session || state !== session.state) {
      reply.clearCookie(GITHUB_OAUTH_SESSION_COOKIE, { path: '/' });
      reply.redirect('/?github_error=invalid_state');
      return;
    }

    try {
      await githubService.connect(session.userId, code);
      reply.clearCookie(GITHUB_OAUTH_SESSION_COOKIE, { path: '/' });
      reply.redirect('/settings?github=connected');
    } catch (error) {
      reply.redirect(`/settings?github_error=${encodeURIComponent(String(error))}`);
    }
  });

  app.get('/auth/github/repos', async (request, reply) => {
    const userId = await requireAuthenticatedUser(request, reply);
    if (!userId) {
      return;
    }

    const { page, perPage } = request.query as {
      page?: string;
      perPage?: string;
    };

    const result = await githubService.listConnectedRepos(
      userId,
      parsePositiveInteger(page, 1),
      parsePositiveInteger(perPage, 30)
    );
    reply.send(result);
  });

  app.delete('/auth/github', async (request, reply) => {
    const userId = await requireAuthenticatedUser(request, reply);
    if (!userId) {
      return;
    }

    await githubService.disconnect(userId);
    reply.code(204).send();
  });
}
