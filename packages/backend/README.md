# Ralph UI Backend

This is the backend service for the Ralph UI orchestrator web application. It provides API endpoints, WebSocket connections, and database management for the Ralph project management system.

## Features

- **tRPC API** - Type-safe API endpoints for project and loop management
- **WebSocket Support** - Real-time communication for loop execution monitoring
- **Chat System** - Integrated chat functionality with OpenCode AI support
- **OpenCode Integration** - AI-powered code assistance via OpenCode SDK
- **Database Management** - SQLite and PostgreSQL support via Drizzle ORM
- **File System Operations** - Project file management and monitoring
- **Notification System** - Real-time notifications for loop events and status updates

## Development

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm
- OpenCode API access (for AI features)
- Supabase setup (for cloud deployment)

### Environment Setup

Create environment files in the workspace root:
- `.env.local` - Local development environment variables
- `.env.cloud` - Cloud/production environment variables

### Available Scripts

```bash
# Development
pnpm dev          # Start development server with local env
pnpm dev:cloud    # Start development server with cloud env
pnpm dev:watch    # Start with file watching

# Build & Production
pnpm build        # Compile TypeScript to dist/
pnpm start        # Run compiled production server

# Code Quality
pnpm lint         # ESLint code checking
pnpm typecheck    # TypeScript type checking
pnpm complexity   # Check code complexity
pnpm test         # Run test suite
pnpm coverage     # Generate test coverage report

# Database Management
pnpm db:generate        # Generate Drizzle migrations (SQLite)
pnpm db:generate:local  # Generate Drizzle migrations (SQLite)
pnpm db:generate:cloud  # Generate Drizzle migrations (PostgreSQL)
pnpm db:migrate         # Run database migrations
pnpm db:migrate:local   # Run SQLite migrations
pnpm db:migrate:cloud   # Run PostgreSQL migrations
pnpm db:seed           # Seed database with initial data
```

## Architecture

### Key Components

- **src/serve.ts** - Main server entry point with Fastify configuration
- **src/db/** - Database schema, migrations, and utilities
- **src/routes/** - tRPC router definitions for API endpoints
- **src/services/** - Core service layer including:
  - `ChatService.ts` - Chat functionality and message handling
  - `OpenCodeService.ts` - OpenCode AI integration
  - `LoopService.ts` - Loop execution and management
  - `ProjectService.ts` - Project operations
  - `LoopNotificationService.ts` - Real-time notifications
- **src/presets/** - Project configuration presets

### Database

The backend supports dual database configurations:
- **SQLite** (local development) - `drizzle.config.ts`
- **PostgreSQL** (cloud deployment) - `drizzle.postgres.config.ts`

### API Structure

The backend exposes tRPC routes for:
- **Project management** - Create, read, update, delete projects
- **Loop execution and monitoring** - Start/stop loops, real-time status updates
- **Chat functionality** - Message handling, session management
- **OpenCode integration** - AI-powered code assistance and suggestions
- **Settings and configuration** - Application and user preferences
- **File system operations** - Project file management and monitoring
- **Notifications** - Real-time event notifications via WebSocket

## Deployment

1. Build the project: `pnpm build`
2. Set production environment variables
3. Run migrations: `pnpm db:migrate`
4. Start the server: `pnpm start`

## Contributing

1. Follow the existing code style (ESLint configuration)
2. Maintain test coverage above current levels
3. Keep code complexity under the configured threshold
4. Update this documentation when adding new features