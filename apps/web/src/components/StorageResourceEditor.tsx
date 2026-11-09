import {isActionCancelled} from '../action-cancellation';
import GuestStorageAllocation from './GuestStorageAllocation';
import {useEffect,useRef,useState, type FormEvent} from 'react';
import {api,confirmedApi} from '../api';
import {Modal} from './UI';
import ReportLoading from './ReportLoading';
const GiB=1024**3;
export default function StorageResourceEditor({resource,onClose,onSaved}:{resource:any;onClose:()=>void;onSaved:()=>void}){
 const [model,setModel]=useState<any>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[success,setSuccess]=useState(''),[guestBusy,setGuestBusy]=useState(false);
 const [allocation,setAllocation]=useState(false);
 const [resize,setResize]=useState<{task?:string;size:number;diskOnly:boolean}|null>(null);
 const [eligibility,setEligibility]=useState<{supported:boolean;reason?:string}|null>(null);
 const [attempt,recheck]=useState(0);
 const [checking,setChecking]=useState(false),[completed,setCompleted]=useState('');
 const alive=useRef(true),pending=useRef(false),saved=useRef(onSaved);
 saved.current=onSaved;
 const query=new URLSearchParams({provider:resource.provider,resourceId:resource.resourceId,...(resource.provider==='proxmox'?{node:resource.node||'',vmid:String(resource.vmid||'')}:{})});
 const editPath='/storage/datasets/edit?'+query;
 useEffect(()=>{
  alive.current=true;const controller=new AbortController();
  void api(editPath,{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setModel(data)}).catch(e=>{if(!controller.signal.aborted)setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});
  return()=>{alive.current=false;controller.abort()};
 },[editPath]);
 useEffect(()=>{
  if(model?.type!=='VM Volume'||allocation||resize||completed)return;
  const controller=new AbortController(),{signal}=controller;
  const path=editPath.replace('/datasets/edit?', '/datasets/guest-layout?');
  setEligibility(null);
  void api(path,{signal}).then(report=>{
   if(signal.aborted)return;
   if(report.connectionScope!==model.connectionScope||report.model.revision!==model.revision)
    throw Error('The disk or connection changed. Reopen Modify disk.');
   const supported=report.plan.supported===true;
   const missing=report.plan.missingTools||[];
   setEligibility({supported,reason:!supported&&missing.length?`Install these guest tools: ${missing.join(', ')}.`:undefined});
  }).catch(e=>{if(!signal.aborted)setEligibility({supported:false,reason:e.message})});
  return()=>controller.abort();
 },[model,editPath,attempt,allocation,resize,completed]);
 useEffect(()=>{
  if(!resize)return;
  const controller=new AbortController(),{signal}=controller;
  let timer:ReturnType<typeof setTimeout>,taskFinished=!resize.task;
  const deadline=Date.now()+120000;
  setChecking(true);setError('');
  const verify=async()=>{
   try{
    if(!taskFinished){
     const task=await api('/tasks/'+encodeURIComponent(model.node)+'/'+encodeURIComponent(resize.task!),{signal});
     if(signal.aborted)return;
     if(task.status==='stopped'&&task.exitstatus!=='OK')throw Error(`Proxmox resize task ended with ${task.exitstatus||'unknown status'}. Check the task history.`);
     taskFinished=task.status==='stopped'&&task.exitstatus==='OK';
    }
    if(taskFinished){
     const current=await api(editPath,{signal});
     if(signal.aborted)return;
     if(current.connectionScope!==model.connectionScope||current.disk!==model.disk||current.type!==model.type)
      throw Error('The disk or connection changed. Reopen Modify disk.');
     if(current.size>=resize.size){
      setChecking(false);setResize(null);
      if(resize.diskOnly)setCompleted('Virtual disk expanded successfully. Guest filesystem allocation was skipped.');
      else if(model.type==='VM Volume'){setModel(current);setAllocation(true)}
      else setCompleted('Disk expanded successfully.');
      saved.current();return;
     }
    }
    if(Date.now()>=deadline)throw Error('The new disk size has not been verified yet. Check the resize status again.');
    timer=setTimeout(verify,2000);
   }catch(e:any){if(!signal.aborted){setError(e.message);setChecking(false)}}
  };
  void verify();
  return()=>{controller.abort();clearTimeout(timer)};
 },[resize,editPath,model]);
 const submit=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();if(!alive.current||!model||pending.current||guestBusy||success||resize||allocation||completed)return;
  const values=Object.fromEntries(new FormData(event.currentTarget)),body:any={provider:model.provider,resourceId:model.resourceId,revision:model.revision,connectionScope:model.connectionScope};
  if(model.provider==='proxmox'){body.node=model.node;body.vmid=model.vmid;}
  if(model.type==='VM Volume'){
   if(!eligibility)return;
   const requested=(event.nativeEvent as SubmitEvent)?.submitter?.getAttribute('value');
   if(!eligibility.supported&&requested!=='disk-only')return;
   body.allocationMode=eligibility.supported?'guest':'disk-only';
  }
  if(values.sizeGiB!==undefined&&values.sizeGiB!=='')body.sizeGiB=Number(values.sizeGiB);
  if(values.quotaGiB!==undefined&&values.quotaGiB!=='')body.quotaGiB=Number(values.quotaGiB);
  if(values.compression)body.compression=values.compression;
  if(values.readonly)body.readonly=values.readonly;
  if(!['sizeGiB','quotaGiB','compression','readonly'].some(key=>body[key]!==undefined)){setError('Choose at least one setting to change.');return;}
  pending.current=true;setBusy(true);setError('');
  try{
   const response:any=await confirmedApi('/storage/datasets/edit',{method:'PUT',body:JSON.stringify(body)},{title:'Modify storage',description:body.allocationMode==='disk-only'?`Increase only the virtual disk for ${model.resourceId}. The guest filesystem will keep its current capacity.`:`Apply these changes to ${model.resourceId}${model.node?' on '+model.node:''}. Volume size increases cannot be undone here.`});
   if(!alive.current)return;
   if(model.provider==='proxmox'){
    setResize({task:response.result?.task,size:body.sizeGiB*GiB,diskOnly:body.allocationMode==='disk-only'});
   }else{
    setSuccess('Storage change accepted by the provider. Refresh the inventory to verify the result.');
    onSaved();
   }
  }catch(e:any){if(isActionCancelled(e))return;if(alive.current){setError(e.message);if(body.allocationMode==='guest'){setEligibility(null);recheck(n=>n+1)}}}finally{pending.current=false;if(alive.current)setBusy(false)}
 };
 return <Modal open title={allocation?'Allocate disk space':'Modify disk'} success={completed} closeDisabled={busy||guestBusy} onClose={onClose}>
  <p className="storage-edit-target"><strong>{resource.name}</strong><br/>{resource.node||resource.provider}</p>
  {loading&&<ReportLoading message="Loading current storage settings…"/>}
  {error&&<p role="alert" className="error">{error}</p>}
  {resize&&checking&&<ReportLoading message="Verifying the new disk size…"/>}
  {resize&&!checking&&<button type="button" className="btn secondary" onClick={()=>setResize({...resize})}>Check resize status</button>}
  {allocation&&<GuestStorageAllocation resource={model} onComplete={message=>{setCompleted(message);onSaved()}} onBusy={setGuestBusy}/>}
  {success&&<><p role="status">{success}</p><button type="button" className="btn primary" onClick={onClose}>Done</button></>}
  {model&&!resize&&!allocation&&!success&&<form className="form-grid storage-resource-edit" onSubmit={submit}>
   {model.provider==='proxmox'?<>
    <p>Current allocated size: {(model.size/GiB).toLocaleString()} GiB · {model.disk}</p>
    <label>New total size (GiB)<input name="sizeGiB" type="number" step="1" min={Math.floor(model.size/GiB)+1} required placeholder={String(Math.floor(model.size/GiB)+1)}/></label>
    <p className="muted">Enter the total size, not the amount to add. Only increases are supported. {model.type==='CT Volume'?'Proxmox resizes the managed container volume and its supported filesystem. Bind mounts are managed on the host.':'After the disk grows, you can allocate the new space to the guest filesystem.'}</p>
   </>:<>
    {model.type==='Dataset'?<label>New quota (GiB)<input name="quotaGiB" type="number" min="0" step="any" placeholder={model.quota==null?'Keep current quota':String(model.quota/GiB)}/><small>Leave empty to keep the current quota. Enter 0 for unlimited.</small></label>:<label>New total volume size (GiB)<input name="sizeGiB" type="number" step="1" min={Math.floor((model.size||0)/GiB)+1} placeholder={'Current: '+(model.size/GiB).toLocaleString()}/><small>Leave empty to keep the current size. Only increases are supported.</small></label>}
    <label>Compression<select name="compression" defaultValue=""><option value="">Keep current ({model.compression||'not reported'})</option>{['LZ4','ZSTD','OFF','INHERIT'].map(v=><option key={v}>{v}</option>)}</select></label>
    <label>Read-only mode<select name="readonly" defaultValue=""><option value="">Keep current ({model.readonly||'not reported'})</option><option value="ON">On</option><option value="OFF">Off</option><option value="INHERIT">Inherit</option></select></label>
   </>}
   {model.type==='VM Volume'&&(!eligibility?<ReportLoading message="Checking guest allocation support…"/>:!eligibility.supported&&<div className="form-wide">
    <p role="status">Automatic guest allocation is unavailable. You can increase the virtual disk and allocate space inside the guest separately.</p>
    {eligibility.reason&&<p className="muted">{eligibility.reason}</p>}
    <button className="btn secondary" type="button" disabled={busy} onClick={()=>{setEligibility(null);recheck(n=>n+1)}}>Check again</button>
   </div>)}
   <div className="storage-edit-actions"><button type="button" className="btn secondary" disabled={busy||guestBusy} onClick={onClose}>Cancel</button>
    <button className="btn primary" type="submit" value={eligibility?.supported===false?'disk-only':'save'} disabled={busy||guestBusy||(model.type==='VM Volume'&&!eligibility)} aria-busy={busy}>{busy?'Saving…':model.type==='VM Volume'&&eligibility?.supported===false?'Expand virtual disk only':'Save Changes'}</button>
   </div>
  </form>}
  {model?.type==='VM Volume'&&!resize&&!allocation&&<section className="storage-guest-allocation">
   <h3>Make allocated space usable</h3>
   <p>Check the space already assigned to this disk before expanding the guest filesystem.</p>
   <button className="btn secondary" type="button" disabled={busy} onClick={()=>{setError('');setAllocation(true)}}>Check usable space</button>
  </section>}
 </Modal>;
}
