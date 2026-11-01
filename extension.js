'use strict';

// Status-bar interaction adapted from Ezra.auto-accept 1.2.0 (MIT; see LICENSE).
const vscode = require('vscode');
const path = require('node:path');
const { discoverBackend, rpc, Acceptor } = require('./core');

function activate(context) {
    const output = vscode.window.createOutputChannel('Antigravity Sidebar Auto Accept');
    const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    status.command = 'antigravitySidebarAutoAccept.toggle';
    const roots = (vscode.workspace.workspaceFolders || []).filter(folder => ['file', 'vscode-remote'].includes(folder.uri.scheme)).map(folder => path.resolve(folder.uri.fsPath));
    let enabled = false;
    let backend;
    let acceptor;
    let timer;
    let lastError;
    let ticking = false;
    const log = message => output.appendLine(`[${new Date().toISOString()}] ${message}`);
    const paint = (state, tooltip = '') => {
        status.text = `$(zap) AG Sidebar: ${state}`;
        status.tooltip = tooltip || 'Antigravity command approvals in this workspace. Click to toggle.';
        status.backgroundColor = enabled ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
        status.show();
    };
    async function tick() {
        if (!enabled || ticking) return;
        ticking = true;
        try {
            if (!backend) {
                backend = discoverBackend(process.pid, roots);
                acceptor = new Acceptor({ call: (method, body) => rpc(backend, method, body), roots, active: () => enabled, log });
                log(`CONNECTED to this window's Antigravity backend (PID ${backend.pid}); command approvals only.`);
            }
            const result = await acceptor.scan();
            if (enabled) paint(`ON (${result?.verified ?? acceptor.verified})`);
            if (lastError) log('READY: connection recovered; scanning command approvals.');
            lastError = undefined;
        } catch (error) {
            const message = error?.message || 'Unknown error';
            const waiting = error.code === 'BACKEND_NOT_READY';
            if (message !== lastError) { log(`${waiting ? 'WAITING' : 'ERROR'}: ${message}`); lastError = message; }
            if (enabled) paint(waiting ? 'WAITING' : 'ERROR', `${message}. Open Antigravity Sidebar Auto Accept: Show Logs.`);
            if (backend && !require('node:fs').existsSync(`/proc/${backend.pid}`)) { backend = undefined; acceptor = undefined; }
        } finally { ticking = false; }
    }
    function configure() {
        clearInterval(timer);
        enabled = vscode.workspace.isTrusted && roots.length > 0 && vscode.workspace.getConfiguration('antigravitySidebarAutoAccept').get('enabled', false);
        if (!enabled) { paint('OFF'); log('OFF: no new approvals will be submitted.'); return; }
        paint('CONNECTING');
        const interval = Math.max(500, vscode.workspace.getConfiguration('antigravitySidebarAutoAccept').get('intervalMs', 1000));
        timer = setInterval(() => void tick(), interval);
        void tick();
    }
    context.subscriptions.push(output, status,
        vscode.commands.registerCommand('antigravitySidebarAutoAccept.toggle', async () => {
            await vscode.workspace.getConfiguration('antigravitySidebarAutoAccept').update('enabled', !enabled, vscode.ConfigurationTarget.Workspace);
        }),
        vscode.commands.registerCommand('antigravitySidebarAutoAccept.showLogs', () => output.show(true)),
        vscode.commands.registerCommand('antigravitySidebarAutoAccept.check', async () => {
            output.show(true);
            if (enabled) await tick();
            else {
                try { const found = discoverBackend(process.pid, roots); await rpc(found, 'GetAllCascadeTrajectories', {}); log(`CHECK OK: backend PID ${found.pid}; auto-accept remains OFF.`); }
                catch (error) { log(`CHECK FAILED: ${error.message}`); }
            }
        }),
        vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('antigravitySidebarAutoAccept')) configure(); }),
        { dispose() { enabled = false; clearInterval(timer); } });
    const official = vscode.extensions.getExtension('google.google-antigravity');
    log(`Activated v${context.extension.packageJSON.version}; official Antigravity ${official?.packageJSON.version || 'not installed in this host'}; extension host ${process.platform}.`);
    if (vscode.extensions.getExtension('Ezra.auto-accept')) {
        void vscode.commands.executeCommand('auto-accept.stop').then(
            () => log('Stopped the original Ezra command poller in this window.'),
            () => log('Could not stop Ezra automatically; use Auto Accept: Stop if its switch is ON.')
        );
    }
    configure();
}

module.exports = { activate };
