import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { execFile as execFileCallback } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { resolveRepositoryBundle } from '../db/repositories/index.js';
import { resolveRalphBinary } from '../lib/ralph.js';
import { OutputBuffer } from '../runner/OutputBuffer.js';
import { RalphEventParser } from '../runner/RalphEventParser.js';
import { ServiceError } from '../lib/ServiceError.js';
import { asLoopId, asPrimaryLoopId, asNumber, asRecord, asString, extractIterationCandidates, isLikelyActiveLoopState, parseConfigRecord, parsePersistedConfig, primaryLoopIdFromEventsPath, primaryLoopIdFromTimestamp, readIterationValue, uniqueLoopIds, usesLiveRuntime } from './loopUtils.js';
import { LoopNotificationService } from './LoopNotificationService.js';
import { LoopDiffService } from './LoopDiffService.js';
import { LoopMetricsService } from './LoopMetricsService.js';
export class LoopServiceError extends ServiceError {
    constructor(code, message) {
        super(code, message);
        this.name = 'LoopServiceError';
    }
}
const STOP_ATTEMPTS = 3;
const STOP_WAIT_MS_PER_ATTEMPT = 700;
const PROJECT_RECONCILE_MIN_INTERVAL_MS = 2_000;
const DEFAULT_OUTPUT_BUFFER_LINES = 500;
const OUTPUT_EVENT_PREFIX = 'loop-output:';
const STATE_EVENT_PREFIX = 'loop-state:';
const execFile = promisify(execFileCallback);
async function stopLoopWithCli(input) {
    try {
        await execFile(input.binaryPath, ['loops', 'stop', '--loop-id', input.loopId], {
            cwd: input.cwd
        });
    }
    catch {
        // Backward compatibility with older Ralph CLIs that use positional id.
        await execFile(input.binaryPath, ['loops', 'stop', input.loopId], {
            cwd: input.cwd
        });
    }
}
function getErrorOutput(error) {
    if (error && typeof error === 'object' && 'stderr' in error) {
        const stderr = error.stderr;
        if (typeof stderr === 'string' && stderr.trim()) {
            return stderr.trim();
        }
    }
    if (error instanceof Error) {
        return error.message;
    }
    return 'Unknown error';
}
function isLoopUnavailableError(error) {
    const output = getErrorOutput(error)
        .toLowerCase()
        .replace(/\s+/g, ' ');
    return ((output.includes('loop') && output.includes('not found')) ||
        output.includes('not running') ||
        output.includes('no such loop') ||
        output.includes('no active loop') ||
        output.includes('unable to find loop') ||
        output.includes('cannot find loop'));
}
function isLoopOutputPersistenceUnavailableError(error) {
    return (getErrorOutput(error).toLowerCase().replace(/\s+/g, ' ') ===
        'loop output persistence is not available in local mode');
}
function buildRunArgs(options) {
    const args = ['run', '--verbose'];
    if (options.config) {
        args.push('--config', options.config);
    }
    if (options.prompt) {
        args.push(`--prompt=${options.prompt}`);
    }
    if (options.promptFile) {
        args.push('--prompt-file', options.promptFile);
    }
    if (options.backend) {
        args.push('--backend', options.backend);
    }
    if (options.exclusive) {
        args.push('--exclusive');
    }
    return args;
}
function quoteShellArg(value) {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}
function buildRunCommand(binaryPath, options) {
    const runArgs = buildRunArgs(options);
    const command = [binaryPath, ...runArgs].map(quoteShellArg).join(' ');
    return `${command} 2>&1`;
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export class LoopService {
    processManager;
    resolveBinary;
    stopLoopWithCli;
    now;
    bufferLines;
    projects;
    loopRuns;
    loopOutput;
    runtimes = new Map();
    events = new EventEmitter();
    reconcileInFlightByProject = new Map();
    lastReconcileAtByProject = new Map();
    notificationService;
    diffService;
    metricsService;
    constructor(source, processManager, options = {}) {
        this.processManager = processManager;
        const repositories = resolveRepositoryBundle(source);
        this.projects = repositories.projects;
        this.loopRuns = repositories.loopRuns;
        this.loopOutput = repositories.loopOutput;
        this.resolveBinary = options.resolveBinary ?? (() => resolveRalphBinary());
        this.stopLoopWithCli = options.stopLoop ?? stopLoopWithCli;
        this.now = options.now ?? (() => new Date());
        this.bufferLines = options.bufferLines ?? DEFAULT_OUTPUT_BUFFER_LINES;
        this.notificationService = new LoopNotificationService(repositories, this.events, this.now);
        this.diffService = new LoopDiffService();
        this.metricsService = new LoopMetricsService(this.now);
    }
    async recoverState() {
        const staleRuns = await this.loopRuns.findByState(['running', 'queued']);
        for (const run of staleRuns) {
            const nowMs = this.now().getTime();
            const parsedConfig = parseConfigRecord(run.config);
            const updatedConfig = JSON.stringify({
                ...parsedConfig,
                _recoveryError: 'App process restarted — loop stopped'
            });
            await this.loopRuns.update(run.id, {
                state: 'failed',
                config: updatedConfig,
                endedAt: nowMs
            });
        }
    }
    async start(projectId, options = {}) {
        const project = await this.requireProject(projectId);
        let binaryPath;
        try {
            binaryPath = await this.resolveBinary();
        }
        catch (error) {
            throw new LoopServiceError('BAD_REQUEST', error instanceof Error ? error.message : 'Unable to resolve Ralph binary');
        }
        let runCwd = project.path;
        if (options.worktree) {
            const resolvedWorktreePath = await this.diffService.resolveWorktreePath(project.path, options.worktree);
            if (!resolvedWorktreePath) {
                throw new LoopServiceError('BAD_REQUEST', `Worktree not found: ${options.worktree}`);
            }
            runCwd = resolvedWorktreePath;
        }
        const existingLoopIds = await this.listRalphLoopIds(binaryPath, runCwd);
        const markerBefore = await this.readCurrentLoopId(runCwd);
        const currentEventsBefore = await this.readCurrentEventsLoopId(runCwd);
        const loopId = randomUUID();
        const startCommit = await this.resolveHeadCommit(runCwd);
        const promptSnapshot = await this.resolvePromptSnapshot(runCwd, options);
        const outputLogFile = join('.ralph-ui', 'loop-logs', `${loopId}.log`);
        await mkdir(join(project.path, '.ralph-ui', 'loop-logs'), { recursive: true });
        const debugLogPath = join(runCwd, 'debug.log');
        const outputLogPath = join(project.path, outputLogFile);
        await Promise.all([
            writeFile(debugLogPath, '', 'utf8'),
            writeFile(outputLogPath, '', 'utf8')
        ]);
        const shellCommand = buildRunCommand(binaryPath, options);
        const handle = await this.processManager.spawn(projectId, 'bash', ['-lc', shellCommand], {
            cwd: runCwd,
            // Provider CLIs like Gemini/OpenCode make forward progress only when Ralph runs under a PTY.
            tty: true
        });
        const markerAfter = await this.readCurrentLoopId(runCwd);
        const currentEventsAfter = await this.readCurrentEventsLoopId(runCwd);
        const initialRalphLoopId = (currentEventsAfter && currentEventsAfter !== currentEventsBefore
            ? currentEventsAfter
            : null) ??
            (markerAfter && markerAfter !== markerBefore ? markerAfter : null);
        const nowMs = this.now().getTime();
        const configPayload = JSON.stringify({
            config: options.config ?? null,
            prompt: options.prompt ?? null,
            promptFile: options.promptFile ?? null,
            backend: options.backend ?? null,
            exclusive: Boolean(options.exclusive),
            worktree: options.worktree ?? null,
            ralphLoopId: initialRalphLoopId,
            startCommit,
            endCommit: null,
            outputLogFile
        });
        try {
            await this.loopRuns.create({
                id: loopId,
                projectId,
                ralphLoopId: initialRalphLoopId,
                state: 'running',
                config: configPayload,
                prompt: promptSnapshot,
                worktree: options.worktree ?? null,
                iterations: 0,
                tokensUsed: 0,
                errors: 0,
                startedAt: nowMs,
                endedAt: null
            });
        }
        catch (error) {
            await this.processManager.kill(handle.id, 'SIGKILL');
            throw error;
        }
        const runtime = {
            processId: handle.id,
            processPid: handle.pid > 0 ? handle.pid : null,
            active: true,
            stopRequested: false,
            ralphLoopId: initialRalphLoopId,
            outputRemainder: '',
            buffer: new OutputBuffer(this.bufferLines),
            parser: new RalphEventParser(),
            currentHat: null,
            iterations: 0,
            notified: new Set(),
            unsubOutput: () => { },
            unsubState: () => { },
            outputSequenceCounter: 0,
            debugLogPath,
            outputLogPath,
            pendingLogWrite: Promise.resolve()
        };
        this.runtimes.set(loopId, runtime);
        runtime.unsubOutput = this.processManager.onOutput(handle.id, (chunk) => {
            void this.handleOutput(loopId, chunk).catch((error) => {
                this.handleBackgroundError(loopId, error);
            });
        });
        runtime.unsubState = this.processManager.onStateChange(handle.id, (state) => {
            void this.handleState(loopId, state).catch((error) => {
                this.handleBackgroundError(loopId, error);
            });
        });
        if (!initialRalphLoopId) {
            void this.bootstrapRalphLoopId(loopId, {
                binaryPath,
                cwd: runCwd,
                existingLoopIds,
                markerBefore,
                currentEventsBefore
            });
        }
        return this.get(loopId);
    }
    handleBackgroundError(loopId, error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('database connection is not open')) {
            return;
        }
        console.error(`[LoopService] background handler failed for loop ${loopId}`, error);
    }
    async stop(loopId) {
        const run = await this.requireLoop(loopId);
        const resolvedLoopId = run.id;
        const runtime = this.runtimes.get(resolvedLoopId);
        const persistedConfig = parsePersistedConfig(run.config);
        const stopLoopIds = uniqueLoopIds([
            runtime?.ralphLoopId ?? undefined,
            run.ralphLoopId ?? undefined,
            persistedConfig.ralphLoopId,
            resolvedLoopId,
            loopId,
            asPrimaryLoopId(loopId),
            primaryLoopIdFromTimestamp(run.startedAt)
        ]);
        if (run.state === 'stopped' && (!runtime?.active || !runtime.processId)) {
            return;
        }
        const project = await this.requireProject(run.projectId, `Project not found for loop: ${loopId}`);
        if (runtime?.active && runtime.processId) {
            runtime.stopRequested = true;
            let lastStopCliError;
            let binaryPath = null;
            try {
                binaryPath = await this.resolveBinary();
            }
            catch (error) {
                lastStopCliError = error;
            }
            if (binaryPath) {
                for (let attempt = 0; attempt < STOP_ATTEMPTS; attempt += 1) {
                    const stopResult = await this.tryStopLoopViaCli({
                        binaryPath,
                        cwd: project.path,
                        loopIds: stopLoopIds
                    });
                    if (stopResult.ok) {
                        const didStop = await this.waitForRuntimeStop(resolvedLoopId, STOP_WAIT_MS_PER_ATTEMPT);
                        if (didStop) {
                            return;
                        }
                    }
                    else {
                        lastStopCliError = stopResult.lastError;
                    }
                }
            }
            const processId = runtime.processId;
            if (processId) {
                try {
                    await this.processManager.kill(processId);
                }
                catch {
                    // Ignore and rely on runtime state check below.
                }
                const didStopViaKill = await this.waitForRuntimeStop(resolvedLoopId, STOP_WAIT_MS_PER_ATTEMPT * 2);
                if (didStopViaKill) {
                    return;
                }
            }
            runtime.stopRequested = false;
            if (lastStopCliError instanceof Error) {
                throw new LoopServiceError('BAD_REQUEST', `${lastStopCliError.message} (forced stop fallback did not terminate runtime)`);
            }
            throw new LoopServiceError('BAD_REQUEST', `Unable to stop loop: ${loopId} (forced stop fallback did not terminate runtime)`);
        }
        if (run.state !== 'stopped') {
            let binaryPath;
            try {
                binaryPath = await this.resolveBinary();
            }
            catch (error) {
                throw new LoopServiceError('BAD_REQUEST', error instanceof Error ? error.message : 'Unable to resolve Ralph binary');
            }
            let lastStopCliError;
            let didRequestStop = false;
            for (let attempt = 0; attempt < STOP_ATTEMPTS; attempt += 1) {
                const stopResult = await this.tryStopLoopViaCli({
                    binaryPath,
                    cwd: project.path,
                    loopIds: stopLoopIds
                });
                if (stopResult.ok) {
                    didRequestStop = true;
                    break;
                }
                lastStopCliError = stopResult.lastError;
            }
            if (!didRequestStop) {
                if (isLoopUnavailableError(lastStopCliError)) {
                    // Runtime tracking is unavailable and CLI confirms the loop is already gone.
                    // Treat this as a stale-state reconciliation and continue with DB stop update.
                    didRequestStop = true;
                }
            }
            if (!didRequestStop) {
                if (lastStopCliError instanceof Error) {
                    throw new LoopServiceError('BAD_REQUEST', `${lastStopCliError.message} (unable to stop runtime because process tracking was unavailable)`);
                }
                throw new LoopServiceError('BAD_REQUEST', `Unable to stop loop: ${loopId} (process tracking was unavailable)`);
            }
        }
        const updates = {
            state: 'stopped',
            endedAt: this.now().getTime()
        };
        const endCommitConfig = await this.buildEndCommitConfig(run);
        if (endCommitConfig !== undefined) {
            updates.config = endCommitConfig;
        }
        await this.loopRuns.update(resolvedLoopId, updates);
        this.events.emit(`${STATE_EVENT_PREFIX}${resolvedLoopId}`, 'stopped');
    }
    async tryStopLoopViaCli(input) {
        let lastError;
        for (const candidateLoopId of input.loopIds) {
            try {
                await this.stopLoopWithCli({
                    binaryPath: input.binaryPath,
                    loopId: candidateLoopId,
                    cwd: input.cwd
                });
                return { ok: true, lastError: null };
            }
            catch (error) {
                lastError = error;
            }
        }
        return { ok: false, lastError };
    }
    async waitForRuntimeStop(loopId, timeoutMs = 2_000, pollMs = 25) {
        const deadline = this.now().getTime() + timeoutMs;
        while (this.now().getTime() <= deadline) {
            const runtime = this.runtimes.get(loopId);
            if (!runtime?.active || !runtime.processId) {
                return true;
            }
            await new Promise((resolve) => setTimeout(resolve, pollMs));
        }
        return false;
    }
    async restart(loopId) {
        const run = await this.requireLoop(loopId);
        const persistedConfig = parsePersistedConfig(run.config);
        const restartOptions = {
            config: persistedConfig.config,
            prompt: persistedConfig.prompt,
            promptSnapshot: run.prompt ?? undefined,
            promptFile: persistedConfig.promptFile,
            backend: persistedConfig.backend,
            exclusive: persistedConfig.exclusive,
            worktree: run.worktree ?? persistedConfig.worktree
        };
        await this.stop(loopId);
        return this.start(run.projectId, restartOptions);
    }
    async list(projectId) {
        await this.reconcileProjectLoops(projectId);
        await this.syncExternalProjectLoops(projectId);
        const rows = await this.loopRuns.listByProjectId(projectId);
        return rows
            .filter((row) => row.id !== '(primary)' && row.ralphLoopId !== '(primary)')
            .sort((a, b) => b.startedAt - a.startedAt)
            .map((row) => this.toSummary(row));
    }
    async reconcileProjectLoops(projectId, options = {}) {
        const minIntervalMs = Math.max(0, options.minIntervalMs ?? PROJECT_RECONCILE_MIN_INTERVAL_MS);
        const nowMs = this.now().getTime();
        const lastReconcileAt = this.lastReconcileAtByProject.get(projectId) ?? 0;
        if (nowMs - lastReconcileAt < minIntervalMs) {
            return 0;
        }
        const existing = this.reconcileInFlightByProject.get(projectId);
        if (existing) {
            return existing;
        }
        const reconcilePromise = this.reconcileProjectLoopsInternal(projectId)
            .catch(() => 0)
            .finally(() => {
            this.reconcileInFlightByProject.delete(projectId);
            this.lastReconcileAtByProject.set(projectId, this.now().getTime());
        });
        this.reconcileInFlightByProject.set(projectId, reconcilePromise);
        return reconcilePromise;
    }
    async get(loopId) {
        const row = await this.requireLoop(loopId);
        return this.toSummary(row);
    }
    async getOutput(input) {
        const run = await this.requireLoop(input.loopId);
        const maxLines = Math.max(1, Math.min(input.limit ?? 50, 500));
        const lines = (await this.replayOutput(input.loopId)).slice(-maxLines);
        const lineLabel = lines.length === 1 ? 'line' : 'lines';
        return {
            summary: `Showing ${lines.length} recent ${lineLabel} for loop ${input.loopId} (${run.state})`,
            lines,
            link: `/project/${run.projectId}/loops?loopId=${run.id}`
        };
    }
    async getDiff(loopId) {
        const run = await this.requireLoop(loopId);
        const project = await this.requireProject(run.projectId, `Project not found for loop: ${loopId}`);
        return this.diffService.getDiff(run, project);
    }
    async getMetrics(loopId) {
        const run = await this.requireLoop(loopId);
        const project = await this.requireProject(run.projectId, `Project not found for loop: ${loopId}`);
        const runtime = this.runtimes.get(loopId);
        const runtimeData = runtime
            ? { active: runtime.active, iterations: runtime.iterations }
            : undefined;
        return this.metricsService.getMetrics(run, project, runtimeData);
    }
    async listNotifications(options = {}) {
        return this.notificationService.list(options);
    }
    async markNotificationRead(notificationId) {
        return this.notificationService.markRead(notificationId);
    }
    subscribeNotifications(cb) {
        return this.notificationService.subscribe(cb);
    }
    async replayNotifications(limit = 20) {
        return this.notificationService.replay(limit);
    }
    subscribeOutput(loopId, cb) {
        const key = `${OUTPUT_EVENT_PREFIX}${loopId}`;
        this.events.on(key, cb);
        return () => this.events.off(key, cb);
    }
    subscribeState(loopId, cb) {
        const key = `${STATE_EVENT_PREFIX}${loopId}`;
        this.events.on(key, cb);
        return () => this.events.off(key, cb);
    }
    async replayOutput(loopId) {
        const runtime = this.runtimes.get(loopId);
        if (runtime) {
            const liveLines = runtime.buffer.replay();
            if (liveLines.length > 0) {
                return liveLines;
            }
        }
        try {
            const chunks = await this.loopOutput.getByLoopRunId(loopId);
            if (chunks.length > 0) {
                return chunks.map(chunk => chunk.data.replace(/\n$/, ''));
            }
        }
        catch (error) {
            if (!isLoopOutputPersistenceUnavailableError(error)) {
                console.warn(`Failed to replay output from database for loop ${loopId}:`, error);
            }
        }
        return this.readOutputReplayFromDiskForLoop(loopId);
    }
    async readOutputReplayFromDiskForLoop(loopId) {
        const run = await this.loopRuns.findById(loopId);
        if (!run) {
            return [];
        }
        const project = await this.projects.findById(run.projectId);
        if (!project) {
            return [];
        }
        const persistedConfig = parsePersistedConfig(run.config);
        const outputLogPath = persistedConfig.outputLogFile
            ? join(project.path, persistedConfig.outputLogFile)
            : join(project.path, 'debug.log');
        return this.readOutputReplayFromDisk(outputLogPath);
    }
    toSummary(row) {
        const runtime = this.runtimes.get(row.id);
        const persistedConfig = parsePersistedConfig(row.config);
        const canonicalRalphLoopId = asLoopId(runtime?.ralphLoopId) ??
            asLoopId(row.ralphLoopId) ??
            asLoopId(persistedConfig.ralphLoopId) ??
            primaryLoopIdFromTimestamp(row.startedAt) ??
            null;
        return {
            id: row.id,
            projectId: row.projectId,
            ralphLoopId: canonicalRalphLoopId,
            processId: runtime?.active ? runtime.processId : null,
            processPid: runtime?.active ? runtime.processPid : null,
            state: row.state,
            config: row.config,
            prompt: row.prompt,
            worktree: row.worktree,
            iterations: Math.max(row.iterations, runtime?.iterations ?? row.iterations),
            tokensUsed: row.tokensUsed,
            errors: row.errors,
            startedAt: row.startedAt,
            endedAt: row.endedAt,
            currentHat: runtime?.currentHat ?? null
        };
    }
    async requireLoop(loopId) {
        const row = await this.loopRuns.findById(loopId);
        if (row) {
            return row;
        }
        const primaryLoopId = asPrimaryLoopId(loopId);
        if (!primaryLoopId) {
            throw new LoopServiceError('NOT_FOUND', `Loop not found: ${loopId}`);
        }
        const ralphLoopRows = (await this.loopRuns.listAll())
            .filter((candidate) => candidate.ralphLoopId === primaryLoopId)
            .sort((a, b) => {
            const stateScoreDiff = Number(isLikelyActiveLoopState(b.state)) - Number(isLikelyActiveLoopState(a.state));
            if (stateScoreDiff !== 0) {
                return stateScoreDiff;
            }
            return b.startedAt - a.startedAt;
        });
        if (ralphLoopRows.length > 0) {
            return ralphLoopRows[0];
        }
        const inferred = (await this.loopRuns.listAll())
            .filter((candidate) => {
            const persisted = parsePersistedConfig(candidate.config);
            return (asPrimaryLoopId(persisted.ralphLoopId) === primaryLoopId ||
                primaryLoopIdFromTimestamp(candidate.startedAt) === primaryLoopId);
        })
            .sort((a, b) => {
            const stateScoreDiff = Number(isLikelyActiveLoopState(b.state)) - Number(isLikelyActiveLoopState(a.state));
            if (stateScoreDiff !== 0) {
                return stateScoreDiff;
            }
            return b.startedAt - a.startedAt;
        });
        if (inferred.length > 0) {
            return inferred[0];
        }
        throw new LoopServiceError('NOT_FOUND', `Loop not found: ${loopId}`);
    }
    async requireProject(projectId, message = `Project not found: ${projectId}`) {
        const project = await this.projects.findById(projectId);
        if (!project) {
            throw new LoopServiceError('NOT_FOUND', message);
        }
        return project;
    }
    async handleOutput(loopId, chunk) {
        const runtime = this.runtimes.get(loopId);
        if (!runtime) {
            return;
        }
        runtime.buffer.append(chunk.data);
        this.events.emit(`${OUTPUT_EVENT_PREFIX}${loopId}`, chunk);
        const pendingLogWrite = runtime.pendingLogWrite ?? Promise.resolve();
        runtime.pendingLogWrite = pendingLogWrite
            .then(async () => {
            if (!runtime.outputLogPath) {
                return;
            }
            await appendFile(runtime.outputLogPath, chunk.data, 'utf8');
        })
            .catch((error) => {
            console.warn(`Failed to persist output log file for loop ${loopId}:`, error);
        });
        this.loopOutput.append({
            id: randomUUID(),
            loopRunId: loopId,
            sequence: runtime.outputSequenceCounter++,
            stream: chunk.stream,
            data: chunk.data,
            createdAt: Date.now()
        }).catch(err => {
            if (!isLoopOutputPersistenceUnavailableError(err)) {
                console.warn(`Failed to persist output chunk for loop ${loopId}:`, err);
            }
        });
        await this.applyOutputDerivedIteration(loopId, runtime, chunk.data);
        const events = runtime.parser.parseChunk(chunk.data);
        for (const event of events) {
            await this.applyParsedEvent(loopId, runtime, event);
        }
    }
    async applyOutputDerivedIteration(loopId, runtime, chunkData, emitState = true) {
        const combined = `${runtime.outputRemainder}${chunkData.replace(/\r\n/g, '\n')}`;
        const lines = combined.split('\n');
        runtime.outputRemainder = lines.pop() ?? '';
        let nextIteration = runtime.iterations;
        for (const line of lines) {
            const candidates = extractIterationCandidates(line);
            for (const candidate of candidates) {
                nextIteration = Math.max(nextIteration, candidate);
            }
        }
        if (nextIteration <= runtime.iterations) {
            return;
        }
        runtime.iterations = nextIteration;
        await this.loopRuns.update(loopId, { iterations: runtime.iterations });
        if (emitState) {
            this.events.emit(`${STATE_EVENT_PREFIX}${loopId}`, 'running');
        }
    }
    async handleState(loopId, state) {
        const runtime = this.runtimes.get(loopId);
        const nextState = runtime?.stopRequested && state !== 'running' ? 'stopped' : state;
        const endedAt = nextState === 'running' ? null : this.now().getTime();
        const updates = {
            state: nextState,
            endedAt
        };
        if (nextState !== 'running') {
            const run = await this.loopRuns.findById(loopId);
            if (run) {
                const endCommitConfig = await this.buildEndCommitConfig(run);
                if (endCommitConfig !== undefined) {
                    updates.config = endCommitConfig;
                }
                // Snapshot the latest persisted/live metrics before terminalizing the run,
                // so loop cards keep the final token count after completion.
                try {
                    const project = await this.projects.findById(run.projectId);
                    const runtimeData = runtime
                        ? { active: runtime.active, iterations: runtime.iterations }
                        : undefined;
                    const finalMetrics = project
                        ? await this.metricsService.getMetrics(run, project, runtimeData)
                        : null;
                    const tokensFromOutputLog = project
                        ? await this.metricsService.readTokensFromLoopOutputLog(project.path, run.config)
                        : undefined;
                    const tokensFromEvents = project
                        ? await this.metricsService.readTokensFromLoopEvents(project.path, run)
                        : undefined;
                    const nextIterations = Math.max(run.iterations, runtime?.iterations ?? run.iterations, finalMetrics?.iterations ?? 0);
                    const nextTokensUsed = Math.max(run.tokensUsed, finalMetrics?.tokensUsed ?? 0, tokensFromOutputLog ?? 0, tokensFromEvents ?? 0);
                    const nextErrors = Math.max(run.errors, finalMetrics?.errors ?? 0);
                    if (nextIterations > run.iterations) {
                        updates.iterations = nextIterations;
                    }
                    if (nextTokensUsed > run.tokensUsed) {
                        updates.tokensUsed = nextTokensUsed;
                    }
                    if (nextErrors > run.errors) {
                        updates.errors = nextErrors;
                    }
                }
                catch {
                    // Best effort: state transition should not fail if final metric snapshot fails.
                }
            }
        }
        await this.loopRuns.update(loopId, updates);
        this.events.emit(`${STATE_EVENT_PREFIX}${loopId}`, nextState);
        await this.notificationService.notifyForLoopState(loopId, nextState, runtime?.notified);
        if (!runtime) {
            return;
        }
        await runtime.pendingLogWrite;
        if (nextState !== 'running' && runtime.outputRemainder.trim().length > 0) {
            await this.applyOutputDerivedIteration(loopId, runtime, '\n', false);
        }
        runtime.unsubOutput();
        runtime.unsubState();
        runtime.active = false;
        runtime.stopRequested = false;
        runtime.processId = null;
        runtime.processPid = null;
    }
    async applyParsedEvent(loopId, runtime, event) {
        if (typeof event.payload !== 'object' || event.payload === null) {
            return;
        }
        const payload = event.payload;
        const payloadMetrics = asRecord(payload.metrics);
        const nextIteration = readIterationValue(payload) ??
            (payloadMetrics ? readIterationValue(payloadMetrics) : undefined);
        const nextHat = asString(payload.sourceHat) ??
            asString(payload.currentHat) ??
            asString(payload.hat);
        const nextTokens = asNumber(payload.tokensUsed) ??
            asNumber(payload.tokens_used) ??
            asNumber(payload.totalTokens) ??
            asNumber(payload.total_tokens) ??
            (payloadMetrics
                ? asNumber(payloadMetrics.tokensUsed) ??
                    asNumber(payloadMetrics.tokens_used) ??
                    asNumber(payloadMetrics.totalTokens) ??
                    asNumber(payloadMetrics.total_tokens)
                : undefined);
        const nextErrors = asNumber(payload.errors) ??
            asNumber(payload.error_count) ??
            (payloadMetrics
                ? asNumber(payloadMetrics.errors) ?? asNumber(payloadMetrics.error_count)
                : undefined);
        const nextRalphLoopId = asLoopId(payload.loop_id) ??
            asLoopId(payload.loopId) ??
            undefined;
        if (nextIteration !== undefined) {
            runtime.iterations = Math.max(runtime.iterations, Math.floor(nextIteration));
        }
        if (nextHat) {
            runtime.currentHat = nextHat;
        }
        if (nextRalphLoopId && runtime.ralphLoopId !== nextRalphLoopId) {
            runtime.ralphLoopId = nextRalphLoopId;
            await this.persistRalphLoopId(loopId, nextRalphLoopId);
        }
        const updates = {};
        if (nextIteration !== undefined) {
            updates.iterations = Math.max(0, runtime.iterations);
        }
        if (nextTokens !== undefined) {
            updates.tokensUsed = Math.max(0, Math.floor(nextTokens));
        }
        if (nextErrors !== undefined) {
            updates.errors = Math.max(0, Math.floor(nextErrors));
        }
        const nextState = asString(payload.state);
        if (nextState) {
            updates.state = nextState;
        }
        if (Object.keys(updates).length > 0) {
            await this.loopRuns.update(loopId, updates);
        }
        if (nextState) {
            this.events.emit(`${STATE_EVENT_PREFIX}${loopId}`, nextState);
            await this.notificationService.notifyForLoopState(loopId, nextState, runtime.notified);
        }
    }
    async persistRalphLoopId(loopId, ralphLoopId) {
        const run = await this.loopRuns.findById(loopId);
        if (!run) {
            return;
        }
        const config = parseConfigRecord(run.config);
        const persistedConfigLoopId = asString(config.ralphLoopId);
        if (run.ralphLoopId === ralphLoopId && persistedConfigLoopId === ralphLoopId) {
            return;
        }
        await this.loopRuns.update(loopId, {
            ralphLoopId,
            config: JSON.stringify({
                ...config,
                ralphLoopId
            })
        });
    }
    async reconcileProjectLoopsInternal(projectId) {
        const runs = await this.loopRuns.listByProjectId(projectId);
        const activeRuns = runs.filter((run) => usesLiveRuntime(run.state));
        if (activeRuns.length === 0) {
            return 0;
        }
        const activeRunsWithoutRuntime = activeRuns.filter((run) => {
            const runtime = this.runtimes.get(run.id);
            return !(runtime?.active && runtime.processId);
        });
        if (activeRunsWithoutRuntime.length === 0) {
            return 0;
        }
        const project = await this.projects.findById(projectId);
        if (!project) {
            return 0;
        }
        let binaryPath;
        try {
            binaryPath = await this.resolveBinary();
        }
        catch {
            return 0;
        }
        const listed = await this.listRalphLoopIdsWithStatus(binaryPath, project.path);
        if (!listed.ok) {
            return 0;
        }
        const nowMs = this.now().getTime();
        let reconciled = 0;
        for (const run of activeRunsWithoutRuntime) {
            const persistedConfig = parsePersistedConfig(run.config);
            const explicitRalphLoopId = asLoopId(run.ralphLoopId) ??
                asLoopId(persistedConfig.ralphLoopId) ??
                null;
            if (!explicitRalphLoopId) {
                continue;
            }
            if (listed.ids.has(explicitRalphLoopId)) {
                continue;
            }
            await this.loopRuns.update(run.id, {
                state: 'stopped',
                endedAt: run.endedAt ?? nowMs
            });
            this.events.emit(`${STATE_EVENT_PREFIX}${run.id}`, 'stopped');
            reconciled += 1;
        }
        return reconciled;
    }
    async syncExternalProjectLoops(projectId) {
        const project = await this.projects.findById(projectId);
        if (!project) {
            return 0;
        }
        let binaryPath;
        try {
            binaryPath = await this.resolveBinary();
        }
        catch {
            return 0;
        }
        const listed = await this.listRalphLoopIdsWithStatus(binaryPath, project.path);
        if (!listed.ok || listed.loops.length === 0) {
            return 0;
        }
        const existingRows = await this.loopRuns.listByProjectId(projectId);
        const existingByAnyId = new Map();
        for (const row of existingRows) {
            existingByAnyId.set(row.id, row);
            if (row.ralphLoopId) {
                existingByAnyId.set(row.ralphLoopId, row);
            }
            const persistedConfig = parsePersistedConfig(row.config);
            if (persistedConfig.ralphLoopId) {
                existingByAnyId.set(persistedConfig.ralphLoopId, row);
            }
        }
        let synced = 0;
        for (const listedLoop of listed.loops) {
            const existing = existingByAnyId.get(listedLoop.id);
            const inferredWorktree = this.inferWorktreeFromLocation(project.path, listedLoop.location);
            if (existing) {
                const nextConfig = parseConfigRecord(existing.config);
                const nextPersistedWorktree = asString(nextConfig.worktree);
                const updates = {};
                if (existing.ralphLoopId !== listedLoop.id) {
                    updates.ralphLoopId = listedLoop.id;
                }
                const existingIsTerminal = existing.state === 'stopped' || existing.state === 'completed';
                if (!existingIsTerminal && existing.state !== listedLoop.state) {
                    updates.state = listedLoop.state;
                }
                if (!existing.worktree && inferredWorktree) {
                    updates.worktree = inferredWorktree;
                }
                if (!existing.prompt && listedLoop.prompt) {
                    updates.prompt = listedLoop.prompt;
                }
                if (updates.ralphLoopId ||
                    updates.worktree ||
                    (!nextPersistedWorktree && inferredWorktree)) {
                    updates.config = JSON.stringify({
                        ...nextConfig,
                        ralphLoopId: listedLoop.id,
                        worktree: nextPersistedWorktree ?? inferredWorktree ?? null
                    });
                }
                if (Object.keys(updates).length > 0) {
                    await this.loopRuns.update(existing.id, updates);
                    synced += 1;
                }
                continue;
            }
            await this.loopRuns.create({
                id: randomUUID(),
                projectId,
                ralphLoopId: listedLoop.id,
                state: listedLoop.state,
                config: JSON.stringify({
                    config: null,
                    prompt: null,
                    promptFile: null,
                    backend: null,
                    exclusive: false,
                    worktree: inferredWorktree,
                    ralphLoopId: listedLoop.id,
                    startCommit: null,
                    endCommit: null,
                    outputLogFile: null,
                    imported: true
                }),
                prompt: listedLoop.prompt,
                worktree: inferredWorktree,
                iterations: 0,
                tokensUsed: 0,
                errors: 0,
                startedAt: this.now().getTime(),
                endedAt: listedLoop.state === 'running' ? null : this.now().getTime()
            });
            synced += 1;
        }
        return synced;
    }
    inferWorktreeFromLocation(projectPath, location) {
        const normalized = asString(location);
        if (!normalized) {
            return null;
        }
        const trimmedProjectName = projectPath.split('/').pop();
        if (normalized === '.' ||
            normalized === 'primary' ||
            normalized === trimmedProjectName) {
            return null;
        }
        return normalized;
    }
    async readCurrentLoopId(projectPath) {
        try {
            const marker = await readFile(join(projectPath, '.ralph', 'current-loop-id'), 'utf8');
            const normalized = asLoopId(marker.trim());
            return normalized ?? null;
        }
        catch {
            return null;
        }
    }
    async readCurrentEventsLoopId(projectPath) {
        try {
            const marker = await readFile(join(projectPath, '.ralph', 'current-events'), 'utf8');
            const normalized = primaryLoopIdFromEventsPath(marker);
            return normalized ?? null;
        }
        catch {
            return null;
        }
    }
    async listRalphLoopIdsWithStatus(binaryPath, cwd) {
        try {
            const result = await execFile(binaryPath, ['loops', 'list', '--json'], {
                cwd,
                encoding: 'utf8'
            });
            const parsed = JSON.parse(result.stdout);
            if (!Array.isArray(parsed)) {
                return { ok: true, ids: new Set(), loops: [] };
            }
            const loops = parsed.flatMap((entry) => {
                if (!entry || typeof entry !== 'object') {
                    return [];
                }
                const row = entry;
                const id = asLoopId(row.loop_id) ??
                    asLoopId(row.loopId) ??
                    asLoopId(row.id);
                if (!id || id === '(primary)') {
                    return [];
                }
                const rawState = asString(row.status) ?? asString(row.state) ?? 'running';
                const state = rawState === 'running' ||
                    rawState === 'queued' ||
                    rawState === 'merging' ||
                    rawState === 'merged' ||
                    rawState === 'needs-review' ||
                    rawState === 'orphan' ||
                    rawState === 'stopped' ||
                    rawState === 'completed'
                    ? rawState
                    : 'running';
                return [{
                        id,
                        state,
                        location: asString(row.location) ?? null,
                        prompt: asString(row.prompt) ?? null
                    }];
            });
            const ids = loops.map((loop) => loop.id);
            return { ok: true, ids: new Set(ids), loops };
        }
        catch {
            return { ok: false, ids: new Set(), loops: [] };
        }
    }
    async listRalphLoopIds(binaryPath, cwd) {
        const listed = await this.listRalphLoopIdsWithStatus(binaryPath, cwd);
        return listed.ids;
    }
    async bootstrapRalphLoopId(loopId, input) {
        for (let attempt = 0; attempt < 15; attempt += 1) {
            const runtime = this.runtimes.get(loopId);
            if (!runtime?.active || runtime.ralphLoopId) {
                return;
            }
            const currentEventsLoopId = await this.readCurrentEventsLoopId(input.cwd);
            if (currentEventsLoopId && currentEventsLoopId !== input.currentEventsBefore) {
                runtime.ralphLoopId = currentEventsLoopId;
                await this.persistRalphLoopId(loopId, currentEventsLoopId);
                return;
            }
            const markerLoopId = await this.readCurrentLoopId(input.cwd);
            if (markerLoopId && markerLoopId !== input.markerBefore) {
                runtime.ralphLoopId = markerLoopId;
                await this.persistRalphLoopId(loopId, markerLoopId);
                return;
            }
            const listedLoopIds = await this.listRalphLoopIds(input.binaryPath, input.cwd);
            const newLoopIds = [...listedLoopIds].filter((candidate) => !input.existingLoopIds.has(candidate) && candidate !== '(primary)');
            if (newLoopIds.length === 1) {
                const detectedLoopId = newLoopIds[0];
                runtime.ralphLoopId = detectedLoopId;
                await this.persistRalphLoopId(loopId, detectedLoopId);
                return;
            }
            await delay(200);
        }
    }
    async buildEndCommitConfig(run) {
        const persistedConfig = parsePersistedConfig(run.config);
        if (persistedConfig.endCommit) {
            return undefined;
        }
        const project = await this.projects.findById(run.projectId);
        if (!project) {
            return undefined;
        }
        const endCommit = await this.resolveHeadCommit(project.path);
        if (!endCommit) {
            return undefined;
        }
        const rawConfig = parseConfigRecord(run.config);
        return JSON.stringify({
            ...rawConfig,
            endCommit
        });
    }
    async resolveHeadCommit(projectPath) {
        try {
            const result = await execFile('git', ['rev-parse', 'HEAD'], {
                cwd: projectPath,
                encoding: 'utf8'
            });
            const commit = result.stdout.trim();
            return commit.length > 0 ? commit : null;
        }
        catch {
            return null;
        }
    }
    async resolvePromptSnapshot(projectPath, options) {
        if (typeof options.promptSnapshot === 'string') {
            return options.promptSnapshot;
        }
        if (typeof options.prompt === 'string') {
            return options.prompt;
        }
        const promptFilePath = options.promptFile ?? 'PROMPT.md';
        if (isAbsolute(promptFilePath)) {
            return null;
        }
        const absolutePath = resolve(projectPath, promptFilePath);
        const relativePath = relative(projectPath, absolutePath);
        if (!relativePath ||
            relativePath.startsWith(`..${sep}`) ||
            relativePath === '..' ||
            isAbsolute(relativePath)) {
            return null;
        }
        try {
            return await readFile(absolutePath, 'utf8');
        }
        catch {
            return null;
        }
    }
    readOutputReplayFromDisk(filePath) {
        const maxLines = Number.isFinite(this.bufferLines) && this.bufferLines > 0
            ? Math.floor(this.bufferLines)
            : 500;
        try {
            const raw = readFileSync(filePath, 'utf8');
            const normalized = raw.replace(/\r\n/g, '\n');
            const lines = normalized.split('\n');
            if (lines.length > 0 && lines[lines.length - 1] === '') {
                lines.pop();
            }
            return lines.slice(Math.max(0, lines.length - maxLines));
        }
        catch {
            return [];
        }
    }
}
