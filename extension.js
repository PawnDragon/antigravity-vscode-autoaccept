'use strict';

// Status-bar interaction adapted from Ezra.auto-accept 1.2.0 (MIT; see LICENSE).
const vscode = require('vscode');
const path = require('node:path');
const { discoverBackend, isProcessRunning, rpc, Acceptor } = require('./core');
const { CONFIGURATION, LEGACY_CONFIGURATION, readSetting } = require('./settings');

function activate(context) {
    const output = vscode.window.createOutputChannel('Antigravity VS Code Auto Accept');
    const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    status.command = 'antigravityVscodeAutoAccept.toggle';
    const roots = (vscode.workspace.workspaceFolders || []).filter(folder => ['file', 'vscode-remote'].includes(folder.uri.scheme)).map(folder => path.resolve(folder.uri.fsPath));
    let enabled = false;
    let backend;
    let acceptor;
    let timer;
    let lastError;
    let ticking = false;
    const log = message => output.appendLine(`[${new Date().toISOString()}] ${message}`);
    const paint = (state, tooltip = '') => {
        status.text = `$(zap) AG Auto Accept: ${state}`;
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
            if (enabled) paint(waiting ? 'WAITING' : 'ERROR', `${message}. Open Antigravity VS Code Auto Accept: Show Logs.`);
            if (backend && !isProcessRunning(backend.pid)) { backend = undefined; acceptor = undefined; }
        } finally { ticking = false; }
    }
    function configure() {
        clearInterval(timer);
        const previous = vscode.extensions.getExtension('Pawnkoolong.antigravity-sidebar-autoaccept')
            || vscode.extensions.getExtension('securerag-local.antigravity-sidebar-autoaccept');
        enabled = !previous?.isActive && vscode.workspace.isTrusted && roots.length > 0 && readSetting(vscode.workspace, 'enabled', false);
        if (previous?.isActive) {
            paint('OFF');
            log('OFF: disable the previous Antigravity auto-accept extension before enabling this one.');
            return;
        }
        if (!enabled) { paint('OFF'); log('OFF: no new approvals will be submitted.'); return; }
        paint('CONNECTING');
        const interval = Math.max(500, readSetting(vscode.workspace, 'intervalMs', 1000));
        timer = setInterval(() => void tick(), interval);
        void tick();
    }
    context.subscriptions.push(output, status,
        vscode.commands.registerCommand('antigravityVscodeAutoAccept.toggle', async () => {
            await vscode.workspace.getConfiguration(CONFIGURATION).update('enabled', !enabled, vscode.ConfigurationTarget.Workspace);
        }),
        vscode.commands.registerCommand('antigravityVscodeAutoAccept.showLogs', () => output.show(true)),
        vscode.commands.registerCommand('antigravityVscodeAutoAccept.check', async () => {
            output.show(true);
            if (enabled) await tick();
            else {
                try { const found = discoverBackend(process.pid, roots); await rpc(found, 'GetAllCascadeTrajectories', {}); log(`CHECK OK: backend PID ${found.pid}; auto-accept remains OFF.`); }
                catch (error) { log(`CHECK FAILED: ${error.message}`); }
            }
        }),
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration(CONFIGURATION) || event.affectsConfiguration(LEGACY_CONFIGURATION)) configure();
        }),
        { dispose() { enabled = false; clearInterval(timer); } });
    // Keep existing keybindings and integrations working without cluttering the palette.
    if (!vscode.extensions.getExtension('Pawnkoolong.antigravity-sidebar-autoaccept')
        && !vscode.extensions.getExtension('securerag-local.antigravity-sidebar-autoaccept')) {
        for (const name of ['toggle', 'showLogs', 'check']) {
            context.subscriptions.push(vscode.commands.registerCommand(`${LEGACY_CONFIGURATION}.${name}`,
                () => vscode.commands.executeCommand(`${CONFIGURATION}.${name}`)));
        }
    }
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
