'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { fileURLToPath } = require('node:url');

const SERVICE = '/exa.language_server_pb.LanguageServerService/';

function canonicalPath(value, platform = process.platform) {
    const paths = platform === 'win32' ? path.win32 : path.posix;
    let resolved = paths.resolve(value);
    try { resolved = fs.realpathSync.native(resolved); }
    catch { /* A workspace can disappear while its backend is still running. */ }
    return platform === 'win32' ? path.win32.normalize(resolved).toLowerCase() : resolved;
}

function backendFromProcess(args, parentPid, ownerPid, roots, { platform = process.platform } = {}) {
    const executable = (platform === 'win32' ? path.win32 : path.posix).basename(args[0] || '');
    const official = platform === 'win32' ? /^agy(?:\.exe)?$/i.test(executable) : executable === 'agy';
    if (parentPid !== ownerPid || !official || !args.includes('--hub')) return;
    const value = name => {
        const inline = args.find(arg => arg.startsWith(`${name}=`));
        if (inline) return inline.slice(name.length + 1);
        const index = args.indexOf(name);
        return index < 0 ? undefined : args[index + 1];
    };
    const dirs = args.filter(arg => arg.startsWith('--add-dir=')).map(arg => canonicalPath(arg.slice(10), platform));
    const canonicalRoots = roots.map(root => canonicalPath(root, platform));
    if (!dirs.length || !dirs.every(dir => canonicalRoots.includes(dir))) return;
    const port = Number(value('--hub-port'));
    const token = value('--csrf_token');
    if (Number.isInteger(port) && port > 0 && port < 65536 && token) return { port, token };
}

// macOS ps joins argv with spaces without shell quoting. Split at option boundaries,
// preserving spaces, apostrophes and backslashes inside executable/workspace paths.
// Never pass this text through a shell or interpret quotes as shell syntax.
function backendFromPs(output, ownerPid, roots) {
    for (const line of output.split('\n')) {
        const row = /^\s*(\d+)\s+(\d+) (.*)$/.exec(line);
        if (!row || Number(row[2]) !== ownerPid) continue;
        const args = row[3].trimStart().split(/ (?=--[a-zA-Z][\w-]*(?:[= ]|$))/);
        const backend = backendFromProcess(args.flatMap(arg => {
            const separate = /^(--[\w-]+) (.*)$/.exec(arg);
            return separate ? separate.slice(1) : [arg];
        }), Number(row[2]), ownerPid, roots, { platform: 'darwin' });
        if (backend) return { ...backend, pid: Number(row[1]) };
    }
}

// Decode the Windows argv quoting used by native process creation, not shell syntax.
// Backslashes are literal unless followed by a double quote; single quotes stay literal.
// https://learn.microsoft.com/en-us/cpp/c-language/parsing-c-command-line-arguments
function windowsArgv(commandLine) {
    const args = [];
    let index = 0;
    while (index < commandLine.length) {
        while (/[ \t]/.test(commandLine[index] || '') && index < commandLine.length) index++;
        if (index === commandLine.length) break;
        let arg = '';
        let quoted = false;
        while (index < commandLine.length) {
            if (!quoted && /[ \t]/.test(commandLine[index])) break;
            let slashes = 0;
            while (commandLine[index] === '\\') { slashes++; index++; }
            if (commandLine[index] === '"') {
                arg += '\\'.repeat(Math.floor(slashes / 2));
                if (slashes % 2) arg += '"';
                else if (quoted && commandLine[index + 1] === '"') { arg += '"'; index++; }
                else quoted = !quoted;
                index++;
            } else {
                arg += '\\'.repeat(slashes);
                if (index < commandLine.length && (quoted || !/[ \t]/.test(commandLine[index]))) arg += commandLine[index++];
            }
        }
        args.push(arg);
    }
    return args;
}

function backendFromWindows(output, ownerPid, roots) {
    // Windows PowerShell emits a single object for one result, and no text for none.
    const decoded = output.trim() ? JSON.parse(output.replace(/^\uFEFF/, '')) : [];
    const rows = Array.isArray(decoded) ? decoded : [decoded];
    for (const row of rows) {
        if (!row || !Number.isInteger(row.ProcessId) || row.ProcessId <= 0
            || row.ParentProcessId !== ownerPid || typeof row.CommandLine !== 'string') continue;
        const backend = backendFromProcess(windowsArgv(row.CommandLine), row.ParentProcessId, ownerPid, roots, { platform: 'win32' });
        if (backend) return { ...backend, pid: row.ProcessId };
    }
}

function discoverBackend(ownerPid, roots, { platform = process.platform, procRoot = '/proc', exec = execFileSync } = {}) {
    // The PID is the only dynamic value in the Windows inspection script.
    if (!Number.isSafeInteger(ownerPid) || ownerPid <= 0) throw new Error('Invalid extension host PID.');
    if (platform === 'darwin') {
        let output;
        try {
            output = exec('/bin/ps', ['-ww', '-axo', 'pid=,ppid=,command='], {
                encoding: 'utf8', timeout: 3000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']
            });
        } catch {
            // Child-process errors may include stdout (and therefore backend tokens).
            throw new Error('Could not inspect macOS processes. Check that /bin/ps is permitted.');
        }
        const backend = backendFromPs(output, ownerPid, roots);
        if (backend) return backend;
    } else if (platform === 'linux') {
        for (const pid of fs.readdirSync(procRoot)) {
            if (!/^\d+$/.test(pid)) continue;
            try {
                const base = path.join(procRoot, pid);
                const status = fs.readFileSync(path.join(base, 'status'), 'utf8');
                const parent = Number(/^PPid:\s+(\d+)/m.exec(status)?.[1]);
                if (parent !== ownerPid) continue;
                const args = fs.readFileSync(path.join(base, 'cmdline'), 'utf8').split('\0').filter(Boolean);
                const backend = backendFromProcess(args, parent, ownerPid, roots, { platform });
                if (backend) return { ...backend, pid: Number(pid) };
            } catch { /* Processes can exit during discovery. */ }
        }
    } else if (platform === 'win32') {
        const powershell = path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
        const script = "$ErrorActionPreference = 'Stop'; [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); "
            + `Get-CimInstance Win32_Process -Filter "ParentProcessId = ${ownerPid} AND Name = 'agy.exe'" `
            + '| Select-Object ProcessId, ParentProcessId, CommandLine | ConvertTo-Json -Compress';
        let backend;
        try {
            const output = exec(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
                encoding: 'utf8', timeout: 5000, maxBuffer: 8 * 1024 * 1024,
                windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
            });
            backend = backendFromWindows(output, ownerPid, roots);
        } catch {
            // Neither subprocess failures nor JSON parse errors may expose backend tokens.
            throw new Error('Could not inspect Windows processes. Check that Windows PowerShell and Get-CimInstance are permitted.');
        }
        if (backend) return backend;
    } else {
        throw new Error(`Unsupported extension host: ${platform}. Use a Windows, macOS or Linux extension host.`);
    }
    const error = new Error('No Antigravity backend in this window. Open the Antigravity extension.');
    error.code = 'BACKEND_NOT_READY';
    throw error;
}

function isProcessRunning(pid, kill = process.kill) {
    try { kill(pid, 0); return true; }
    catch (error) { return error.code !== 'ESRCH'; }
}

function rpc(backend, method, body) {
    return new Promise((resolve, reject) => {
        const request = http.request({
            hostname: '127.0.0.1', port: backend.port, path: SERVICE + method, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Connect-Protocol-Version': '1', 'X-Codeium-Csrf-Token': backend.token }
        }, response => {
            const chunks = [];
            let bytes = 0;
            response.on('data', chunk => {
                bytes += chunk.length;
                if (bytes > 16 * 1024 * 1024) request.destroy(new Error(`${method}: response too large`));
                else chunks.push(chunk);
            });
            response.on('error', reject);
            response.on('end', () => {
                if (response.statusCode !== 200) return reject(new Error(`${method}: HTTP ${response.statusCode}`));
                try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
                catch { reject(new Error(`${method}: invalid JSON response`)); }
            });
        });
        request.setTimeout(5000, () => request.destroy(new Error(`${method}: timeout`)));
        request.on('error', reject);
        request.end(JSON.stringify(body));
    });
}

function belongsToWorkspace(summary, roots, { platform = process.platform } = {}) {
    const uris = summary.workspaces?.map(item => item.workspaceFolderAbsoluteUri) || [];
    if (!uris.length) return false;
    try {
        const canonicalRoots = roots.map(root => canonicalPath(root, platform));
        return uris.every(uri => canonicalRoots.includes(canonicalPath(fileURLToPath(uri, { windows: platform === 'win32' }), platform)));
    }
    catch { return false; }
}

function pendingCommand(step) {
    if (step?.status !== 'CORTEX_STEP_STATUS_WAITING') return;
    const request = step.requestedInteraction;
    if (!request || Object.keys(request).some(key => key !== 'permission')) return;
    const permission = request.permission;
    if (permission?.resource?.action !== 'command' || typeof permission.resource.target !== 'string' || !permission.resource.target) return;
    // Explicit Ask rules, hook decisions and unrecognised prompt types stay manual.
    if (permission.triggerSource?.type !== 'TYPE_DEFAULT_FALLBACK') return;
    if (permission.persistSuggestionType === 'PERSIST_SUGGESTION_TYPE_BLOCKED') return;
    if (permission.approvalScopeFilter && !['PERMISSION_SCOPE_UNSPECIFIED', 'PERMISSION_SCOPE_ONCE'].includes(permission.approvalScopeFilter)) return;
    return { target: permission.resource.target, completed: step.completedInteractions?.length || 0 };
}

function approvalBody(cascadeId, trajectoryId, stepIndex) {
    return { cascadeId, interaction: { trajectoryId, stepIndex, permission: { allow: true, scope: 'PERMISSION_SCOPE_ONCE' } } };
}

function isVerified(step, item) {
    const completion = step?.completedInteractions?.[item.completed];
    return completion?.request?.permission?.resource?.action === 'command'
        && completion.request.permission.resource.target === item.target
        && completion.response?.trajectoryId === item.trajectoryId
        && completion.response?.stepIndex === item.stepIndex
        && completion.response?.permission?.allow === true
        && completion.response.permission.scope === 'PERMISSION_SCOPE_ONCE';
}

class Acceptor {
    constructor({ call, roots, active = () => true, log = () => {} }) {
        this.call = call;
        this.roots = roots;
        this.active = active;
        this.log = log;
        this.seen = new Set();
        this.unverified = new Map();
        this.cursors = new Map();
        this.verified = 0;
        this.busy = false;
    }

    async readSteps(cascadeId, stepOffset) {
        // The default projection includes large historical snapshots; use the same projection as the official extension.
        return this.call('GetCascadeTrajectorySteps', {
            cascadeId, stepOffset, trajectoryVerbosity: 'CLIENT_TRAJECTORY_VERBOSITY_PROD_UI'
        });
    }

    async readStep(item) {
        const result = await this.readSteps(item.cascadeId, item.stepIndex);
        return result.steps?.[0];
    }

    async verify() {
        for (const [key, item] of this.unverified) {
            if (!this.active()) return;
            const step = await this.readStep(item);
            if (isVerified(step, item)) {
                this.unverified.delete(key);
                this.verified++;
                this.log(`VERIFIED allow once: conversation ${item.cascadeId.slice(0, 8)}, step ${item.stepIndex}`);
            } else if (Date.now() - item.sentAt > 30000) {
                this.unverified.delete(key);
                this.log(`UNVERIFIED submission: step ${item.stepIndex}; inspect Antigravity. No automatic retry.`);
            }
        }
    }

    async scan() {
        if (this.busy || !this.active()) return;
        this.busy = true;
        try {
            await this.verify();
            const all = await this.call('GetAllCascadeTrajectories', {});
            // Proto JSON omits an empty map: {} is a normal response before any conversations load.
            if (!all || typeof all !== 'object' || Array.isArray(all)
                || (all.trajectorySummaries === undefined && Object.keys(all).length !== 0)
                || (all.trajectorySummaries !== undefined && (!all.trajectorySummaries || typeof all.trajectorySummaries !== 'object' || Array.isArray(all.trajectorySummaries)))) {
                throw new Error('Unsupported Antigravity summaries response');
            }
            for (const [cascadeId, summary] of Object.entries(all.trajectorySummaries || {})) {
                if (!this.active()) break;
                if (summary.status !== 'CASCADE_RUN_STATUS_RUNNING' || !belongsToWorkspace(summary, this.roots)) continue;
                if (typeof summary.trajectoryId !== 'string' || !summary.trajectoryId) continue;
                const total = Number(summary.stepCount) || 0;
                const previous = this.cursors.get(cascadeId);
                let offset = previous?.trajectoryId === summary.trajectoryId
                    ? Math.min(previous.offset, Math.max(0, total - 1)) : 0;
                let firstUnfinished;
                while (offset < total && this.active()) {
                    const page = await this.readSteps(cascadeId, offset);
                    if (!Array.isArray(page.steps) || !page.steps.length) break;
                    for (const [localIndex, step] of page.steps.entries()) {
                        if (['CORTEX_STEP_STATUS_WAITING', 'CORTEX_STEP_STATUS_RUNNING'].includes(step.status)) {
                            firstUnfinished ??= offset + localIndex;
                        }
                        const pending = pendingCommand(step);
                        if (!pending) continue;
                        const item = { cascadeId, trajectoryId: summary.trajectoryId, stepIndex: offset + localIndex, ...pending };
                        const key = JSON.stringify([cascadeId, item.trajectoryId, item.stepIndex, item.completed, item.target]);
                        if (this.seen.has(key)) continue;
                        const fresh = pendingCommand(await this.readStep(item));
                        if (!this.active() || !fresh || fresh.target !== item.target || fresh.completed !== item.completed) continue;
                        // Record before sending: ambiguous timeouts must not approve a later request by retrying.
                        this.seen.add(key);
                        if (this.seen.size > 2000) this.seen.delete(this.seen.values().next().value);
                        await this.call('HandleCascadeUserInteraction', approvalBody(cascadeId, item.trajectoryId, item.stepIndex));
                        this.unverified.set(key, { ...item, sentAt: Date.now() });
                        this.log(`SUBMITTED allow once: conversation ${cascadeId.slice(0, 8)}, step ${item.stepIndex}`);
                    }
                    offset += page.steps.length;
                }
                // Keep revisiting unfinished steps, even when newer steps have appeared after them.
                this.cursors.set(cascadeId, { trajectoryId: summary.trajectoryId, offset: firstUnfinished ?? Math.max(0, total - 1) });
            }
            await this.verify();
            return { verified: this.verified, pendingVerification: this.unverified.size };
        } finally { this.busy = false; }
    }
}

module.exports = { backendFromProcess, backendFromPs, backendFromWindows, windowsArgv, discoverBackend, isProcessRunning, rpc, belongsToWorkspace, pendingCommand, approvalBody, isVerified, Acceptor };
