import {api, confirmedApi} from './api';
import {isActionCancelled} from './action-cancellation';

export type RestartCheckpoint = {
  operation?: 'start' | 'reboot';
  task?: string;
  taskComplete?: boolean;
  receiptUnknown?: boolean;
};

const unknownReceipt = 'Proxmox may have accepted the request. Check the guest’s task history before starting another restart.';

function pause(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, 2000);
    signal.addEventListener('abort', abort, {once: true});
    if (signal.aborted) abort();
  });
}

export async function powerCycleGuest(
  node: string, id: string, kind: 'vm' | 'lxc', progress: (message: string) => void,
  signal: AbortSignal, checkpoint: RestartCheckpoint = {}, verifyAgent = true
) {
  const details = `/proxmox/${kind}/${encodeURIComponent(node)}/${encodeURIComponent(id)}/details`;
  const readPower = async () => {
    const {status} = await api(details + '?view=power', {signal});
    return status?.status === 'running' ? status.qmpstatus || 'running' : status?.status;
  };

  // Only reads are retried. A brief loss of connectivity is normal if i-Clusters
  // itself runs in the guest being restarted.
  async function poll<T>(read: () => Promise<T>, ready: (report: T) => boolean, timeout: number, timeoutMessage: string) {
    const deadline = Date.now() + timeout;
    let lastError = '';
    do {
      signal.throwIfAborted();
      let report: T;
      try {
        report = await read();
        lastError = '';
      } catch (error: any) {
        if (signal.aborted || (error.status && error.status < 500 && error.status !== 429)) throw error;
        lastError = error.message;
        await pause(signal);
        continue;
      }
      if (ready(report)) return;
      await pause(signal);
    } while (Date.now() < deadline);
    throw Error([timeoutMessage, lastError].filter(Boolean).join(' '));
  }

  if (checkpoint.receiptUnknown) throw Error(unknownReceipt);
  if (!checkpoint.task) {
    progress('Checking the guest’s power state…');
    const before = await readPower();
    if (before !== 'running' && before !== 'stopped') throw Error('Guest power state is unavailable. No power action was performed.');
    const operation = before === 'running' ? 'reboot' : 'start';
    progress(operation === 'reboot' ? 'Requesting approval for shutdown and automatic startup…' : 'Guest is already stopped. Requesting startup…');
    signal.throwIfAborted();
    let response;
    try {
      // Proxmox performs the full shutdown and start on the host under one task.
      response = await confirmedApi(`/actions/proxmox/${kind}/${encodeURIComponent(id)}/${operation}`, {
        method: 'POST', signal, body: JSON.stringify({node})
      });
    } catch (error: any) {
      if (!isActionCancelled(error) && (!error.status || error.status >= 500)) {
        checkpoint.receiptUnknown = true;
        throw Error([unknownReceipt, error.message].join(' '));
      }
      throw error;
    }
    const task = response?.result?.task || response?.task;
    if (typeof task !== 'string' || !task) {
      checkpoint.receiptUnknown = true;
      throw Error(unknownReceipt);
    }
    checkpoint.operation = operation;
    checkpoint.task = task;
  }

  if (!checkpoint.taskComplete) {
    const starting = 'Starting the guest…';
    progress(checkpoint.operation === 'start' ? starting : 'Shutting down the guest. Proxmox will start it automatically.');
    let sawStopped = checkpoint.operation === 'start';
    const taskPath = `/tasks/${encodeURIComponent(node)}/${encodeURIComponent(checkpoint.task)}`;
    await poll(async () => {
      const task = await api(taskPath, {signal});
      if (task.status === 'running' && !sawStopped && await readPower() === 'stopped') {
        sawStopped = true;
        progress(starting);
      }
      return task;
    }, task => {
      if (task.status !== 'stopped') return false;
      if (task.exitstatus !== 'OK') {
        // A terminal failure is known. An explicit retry can check current power
        // and request startup alone if the guest was left stopped.
        if (task.exitstatus) delete checkpoint.task;
        throw Error(`Proxmox task failed: ${task.exitstatus || 'result not reported'}`);
      }
      return true;
    }, 300000, 'The restart task has not finished. Check progress again.');
    checkpoint.taskComplete = true;
  }

  progress('Waiting for Proxmox to confirm the guest is running…');
  await poll(readPower, power => power === 'running', 180000, 'Proxmox has not confirmed that the guest is running. Check its task history.');
  if (kind === 'vm' && verifyAgent) {
    progress('Guest is running. Verifying guest access…');
    await poll(() => api(details + '?view=agent', {signal}), ({os}) => {
      const info = os && Object.hasOwn(os, 'result') ? os.result : os;
      return !!info && typeof info === 'object' && !Array.isArray(info) && Object.keys(info).length > 0;
    }, 120000, 'The VM is running, but guest-agent access is not verified yet. Recheck the guest agent.');
  }
}
