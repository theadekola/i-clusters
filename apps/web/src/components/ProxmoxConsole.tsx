import {useEffect, useRef, useState} from 'react';
import {Clipboard, Maximize, Minimize, Terminal} from 'lucide-react';
import type {Terminal as TextTerminal} from '@xterm/xterm';
import {api} from '../api';
import {clusterApiPath} from '../cluster-context';
import {copyTerminalSelection, exitTerminalFullscreen, fullscreenTerminal} from '../ssh-transfer';
import {CreationHa} from './GuestCreateFields';
import {Modal} from './UI';
import {useTerminalTools} from './TerminalTools';
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

type Display = 'text' | 'graphical';
export default function ProxmoxConsole({target, active, canUpdate = false}: {
  target: ConsoleTarget; active: boolean; canUpdate?: boolean;
}) {
  const {id, node, kind, name, creation} = target;
  const receipt = creation?.creationReceipt;
  const panel = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<TextTerminal | null>(null);
  const resize = useRef<(() => void) | null>(null);
  const sendClipboard = useRef<((text: string) => void) | null>(null);
  const visible = useRef(active);
  visible.current = active;
  const [requestedDisplay, setRequestedDisplay] = useState<Display | 'auto'>(kind === 'qemu' && creation ? 'graphical' : 'auto');
  const [display, setDisplay] = useState<Display | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('Connecting to Proxmox…');
  const [configuration, setConfiguration] = useState(creation);
  const [expanded, setExpanded] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [clipboardOpen, setClipboardOpen] = useState(false);
  const [guestClipboard, setGuestClipboard] = useState('');
  const [clipboardText, setClipboardText] = useState('');
  const tools = useTerminalTools(terminalRef, active, attempt, connected && display === 'text', resize);

  useEffect(() => {
    const element = panel.current;
    const sync = () => setExpanded(document.fullscreenElement === element || !!element?.classList.contains('terminal-expanded'));
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && element?.classList.contains('terminal-expanded'))
        void exitTerminalFullscreen(element).then(sync).catch(() => {});
    };
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('keydown', escape);
      void exitTerminalFullscreen(element).catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (active) {
      resize.current?.();
      if (terminalRef.current && !terminalRef.current.options.disableStdin) terminalRef.current.focus();
    } else {
      void exitTerminalFullscreen(panel.current).catch(() => {});
      setExpanded(false);
      setUpdateOpen(false);
      setClipboardOpen(false);
      setClipboardText('');
    }
  }, [active]);

  useEffect(() => {
    const controller = new AbortController();
    let dispose: (() => void) | undefined;
    let detachTools: (() => void) | undefined;
    let timeout: number;
    setConnected(false);
    setDisplay(null);
    setGuestClipboard('');
    setError('');
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
      const path = `/proxmox/console/${kind}/${encodeURIComponent(node)}` + (kind === 'node' ? '' : '/' + encodeURIComponent(id));
      const {key, password, display: selected} = await api<{key: string; password?: string; display?: Display}>(path, {
        method: 'POST', body: JSON.stringify({display: requestedDisplay}), signal: controller.signal
      });
      const actualDisplay = selected ?? (password ? 'graphical' : 'text');
      const url = new URL(clusterApiPath('/proxmox/console/socket'), window.location.origin);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      if (actualDisplay === 'text') {
        const {attachProxmoxTerminal} = await import('./proxmox-text-terminal');
        if (controller.signal.aborted || !viewport.current) return;
        const text = attachProxmoxTerminal(viewport.current, url, key, tools.fontRef.current, markConnected, closeWithError);
        terminalRef.current = text.terminal;
        resize.current = text.resize;
        detachTools = tools.attach(viewport.current, text.terminal);
        dispose = text.dispose;
      } else {
        if (!password) throw new Error('Proxmox returned an invalid console ticket.');
        const {default: RFB} = await import('@novnc/novnc');
        if (controller.signal.aborted || !viewport.current) return;
        const rfb = new RFB(viewport.current, url.toString(), {wsProtocols: ['binary', key], credentials: {password}});
        rfb.scaleViewport = true;
        sendClipboard.current = text => {rfb.clipboardPasteFrom(text);rfb.focus();};
        rfb.addEventListener('clipboard', event => {
          if (!controller.signal.aborted) setGuestClipboard((event as CustomEvent<{text: string}>).detail.text);
        });
        rfb.addEventListener('connect', () => { if (markConnected()) rfb.focus(); });
        rfb.addEventListener('disconnect', () => closeWithError('The Proxmox console disconnected.'));
        rfb.addEventListener('securityfailure', () => closeWithError('Proxmox rejected the guest console ticket. Reconnect to request a new one.'));
        dispose = () => rfb.disconnect();
      }
      setDisplay(actualDisplay);
      timeout = window.setTimeout(() => {
        closeWithError('The Proxmox console did not respond in time.');
        dispose?.();
      }, 12000);
    }

    void connect().catch(error => closeWithError(error.message));
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
      terminalRef.current = null;
      resize.current = null;
      sendClipboard.current = null;
      detachTools?.();
      dispose?.();
    };
  }, [kind, node, id, receipt, attempt, requestedDisplay]);

  const changeDisplay = () => {
    setRequestedDisplay(display === 'graphical' || requestedDisplay === 'graphical' ? 'text' : 'graphical');
    setUpdateOpen(false);
    setClipboardOpen(false);
    setClipboardText('');
    setAttempt(value => value + 1);
  };
  const insertUpdate = (command: string) => {
    const terminal = terminalRef.current;
    if (!visible.current || !terminal || terminal.options.disableStdin) return;
    terminal.paste(command);
    requestAnimationFrame(() => {
      if (visible.current && terminalRef.current === terminal) terminal.focus();
    });
  };

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
        {kind !== 'node' && (connected || error) && <button type="button" className="btn text-action"
          onClick={changeDisplay}>{display === 'graphical' || requestedDisplay === 'graphical' ? 'Text console' : 'Graphical console'}</button>}
        {kind !== 'node' && canUpdate && connected && <button type="button" className="btn text-action shell-update-label"
          aria-label="Guest OS updates" onClick={() => setUpdateOpen(true)}>OS Update</button>}
        {display === 'text' && tools.buttons}
        {display === 'graphical' && connected && <button type="button" className="icon-btn" aria-label="Guest clipboard"
          title="Guest clipboard" onClick={() => setClipboardOpen(true)}><Clipboard size={18}/></button>}
        <button type="button" className="icon-btn" aria-label={expanded ? 'Exit fullscreen terminal' : 'Fullscreen terminal'}
          title={expanded ? 'Exit fullscreen' : 'Fullscreen terminal'} aria-pressed={expanded}
          onClick={async () => { setExpanded(await fullscreenTerminal(panel.current)); }}>
          {expanded ? <Minimize size={19}/> : <Maximize size={19}/>}
        </button>
      </div>
    </div>
    {error && <p className="login-error guest-console-error" role="alert">{error}</p>}
    {configuration?.ha && <CreationHa created={configuration} onUpdate={setConfiguration}/>}
    {configuration?.installationReady && <small className="muted">After installation, eject the ISO or set disk-first boot in Proxmox.</small>}
    <div className="guest-console-display" ref={viewport} onContextMenu={display === 'text' ? tools.onContextMenu : undefined}
      aria-label={kind === 'node' ? 'Proxmox node terminal' : 'Proxmox guest display'}/>
    {tools.dialog}
    {updateOpen && active && connected && <ConsoleGuestUpdate name={name}
      onClose={() => setUpdateOpen(false)} onInsert={display === 'text' ? insertUpdate : undefined}/>}
    <Modal open={clipboardOpen && active && connected} title="Guest clipboard" onClose={() => {
      setClipboardOpen(false);setClipboardText('');
    }}>
      <div className="shell-clipboard-form">
        <p>Clipboard sharing depends on the guest display. Use a text console to select and copy terminal output.</p>
        <label>Text copied in the guest<textarea readOnly value={guestClipboard} rows={3}/></label>
        <label>Text to send to the guest<textarea value={clipboardText} rows={3}
          onChange={event => setClipboardText(event.target.value)}/></label>
        <button type="button" className="btn primary" disabled={!clipboardText} onClick={() => {
          sendClipboard.current?.(clipboardText);setClipboardText('');setClipboardOpen(false);
        }}>Send to guest clipboard</button>
      </div>
    </Modal>
  </div>;
}

function ConsoleGuestUpdate({name, onClose, onInsert}: {
  name: string; onClose: () => void; onInsert?: (command: string) => void;
}) {
  const [command, setCommand] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    api<{command: string}>('/proxmox/console/update-command', {signal: controller.signal})
      .then(result => { if (!controller.signal.aborted) setCommand(result.command); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, []);
  return <Modal open title="Guest OS updates" onClose={onClose}>
    <div className="shell-clipboard-form">
      <p><strong>{name}</strong></p>
      <p>Sign in to a Debian or Ubuntu guest and use an empty shell prompt. Run the command to preview available updates. The guest prompts you before installing packages.</p>
      {error ? <p role="alert" className="error">{error}</p> : command ?
        <label>Update command<textarea ref={field} readOnly value={command} rows={5}/></label> :
        <p role="status">Loading update command…</p>}
      {copied && <p role="status">Update command copied.</p>}
      <div className="modal-actions">
        <button type="button" className="btn secondary" disabled={!command} onClick={async () => {
          try { await copyTerminalSelection(command); setCopied(true); }
          catch { field.current?.focus();field.current?.select(); }
        }}>Copy update command</button>
        {onInsert && <button type="button" className="btn primary" disabled={!command} onClick={() => {
          onClose();onInsert(command);
        }}>Insert command at prompt</button>}
      </div>
      {onInsert && <p>Press Enter at the guest prompt to run the inserted command.</p>}
    </div>
  </Modal>;
}
