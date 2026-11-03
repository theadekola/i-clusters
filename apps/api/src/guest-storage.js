import {readFileSync} from 'node:fs';
import {pve} from './connectors.js';
import {storageResourceEditor} from './storage-resource-editor.js';
const script=readFileSync(new URL('./agent-assets/guest-storage.py',import.meta.url),'utf8');
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status})};
export function createGuestStorage({query=pve,editor=storageResourceEditor,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 async function target(input){
  const model=await editor.inspect(input);
  if(model.provider!=='proxmox'||model.type!=='VM Volume')fail('Select a Proxmox VM disk for guest filesystem expansion');
  const base=`/nodes/${encodeURIComponent(model.node)}/qemu/${model.vmid}`;
  const config=await query(base+'/config');
  if(config.digest!==model.digest||config.lock||config.template)fail('VM configuration changed. Reopen Edit');
  const disks=Object.entries(config).filter(([key,value])=>/^(scsi|sata|ide|virtio)\d+$/.test(key)&&typeof value==='string'&&!/(?:^|,)media=cdrom(?:,|$)/.test(value));
  if(disks.length!==1||disks[0][0]!==model.disk)fail('Automatic guest expansion requires one attached VM disk to identify the root disk safely');
  const status=await query(base+'/status/current');if(status?.status!=='running')fail('Start the VM and its QEMU Guest Agent before checking usable space');
  return {model,base};
 }
 async function execute(base,mode,token){
  const command=['/usr/bin/python3','-c',script,mode,...(token?[token]:[])];
  const execution=await query(base+'/agent/exec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command})});
  if(!Number.isInteger(execution?.pid)||execution.pid<0)fail('Guest agent did not start the storage operation',502);
  for(let attempt=0;attempt<120;attempt++){
   const result=await query(base+'/agent/exec-status?pid='+execution.pid);
   if(result?.exited){
    if(result.exitcode!==0||result['out-truncated'])fail('Guest storage operation failed. Check Python 3, QEMU Guest Agent and guest execution permissions. Recheck before retrying.',502);
    let plan;try{plan=JSON.parse(result['out-data']);}catch{fail('Guest storage result could not be verified. Recheck before retrying.',502)}
    if(plan.error)fail(plan.error);
    return plan;
   }
   await wait(1000);
  }
  fail('Guest operation is still running or its result is unknown. Do not repeat it until you recheck the VM.',504);
 }
 return {
  async inspect(input,guard=()=>{}){const {model,base}=await target(input);guard();const plan=await execute(base,'inspect');guard();if(plan.diskBytes!==model.size)fail('The guest has not detected the current virtual disk size. Rescan or reboot the guest, then check again');return {model,plan};},
  async expand(input,guard=()=>{}){
   const {model,base}=await target(input);
   if(input.revision!==model.revision||!(/^[a-f0-9]{64}$/).test(input.guestToken||''))fail('Storage changed. Check usable space again');
   guard();const result=await execute(base,'expand',input.guestToken);guard();
   if(result.verified!==true)fail('Guest filesystem expansion was not verified',502);
   return result;
  }
 };
}
export const guestStorage=createGuestStorage();
