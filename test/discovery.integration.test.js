'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { discoverBackend, isProcessRunning, rpc, Acceptor } = require('../core');

test(`native ${process.platform} environment-token discovery, allow-once verification and backend exit`, {
    skip: !['linux', 'win32'].includes(process.platform), timeout: 20000
}, async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-vscode-native-'));
    // A junction in discovery.test.js covers aliases; this path exercises real argv encoding.
    const workspace = path.join(directory, "中文 project's folder & $literal");
    fs.mkdirSync(workspace);
    const executable = path.join(directory, process.platform === 'win32' ? 'agy.exe' : 'agy');
    if (process.platform === 'win32') fs.copyFileSync(process.execPath, executable);
    else fs.symlinkSync(process.execPath, executable);
    const worker = path.join(directory, 'worker.js');
    fs.writeFileSync(worker, 'setInterval(() => {}, 1000);\n');
    let child;
    t.after(async () => {
        if (child && child.exitCode === null && child.signalCode === null) {
            const exited = once(child, 'exit');
            child.kill();
            await exited;
        }
        fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    });

    const token = 'environment-integration-fixture';
    const request = { permission: { resource: { action: 'command', target: 'fixture only; never executed' }, triggerSource: { type: 'TYPE_DEFAULT_FALLBACK' } } };
    let step = { status: 'CORTEX_STEP_STATUS_WAITING', requestedInteraction: request };
    let submissions = 0;
    const server = http.createServer(async (req, res) => {
        assert.equal(req.headers['x-codeium-csrf-token'], token);
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        let response;
        switch (req.url.split('/').pop()) {
            case 'GetAllCascadeTrajectories':
                response = { trajectorySummaries: { fixture: { status: 'CASCADE_RUN_STATUS_RUNNING', trajectoryId: 'native-fixture', stepCount: 1, workspaces: [{ workspaceFolderAbsoluteUri: pathToFileURL(process.platform === 'win32' ? workspace.toLowerCase() : workspace).href }] } } };
                break;
            case 'GetCascadeTrajectorySteps':
                response = { steps: [step] };
                break;
            case 'HandleCascadeUserInteraction':
                assert.deepEqual(body, { cascadeId: 'fixture', interaction: { trajectoryId: 'native-fixture', stepIndex: 0, permission: { allow: true, scope: 'PERMISSION_SCOPE_ONCE' } } });
                submissions++;
                step = { status: 'CORTEX_STEP_STATUS_DONE', completedInteractions: [{ request, response: body.interaction }] };
                response = {};
                break;
            default:
                assert.fail('Unexpected RPC method');
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(response));
    });
    t.after(() => new Promise(resolve => server.close(resolve)));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    child = spawn(executable, [worker, '--hub', `--hub-port=${port}`, `--add-dir=${workspace}`], {
        env: { ...process.env, ANTIGRAVITY_SERVER_CSRF_TOKEN: token }, windowsHide: true, stdio: 'ignore'
    });
    await once(child, 'spawn');

    const connection = { port, csrfToken: token };
    const backend = discoverBackend(process.pid, [workspace], { connection });
    assert.deepEqual(backend, { pid: child.pid, port, token });
    if (process.platform === 'linux') {
        assert.deepEqual(discoverBackend(process.pid, [workspace]), backend);
        assert.ok(!fs.readFileSync(`/proc/${child.pid}/cmdline`, 'utf8').includes(token));
    }
    assert.equal(isProcessRunning(backend.pid), true);
    assert.throws(() => discoverBackend(process.pid, [workspace + '-other'], { connection }), error => error.code === 'BACKEND_NOT_READY');
    const messages = [];
    const acceptor = new Acceptor({ roots: [workspace], call: (method, body) => rpc(backend, method, body), log: message => messages.push(message) });
    assert.equal((await acceptor.scan()).verified, 1);
    await acceptor.scan();
    assert.equal(submissions, 1);
    assert.ok(messages.some(message => message.startsWith('VERIFIED')));

    const exited = once(child, 'exit');
    child.kill();
    await exited;
    assert.equal(isProcessRunning(backend.pid), false);
    assert.throws(() => discoverBackend(process.pid, [workspace], { connection }), error => error.code === 'BACKEND_NOT_READY');
});
