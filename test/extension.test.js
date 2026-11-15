'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { CONFIGURATION, LEGACY_CONFIGURATION } = require('../settings');

function activateFixture(previous, official) {
    const commands = new Map();
    const updates = [];
    const logs = [];
    const values = new Map();
    const discoveries = [];
    let configure;
    let scans = 0;
    let timers = 0;
    const status = { show() {} };
    const vscode = {
        window: {
            createOutputChannel: () => ({ appendLine: value => logs.push(value), show() {} }),
            createStatusBarItem: () => status
        },
        StatusBarAlignment: { Right: 1 },
        ThemeColor: class {},
        ConfigurationTarget: { Workspace: 2 },
        workspace: {
            isTrusted: true,
            workspaceFolders: [{ uri: { scheme: 'file', fsPath: '/temporary/workspace' } }],
            getConfiguration: section => ({
                inspect: key => ({ workspaceValue: values.get(`${section}.${key}`) }),
                get: (key, fallback) => values.get(`${section}.${key}`) ?? fallback,
                update: async (key, value, target) => {
                    updates.push({ section, key, value, target });
                    values.set(`${section}.${key}`, value);
                    configure({ affectsConfiguration: name => name === section });
                }
            }),
            onDidChangeConfiguration: listener => { configure = listener; return {}; }
        },
        commands: {
            registerCommand: (name, callback) => { assert.equal(commands.has(name), false); commands.set(name, callback); return {}; },
            executeCommand: async name => commands.get(name)()
        },
        extensions: {
            getExtension: id => id === 'Pawnkoolong.antigravity-sidebar-autoaccept' ? previous
                : id === 'google.google-antigravity' ? official : undefined
        }
    };
    const core = {
        discoverBackend: (pid, roots, options) => { discoveries.push(options); return { pid: 123, port: 12345, token: 'fixture-only' }; },
        rpc: async () => ({}),
        isProcessRunning: () => true,
        Acceptor: class { async scan() { scans++; return { verified: 0 }; } }
    };
    const sandbox = {
        module: { exports: {} }, process,
        require: name => name === 'vscode' ? vscode : name === './core' ? core : name === './settings' ? require('../settings') : require(name),
        setInterval: () => ++timers, clearInterval() {}
    };
    vm.runInNewContext(fs.readFileSync(require.resolve('../extension'), 'utf8'), sandbox);
    sandbox.module.exports.activate({ extension: { packageJSON: { version: '0.1.5' } }, subscriptions: [] });
    return { commands, updates, logs, status, values, discoveries, scans: () => scans, timers: () => timers };
}

test('renamed extension exposes new commands and forwards legacy keybindings to new settings', async () => {
    const fixture = activateFixture();
    assert.match(fixture.status.text, /AG Auto Accept: OFF/);
    for (const name of ['toggle', 'check', 'showLogs']) {
        assert.ok(fixture.commands.has(`${CONFIGURATION}.${name}`));
        assert.ok(fixture.commands.has(`${LEGACY_CONFIGURATION}.${name}`));
    }
    await fixture.commands.get(`${LEGACY_CONFIGURATION}.toggle`)();
    assert.equal(fixture.updates[0].section, CONFIGURATION);
    assert.equal(fixture.updates[0].value, true);
    assert.equal(fixture.scans(), 1);
    await fixture.commands.get(`${CONFIGURATION}.toggle`)();
    assert.equal(fixture.updates[1].value, false);
    assert.match(fixture.status.text, /OFF/);
});

test('an active previous extension prevents duplicate polling and command registration conflicts', async () => {
    const fixture = activateFixture({ isActive: true });
    await fixture.commands.get(`${CONFIGURATION}.toggle`)();
    assert.match(fixture.status.text, /OFF/);
    assert.equal(fixture.scans(), 0);
    assert.equal(fixture.timers(), 0);
    assert.equal(fixture.commands.has(`${LEGACY_CONFIGURATION}.toggle`), false);
    assert.ok(fixture.logs.some(line => line.includes('disable the previous')));
});

test('connection checks and enabled scans use the current official extension exports without logging credentials', async () => {
    const official = { packageJSON: { version: '1.12.0' }, isActive: true, exports: { port: 12345, csrfToken: 'private-fixture-token' } };
    const fixture = activateFixture(undefined, official);
    await fixture.commands.get(`${CONFIGURATION}.check`)();
    assert.equal(fixture.discoveries[0].connection, official.exports);
    assert.equal(fixture.scans(), 0);
    official.exports = { port: 23456, csrfToken: 'private-replacement-token' };
    await fixture.commands.get(`${CONFIGURATION}.toggle`)();
    assert.equal(fixture.discoveries[1].connection, official.exports);
    assert.equal(fixture.scans(), 1);
    assert.ok(fixture.logs.every(line => !line.includes('private-')));
});

test('an inactive official extension can start later without activating it during a connection check', async () => {
    const official = { packageJSON: { version: '1.12.0' }, isActive: false, get exports() { assert.fail('Must not read inactive exports'); } };
    const fixture = activateFixture(undefined, official);
    await fixture.commands.get(`${CONFIGURATION}.check`)();
    assert.equal(fixture.discoveries[0].connection, undefined);
    Object.defineProperty(official, 'exports', { value: { port: 12345, csrfToken: 'fixture-only' } });
    official.isActive = true;
    await fixture.commands.get(`${CONFIGURATION}.check`)();
    assert.equal(fixture.discoveries[1].connection, official.exports);
});
