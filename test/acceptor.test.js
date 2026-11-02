'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { backendFromProcess, discoverBackend, rpc, pendingCommand, belongsToWorkspace, Acceptor } = require('../core');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const roots = ['/workspaces/example'];
const summary = { status: 'CASCADE_RUN_STATUS_RUNNING', trajectoryId: 'trajectory-1', stepCount: 1, workspaces: [{ workspaceFolderAbsoluteUri: 'file://' + roots[0] }] };
const pending = () => ({ type: 'CORTEX_STEP_TYPE_RUN_COMMAND', status: 'CORTEX_STEP_STATUS_WAITING', requestedInteraction: { permission: { resource: { action: 'command', target: "printf 'autoaccept-smoke\\n'" }, triggerSource: { type: 'TYPE_DEFAULT_FALLBACK' } } } });
const clone = value => structuredClone(value);

function fakeBackend(step = pending()) {
    const state = { step, posts: [] };
    state.call = async (method, body) => {
        if (method === 'GetAllCascadeTrajectories') return { trajectorySummaries: { 'conversation-1': clone(summary) } };
        if (method === 'GetCascadeTrajectorySteps') return { steps: [clone(state.step)] };
        assert.equal(method, 'HandleCascadeUserInteraction');
        state.posts.push(body);
        state.step = { status: 'CORTEX_STEP_STATUS_DONE', completedInteractions: [{ request: step.requestedInteraction, response: body.interaction }] };
        return {};
    };
    return state;
}

test('discovers only the official backend owned by this extension host and workspace', () => {
    const args = ['/opt/antigravity/agy', '--hub', '--hub-port=12345', '--csrf_token=test-only', '--add-dir=' + roots[0]];
    assert.deepEqual(backendFromProcess(args, 42, 42, roots), { port: 12345, token: 'test-only' });
    assert.equal(backendFromProcess(args, 41, 42, roots), undefined);
    assert.equal(backendFromProcess(args, 42, 42, ['/another/workspace']), undefined);
    assert.equal(backendFromProcess(args.map(x => x.replace('12345', '99999')), 42, 42, roots), undefined);
});

test('does not process other workspaces, malformed URIs or empty workspace lists', () => {
    assert.equal(belongsToWorkspace(summary, roots), true);
    assert.equal(belongsToWorkspace(summary, ['/other']), false);
    assert.equal(belongsToWorkspace({ workspaces: [] }, roots), false);
    assert.equal(belongsToWorkspace({ workspaces: [{ workspaceFolderAbsoluteUri: 'https://example.org' }] }, roots), false);
});

test('only default-fallback command permission cards are eligible', () => {
    assert.ok(pendingCommand(pending()));
    const mutations = [
        s => { s.status = 'CORTEX_STEP_STATUS_DONE'; },
        s => { s.requestedInteraction = { askQuestion: { questions: [] } }; },
        s => { s.requestedInteraction.permission.resource.action = 'mcp'; },
        s => { s.requestedInteraction.permission.triggerSource.type = 'TYPE_ASK_RULE'; },
        s => { delete s.requestedInteraction.permission.triggerSource; },
        s => { s.requestedInteraction.permission.persistSuggestionType = 'PERSIST_SUGGESTION_TYPE_BLOCKED'; },
        s => { s.requestedInteraction.permission.approvalScopeFilter = 'PERMISSION_SCOPE_GLOBAL'; }
    ];
    for (const mutate of mutations) { const step = pending(); mutate(step); assert.equal(pendingCommand(step), undefined); }
});

test('submits native allow-once and verifies the actual recorded response, without persisting grants', async () => {
    const backend = fakeBackend();
    const messages = [];
    const acceptor = new Acceptor({ call: backend.call, roots, log: m => messages.push(m) });
    assert.equal((await acceptor.scan()).verified, 1);
    assert.deepEqual(backend.posts, [{ cascadeId: 'conversation-1', interaction: { trajectoryId: 'trajectory-1', stepIndex: 0, permission: { allow: true, scope: 'PERMISSION_SCOPE_ONCE' } } }]);
    assert.ok(messages.some(m => m.startsWith('VERIFIED')));
    assert.ok(messages.every(m => !m.includes('autoaccept-smoke')));
    await acceptor.scan();
    assert.equal(backend.posts.length, 1);
});

test('revalidates a prompt and never submits after it changes or the toggle is switched off', async () => {
    for (const mode of ['changed', 'stopped']) {
        const backend = fakeBackend();
        let active = true;
        let reads = 0;
        const call = async (method, body) => {
            const result = await backend.call(method, body);
            if (method === 'GetCascadeTrajectorySteps' && ++reads === 2) {
                if (mode === 'stopped') active = false;
                else result.steps[0].requestedInteraction.permission.resource.target = 'different command';
            }
            return result;
        };
        await new Acceptor({ call, roots, active: () => active }).scan();
        assert.equal(backend.posts.length, 0);
    }
});

test('does not retry an ambiguous approval timeout', async () => {
    const backend = fakeBackend();
    let attempts = 0;
    const call = (method, body) => {
        if (method === 'HandleCascadeUserInteraction') { attempts++; throw new Error('timeout'); }
        return backend.call(method, body);
    };
    const acceptor = new Acceptor({ call, roots });
    await assert.rejects(acceptor.scan(), /timeout/);
    await acceptor.scan();
    assert.equal(attempts, 1);
});

test('native HTTP transport handles a complete scan and reports errors visibly', async t => {
    const backend = fakeBackend();
    const server = http.createServer(async (req, res) => {
        assert.equal(req.headers['x-codeium-csrf-token'], 'test-only');
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const method = req.url.split('/').pop();
        if (method === 'Broken') { res.writeHead(501); res.end('{}'); return; }
        const data = await backend.call(method, JSON.parse(Buffer.concat(chunks).toString()));
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const connection = { port: server.address().port, token: 'test-only' };
    const acceptor = new Acceptor({ call: (method, body) => rpc(connection, method, body), roots });
    assert.equal((await acceptor.scan()).verified, 1);
    await assert.rejects(rpc(connection, 'Broken', {}), /HTTP 501/);
});

test('all step reads request the production UI projection, including approval verification', async () => {
    const backend = fakeBackend();
    const reads = [];
    const call = (method, body) => {
        if (method === 'GetCascadeTrajectorySteps') reads.push(body);
        return backend.call(method, body);
    };
    const result = await new Acceptor({ call, roots }).scan();
    assert.equal(result.verified, 1);
    assert.ok(reads.length >= 3);
    for (const body of reads) assert.equal(body.trajectoryVerbosity, 'CLIENT_TRAJECTORY_VERBOSITY_PROD_UI');
});

test('long conversations advance past completed history and keep revisiting unfinished steps', async () => {
    const steps = Array.from({ length: 150 }, () => ({ status: 'CORTEX_STEP_STATUS_DONE' }));
    steps[149] = { status: 'CORTEX_STEP_STATUS_RUNNING' };
    const offsets = [];
    let approvals = 0;
    const call = async (method, body) => {
        if (method === 'GetAllCascadeTrajectories') return { trajectorySummaries: { 'conversation-1': { ...summary, stepCount: steps.length } } };
        if (method === 'GetCascadeTrajectorySteps') { offsets.push(body.stepOffset); return { steps: clone(steps.slice(body.stepOffset)) }; }
        assert.equal(method, 'HandleCascadeUserInteraction');
        approvals++;
        const index = body.interaction.stepIndex;
        steps[index] = { status: 'CORTEX_STEP_STATUS_DONE', completedInteractions: [{ request: steps[index].requestedInteraction, response: body.interaction }] };
        return {};
    };
    const acceptor = new Acceptor({ call, roots });
    await acceptor.scan();
    assert.deepEqual(offsets, [0]);
    offsets.length = 0;
    steps[149] = pending();
    steps.push({ status: 'CORTEX_STEP_STATUS_DONE' });
    await acceptor.scan();
    assert.equal(approvals, 1);
    assert.ok(offsets.every(offset => offset >= 149), `Unexpected history reread: ${offsets}`);
    assert.equal(acceptor.verified, 1);
});

test('empty proto maps are idle, while malformed responses remain errors', async () => {
    for (const response of [{}, { trajectorySummaries: {} }]) {
        const acceptor = new Acceptor({ roots, call: async method => {
            assert.equal(method, 'GetAllCascadeTrajectories'); return response;
        } });
        assert.equal((await acceptor.scan()).verified, 0);
    }
    for (const response of [null, [], { unexpected: true }, { trajectorySummaries: [] }]) {
        await assert.rejects(new Acceptor({ roots, call: async () => response }).scan(), /Unsupported/);
    }
});

test('a backend that has not started is an expected waiting state', t => {
    const proc = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-sidebar-proc-'));
    t.after(() => fs.rmSync(proc, { recursive: true, force: true }));
    assert.throws(() => discoverBackend(42, roots, { platform: 'linux', procRoot: proc }), error => error.code === 'BACKEND_NOT_READY');
});
