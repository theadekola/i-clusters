import {Terminal} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export function attachProxmoxTerminal(
  viewport: HTMLDivElement, url: URL, key: string,
  fontSize: number, connected: () => boolean, failed: (message: string) => void
) {
  const terminal = new Terminal({fontSize, theme: {background: '#07111d'}, cursorBlink: true, disableStdin: true});
  const fit = new FitAddon();
  terminal.loadAddon(fit);
  terminal.open(viewport);
  const socket = new WebSocket(url, ['binary', key]);
  socket.binaryType = 'arraybuffer';
  const encoder = new TextEncoder();
  const acknowledgement = encoder.encode('OK');
  let acknowledged = 0;
  let keepalive: number;
  const send = (packet: string) => {
    if (acknowledged === acknowledgement.length && socket.readyState === WebSocket.OPEN) socket.send(packet);
  };
  const resize = () => {
    if (!viewport.offsetWidth || !viewport.offsetHeight) return;
    fit.fit();
    send(`1:${terminal.cols}:${terminal.rows}:`);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(viewport);
  const input = terminal.onData(data => send(`0:${encoder.encode(data).length}:${data}`));
  socket.onmessage = event => {
    const bytes = typeof event.data === 'string' ? encoder.encode(event.data) : new Uint8Array(event.data);
    let offset = 0;
    if (acknowledged < acknowledgement.length) {
      while (offset < bytes.length && acknowledged < acknowledgement.length) {
        if (bytes[offset++] !== acknowledgement[acknowledged++]) {
          failed('Proxmox rejected the console ticket. Reconnect to request a new one.');
          socket.close();
          return;
        }
      }
      if (acknowledged < acknowledgement.length) return;
      terminal.options.disableStdin = false;
      if (connected()) terminal.focus();
      resize();
      keepalive = window.setInterval(() => send('2'), 30000);
    }
    terminal.write(bytes.subarray(offset));
  };
  socket.onclose = () => {
    window.clearInterval(keepalive);
    terminal.options.disableStdin = true;
    failed('The Proxmox console disconnected.');
  };
  socket.onerror = () => {
    terminal.options.disableStdin = true;
    failed('The Proxmox console disconnected.');
  };

  const dispose = () => {
    window.clearInterval(keepalive);
    observer.disconnect();
    input.dispose();
    socket.onmessage = socket.onclose = socket.onerror = null;
    socket.close();
    terminal.dispose();
  };
  return {terminal, resize, dispose};
}
