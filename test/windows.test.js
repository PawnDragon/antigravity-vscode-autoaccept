'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { backendFromProcess, backendFromWindows, windowsArgv, discoverBackend, belongsToWorkspace } = require('../core');

const roots = [String.raw`C:\Users\Example\中文 project's folder`, String.raw`D:\second workspace`];
const executable = String.raw`C:\Users\Example\Application Support\Antigravity\agy.exe`;
const commandLine = `"${executable}" --hub --hub-port=12345 --csrf_token=fixture-only "--add-dir=${roots[0]}" "--add-dir=${roots[1]}"`;
const row = (changes = {}) => ({ ProcessId: 43, ParentProcessId: 42, CommandLine: commandLine, ...changes });
const backend = { pid: 43, port: 12345, token: 'fixture-only' };

test('Windows decodes native argv quoting, escaped quotes and trailing backslashes', () => {
    assert.deepEqual(windowsArgv(commandLine), [executable, '--hub', '--hub-port=12345', '--csrf_token=fixture-only', ...roots.map(root => '--add-dir=' + root)]);
    assert.deepEqual(windowsArgv(String.raw`agy.exe "a b" c\ "" "say \"yes\"" "C:\space dir\\"`), ['agy.exe', 'a b', 'c\\', '', 'say "yes"', 'C:\\space dir\\']);
    assert.deepEqual(windowsArgv(String.raw`  agy.exe a\\\b d"e f"g h   `), ['agy.exe', 'a\\\\\\b', 'de fg', 'h']);
    assert.deepEqual(windowsArgv('agy.exe\t"double ""quote"""'), ['agy.exe', 'double "quote"']);
    assert.deepEqual(windowsArgv(' \t '), []);
});

test('Windows discovers only this host and workspace, from single-object or array CIM JSON', () => {
    assert.deepEqual(backendFromWindows(JSON.stringify(row()), 42, roots), backend);
    const rows = [row({ ParentProcessId: 99 }), row({ CommandLine: commandLine.replace('agy.exe', 'other.exe') }), row()];
    assert.deepEqual(backendFromWindows(JSON.stringify(rows), 42, roots), backend);
    assert.deepEqual(backendFromWindows('\uFEFF' + JSON.stringify(row()), 42, roots), backend);
    assert.equal(backendFromWindows(JSON.stringify(row()), 1, roots), undefined);
    assert.equal(backendFromWindows(JSON.stringify(row()), 42, [roots[0]]), undefined);
    for (const output of ['', '\r\n', 'null', '[]', '{}', JSON.stringify(row({ CommandLine: null })), JSON.stringify(row({ ProcessId: 0 }))]) {
        assert.equal(backendFromWindows(output, 42, roots), undefined);
    }
});

test('Windows supports separate flags, case-insensitive executable and workspace paths', () => {
    const args = windowsArgv(commandLine.replace('--hub-port=12345 --csrf_token=fixture-only', '--hub-port 12345 --csrf_token fixture-only'));
    args[0] = executable.toUpperCase();
    assert.deepEqual(backendFromProcess(args, 42, 42, roots.map(root => root.toLowerCase().replaceAll('\\', '/')), { platform: 'win32' }), { port: 12345, token: 'fixture-only' });
    assert.equal(backendFromWindows(JSON.stringify(row({ CommandLine: commandLine.replace('--hub ', '') })), 42, roots), undefined);
    assert.equal(backendFromWindows(JSON.stringify(row({ CommandLine: commandLine.replace('12345', '65536') })), 42, roots), undefined);
    assert.equal(backendFromWindows(JSON.stringify(row({ CommandLine: commandLine.replaceAll('--add-dir=', '--other=') })), 42, roots), undefined);
    assert.equal(backendFromWindows(JSON.stringify(row({ CommandLine: commandLine.replace(roots[1], roots[1] + '-other') })), 42, roots), undefined);
});

test('Windows workspace URI matching handles drive letters, Unicode, UNC and unrelated folders', () => {
    const summary = { workspaces: [{ workspaceFolderAbsoluteUri: 'file:///c:/users/example/' + encodeURIComponent("中文 project's folder") }] };
    assert.equal(belongsToWorkspace(summary, [roots[0]], { platform: 'win32' }), true);
    assert.equal(belongsToWorkspace(summary, [roots[0] + '-other'], { platform: 'win32' }), false);
    const unc = { workspaces: [{ workspaceFolderAbsoluteUri: 'file://server/share/Work%20Space' }] };
    assert.equal(belongsToWorkspace(unc, [String.raw`\\SERVER\share\work space` + '\\'], { platform: 'win32' }), true);
    assert.equal(belongsToWorkspace({ workspaces: [...summary.workspaces, ...unc.workspaces] }, [roots[0]], { platform: 'win32' }), false);
    assert.equal(belongsToWorkspace({ workspaces: [{ workspaceFolderAbsoluteUri: 'file:///c:/bad%2Fpath' }] }, roots, { platform: 'win32' }), false);
});

test('Windows uses a hidden, bounded PowerShell CIM query without interpolating workspace paths', () => {
    let calls = 0;
    assert.deepEqual(discoverBackend(42, roots, { platform: 'win32', exec: (file, args, options) => {
        calls++;
        assert.equal(file, path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'));
        assert.deepEqual(args.slice(0, 4), ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command']);
        assert.match(args[4], /Get-CimInstance Win32_Process/);
        assert.match(args[4], /ParentProcessId = 42 AND Name = 'agy.exe'/);
        assert.ok(roots.every(root => !args[4].includes(root)));
        assert.equal(options.encoding, 'utf8');
        assert.equal(options.windowsHide, true);
        assert.equal(options.shell, undefined);
        assert.equal(options.timeout, 5000);
        assert.equal(options.maxBuffer, 8 * 1024 * 1024);
        return JSON.stringify(row());
    } }), backend);
    assert.equal(calls, 1);
    assert.throws(() => discoverBackend(42, roots, { platform: 'win32', exec: () => '' }), error => error.code === 'BACKEND_NOT_READY');
    assert.throws(() => discoverBackend('42; injected', roots, { platform: 'win32', exec: () => assert.fail('Must not execute') }), /Invalid extension host PID/);
});

test('Windows subprocess and malformed JSON errors never disclose backend tokens', () => {
    for (const exec of [() => { throw new Error('--csrf_token=private-token'); }, () => '{"CommandLine":"--csrf_token=private-token" broken']) {
        assert.throws(() => discoverBackend(42, roots, { platform: 'win32', exec }), error => {
            assert.match(error.message, /Could not inspect Windows processes/);
            assert.equal(error.code, undefined);
            assert.equal(error.cause, undefined);
            assert.ok(!error.stack.includes('private-token'));
            return true;
        });
    }
});
