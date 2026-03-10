FROM node:22-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/backend/package.json packages/backend/package.json
COPY packages/frontend/package.json packages/frontend/package.json
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3003
ENV RALPH_UI_BIND_HOST=0.0.0.0
ENV RALPH_UI_WORKSPACE_DIR=/home/app/workspaces

COPY package.json package-lock.json ./
COPY packages/backend/package.json packages/backend/package.json
COPY packages/frontend/package.json packages/frontend/package.json
RUN npm ci --omit=dev --workspaces --include-workspace-root
RUN npm install -g opencode-ai @ralph-orchestrator/ralph-cli

RUN addgroup --system app && adduser --system --ingroup app app

COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY --from=build /app/packages/backend/drizzle ./packages/backend/drizzle
COPY --from=build /app/packages/backend/presets ./packages/backend/presets
COPY --from=build /app/packages/frontend/dist ./packages/frontend/dist
COPY deploy ./deploy
COPY scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh

RUN chmod +x ./scripts/docker-entrypoint.sh \
  && mkdir -p /home/app/.config/opencode /home/app/workspaces \
  && chown -R app:app /app /home/app

USER app

EXPOSE 3003
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
