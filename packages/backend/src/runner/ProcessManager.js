import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { constants } from 'node:fs';
import { access, chmod, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import * as pty from 'node-pty';
const NOOP_LOGGER = {
    debug: () => { },
    info: () => { },
    error: () => { }
};
const require = createRequire(import.meta.url);
function toPtyEnvironment(env) {
    const ptyEnv = {};
    for (const [key, value] of Object.entries(env)) {
        if (typeof value === 'string') {
            ptyEnv[key] = value;
        }
    }
    if (!ptyEnv.TERM) {
        ptyEnv.TERM = 'xterm-256color';
    }
    return ptyEnv;
}
export class ProcessManager {
    killGraceMs;
    idFactory;
    now;
    logger;
    processes = new Map();
    helperPermissionsEnsured = false;
    constructor(options = {}) {
        this.killGraceMs = options.killGraceMs ?? 1_000;
        this.idFactory = options.idFactory ?? (() => randomUUID());
        this.now = options.now ?? (() => new Date());
        this.logger = options.logger ?? NOOP_LOGGER;
    }
    async ensureNodePtyHelperExecutable() {
        if (this.helperPermissionsEnsured || process.platform === 'win32') {
            return;
        }
        const packageJsonPath = require.resolve('node-pty/package.json');
        const packageRoot = dirname(packageJsonPath);
        const helperCandidates = [
            join(packageRoot, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'),
            join(packageRoot, 'build', 'Release', 'spawn-helper'),
            join(packageRoot, 'build', 'Debug', 'spawn-helper')
        ];
        let foundAnyHelper = false;
        for (const helperPath of helperCandidates) {
            try {
                const helperStats = await stat(helperPath);
                if (!helperStats.isFile()) {
                    continue;
                }
                foundAnyHelper = true;
            }
            catch {
                continue;
            }
            try {
                await access(helperPath, constants.X_OK);
                continue;
            }
            catch {
                // Continue and try to make it executable.
            }
            try {
                await chmod(helperPath, 0o755);
                await access(helperPath, constants.X_OK);
                this.logger.info({
                    helperPath
                }, '[ProcessManager] Fixed execute permissions for node-pty spawn-helper');
            }
            catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                throw new Error(`node-pty helper is not executable: ${helperPath} (${reason})`);
            }
        }
        if (!foundAnyHelper) {
            this.logger.debug({}, '[ProcessManager] No node-pty spawn-helper binary found to permission-fix');
        }
        this.helperPermissionsEnsured = true;
    }
    signalProcessTree(managed, signal) {
        if (managed.mode === 'pty' && managed.pty) {
            try {
                managed.pty.kill(signal);
                return true;
            }
            catch {
                // Fall through to direct pid signaling.
            }
        }
        const pid = managed.handle.pid;
        if (pid > 0) {
            try {
                // Detached child processes can be targeted via process-group id.
                process.kill(-pid, signal);
                return true;
            }
            catch {
                // Fall through to direct child signaling.
            }
            try {
                process.kill(pid, signal);
                return true;
            }
            catch {
                // Fall through to child handle signaling.
            }
        }
        if (managed.child) {
            return managed.child.kill(signal);
        }
        return false;
    }
    emitOutput(managed, stream, data) {
        const text = typeof data === 'string' ? data : data.toString('utf8');
        if (text.length === 0) {
            return;
        }
        managed.outputEmitter.emit('output', {
            stream,
            data: text,
            timestamp: this.now()
        });
    }
    markProcessClosed(processId, managed, exitCode) {
        const handle = managed.handle;
        handle.state = managed.killRequested
            ? 'stopped'
            : exitCode === 0
                ? 'completed'
                : 'crashed';
        handle.endedAt = this.now();
        this.logger.info({
            processId,
            pid: handle.pid,
            state: handle.state,
            exitCode
        }, '[ProcessManager] Process exited');
        managed.stateEmitter.emit('state', handle.state);
        this.processes.delete(processId);
        managed.resolveClose();
    }
    markProcessError(processId, managed, error) {
        managed.handle.state = 'crashed';
        managed.handle.endedAt = this.now();
        this.logger.error({
            processId,
            pid: managed.handle.pid,
            error: error.message
        }, '[ProcessManager] Process error');
        managed.stateEmitter.emit('state', managed.handle.state);
        this.processes.delete(processId);
        managed.rejectClose(error);
    }
    async spawn(projectId, command, args, opts = {}) {
        const env = { ...process.env, ...opts.env };
        const tty = Boolean(opts.tty);
        const id = this.idFactory();
        let closeResolved = false;
        let resolveClose;
        let rejectClose;
        const closePromise = new Promise((resolve, reject) => {
            resolveClose = resolve;
            rejectClose = reject;
        });
        const handle = {
            id,
            projectId,
            command,
            args: [...args],
            tty,
            pid: -1,
            state: 'running',
            startedAt: this.now(),
            endedAt: null
        };
        const managed = {
            mode: tty ? 'pty' : 'pipe',
            handle,
            child: null,
            pty: null,
            outputEmitter: new EventEmitter(),
            stateEmitter: new EventEmitter(),
            closePromise,
            resolveClose: () => {
                if (!closeResolved) {
                    closeResolved = true;
                    resolveClose();
                }
            },
            rejectClose: (error) => {
                if (!closeResolved) {
                    closeResolved = true;
                    rejectClose(error);
                }
            },
            killRequested: false,
            killGraceMs: opts.killGraceMs ?? this.killGraceMs
        };
        if (tty) {
            await this.ensureNodePtyHelperExecutable();
            const terminal = pty.spawn(command, args, {
                name: 'xterm-256color',
                cols: 120,
                rows: 36,
                cwd: opts.cwd,
                env: toPtyEnvironment(env)
            });
            managed.pty = terminal;
            handle.pid = terminal.pid;
            this.processes.set(id, managed);
            terminal.onData((data) => {
                this.emitOutput(managed, 'stdout', data);
            });
            terminal.onExit(({ exitCode, signal }) => {
                this.markProcessClosed(id, managed, exitCode);
            });
        }
        else {
            const child = spawn(command, args, {
                cwd: opts.cwd,
                env,
                stdio: 'pipe',
                detached: true
            });
            managed.child = child;
            handle.pid = child.pid ?? -1;
            this.processes.set(id, managed);
            child.stdout.on('data', (data) => this.emitOutput(managed, 'stdout', data));
            child.stderr.on('data', (data) => this.emitOutput(managed, 'stderr', data));
            child.once('error', (error) => {
                this.markProcessError(id, managed, error);
            });
            child.once('close', (code) => {
                this.markProcessClosed(id, managed, code);
            });
        }
        this.logger.info({
            projectId,
            processId: id,
            command,
            args,
            pid: handle.pid,
            tty,
            cwd: opts.cwd ?? null
        }, '[ProcessManager] Spawned process');
        return { ...handle, args: [...handle.args] };
    }
    sendInput(processId, input) {
        const managed = this.processes.get(processId);
        if (!managed) {
            throw new Error(`Process ${processId} is not running`);
        }
        if (managed.mode === 'pty') {
            if (!managed.pty) {
                throw new Error(`Process ${processId} pseudo-terminal is not available`);
            }
            managed.pty.write(input);
            return;
        }
        const child = managed.child;
        if (!child?.stdin.writable) {
            throw new Error(`Process ${processId} stdin is not writable`);
        }
        child.stdin.write(input);
    }
    async kill(processId, signal = 'SIGTERM') {
        const managed = this.processes.get(processId);
        if (!managed) {
            this.logger.debug({ processId, signal }, '[ProcessManager] Kill ignored; process missing');
            return;
        }
        managed.killRequested = true;
        this.logger.info({
            processId,
            pid: managed.handle.pid,
            signal
        }, '[ProcessManager] Killing process');
        if (signal === 'SIGKILL') {
            this.signalProcessTree(managed, 'SIGKILL');
            await managed.closePromise;
            return;
        }
        this.signalProcessTree(managed, 'SIGTERM');
        const timeout = setTimeout(() => {
            if (this.processes.has(processId)) {
                this.signalProcessTree(managed, 'SIGKILL');
            }
        }, managed.killGraceMs);
        try {
            await managed.closePromise;
        }
        finally {
            clearTimeout(timeout);
        }
    }
    list() {
        return [...this.processes.values()].map((managed) => ({
            ...managed.handle,
            args: [...managed.handle.args]
        }));
    }
    onOutput(processId, cb) {
        const managed = this.processes.get(processId);
        if (!managed) {
            throw new Error(`Process ${processId} is not running`);
        }
        const listener = (chunk) => cb(chunk);
        managed.outputEmitter.on('output', listener);
        return () => {
            managed.outputEmitter.off('output', listener);
        };
    }
    onStateChange(processId, cb) {
        const managed = this.processes.get(processId);
        if (!managed) {
            throw new Error(`Process ${processId} is not running`);
        }
        const listener = (state) => cb(state);
        managed.stateEmitter.on('state', listener);
        return () => {
            managed.stateEmitter.off('state', listener);
        };
    }
    async shutdown() {
        const processIds = [...this.processes.keys()];
        await Promise.allSettled(processIds.map((processId) => this.kill(processId)));
    }
}
