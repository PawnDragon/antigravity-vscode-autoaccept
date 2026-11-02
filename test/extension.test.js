'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { CONFIGURATION, LEGACY_CONFIGURATION } = require('../settings');

function activateFixture(previous) {
    const commands = new Map();
    const updates = [];
    const logs = [];
    const values = new Map();
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
            getExtension: id => id === 'Pawnkoolong.antigravity-sidebar-autoaccept' ? previous : undefined
        }
    };
    const core = {
        discoverBackend: () => ({ pid: 123, port: 12345, token: 'fixture-only' }),
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
    return { commands, updates, logs, status, values, scans: () => scans, timers: () => timers };
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
