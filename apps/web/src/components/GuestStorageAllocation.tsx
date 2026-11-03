import {useEffect,useRef,useState} from 'react';
import {api,confirmedApi} from '../api';
const size=(bytes:number)=>(bytes/1024**3).toLocaleString(undefined,{maximumFractionDigits:2})+' GiB';
export default function GuestStorageAllocation({resource,onSaved,disabled,onBusy}:{resource:any;onSaved:()=>void;disabled:boolean;onBusy:(busy:boolean)=>void}){
 const [inspection,setInspection]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<any>(null);
 const alive=useRef(true),pending=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const check=async()=>{
  if(disabled||pending.current||!alive.current)return;
  pending.current=true;setBusy(true);onBusy(true);setError('');setInspection(null);setResult(null);
  try{const query=new URLSearchParams({provider:'proxmox',resourceId:resource.resourceId,node:resource.node,vmid:String(resource.vmid)});const data=await api('/storage/datasets/guest-layout?'+query);if(alive.current)setInspection(data)}
  catch(e:any){if(alive.current)setError(e.message)}finally{pending.current=false;if(alive.current){setBusy(false);onBusy(false)}}
 };
 const expand=async()=>{
  if(disabled||pending.current||!alive.current||!inspection?.plan?.supported)return;
  pending.current=true;setBusy(true);onBusy(true);setError('');
  const {model,plan,connectionScope}=inspection;
  try{
   const response:any=await confirmedApi('/storage/datasets/guest-expand',{method:'PUT',body:JSON.stringify({provider:'proxmox',resourceId:model.resourceId,node:model.node,vmid:model.vmid,revision:model.revision,connectionScope,guestToken:plan.token})},{title:'Expand guest filesystem',description:`Make the existing allocation usable by VM ${model.vmid} on ${model.node}. Expand the root partition, physical volume, logical volume and filesystem where applicable. All free space in a supported single-volume LVM group will be assigned to the root filesystem. Take a backup before continuing. No disk size increase is requested.`});
   if(alive.current){setResult(response.result);setInspection(null);onSaved()}
  }catch(e:any){if(alive.current){setError(e.message);setInspection(null)}}finally{pending.current=false;if(alive.current){setBusy(false);onBusy(false)}}
 };
 return <section className="storage-guest-allocation" aria-label="Guest filesystem allocation">
  <h3>Make allocated space usable</h3>
  <p>Use space already assigned to this VM without adding disk capacity. This expands the Linux root partition, LVM and filesystem where needed. Existing files stay in place. Used space remains occupied by your data.</p>
  <p className="muted">Requires Python 3 and QEMU Guest Agent inside a running VM. Supports one disk with an ext4 or XFS root filesystem, directly or through a single-volume linear LVM group. Other disks and layouts need a guest-specific workflow.</p>
  <button className="btn secondary" type="button" disabled={disabled||busy} onClick={()=>void check()}>{busy?'Working…':'Check usable space'}</button>
  {error&&<p role="alert" className="error">{error}</p>}
  {inspection&&<>
   <dl><dt>Virtual disk</dt><dd>{size(inspection.plan.diskBytes)}</dd><dt>Filesystem capacity</dt><dd>{size(inspection.plan.capacityBytes)}</dd><dt>Available to the guest</dt><dd>{size(inspection.plan.availableBytes)}</dd><dt>Root filesystem</dt><dd>{inspection.plan.source} ({inspection.plan.filesystem})</dd></dl>
   {inspection.plan.missingTools?.length>0&&<p role="status">Install these tools inside the VM before expanding: {inspection.plan.missingTools.join(', ')}.</p>}
   <button className="btn primary" type="button" disabled={disabled||busy||!inspection.plan.supported} onClick={()=>void expand()}>Expand guest filesystem</button>
  </>}
  {result&&<p role="status">{result.changed?`Verified filesystem capacity: ${size(result.before.capacityBytes)} → ${size(result.after.capacityBytes)}. Available now: ${size(result.after.availableBytes)}.`:`Filesystem checked successfully. Its capacity is unchanged at ${size(result.after.capacityBytes)}; no additional root filesystem capacity was made available.`}</p>}
 </section>;
}
