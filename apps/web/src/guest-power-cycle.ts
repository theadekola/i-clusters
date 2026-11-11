import {api,confirmedApi} from './api';

export type GuestKind='vm'|'lxc';
export type RestartReason='setup'|'update';
export type RestartPhase='submitting'|'unknown'|'monitoring'|'booting'|'verifying'|'recoverable'|'complete'|'failed'|'reviewed';
export type RestartRecord={
  id:string; node:string; kind:GuestKind; guest:string; name:string; reason:RestartReason; operation:'start'|'reboot';
  phase:RestartPhase; power:string; task:string|null; started_at:string; updated_at:string; detail:string; readError?:string;
};
export type RestartList={cluster:string;restarts:RestartRecord[]};
export const restartsPath='/maintenance/restarts';
export function restartId(){
  if(crypto.randomUUID)return crypto.randomUUID();
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&15)|64;
  bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
export function finished(phase:RestartPhase){return ['complete','failed','reviewed'].includes(phase)}
export function restartMessage(r:RestartRecord) {
  switch(r.phase){
    case 'submitting':return 'Waiting for Proxmox to accept the power request…';
    case 'monitoring':return r.operation==='start'||r.power==='stopped'?'Starting the guest…':'Shutting down the guest. Proxmox will start it automatically.';
    case 'booting':return 'Waiting for Proxmox to confirm the guest is running…';
    case 'recoverable':return 'The guest is stopped and no guest task is active. You can start it now.';
    case 'verifying':return 'Guest is running. Verifying guest access…';
    case 'complete':return r.kind==='vm'&&r.reason==='setup'?'The VM is running and QEMU Guest Agent has responded.':'Restart complete. Proxmox confirms the guest is running.';
    case 'failed':return 'Proxmox reported a failed task.';
    case 'unknown':return 'The request may have been accepted. Review guest task history before taking another action.';
    case 'reviewed':return 'Task history reviewed.';
  }
}
export async function submitRestart(target:{node:string;kind:GuestKind;id:string;name:string;reason:RestartReason},cluster:string,requestId:string,signal:AbortSignal,recovery?:RestartRecord) {
  const {node,kind,id,name,reason}=target;
  let operation:'start'|'reboot'='start';
  if(!recovery){
    const {status}=await api(`/proxmox/${kind}/${encodeURIComponent(node)}/${encodeURIComponent(id)}/details?view=power`,{signal});
    const power=status?.status==='running'?status.qmpstatus||'running':status?.status;
    if(power!=='running'&&power!=='stopped')throw Error('Guest power state is unavailable. No power action was performed.');
    operation=power==='running'?'reboot':'start';
  } else if(recovery.phase!=='recoverable'||!recovery.task||recovery.id!==requestId||recovery.node!==node||recovery.guest!==id||recovery.kind!==kind)
    throw Error('Startup is not available. Recheck the guest and its tasks.');
  signal.throwIfAborted();
  const body={node,maintenance:{id:requestId,cluster,reason,name,...(recovery?{previousTask:recovery.task}:{})}};
  let answer;
  try {
    answer=await confirmedApi(`/actions/proxmox/${kind}/${encodeURIComponent(id)}/${operation}`,{method:'POST',signal,body:JSON.stringify(body)});
  } catch(error:any) {
    if(!error.status||error.status>=500)error.checkReceipt=true;
    throw error;
  }
  if(!answer?.result?.restart?.id)throw Object.assign(Error('Restart receipt unavailable. Check progress.'),{checkReceipt:true});
  return answer.result.restart as RestartRecord;
}
export function historyLink(record:Pick<RestartRecord,'id'> & {task?:string|null}){
  const params=new URLSearchParams({tab:'Tasks & Logs',restart:record.id});
  if(record.task)params.set('task',record.task);
  return '/proxmox?'+params;
}
