import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
const NOOP_LOGGER = {
    debug: () => { },
    info: () => { },
    error: () => { }
};
function truncateOutput(data, limit = 200) {
    if (data.length <= limit) {
        return data;
    }
    return `${data.slice(0, limit)}…`;
}
function toTclLiteral(value) {
    const escaped = value
        .replace(/\\/g, '\\\\')
        .replace(/{/g, '\\{')
        .replace(/}/g, '\\}');
    return `{${escaped}}`;
}
function buildExpectTtyBridgeScript(command, args) {
    return [
        'set timeout -1',
        `spawn -noecho ${[command, ...args].map(toTclLiteral).join(' ')}`,
        'interact',
        'lassign [wait] pid spawnid osError exitCode',
        'if {$osError == 0} {',
        '  exit $exitCode',
        '}',
        'exit 1'
    ].join('\n');
}
export class ProcessManager {
    killGraceMs;
    idFactory;
    now;
    logger;
    processes = new Map();
    constructor(options = {}) {
        this.killGraceMs = options.killGraceMs ?? 1_000;
        this.idFactory = options.idFactory ?? (() => randomUUID());
        this.now = options.now ?? (() => new Date());
        this.logger = options.logger ?? NOOP_LOGGER;
    }
    signalProcessTree(managed, signal) {
        const pid = managed.handle.pid;
        if (pid > 0) {
            try {
                // Child processes are spawned detached, so negative pid targets the whole group.
                process.kill(-pid, signal);
                return true;
            }
            catch {
                // Fall through to direct child signaling.
            }
        }
        return managed.child.kill(signal);
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
        console.log(`[ProcessManager] Output chunk: processId=${managed.handle.id} stream=${stream} bytes=${text.length} preview="${truncateOutput(text, 100).replace(/\n/g, '\\n')}"`);
        this.logger.debug({
            processId: managed.handle.id,
            stream,
            output: truncateOutput(text),
            bytes: text.length
        }, '[ProcessManager] Output chunk');
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
        const spawnCommand = tty ? 'expect' : command;
        const spawnArgs = tty ? ['-c', buildExpectTtyBridgeScript(command, args)] : args;
        const id = this.idFactory();
        let closeResolved = false;
        let resolveClose;
        let rejectClose;
        const closePromise = new Promise((resolve, reject) => {
            resolveClose = resolve;
            rejectClose = reject;
        });
        const child = spawn(spawnCommand, spawnArgs, {
            cwd: opts.cwd,
            env,
            stdio: 'pipe',
            detached: true
        });
        const handle = {
            id,
            projectId,
            command,
            args: [...args],
            tty,
            pid: child.pid ?? -1,
            state: 'running',
            startedAt: this.now(),
            endedAt: null
        };
        const managed = {
            handle,
            child,
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
        this.processes.set(id, managed);
        console.log(`[ProcessManager] Spawned process: processId=${id} pid=${handle.pid} tty=${tty} command=${command} args=${JSON.stringify(args).slice(0, 200)}`);
        this.logger.info({
            projectId,
            processId: id,
            command,
            args,
            pid: handle.pid,
            tty,
            cwd: opts.cwd ?? null
        }, '[ProcessManager] Spawned process');
        child.stdout.on('data', (data) => this.emitOutput(managed, 'stdout', data));
        child.stderr.on('data', (data) => this.emitOutput(managed, 'stderr', data));
        child.once('error', (error) => {
            console.log(`[ProcessManager] Process error: processId=${id} error=${error.message}`);
            this.markProcessError(id, managed, error);
        });
        child.once('close', (code) => {
            console.log(`[ProcessManager] Process closed: processId=${id} exitCode=${code}`);
            this.markProcessClosed(id, managed, code);
        });
        return { ...handle, args: [...handle.args] };
    }
    sendInput(processId, input) {
        const managed = this.processes.get(processId);
        if (!managed) {
            throw new Error(`Process ${processId} is not running`);
        }
        if (!managed.child.stdin.writable) {
            throw new Error(`Process ${processId} stdin is not writable`);
        }
        managed.child.stdin.write(input);
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
