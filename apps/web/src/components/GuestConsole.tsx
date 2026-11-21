import {useEffect, useRef, useState} from 'react';
import {api} from '../api';
import {clusterApiPath} from '../cluster-context';
import {Modal} from './UI';
import './guest-console.css';

export type ConsoleGuest = {id: string; node: string; name?: string; creationReceipt?: string};

export default function GuestConsole({guest, kind, onClose}: {
  guest: ConsoleGuest; kind: 'qemu' | 'lxc'; onClose: () => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('Connecting to Proxmox…');

  useEffect(() => {
    const controller = new AbortController();
    let rfb: InstanceType<typeof import('@novnc/novnc').default> | undefined;
    let timeout: number;
    const closeWithError = (message: string) => {
      if (controller.signal.aborted) return;
      window.clearTimeout(timeout);
      setConnected(false);
      setError(previous => previous || message);
    };

    async function connect() {
      if (!window.isSecureContext) throw new Error('Open i-Clusters over trusted HTTPS to use the guest console.');
      if (guest.creationReceipt) {
        setProgress('Creating guest…');
        while (!controller.signal.aborted) {
          const {state} = await api<{state: 'creating' | 'starting' | 'ha' | 'stopped' | 'running'}>(
            `/proxmox/creation/${encodeURIComponent(guest.creationReceipt)}/status`, {signal: controller.signal}
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
      const {default: RFB} = await import('@novnc/novnc');
      if (controller.signal.aborted) return;
      const {key, password} = await api<{key: string; password: string}>(
        `/proxmox/console/${kind}/${encodeURIComponent(guest.node)}/${encodeURIComponent(guest.id)}`,
        {method: 'POST', signal: controller.signal}
      );
      if (controller.signal.aborted || !viewport.current) return;
      const url = new URL(clusterApiPath('/proxmox/console/socket'), window.location.origin);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      rfb = new RFB(viewport.current, url.toString(), {wsProtocols: ['binary', key], credentials: {password}});
      rfb.scaleViewport = true;
      rfb.addEventListener('connect', () => {
        if (controller.signal.aborted) return;
        window.clearTimeout(timeout);
        setConnected(true);
        rfb?.focus();
      });
      rfb.addEventListener('disconnect', () => closeWithError('The Proxmox console disconnected.'));
      rfb.addEventListener('securityfailure', () => closeWithError('Proxmox rejected the guest console ticket. Reconnect to request a new one.'));
      timeout = window.setTimeout(() => {
        rfb?.disconnect();
        closeWithError('The Proxmox console did not respond in time.');
      }, 12000);
    }

    void connect().catch(error => closeWithError(error.message));
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
      rfb?.disconnect();
    };
  }, [kind, guest.node, guest.id, guest.creationReceipt, attempt]);

  return <Modal open portal title={guest.name ? `${guest.name} · Proxmox Console` : 'Proxmox Console'} onClose={onClose}>
    <div className="guest-console">
      <div className="guest-console-status">
        <span className="muted">{kind === 'qemu' ? 'VM' : 'CT'} {guest.id} · {guest.node}</span>
        {error ? <p className="login-error" role="alert">{error}</p> :
          <span role="status">{connected ? 'Connected' : progress}</span>}
        {error && <button type="button" className="btn secondary" onClick={() => {
          setError('');
          setAttempt(value => value + 1);
        }}>Reconnect</button>}
      </div>
      <div className="guest-console-display" ref={viewport} aria-label="Proxmox guest display"
        onKeyDown={event => { if (event.key === 'Escape' && connected) event.stopPropagation(); }}/>
    </div>
  </Modal>;
}
