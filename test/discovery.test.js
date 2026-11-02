'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { backendFromProcess, backendFromPs, discoverBackend, isProcessRunning, belongsToWorkspace } = require('../core');

const roots = ["/Users/example/Projects/中文 project's folder", '/Users/example/second workspace'];
const args = ['/Users/example/Application Support/Antigravity/agy', '--hub', '--hub-port=12345', '--app_data_dir=antigravity', '--csrf_token=fixture-only', ...roots.map(root => '--add-dir=' + root)];
const row = (pid = 43, parent = 42, argv = args) => `  ${pid}  ${parent} ${argv.join(' ')}\n`;

test('macOS discovers its own backend with spaces, quotes, Unicode and multiple roots', () => {
    const output = row(7, 99) + row(8, 42, ['/usr/bin/other', ...args.slice(1)]) + row();
    assert.deepEqual(backendFromPs(output, 42, roots), { pid: 43, port: 12345, token: 'fixture-only' });
    assert.equal(backendFromPs(output, 1, roots), undefined);
    assert.equal(backendFromPs(row(), 42, [roots[0]]), undefined);
    assert.equal(backendFromPs(row(43, 1), 42, roots), undefined);
    assert.equal(backendFromPs(row(43, 42, args.filter(arg => !arg.startsWith('--add-dir='))), 42, roots), undefined);
    assert.equal(backendFromPs('malformed row\n', 42, roots), undefined);
});

test('macOS handles separate port and token values without interpreting path characters', () => {
    const separate = args.flatMap(arg => arg.startsWith('--hub-port=') || arg.startsWith('--csrf_token=') ? arg.split('=') : [arg]);
    assert.equal(backendFromPs(row(43, 42, separate), 42, roots).port, 12345);
    const special = ['/Users/example/$(literal)/back\\slash "quoted"'];
    const specialArgs = [...args.filter(arg => !arg.startsWith('--add-dir=')), '--add-dir=' + special[0]];
    assert.equal(backendFromPs(row(43, 42, specialArgs), 42, special).pid, 43);
});

test('macOS uses bounded ps discovery and returns the same backend shape as Linux', () => {
    let calls = 0;
    const result = discoverBackend(42, roots, { platform: 'darwin', exec: (file, argv, options) => {
        calls++;
        assert.equal(file, '/bin/ps');
        assert.deepEqual(argv, ['-ww', '-axo', 'pid=,ppid=,command=']);
        assert.equal(options.encoding, 'utf8');
        assert.equal(options.timeout, 3000);
        assert.equal(options.shell, undefined);
        return row();
    } });
    assert.equal(calls, 1);
    assert.deepEqual(result, { pid: 43, ...backendFromProcess(args, 42, 42, roots) });
    assert.throws(() => discoverBackend(42, roots, { platform: 'darwin', exec: () => '' }), error => error.code === 'BACKEND_NOT_READY');
});

test('macOS process inspection errors never expose subprocess output or tokens', () => {
    assert.throws(() => discoverBackend(42, roots, { platform: 'darwin', exec: () => {
        throw new Error('ps failed: --csrf_token=private-token');
    } }), error => /Could not inspect macOS processes/.test(error.message) && !JSON.stringify(error).includes('private-token'));
});

test('Linux discovery remains supported on every test host', t => {
    const procRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-vscode-linux-'));
    t.after(() => fs.rmSync(procRoot, { recursive: true, force: true }));
    for (const [pid, parent] of [[7, 99], [43, 42]]) {
        const directory = path.join(procRoot, String(pid));
        fs.mkdirSync(directory);
        fs.writeFileSync(path.join(directory, 'status'), `Name:\tagy\nPPid:\t${parent}\n`);
        fs.writeFileSync(path.join(directory, 'cmdline'), args.join('\0') + '\0');
    }
    assert.deepEqual(discoverBackend(42, roots, { platform: 'linux', procRoot }), { pid: 43, port: 12345, token: 'fixture-only' });
});

test('backend and conversation workspace matching resolve filesystem aliases', t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-vscode-alias-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const actual = path.join(directory, 'actual workspace');
    const alias = path.join(directory, 'alias');
    fs.mkdirSync(actual);
    fs.symlinkSync(actual, alias);
    const argv = [...args.filter(arg => !arg.startsWith('--add-dir=')), '--add-dir=' + actual];
    assert.ok(backendFromProcess(argv, 42, 42, [alias]));
    assert.equal(belongsToWorkspace({ workspaces: [{ workspaceFolderAbsoluteUri: pathToFileURL(actual).href }] }, [alias]), true);
    assert.equal(belongsToWorkspace({ workspaces: [{ workspaceFolderAbsoluteUri: pathToFileURL(actual + '-other').href }] }, [alias]), false);
});

test('backend liveness is portable and only a missing process triggers rediscovery', () => {
    assert.equal(isProcessRunning(43, (pid, signal) => { assert.equal(pid, 43); assert.equal(signal, 0); }), true);
    for (const code of ['ESRCH', 'EPERM']) {
        assert.equal(isProcessRunning(43, () => { throw Object.assign(new Error(code), { code }); }), code !== 'ESRCH');
    }
});
