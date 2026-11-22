import {STATUS_CODES} from 'node:http';
import {randomBytes} from 'node:crypto';
import {WebSocket, WebSocketServer} from 'ws';
import {clusterConfig} from './cluster-config.js';
import {pve, pveConnectionOptions} from './connectors.js';
import {assertGuestPlacement} from './ssh-target.js';

export const consoleSocketPath = '/api/proxmox/console/socket';
export function readConsoleKey(req) {
  return /^binary,\s*([a-f0-9]{64})$/.exec(req.headers['sec-websocket-protocol'])?.[1];
}
const maxPayload = 16 * 1024 * 1024;
const problem = (message, status) => Object.assign(new Error(message), {status});

async function openProviderConsole({node, id, kind}) {
  const config = clusterConfig();
  if (config.accessMode === 'monitoring')
    throw problem('Enable management on this Proxmox connection to open a console.', 403);
  const connection = pveConnectionOptions(config);
  const query = (path, init) => pve(path, init, config);
  const nodeConsole = kind === 'node';
  if (nodeConsole) {
    const nodes = await query('/nodes');
    const target = Array.isArray(nodes) && nodes.find(row => row.node === node);
    if (!target) throw problem('The requested host is not present in the connected cluster.', 404);
    if (target.status !== 'online') throw problem('The Proxmox node is offline.', 409);
  } else {
    const guest = await assertGuestPlacement(node, id, kind, query);
    if (guest.status !== 'running')
      throw problem('Start this guest before opening its Proxmox console.', 409);
  }

  const base = `/nodes/${encodeURIComponent(node)}` + (nodeConsole ? '' : `/${kind}/${encodeURIComponent(id)}`);
  const body = new URLSearchParams(nodeConsole ? {cmd: 'login'} : {websocket: '1'});
  const result = await query(base + (nodeConsole ? '/termproxy' : '/vncproxy'), {
    method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body
  });
  const {ticket, port: proxyPort, password, user} = result || {};
  // Proxmox may return the console port as a JSON string.
  const port = typeof proxyPort === 'string' && proxyPort.length === 4 && /^[0-9]{4}$/.test(proxyPort)
    ? Number(proxyPort)
    : proxyPort;
  const legacyPassword = typeof ticket === 'string' && /^(.{8}):PVEVNC:/.exec(ticket)?.[1];
  if (typeof ticket !== 'string' || !ticket || !Number.isInteger(port) || port < 5900 || port > 5999)
    throw problem('Proxmox returned an invalid console ticket.', 502);
  if (nodeConsole && (typeof user !== 'string' || !user || /[:\r\n]/.test(user) || /[\r\n]/.test(ticket)))
    throw problem('Proxmox returned an invalid console ticket.', 502);
  const url = new URL(config.url + '/api2/json' + base + '/vncwebsocket');
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.search = new URLSearchParams({port, vncticket: ticket});

  return new Promise((resolve, reject) => {
    const upstream = new WebSocket(url, nodeConsole ? ['binary'] : [], {
      ...connection, handshakeTimeout: 8000, perMessageDeflate: false, maxPayload
    });
    upstream.on('error', reject);
    upstream.once('unexpected-response', (request, response) => {
      reject(Object.assign(new Error('vncwebsocket'), {providerStatus: response.statusCode}));
      request.destroy();
    });
    upstream.once('open', () => {
      upstream.pause();
      if (nodeConsole) {
        // Proxmox termproxy expects its ticket before the terminal protocol begins.
        upstream.send(`${user}:${ticket}\n`, error => {
          if (error) {
            upstream.terminate();
            reject(error);
          } else resolve({upstream});
        });
        return;
      }
      resolve({upstream, password: typeof password === 'string' ? password : legacyPassword || ticket});
    });
  });
}

function publicError(error, kind) {
  if (error.providerStatus === 401) return problem('Proxmox rejected the cluster API token. Check the connection credentials in Settings and try again.', 502);
  if (error.providerStatus === 403) return problem(kind === 'node'
    ? 'Proxmox denied console access. Check that the connected user and API token have Sys.Console on this node.'
    : 'Proxmox denied console access. Check that the connected user and API token have VM.Console on this guest.', 403);
  if (/CERT|TLS/.test(error.code || '')) return problem('The controller could not verify the Proxmox certificate. Check the cluster connection’s TLS settings.', 502);
  if (error.status && !error.providerStatus) return error;
  return problem(kind === 'node' ? 'The controller could not open the Proxmox node console. Check the cluster connection, then try again.'
    : 'The controller could not open the Proxmox console. Check the guest and cluster connection, then try again.', 502);
}

export function rejectConsoleUpgrade(socket, status = 404) {
  socket.end(['HTTP/1.1', status, STATUS_CODES[status]].join(' ')+'\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
}

export function createProxmoxConsole({connect = openProviderConsole} = {}) {
  const sessions = new Map();
  const websocket = new WebSocketServer({noServer: true, maxPayload, perMessageDeflate: false});

  function close(entry) {
    sessions.delete(entry.key);
    clearTimeout(entry.timer);
    entry.browser?.terminate();
    entry.upstream?.terminate();
  }

  async function start(req, res, audit, kind) {
    const {node, id} = req.params;
    const {sub, sid, sessionExp} = req.user;
    const origin = req.get('origin');
    let sameOrigin = false;
    try {
      const url = new URL(origin);
      sameOrigin = ['https:', 'http:'].includes(url.protocol) && url.host === req.get('host');
    } catch { /* A console is opened from the controller UI. */ }
    if (!sid || !sameOrigin) throw problem('Open the console from a signed-in i-Clusters browser.', 403);

    if (sessions.size >= 32 || [...sessions.values()].filter(entry => entry.sub === sub).length >= 4)
      throw problem('Too many open guest consoles. Close an existing console and retry.', 429);

    const key = randomBytes(32).toString('hex');
    const entry = {key, sub, sid, origin, sessionExp};
    sessions.set(key, entry);
    const abandoned = () => { if (!res.writableFinished) close(entry); };
    res.once('close', abandoned);
    try {
      const {upstream, password} = await connect({kind, node, id});
      entry.upstream = upstream;
      if (!sessions.has(key)) { close(entry); throw problem('The console session ended before it could open. Try again.', 409); }
      upstream.once('error', () => close(entry));
      upstream.once('close', () => close(entry));
      entry.timer = setTimeout(() => close(entry), 8000).unref();
      await audit(req, 'proxmox.console.open', id === undefined ? `${kind}:${node}` : `${kind}:${node}:${id}`, {}, 'success');
      if (res.destroyed) return close(entry);
      if (!sessions.has(key)) throw problem('The console session ended before it could open. Try again.', 409);
      res.set('Cache-Control', 'no-store').json({key, password});
    } catch (error) {
      close(entry);
      throw publicError(error, kind);
    }
  }

  function upgrade(req, socket, head) {
    const entry = sessions.get(readConsoleKey(req));
    if (!entry?.upstream || entry.claimed || req.headers.origin !== entry.origin)
      return rejectConsoleUpgrade(socket, 403);
    entry.claimed = true;
    clearTimeout(entry.timer);
    const duration = Math.min(60 * 60 * 1000, entry.sessionExp ? entry.sessionExp * 1000 - Date.now() : Infinity);
    if (duration <= 0) {
      close(entry);
      return rejectConsoleUpgrade(socket, 403);
    }
    entry.timer = setTimeout(() => close(entry), duration).unref();
    // Do not echo the one-time capability as the negotiated protocol.
    req.headers['sec-websocket-protocol'] = 'binary';
    websocket.handleUpgrade(req, socket, head, browser => {
      entry.browser = browser;
      const {upstream} = entry;
      const relay = (from, to) => from.on('message', (data, binary) => {
        if (to.readyState !== WebSocket.OPEN || to.bufferedAmount > maxPayload) return close(entry);
        to.send(data, {binary}, error => { if (error) close(entry); });
      });
      browser.on('error', () => close(entry));
      browser.once('close', () => close(entry));
      relay(upstream, browser);
      relay(browser, upstream);
      upstream.resume();
    });
    socket.once('close', () => close(entry));
  }

  function revoke(user, sid) {
    for (const entry of sessions.values())
      if (entry.sub === user && (!sid || entry.sid === sid)) close(entry);
  }

  return {start, upgrade, revoke, close: () => { for (const entry of sessions.values()) close(entry); }};
}
