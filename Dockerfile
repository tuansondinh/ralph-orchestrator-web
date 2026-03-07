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

COPY package.json package-lock.json ./
COPY packages/backend/package.json packages/backend/package.json
COPY packages/frontend/package.json packages/frontend/package.json
RUN npm ci --omit=dev --workspaces --include-workspace-root

COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY --from=build /app/packages/backend/drizzle ./packages/backend/drizzle
COPY --from=build /app/packages/backend/presets ./packages/backend/presets
COPY --from=build /app/packages/frontend/dist ./packages/frontend/dist

EXPOSE 3003
CMD ["npm", "run", "start", "-w", "@ralph-ui/backend"]
