import {useEffect, useRef, useState} from 'react';
import {api} from './api';
import {taskState} from './proxmox-state';

type Task = {node: string; id: string};
type Notice = {message: string; task?: Task; failed?: boolean};
type ActionResponse = {message?: string; result?: {node?: string; task?: unknown}};

export function useProxmoxTaskNotice(refresh: () => Promise<void>) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const task = notice?.task;
  const refreshAfterTask = useRef(refresh);
  refreshAfterTask.current = refresh;

  useEffect(() => {
    if (!task) return;
    const controller = new AbortController();
    let timer: number;
    let failures = 0;
    const path = `/tasks/${encodeURIComponent(task.node)}/${encodeURIComponent(task.id)}`;
    const finish = (message?: string) => setNotice(current => current?.task !== task ? current :
      message ? {message, failed: true} : null);

    async function check() {
      try {
        const result = await api<{status: string; exitstatus?: string}>(path, {signal: controller.signal});
        if (controller.signal.aborted) return;
        if (result?.status === 'stopped') {
          const outcome = taskState(result);
          if (outcome === 'Failed') finish('Proxmox task failed. Check Tasks & Logs.');
          else if (outcome === 'Unknown') finish('Proxmox task result is unavailable. Check Tasks & Logs.');
          else finish();
          void refreshAfterTask.current().catch(() => {});
          return;
        }
        if (result?.status !== 'running') throw new Error();
        failures = 0;
        timer = window.setTimeout(check, 3000);
      } catch (error: any) {
        if (controller.signal.aborted) return;
        if ([401, 403, 404].includes(error.status) || ++failures >= 5) {
          finish('Proxmox task result is unavailable. Check Tasks & Logs.');
          return;
        }
        timer = window.setTimeout(check, Math.min(30000, 3000 * 2 ** failures));
      }
    }

    void check();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [task]);

  function report(response: ActionResponse, fallback: string) {
    const id = response.result?.task;
    const node = typeof id === 'string' && /^UPID:([^:]+):/.exec(id)?.[1] || response.result?.node;
    const tracked = typeof id === 'string' && id && node ? {id, node} : undefined;
    setNotice({message: response.message || fallback, task: tracked});
  }

  return {notice, report, clear: () => setNotice(null)};
}
