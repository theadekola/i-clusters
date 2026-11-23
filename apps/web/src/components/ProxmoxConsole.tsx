import {useEffect, useRef, useState} from 'react';
import {Maximize, Terminal} from 'lucide-react';
import {api} from '../api';
import {clusterApiPath} from '../cluster-context';
import {exitTerminalFullscreen, fullscreenTerminal} from '../ssh-transfer';
import {CreationHa} from './GuestCreateFields';
import './guest-console.css';

export type ConsoleCreation = {
  creationReceipt?: string;
  installationReady?: boolean;
  ha?: {state: string; receipt: string; message: string};
};
export type ConsoleTarget = {
  id: string;
  node: string;
  name: string;
  kind: 'node' | 'qemu' | 'lxc';
  creation?: ConsoleCreation;
};

export default function ProxmoxConsole({target, active}: {target: ConsoleTarget; active: boolean}) {
  const {id, node, kind, name, creation} = target;
  const receipt = creation?.creationReceipt;
  const panel = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const visible = useRef(active);
  visible.current = active;
  const [attempt, setAttempt] = useState(0);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('Connecting to Proxmox…');
  const [configuration, setConfiguration] = useState(creation);

  useEffect(() => {
    const element = panel.current;
    if (!active) void exitTerminalFullscreen(element).catch(() => {});
    return () => { void exitTerminalFullscreen(element).catch(() => {}); };
  }, [active]);

  useEffect(() => {
    const controller = new AbortController();
    let dispose: (() => void) | undefined;
    let timeout: number;
    const closeWithError = (message: string) => {
      if (controller.signal.aborted) return;
      window.clearTimeout(timeout);
      setConnected(false);
      setError(previous => previous || message);
    };
    const markConnected = () => {
      if (controller.signal.aborted) return false;
      window.clearTimeout(timeout);
      setConnected(true);
      return visible.current;
    };

    async function connect() {
      if (!window.isSecureContext) throw new Error('Open i-Clusters over trusted HTTPS to use the guest console.');
      if (receipt) {
        setProgress('Creating guest…');
        while (!controller.signal.aborted) {
          const {state} = await api<{state: 'creating' | 'starting' | 'ha' | 'stopped' | 'running'}>(
            `/proxmox/creation/${encodeURIComponent(receipt)}/status`, {signal: controller.signal}
          );
          if (controller.signal.aborted) return;
          if (state === 'running') break;
          if (state === 'ha') throw new Error('Complete HA setup before starting the new guest.');
          if (state === 'stopped') throw new Error('Start this guest before opening its Proxmox console.');
          setProgress(state === 'creating' ? 'Creating guest…' : 'Starting guest…');
          await new Promise(resolve => window.setTimeout(resolve, 1500));
        }
      }
      if (controller.signal.aborted) return;
      setProgress('Connecting to Proxmox…');
      const transport = kind === 'node' ? await import('./proxmox-node-terminal') : await import('@novnc/novnc');
      if (controller.signal.aborted) return;
      const path = `/proxmox/console/${kind}/${encodeURIComponent(node)}` + (kind === 'node' ? '' : '/' + encodeURIComponent(id));
      const {key, password} = await api<{key: string; password?: string}>(path, {method: 'POST', signal: controller.signal});
      if (controller.signal.aborted || !viewport.current) return;
      const url = new URL(clusterApiPath('/proxmox/console/socket'), window.location.origin);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      if ('attachNodeTerminal' in transport) {
        dispose = transport.attachNodeTerminal(viewport.current, url, key, markConnected, closeWithError);
      } else {
        if (!password) throw new Error('Proxmox returned an invalid console ticket.');
        const rfb = new transport.default(viewport.current, url.toString(), {wsProtocols: ['binary', key], credentials: {password}});
        rfb.scaleViewport = true;
        rfb.addEventListener('connect', () => { if (markConnected()) rfb.focus(); });
        rfb.addEventListener('disconnect', () => closeWithError('The Proxmox console disconnected.'));
        rfb.addEventListener('securityfailure', () => closeWithError('Proxmox rejected the guest console ticket. Reconnect to request a new one.'));
        dispose = () => rfb.disconnect();
      }
      timeout = window.setTimeout(() => {
        closeWithError('The Proxmox console did not respond in time.');
        dispose?.();
      }, 12000);
    }

    void connect().catch(error => closeWithError(error.message));
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
      dispose?.();
    };
  }, [kind, node, id, receipt, attempt]);

  return <div ref={panel} className="guest-console">
    <div className="shell-session-toolbar guest-console-status">
      <div className="shell-session-heading">
        <Terminal size={19} aria-hidden="true"/>
        <div><strong>{name}</strong><small>{kind === 'node' ? 'Proxmox Node' : `${kind === 'qemu' ? 'VM' : 'CT'} ${id} · ${node}`}</small></div>
      </div>
      <div className="header-actions">
        {!error && <span role="status">{connected ? 'Connected' : progress}</span>}
        {error && <button type="button" className="btn secondary" onClick={() => {
          setError('');
          setAttempt(value => value + 1);
        }}>Reconnect</button>}
        <button type="button" className="icon-btn" aria-label="Fullscreen terminal" title="Fullscreen terminal"
          onClick={() => { void fullscreenTerminal(panel.current); }}><Maximize size={19}/></button>
      </div>
    </div>
    {error && <p className="login-error guest-console-error" role="alert">{error}</p>}
    {configuration?.ha && <CreationHa created={configuration} onUpdate={setConfiguration}/>}
    {configuration?.installationReady && <small className="muted">After installation, eject the ISO or set disk-first boot in Proxmox.</small>}
    <div className="guest-console-display" ref={viewport} aria-label={kind === 'node' ? 'Proxmox node terminal' : 'Proxmox guest display'}/>
  </div>;
}
