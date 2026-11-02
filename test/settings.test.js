'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CONFIGURATION, LEGACY_CONFIGURATION, readSetting } = require('../settings');

function workspace(current = {}, legacy = {}, defaults = { enabled: false, intervalMs: 1000 }) {
    return { getConfiguration(section) {
        const values = section === CONFIGURATION ? current : legacy;
        assert.ok([CONFIGURATION, LEGACY_CONFIGURATION].includes(section));
        return {
            inspect: key => values[key],
            get: (key, fallback) => defaults[key] ?? fallback
        };
    } };
}

test('renamed extension stays OFF by default and keeps the existing interval', () => {
    assert.equal(readSetting(workspace(), 'enabled', false), false);
    assert.equal(readSetting(workspace(), 'intervalMs', 1000), 1000);
});

test('existing user and workspace settings continue to work after the rename', () => {
    for (const scope of ['globalValue', 'workspaceValue', 'workspaceFolderValue']) {
        const old = { enabled: { [scope]: true }, intervalMs: { [scope]: 2500 } };
        assert.equal(readSetting(workspace({}, old), 'enabled', false), true);
        assert.equal(readSetting(workspace({}, old), 'intervalMs', 1000), 2500);
    }
});

test('an explicit new OFF overrides legacy ON, while new defaults do not mask legacy values', () => {
    const old = { enabled: { workspaceValue: true } };
    assert.equal(readSetting(workspace({ enabled: { workspaceValue: false } }, old), 'enabled', false), false);
    assert.equal(readSetting(workspace({ enabled: { defaultValue: false } }, old), 'enabled', false), true);
});

test('new settings take priority and preserve normal configuration scope precedence', () => {
    const current = { intervalMs: { globalValue: 1500, workspaceValue: 2000, workspaceFolderValue: 3000 } };
    const old = { intervalMs: { workspaceValue: 5000 } };
    assert.equal(readSetting(workspace(current, old), 'intervalMs', 1000), 3000);
    delete current.intervalMs.workspaceFolderValue;
    assert.equal(readSetting(workspace(current, old), 'intervalMs', 1000), 2000);
});
