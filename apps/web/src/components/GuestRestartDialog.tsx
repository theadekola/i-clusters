import {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {isActionCancelled} from '../action-cancellation';
import {powerCycleGuest, type RestartCheckpoint} from '../guest-power-cycle';
import {Modal} from './UI';
import ReportLoading from './ReportLoading';

type Props = {
  node: string; id: string; name: string; kind?: 'vm' | 'lxc'; reason?: 'setup' | 'update';
  onClose: () => void; onComplete: () => void; onBusy?: (busy: boolean) => void;
};

export default function GuestRestartDialog({node, id, kind='vm', reason='setup', name, onClose, onComplete, onBusy}: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const checkpoint = useRef<RestartCheckpoint>({});
  const controller = useRef<AbortController | null>(null);
  const verifyAgent = kind === 'vm' && reason === 'setup';

  useEffect(() => () => controller.current?.abort(), []);

  async function restart() {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    onBusy?.(true);
    setError('');
    try {
      await powerCycleGuest(node, id, kind, setMessage, request.signal, checkpoint.current, verifyAgent);
      if (!request.signal.aborted) setSuccess(verifyAgent
        ? 'The VM is running and QEMU Guest Agent has responded.'
        : 'Restart complete. Proxmox confirms the guest is running.');
    } catch (e: any) {
      if (!request.signal.aborted && !isActionCancelled(e)) setError(e.message);
    } finally {
      controller.current = null;
      if (!request.signal.aborted) {
        setBusy(false);
        onBusy?.(false);
      }
    }
  }

  return createPortal(<Modal open title={`Restart ${kind === 'vm' ? 'VM' : 'CT'} · ${name}`}
    success={success} onClose={success ? onComplete : onClose} closeDisabled={busy}>
    <p><b>{name}</b> ({node} / {id})</p>
    <p>{reason === 'update' ? 'Restart this guest to finish the OS update.' : 'Restart this guest to finish setup.'}</p>
    <p>Proxmox will shut it down and start it automatically after one SSH approval. Services will be interrupted.</p>
    {kind === 'lxc' && <p>If the container exceeds its shutdown timeout, Proxmox may stop its remaining processes before startup.</p>}
    {busy && <div role="status" aria-live="polite"><ReportLoading inline/> {message}</div>}
    {error && <p role="alert" className="error">{error}</p>}
    <div className={reason === 'update' ? 'modal-actions guest-restart-sheet' : 'modal-actions'}>
      <button type="button" className="btn secondary" disabled={busy} onClick={onClose}>{checkpoint.current.task || checkpoint.current.receiptUnknown ? 'Close' : 'Later'}</button>
      <button type="button" className="btn primary" disabled={busy || checkpoint.current.receiptUnknown} aria-busy={busy} onClick={restart}>
        {checkpoint.current.task && !busy ? 'Check progress' : 'Shutdown, Start & Verify'}
      </button>
    </div>
  </Modal>, document.body);
}
