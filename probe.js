'use strict';
const path = require('node:path');
const { discoverBackend, rpc } = require('./core');

async function main() {
    const ownerPid = Number(process.argv[2]);
    const workspace = path.resolve(process.argv[3] || process.cwd());
    if (!Number.isInteger(ownerPid) || ownerPid <= 0) throw new Error('Usage: node probe.js <extension-host-pid> <workspace>');
    const backend = discoverBackend(ownerPid, [workspace]);
    const result = await rpc(backend, 'GetAllCascadeTrajectories', {});
    console.log(JSON.stringify({ connected: true, backendPid: backend.pid, conversationCount: Object.keys(result.trajectorySummaries || {}).length }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
