import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const bundle = await build({
  entryPoints: [new URL('../src/guest-power-cycle.ts', import.meta.url).pathname],
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{name: 'test-api', setup(builder) {
    builder.onResolve({filter: /\/api$/}, () => ({path: 'api', namespace: 'fixture'}));
    builder.onLoad({filter: /.*/, namespace: 'fixture'}, () => ({
      contents: 'export const api=(...args)=>globalThis.cycleAPI(...args); export const confirmedApi=api;'
    }));
  }}]
});
const {powerCycleGuest} = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
after(() => { delete globalThis.cycleAPI; });

function fixture({kind='vm', initial='running', verify=true, respond} = {}) {
  const messages = [], writes = [], reads = [], checkpoint = {};
  let power = initial;
  globalThis.cycleAPI = async (path, options) => {
    if (options.method === 'POST') {
      assert.deepEqual(JSON.parse(options.body), {node: 'n1'});
      writes.push(path);
    } else reads.push(path);
    const response = respond?.(path, options);
    if (response !== undefined) return response;
    if (path === `/proxmox/${kind}/n1/107/details?view=power`) return {status: {status: power}};
    if (path === `/actions/proxmox/${kind}/107/reboot` || path === `/actions/proxmox/${kind}/107/start`) return {result: {task: 'UPID:n1:power'}};
    if (path === '/tasks/n1/UPID%3An1%3Apower') {
      power = 'running';
      return {status: 'stopped', exitstatus: 'OK'};
    }
    if (path === '/proxmox/vm/n1/107/details?view=agent') return {os: {result: {name: 'Debian'}}};
    assert.fail('Unexpected endpoint ' + path);
  };
  return {writes, reads, messages, checkpoint, run: (signal = new AbortController().signal) =>
    powerCycleGuest('n1', '107', kind, message => messages.push(message), signal, checkpoint, verify)};
}

for (const kind of ['vm','lxc']) test(kind + ' OS update submits one host-managed restart and confirms running without an agent', async () => {
  const f = fixture({kind, verify: false});
  await f.run();
  assert.deepEqual(f.writes, [`/actions/proxmox/${kind}/107/reboot`]);
  assert.deepEqual(f.reads, [`/proxmox/${kind}/n1/107/details?view=power`, '/tasks/n1/UPID%3An1%3Apower', `/proxmox/${kind}/n1/107/details?view=power`]);
  assert.match(f.messages.join(' '), /shutting down.*automatically.*confirm the guest is running/i);
});

test('VM setup reports observed shutdown and waits for fresh agent data after boot', async () => {
  let polls = 0, powerReads = 0, probes = 0;
  const f = fixture({respond(path) {
    if (path.includes('/tasks/') && ++polls === 1) return {status: 'running'};
    if (path.endsWith('=power') && ++powerReads === 2) return {status: {status: 'stopped'}};
    if (path.endsWith('=agent') && ++probes === 1) return {os: {result: null}};
  }});
  await f.run();
  assert.equal(probes, 2);
  assert.deepEqual(f.writes, ['/actions/proxmox/vm/107/reboot']);
  assert.ok(f.messages.includes('Starting the guest…'));
  assert.match(f.messages.at(-1), /verifying guest access/i);
});

test('a guest already powered off is started directly', async () => {
  const f = fixture({kind:'lxc', initial:'stopped'});
  await f.run();
  assert.deepEqual(f.writes, ['/actions/proxmox/lxc/107/start']);
  assert.ok(!f.reads.some(path => path.endsWith('=agent')));
});

test('failed native restart reports the provider error without another write', async () => {
  const f = fixture({respond(path) {
    if (path.includes('/tasks/')) return {status:'stopped', exitstatus:'ERROR: shutdown timed out'};
  }});
  await assert.rejects(f.run(), /shutdown timed out/);
  assert.equal(f.writes.length, 1);
  assert.ok(!f.reads.some(path => path.endsWith('=agent')));
});

test('unknown or paused guest state prevents submission', async () => {
  for (const status of [{}, {status:'running',qmpstatus:'paused'}]) {
    const f = fixture({respond: () => ({status})});
    await assert.rejects(f.run(), /power state is unavailable/);
    assert.deepEqual(f.writes, []);
  }
});

test('an unknown task receipt or lost action response cannot replay the restart on retry', async () => {
  for (const outcome of ['empty', 'null', 'disconnected']) {
    const f = fixture({respond(path) {
      if (path.includes('/actions/')) {
        if (outcome === 'empty') return {result:{}};
        if (outcome === 'null') return null;
        throw new TypeError('Network error');
      }
    }});
    await assert.rejects(f.run(), /task history/);
    await assert.rejects(f.run(), /task history/);
    assert.equal(f.writes.length, 1);
  }
});

test('interrupted monitoring can resume the accepted task without a second power request', async () => {
  const controller = new AbortController();
  let interrupt = true;
  const f = fixture({respond(path) {
    if (path.includes('/tasks/') && interrupt) {
      controller.abort();
      throw controller.signal.reason;
    }
  }});
  await assert.rejects(f.run(controller.signal), {name:'AbortError'});
  interrupt = false;
  await f.run();
  assert.equal(f.writes.length, 1);
  assert.equal(f.reads.filter(p => p.includes('/tasks/')).length, 2);
});

test('retrying verification checks the running VM and agent without repeating a successful task', async () => {
  let denied = true;
  const f = fixture({respond(path) {
    if (path.endsWith('=agent') && denied) throw Object.assign(Error('Access denied'), {status:403});
  }});
  await assert.rejects(f.run(), /Access denied/);
  denied = false;
  await f.run();
  assert.equal(f.writes.length, 1);
  assert.equal(f.reads.filter(p => p.includes('/tasks/')).length, 1);
});

test('temporary connection loss during restart retries task reads only', async () => {
  let attempts = 0;
  const f = fixture({respond(path) {
    if (path.includes('/tasks/') && ++attempts === 1) throw Object.assign(Error('Gateway unavailable'), {status:502});
  }});
  await f.run();
  assert.equal(attempts, 2);
  assert.equal(f.writes.length, 1);
});
