'use strict';

const CONFIGURATION = 'antigravityVscodeAutoAccept';
const LEGACY_CONFIGURATION = 'antigravitySidebarAutoAccept';

function explicitValue(configuration, key) {
    const values = configuration.inspect(key);
    return values?.workspaceFolderValue ?? values?.workspaceValue ?? values?.globalValue;
}

function readSetting(workspace, key, fallback) {
    const current = workspace.getConfiguration(CONFIGURATION);
    const legacy = workspace.getConfiguration(LEGACY_CONFIGURATION);
    return explicitValue(current, key) ?? explicitValue(legacy, key) ?? current.get(key, fallback);
}

module.exports = { CONFIGURATION, LEGACY_CONFIGURATION, readSetting };
