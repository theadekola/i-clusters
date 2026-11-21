import assert from 'node:assert/strict';
import {once} from 'node:events';
import http from 'node:http';
import test from 'node:test';
import {WebSocket, WebSocketServer} from 'ws';

process.env.JWT_SECRET ||= 'test-only-console-secret-aaaaaaaaaaaaaaaaaaaaaaaa';
process.env.JWT_REFRESH_SECRET ||= 'test-only-refresh-secret-aaaaaaaaaaaaaaaaaaaaaaa';
const {createApp} = await import('../src/app.js');
const {createProxmoxConsole, consoleSocketPath} = await import('../src/proxmox-console.js');

async function listen(server, t) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('guest console connects with cluster credentials and confines the relay to one signed-in browser', async t => {
  const calls = [];
  let failure = 0, status = 'running', portOverride;
  const password = 'vnc-pass';
  const ticket = password + ':PVEVNC:fixture+/=';
  const authorization = 'PVEAPIToken=console@pve!test=fixture-secret';
  const provider = http.createServer(async (req, res) => {
    calls.push(req.url);
    assert.equal(req.headers.authorization, authorization);
    if (req.url.endsWith('/cluster/resources')) {
      return res.end(JSON.stringify({data: [
        {node: 'node01', vmid: 100, type: 'qemu', status},
        {node: 'node02', vmid: 101, type: 'lxc', status}
      ]}));
    }
    assert.match(req.url, /^\/api2\/json\/nodes\/node0[12]\/(qemu\/100|lxc\/101)\/vncproxy$/);
    assert.equal(req.method, 'POST');
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    assert.equal(Buffer.concat(chunks).toString(), 'websocket=1');
    const isVm = req.url.includes('/qemu/');
    const port = portOverride ?? (isVm ? '5901' : 5901);
    res.end(JSON.stringify({data: {ticket, port, ...(isVm ? {password} : {})}}));
  });
  const upstream = new WebSocketServer({noServer: true});
  provider.on('upgrade', (req, socket, head) => {
    calls.push(req.url);
    const url = new URL(req.url, 'http://fixture');
    assert.equal(req.headers.authorization, authorization);
    assert.match(url.pathname, /\/(qemu\/100|lxc\/101)\/vncwebsocket$/);
    assert.equal(url.searchParams.get('port'), '5901');
    assert.equal(url.searchParams.get('vncticket'), ticket);
    if (failure) return socket.end(`HTTP/1.1 ${failure} Failed\r\nContent-Length: 0\r\n\r\n`);
    upstream.handleUpgrade(req, socket, head, client => {
      client.send(Buffer.from('RFB 003.008\n'));
      client.on('message', (frame, binary) => client.send(frame, {binary}));
    });
  });
  const providerUrl = await listen(provider, t);
  t.after(() => { for (const client of upstream.clients) client.terminate(); upstream.close(); });
  process.env.PROXMOX_URL = providerUrl;
  process.env.PROXMOX_TOKEN_ID = 'console@pve!test';
  process.env.PROXMOX_TOKEN_SECRET = 'fixture-secret';

  const guestConsole = createProxmoxConsole();
  t.after(guestConsole.close);
  const audit = [];
  const app = createApp({
    profiles: null, guestConsole,
    authenticate(req, res, next) {
      if (!req.headers.authorization) return res.sendStatus(401);
      const role = req.headers.authorization === 'Bearer viewer' ? 'viewer' : 'operator';
      req.user = {role, sub: 'test-user', sid: 'test-session'};
      if (req.headers.authorization === 'Bearer restricted') req.user.permissionKeys = ['vm.view'];
      next();
    },
    audit: async (_req, ...entry) => audit.push(entry)
  });
  const controller = http.createServer(app);
  controller.on('upgrade', guestConsole.upgrade);
  const origin = await listen(controller, t);
  const create = (kind = 'qemu', node = 'node01', id = 100, token = 'operator', browserOrigin = origin) =>
    fetch(`${origin}/api/proxmox/console/${kind}/${node}/${id}`, {
      method: 'POST', headers: {origin: browserOrigin, ...(token ? {authorization: 'Bearer ' + token} : {})}
    });
  const connect = (key, browserOrigin = origin) => new WebSocket(origin.replace('http:', 'ws:') + consoleSocketPath, ['binary', key], {origin: browserOrigin});
  const rejected = async socket => {
    const [error] = await once(socket, 'error');
    assert.match(error.message, /403/);
  };

  assert.equal((await create(undefined, undefined, undefined, '')).status, 401);
  assert.equal((await create(undefined, undefined, undefined, 'viewer')).status, 403);
  assert.equal((await create(undefined, undefined, undefined, 'restricted')).status, 403);
  assert.equal((await create(undefined, undefined, undefined, 'operator', 'https://other.test')).status, 403);
  assert.deepEqual(calls, []);

  assert.equal((await create('qemu', 'node02')).status, 403);
  status = 'stopped';
  assert.equal((await create()).status, 409);
  status = 'running';
  failure = 401;
  const expiredToken = await create('lxc', 'node02', 101);
  assert.equal(expiredToken.status, 502);
  assert.match((await expiredToken.json()).error, /API token/);
  failure = 403;
  const denied = await create('lxc', 'node02', 101);
  assert.equal(denied.status, 403);
  assert.match((await denied.json()).error, /VM\.Console/);
  failure = 0;

  for (const invalidPort of [true, '', ' 5901 ', '5901.0', '5901\n', 5901.5, 5899, '6000']) {
    portOverride = invalidPort;
    const callCount = calls.length;
    const response = await create();
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error, 'Proxmox returned an invalid console ticket.');
    assert.equal(calls.slice(callCount).some(url => url.includes('/vncwebsocket')), false);
  }
  portOverride = undefined;

  for (const target of [['qemu', 'node01', 100], ['lxc', 'node02', 101]]) {
    const response = await create(...target);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const session = await response.json();
    assert.deepEqual(Object.keys(session).sort(), ['key', 'password']);
    assert.equal(session.password, password);
    await rejected(connect(session.key, 'https://other.test'));
    const browser = connect(session.key);
    const [banner] = await once(browser, 'message');
    assert.equal(banner.toString(), 'RFB 003.008\n');
    const input = Buffer.from([0, 255, 27, 13]);
    browser.send(input);
    assert.deepEqual((await once(browser, 'message'))[0], input);
    await rejected(connect(session.key));
    const closed = once(browser, 'close');
    guestConsole.revoke('test-user', 'test-session');
    await closed;
    await rejected(connect(session.key));
  }
  assert.deepEqual(audit.map(entry => entry[1]), ['qemu:node01:100', 'lxc:node02:101']);
});
