import {isActionCancelled} from '../action-cancellation';
import {useEffect,useRef,useState} from 'react';
import {api,confirmedApi} from '../api';
import ReportLoading from './ReportLoading';

const size=(bytes:number)=>(bytes/1024**3).toLocaleString(undefined,{maximumFractionDigits:2})+' GiB';

export default function GuestStorageAllocation({resource,onComplete,onBusy}:{
 resource:any;onComplete:(message:string)=>void;onBusy:(busy:boolean)=>void;
}){
 const [inspection,setInspection]=useState<any>(null),[error,setError]=useState('');
 const [attempt,setAttempt]=useState(0),[checking,setChecking]=useState(true),[busy,setBusy]=useState(false);
 const section=useRef<HTMLElement>(null),alive=useRef(true),pending=useRef(false);
 useEffect(()=>{
  alive.current=true;
  section.current?.focus({preventScroll:true});
  const modal=section.current?.closest('.modal');if(modal)modal.scrollTop=0;
  return()=>{alive.current=false};
 },[]);
 useEffect(()=>{
  const controller=new AbortController(),{signal}=controller;
  setChecking(true);setInspection(null);setError('');
  const query=new URLSearchParams({provider:'proxmox',resourceId:resource.resourceId,node:resource.node,vmid:String(resource.vmid)});
  void api('/storage/datasets/guest-layout?'+query,{signal}).then(data=>{
   if(signal.aborted)return;
   if(data.connectionScope!==resource.connectionScope||data.model.disk!==resource.disk||data.model.size<resource.size)
    throw Error('The disk or connection changed. Reopen Modify disk.');
   setInspection(data);
  }).catch(e=>{if(!signal.aborted)setError(e.message)}).finally(()=>{if(!signal.aborted)setChecking(false)});
  return()=>controller.abort();
 },[resource,attempt]);

 const expand=async()=>{
  if(pending.current||!alive.current||!inspection?.plan?.supported)return;
  pending.current=true;setBusy(true);onBusy(true);setError('');
  const {model,plan,connectionScope}=inspection;
  try{
   const response=await confirmedApi('/storage/datasets/guest-expand',{method:'PUT',body:JSON.stringify({provider:'proxmox',resourceId:model.resourceId,node:model.node,vmid:model.vmid,revision:model.revision,connectionScope,guestToken:plan.token})},{title:'Expand guest filesystem',description:`Make the existing allocation usable by VM ${model.vmid} on ${model.node}. Expand the root partition, physical volume, logical volume and filesystem where applicable. All free space in a supported single-volume LVM group will be assigned to the root filesystem. Take a backup before continuing. No disk size increase is requested.`});
   if(!alive.current)return;
   const {result}=response;
   if(result?.verified!==true)throw Error('Guest filesystem expansion was not verified');
   setInspection(null);
   onComplete(result.changed
    ?`Disk expanded successfully. Filesystem capacity increased from ${size(result.before.capacityBytes)} to ${size(result.after.capacityBytes)}. Available space: ${size(result.after.availableBytes)}.`
    :`Filesystem check completed. Capacity is unchanged at ${size(result.after.capacityBytes)}.`);
  }catch(e:any){
   if(isActionCancelled(e))return;
   if(alive.current){setError(e.message);setInspection(null)}
  }finally{pending.current=false;if(alive.current){setBusy(false);onBusy(false)}}
 };

 return <section ref={section} tabIndex={-1} aria-label="Guest filesystem allocation" className="storage-guest-allocation storage-allocation-step">
  <p>Use space already assigned to this VM without adding disk capacity. This expands the Linux root partition, LVM and filesystem where needed. Existing files stay in place. Used space remains occupied by your data.</p>
  <p className="muted">Requires Python 3 and QEMU Guest Agent inside a running VM. Supports one disk with an ext4 or XFS root filesystem, directly or through a single-volume linear LVM group. Other disks and layouts need a guest-specific workflow.</p>
  {checking&&<ReportLoading message="Checking usable space…"/>}
  {error&&<p role="alert" className="error">{error}</p>}
  {inspection&&<>
   <dl><dt>Virtual disk</dt><dd>{size(inspection.plan.diskBytes)}</dd><dt>Filesystem capacity</dt><dd>{size(inspection.plan.capacityBytes)}</dd><dt>Available to the guest</dt><dd>{size(inspection.plan.availableBytes)}</dd><dt>Root filesystem</dt><dd>{inspection.plan.source} ({inspection.plan.filesystem})</dd></dl>
   {inspection.plan.missingTools?.length>0&&<p role="status">Install these tools inside the VM before expanding: {inspection.plan.missingTools.join(', ')}.</p>}
  </>}
  <div className="storage-allocation-actions">
   <button className="btn secondary" type="button" disabled={checking||busy} onClick={()=>setAttempt(a=>a+1)}>Check usable space</button>
   {inspection&&<button className="btn primary" type="button" disabled={busy||!inspection.plan.supported} aria-busy={busy} onClick={()=>void expand()}>{busy?'Working…':'Expand guest filesystem'}</button>}
  </div>
 </section>;
}
