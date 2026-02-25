# Ralph Orchestrator Web - Backend Architecture

## Overview

The backend of the Ralph Orchestrator Web is a **Fastify-based TypeScript application** that serves as the API layer for orchestrating Ralph CLI operations, managing projects, chat sessions, and AI-powered loop execution.

**Location:** `/Users/sonwork/Workspace/ralph-orchestrator-web/packages/backend`

---

## 1. Backend Directory Structure

```
packages/backend/
├── src/
│   ├── app.ts                 # Main Fastify application setup
│   ├── serve.ts               # Server entry point & startup logic
│   ├── api/
│   │   └── websocket.ts       # WebSocket handler registration
│   ├── db/
│   │   ├── schema.ts          # Drizzle ORM schema definitions
│   │   ├── connection.ts      # Database initialization & management
│   │   ├── migrate.ts         # Database migration script
│   │   └── seed.ts            # Database seeding
│   ├── lib/
│   │   ├── ralph.ts           # Ralph binary resolution logic
│   │   ├── origin.ts          # CORS origin validation
│   │   ├── safety.ts          # Dangerous operation checks
│   │   ├── detect.ts          # Project type detection
│   │   └── parseDiff.ts       # Git diff parsing utilities
│   ├── runner/
│   │   ├── ProcessManager.ts  # Child process spawning & management
│   │   ├── OutputBuffer.ts    # Output buffering for processes
│   │   └── RalphEventParser.ts # Ralph event parsing
│   ├── services/
│   │   ├── LoopService.ts     # Main Ralph loop orchestration
│   │   ├── ChatService.ts     # AI chat session management
│   │   ├── ProjectService.ts  # Project CRUD operations
│   │   ├── TerminalService.ts # Terminal session management
│   │   ├── MonitoringService.ts # Metrics & monitoring
│   │   ├── TaskService.ts     # Task tracking
│   │   ├── PresetService.ts   # Preset file management
│   │   ├── HatsPresetService.ts # Hats preset handling
│   │   ├── RalphProcessService.ts # Process listing & control
│   │   ├── DevPreviewManager.ts # Dev server preview management
│   │   └── SettingsService.ts # Application settings
│   ├── trpc/
│   │   ├── router.ts          # tRPC procedure definitions
│   │   └── context.ts         # tRPC context setup
│   └── types/
│       └── fastify.d.ts       # Fastify type augmentation
├── drizzle/                   # Database migrations
├── test/                      # Test files
├── presets/                   # Default preset configurations
├── package.json               # Dependencies & scripts
└── tsconfig.json              # TypeScript configuration
```

---

## 2. Framework & Core Technologies

### Primary Framework: **Fastify v5.7.4**
- Lightweight, high-performance HTTP server
- Minimal footprint with plugin-based architecture
- Configured in `/Users/sonwork/Workspace/ralph-orchestrator-web/packages/backend/src/app.ts`

**Key initialization code:**
```typescript
const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info'
  }
})
```

### RPC Framework: **tRPC v11.10.0**
- Type-safe RPC layer mounted at `/trpc` endpoint
- Works alongside REST and WebSocket APIs
- Adapter: `@trpc/server/adapters/fastify`

### Database: **Better SQLite3 + Drizzle ORM**
- **better-sqlite3 v12.6.2** - Synchronous SQLite driver
- **drizzle-orm v0.45.1** - Type-safe ORM
- Database file: `.ralph-ui/data.db` (default)
- Features: Foreign keys enabled, WAL mode for concurrency
- Location: `/Users/sonwork/Workspace/ralph-orchestrator-web/packages/backend/src/db/connection.ts`

---

## 3. WebSocket Implementation

**Type:** Socket.IO-like pub/sub system using **@fastify/websocket v11.2.0** and **ws v8.19.0**

**Endpoint:** `GET /ws`

**Channel Pattern:**
```
loop:<loopId>:output      # Loop stdout/stderr output
loop:<loopId>:state       # Loop execution state
loop:<loopId>:metrics     # Loop performance metrics
chat:<sessionId>:message  # Chat messages
chat:<sessionId>:state    # Chat session state
preview:<projectId>:state # Dev preview server state
terminal:<sessionId>:output # Terminal output
terminal:<sessionId>:state   # Terminal state
notifications             # Global notification channel
```

**Message Types:**
- `subscribe` - Client subscribes to channels
- `terminal.input` - Send input to terminal
- `terminal.resize` - Resize terminal
- Server broadcasts state/output/metrics updates in real-time

**Implementation File:** `/Users/sonwork/Workspace/ralph-orchestrator-web/packages/backend/src/api/websocket.ts`

**Key Features:**
- Origin validation for security
- Message replay on subscription (historical output)
- Automatic cleanup on disconnect
- Metrics broadcast interval: 5 seconds (configurable via `RALPH_UI_METRICS_INTERVAL_MS`)

---

## 4. Ralph CLI Invocation

### Method: **Child Process Spawning** (Node.js `spawn`)

**Location:** `/Users/sonwork/Workspace/ralph-orchestrator-web/packages/backend/src/runner/ProcessManager.ts`

**Ralph Binary Resolution:** `/Users/sonwork/Workspace/ralph-orchestrator-web/packages/backend/src/lib/ralph.ts`

### Resolution Strategy (in order):
1. Custom path from settings (user-configured)
2. `RALPH_UI_RALPH_BIN` environment variable
3. Local node_modules: `./node_modules/.bin/ralph`
4. System PATH environment variable

### Process Spawning Details:

**ProcessManager Features:**
- UUID-based process tracking
- Detached process groups for clean termination
- Graceful shutdown with SIGTERM → SIGKILL (1s grace period)
- TTY mode support via `expect` command for interactive processes
- Output buffering with EventEmitter subscriptions
- State tracking: `running | stopped | crashed | completed`

**Example - Loop Start:**
```typescript
// From LoopService.ts line 529
const handle = await this.processManager.spawn(
  projectId,
  'bash',
  ['-lc', shellCommand],
  { cwd: projectPath, tty: true }
)
```

**Example - Ralph CLI Calls:**
```typescript
// execFile wrapper from LoopService.ts
await execFile(binaryPath, ['loops', 'stop', '--loop-id', loopId], {
  cwd: projectPath,
  timeout: 10000
})

// Ralph loops list
const result = await execFile(binaryPath, ['loops', 'list', '--json'], {
  cwd: projectPath
})
```

### Ralph CLI Commands Used:
- `loops start` - Start a new loop run
- `loops stop` - Stop active loop
- `loops list --json` - List running loops
- `plan` / `task` - Chat modes (from ChatService)

---

## 5. REST API Routes & Structure

### Framework: **tRPC + Fastify**

**Base Path:** `/trpc`

### Route Organization by Domain:

#### **Projects** (`project.*`)
- `project.list` - List all projects
- `project.get` - Get single project details
- `project.create` - Create new project
- `project.update` - Update project metadata
- `project.delete` - Delete project
- `project.selectDirectory` - OS file picker dialog
- `project.getConfig` - Get ralph.yml config
- `project.updateConfig` - Update project config (YAML or object)
- `project.getPrompt` - Get project prompt
- `project.updatePrompt` - Update prompt
- `project.listWorktrees` - List git worktrees
- `project.createWorktree` - Create new worktree

#### **Loops** (`loop.*`)
- `loop.list` - List loops for project
- `loop.start` - Start new loop execution
- `loop.stop` - Stop running loop
- `loop.restart` - Restart stopped loop
- `loop.getMetrics` - Get loop performance metrics
- `loop.getDiff` - Get git diff from loop changes

#### **Chat** (`chat.*`)
- `chat.startSession` - Start chat session
- `chat.restartSession` - Restart existing session
- `chat.getProjectSession` - Get active session
- `chat.sendMessage` - Send user message
- `chat.endSession` - End session
- `chat.getHistory` - Retrieve message history

#### **Monitoring** (`monitoring.*`)
- `monitoring.projectStatus` - Get project health status
- `monitoring.loopMetrics` - Get loop metrics
- `monitoring.eventHistory` - Get event log
- `monitoring.fileContent` - Get file contents from loop

#### **Preview** (`preview.*`)
- `preview.start` - Start dev preview server
- `preview.stop` - Stop preview server
- `preview.status` - Get preview status

#### **Terminal** (`terminal.*`)
- `terminal.startSession` - Start interactive terminal
- `terminal.getProjectSession` - Get terminal session
- `terminal.getProjectSessions` - List project terminals
- `terminal.endSession` - Close terminal
- `terminal.getOutputHistory` - Replay terminal output

#### **Settings** (`settings.*`)
- `settings.get` - Get all settings
- `settings.update` - Update settings
- `settings.testBinary` - Test Ralph binary
- `settings.clearData` - Clear all data
- `settings.getDefaultPreset` / `setDefaultPreset`

#### **Notifications** (`notification.*`)
- `notification.list` - List notifications
- `notification.markRead` - Mark notification read

#### **Presets** (`presets.*`)
- `presets.list` - List available presets
- `presets.get` - Get preset content

#### **Hats Presets** (`hatsPresets.*`)
- `hatsPresets.list` - List hats presets
- `hatsPresets.get` - Get hats preset

#### **Ralph Processes** (`ralph.*`)
- `ralph.list` - List active Ralph processes
- `ralph.kill` - Kill process by PID
- `ralph.killAll` - Terminate all Ralph processes

#### **Tasks** (`task.*`)
- `task.list` - List project tasks

### Health Check
- `GET /health` - Returns `{ status: 'ok' }`

---

## 6. Backend Code Organization

### Service-Oriented Architecture

Each major domain has a dedicated **Service** class:

#### **LoopService** (`/packages/backend/src/services/LoopService.ts`)
- ~2000 lines
- Orchestrates Ralph loop execution
- Manages loop lifecycle (start, stop, restart, state tracking)
- Parses Ralph events and metrics
- Handles git operations for diffs
- Stores loop runs in database
- Subscription system for real-time updates
- Key methods:
  - `start(projectId, options)` - Spawn loop process
  - `stop(loopId)` - Terminate loop
  - `get(loopId)` - Fetch loop details
  - `subscribeOutput(loopId, callback)` - Stream output
  - `subscribeState(loopId, callback)` - Track state changes

#### **ChatService** (`/packages/backend/src/services/ChatService.ts`)
- ~450 lines
- Manages chat sessions for planning & task modes
- Spawns backend processes (Claude, Gemini, Copilot, etc.)
- Parses streaming chat output
- Stores conversation history
- Methods:
  - `startSession(projectId, type, input, backend)`
  - `sendMessage(sessionId, message)`
  - `getHistory(sessionId)`

#### **ProjectService** (`/packages/backend/src/services/ProjectService.ts`)
- CRUD operations for projects
- Config file management (YAML parsing)
- Git worktree operations
- File system integration

#### **TerminalService** (`/packages/backend/src/services/TerminalService.ts`)
- Interactive terminal sessions using node-pty
- Output buffering and replay
- Session tracking per project

#### **MonitoringService** (`/packages/backend/src/services/MonitoringService.ts`)
- Aggregates metrics from loops
- Event history tracking
- File content retrieval from project

#### **SettingsService** (`/packages/backend/src/services/SettingsService.ts`)
- Application settings persistence
- Ralph binary configuration
- Theme, notifications, port range settings

#### **DevPreviewManager** (`/packages/backend/src/services/DevPreviewManager.ts`)
- Spawns dev preview servers
- Port allocation (configurable range 3001-3010)
- Preview state tracking

#### **Other Services:**
- `TaskService` - Task tracking
- `PresetService` - Preset file resolution
- `HatsPresetService` - Hats presets management
- `RalphProcessService` - Process listing/killing

### Error Handling Pattern

Custom error classes with error codes:
```typescript
class LoopServiceError extends Error {
  code: ServiceErrorCode // 'BAD_REQUEST' | 'NOT_FOUND' | 'CONFLICT'
}
```

Mapped to tRPC errors in router:
```typescript
if (error instanceof LoopServiceError) {
  throw new TRPCError({
    code: error.code,
    message: error.message
  })
}
```

---

## 7. AI/LLM Integrations

### Supported Backends:
- **claude** - Anthropic Claude
- **kiro** - Kiro LLM
- **gemini** - Google Gemini
- **codex** - OpenAI Codex (default)
- **amp** - AMP LLM
- **copilot** - GitHub Copilot
- **opencode** - OpenCode LLM

### Integration Points:

#### **Chat Sessions** (ChatService)
- Each session specifies a backend
- Backend processes are spawned as child processes
- Type: `plan` or `task`
- Communication via stdin/stdout streaming
- Output parsing strips control characters

#### **Loop Execution** (LoopService)
- Optional backend selection in `loop.start`
- Passed as: `--backend <backend-name>` to Ralph CLI
- Ralph handles LLM-specific logic

### No Direct API Integration
The backend **does not** directly call OpenAI, Claude, or other APIs. Instead:
1. It spawns Ralph CLI or chat backend processes
2. The external tools handle API authentication
3. Backend streams and buffers their output

---

## 8. Package.json Dependencies

### Production Dependencies
```json
{
  "@fastify/cors": "^11.2.0",           // CORS middleware
  "@fastify/websocket": "^11.2.0",      // WebSocket support
  "@trpc/server": "^11.10.0",           // Type-safe RPC
  "better-sqlite3": "^12.6.2",          // SQLite driver
  "drizzle-kit": "^0.31.9",             // ORM tooling
  "drizzle-orm": "^0.45.1",             // ORM framework
  "fastify": "^5.7.4",                  // HTTP server
  "node-pty": "^1.1.0",                 // PTY for terminals
  "ws": "^8.19.0",                      // WebSocket library
  "yaml": "^2.8.2",                     // YAML parsing
  "zod": "^4.3.6"                       // Schema validation
}
```

### Dev Dependencies
```json
{
  "@vitest/coverage-v8": "^4.0.18",     // Test coverage
  "@ralph-orchestrator/ralph-cli": "^2.5.1", // Ralph CLI
  "@types/better-sqlite3": "^7.6.13",   // Types
  "@types/node": "^25.2.3",             // Node.js types
  "@types/ws": "^8.18.1",               // WebSocket types
  "tsx": "^4.21.0",                     // TypeScript executor
  "typescript": "^5.9.3",               // TypeScript
  "vitest": "^4.0.18"                   // Test framework
}
```

---

## 9. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                        │
│                  packages/frontend                          │
└────────────────────────┬──────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
   HTTP/REST         WebSocket          tRPC
  (Fastify)        (/ws endpoint)    (/trpc path)
        │                │                │
        └────────────────┼────────────────┘
                         │
┌─────────────────────────▼──────────────────────────────────┐
│                  Fastify Application                       │
│              src/app.ts (createApp())                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─ Services Layer ────────────────────────────────────┐   │
│  │ ┌─────────────────────────────────────────────────┐ │   │
│  │ │ ProjectService  │ LoopService   │ ChatService   │ │   │
│  │ │ TaskService     │ TerminalSvc   │ MonitoringSvc │ │   │
│  │ │ PresetService   │ DevPreview    │ SettingsSvc   │ │   │
│  │ └─────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
│                           ▲                                 │
│  ┌─ Runner Layer ─────────┼───────────────────────────┐   │
│  │ ProcessManager (spawn) │ OutputBuffer  │ EventParser│   │
│  │                        ▼                           │   │
│  │                    Child Processes                │   │
│  │   Ralph CLI │ bash │ Chat Backend │ Terminal │   │   │
│  └────────────────────────────────────────────────────┘   │
│                           │                                 │
│  ┌─ Data Layer ──────────┼───────────────────────────┐   │
│  │ Drizzle ORM           │                           │   │
│  │   Database (SQLite)   ▼                           │   │
│  │  ├─ projects                                      │   │
│  │  ├─ loopRuns                                      │   │
│  │  ├─ chatSessions/Messages                         │   │
│  │  ├─ notifications                                 │   │
│  │  └─ settings                                      │   │
│  └────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 10. Configuration & Environment Variables

### Server Configuration
```bash
PORT                              # Server port (default: 3001)
RALPH_UI_BIND_HOST               # Bind host (default: 127.0.0.1)
LOG_LEVEL                        # Logging level (default: info)
RALPH_UI_DB_PATH                 # Database path (default: .ralph-ui/data.db)
```

### Ralph Binary
```bash
RALPH_UI_RALPH_BIN              # Custom Ralph binary path
```

### Security
```bash
RALPH_UI_ALLOWED_ORIGINS        # CORS allowed origins (comma-separated)
RALPH_UI_DANGEROUS_OPERATIONS   # Enable dangerous ops (terminal, process kill)
```

### Preview Settings
```bash
RALPH_UI_METRICS_INTERVAL_MS    # Metrics broadcast interval (default: 5000ms)
```

---

## 11. Key Code Snippets

### Starting a Loop
```typescript
// From LoopService.ts
const handle = await this.loopService.start(projectId, {
  config: 'path/to/ralph.yml',
  prompt: 'user input',
  backend: 'claude',
  worktree: 'branch-name'
})
```

### WebSocket Subscription
```typescript
// Client-side
socket.send(JSON.stringify({
  type: 'subscribe',
  channels: [
    'loop:uuid:output',
    'loop:uuid:state',
    'loop:uuid:metrics'
  ]
}))
```

### Chat Session
```typescript
const session = await chatService.startSession(
  projectId,
  'task',
  'initial message',
  'claude'
)
await chatService.sendMessage(session.id, 'continue with this...')
```

---

## 12. Database Schema

### Tables
- **projects** - Project metadata (name, path, config)
- **loopRuns** - Loop execution records (state, metrics)
- **chatSessions** - Chat conversation sessions
- **chatMessages** - Individual messages in sessions
- **notifications** - User notifications
- **settings** - Key-value configuration store

### Schema File
`/Users/sonwork/Workspace/ralph-orchestrator-web/packages/backend/src/db/schema.ts`

---

## 13. Build & Deploy

### Development
```bash
npm run dev          # Start with tsx watch
```

### Production
```bash
npm run build        # TypeScript compilation to dist/
npm start            # Run compiled JavaScript
```

### Database
```bash
npm run db:generate  # Generate migrations
npm run db:migrate   # Run migrations
npm run db:seed      # Seed initial data
```

### Quality
```bash
npm run lint         # ESLint
npm run typecheck    # TypeScript check
npm run test         # Vitest
npm run coverage     # Test coverage
npm run complexity   # Cyclomatic complexity
```

---

## 14. Summary Table

| Aspect | Technology | Details |
|--------|-----------|---------|
| **HTTP Server** | Fastify 5.7.4 | Plugin-based, high-performance |
| **RPC Layer** | tRPC 11.10.0 | Type-safe procedures |
| **WebSocket** | @fastify/websocket + ws | Pub/sub channel system |
| **Database** | SQLite + Drizzle ORM | Type-safe, synchronous |
| **Process Management** | Node.js spawn | Detached groups, TTY support |
| **CLI Integration** | Ralph CLI | Spawned as child process |
| **AI Backends** | 7 options (Claude, Gemini, etc.) | Via child process communication |
| **Language** | TypeScript 5.9.3 | Compiled to JavaScript |
| **Testing** | Vitest 4.0.18 | Unit & coverage |
| **Terminal Support** | node-pty 1.1.0 | Interactive PTY sessions |
