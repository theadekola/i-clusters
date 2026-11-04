import {isActionCancelled} from '../action-cancellation';
import GuestStorageAllocation from './GuestStorageAllocation';
import {useEffect,useRef,useState} from 'react';
import {api,confirmedApi} from '../api';
import {Modal} from './UI';
import ReportLoading from './ReportLoading';
const GiB=1024**3;
export default function StorageResourceEditor({resource,onClose,onSaved}:{resource:any;onClose:()=>void;onSaved:()=>void}){
 const [model,setModel]=useState<any>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[success,setSuccess]=useState(''),[guestBusy,setGuestBusy]=useState(false);
 const alive=useRef(true),pending=useRef(false);
 useEffect(()=>{
  alive.current=true;const controller=new AbortController();
  const query=new URLSearchParams({provider:resource.provider,resourceId:resource.resourceId,...(resource.provider==='proxmox'?{node:resource.node||'',vmid:String(resource.vmid||'')}:{})});
  void api('/storage/datasets/edit?'+query,{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setModel(data)}).catch(e=>{if(!controller.signal.aborted)setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});
  return()=>{alive.current=false;controller.abort()};
 },[resource.id,resource.node,resource.vmid,resource.resourceId,resource.provider]);
 const submit=async(event:any)=>{
  event.preventDefault();if(!alive.current||!model||pending.current||guestBusy||success)return;
  const values=Object.fromEntries(new FormData(event.currentTarget)),body:any={provider:model.provider,resourceId:model.resourceId,revision:model.revision,connectionScope:model.connectionScope};
  if(model.provider==='proxmox'){body.node=model.node;body.vmid=model.vmid;}
  if(values.sizeGiB!==undefined&&values.sizeGiB!=='')body.sizeGiB=Number(values.sizeGiB);
  if(values.quotaGiB!==undefined&&values.quotaGiB!=='')body.quotaGiB=Number(values.quotaGiB);
  if(values.compression)body.compression=values.compression;
  if(values.readonly)body.readonly=values.readonly;
  if(!['sizeGiB','quotaGiB','compression','readonly'].some(key=>body[key]!==undefined)){setError('Choose at least one setting to change.');return;}
  pending.current=true;setBusy(true);setError('');
  try{
   const response:any=await confirmedApi('/storage/datasets/edit',{method:'PUT',body:JSON.stringify(body)},{title:'Modify storage',description:`Apply these changes to ${model.resourceId}${model.node?' on '+model.node:''}. Volume size increases cannot be undone here.`});
   if(!alive.current)return;
   setSuccess(response.result?.task?'Resize task accepted. Check Proxmox task history for completion.':'Storage change accepted by the provider. Refresh the inventory to verify the result.');
   onSaved();
  }catch(e:any){if(isActionCancelled(e))return;if(alive.current)setError(e.message)}finally{pending.current=false;if(alive.current)setBusy(false)}
 };
 return <Modal open title="Edit Dataset / Volume" closeDisabled={busy||guestBusy} onClose={onClose}>
  <p className="storage-edit-target"><strong>{resource.name}</strong><br/>{resource.node||resource.provider}</p>
  {loading&&<ReportLoading message="Loading current storage settings…"/>}
  {error&&<p role="alert" className="error">{error}</p>}
  {success?<><p role="status">{success}</p><button type="button" className="btn primary" disabled={guestBusy} onClick={onClose}>Done</button></>:model&&<form className="form-grid storage-resource-edit" onSubmit={submit}>
   {model.provider==='proxmox'?<>
    <p>Current allocated size: {(model.size/GiB).toLocaleString()} GiB · {model.disk}</p>
    <label>New total size (GiB)<input name="sizeGiB" type="number" step="1" min={Math.floor(model.size/GiB)+1} required placeholder={String(Math.floor(model.size/GiB)+1)}/></label>
    <p className="muted">Enter the total size, not the amount to add. Only increases are supported. {model.type==='CT Volume'?'Proxmox resizes the managed container volume and its supported filesystem. Bind mounts are managed on the host.':'After the Proxmox task finishes, use Check usable space below to inspect and expand the guest filesystem.'}</p>
   </>:<>
    {model.type==='Dataset'?<label>New quota (GiB)<input name="quotaGiB" type="number" min="0" step="any" placeholder={model.quota==null?'Keep current quota':String(model.quota/GiB)}/><small>Leave empty to keep the current quota. Enter 0 for unlimited.</small></label>:<label>New total volume size (GiB)<input name="sizeGiB" type="number" step="1" min={Math.floor((model.size||0)/GiB)+1} placeholder={'Current: '+(model.size/GiB).toLocaleString()}/><small>Leave empty to keep the current size. Only increases are supported.</small></label>}
    <label>Compression<select name="compression" defaultValue=""><option value="">Keep current ({model.compression||'not reported'})</option>{['LZ4','ZSTD','OFF','INHERIT'].map(v=><option key={v}>{v}</option>)}</select></label>
    <label>Read-only mode<select name="readonly" defaultValue=""><option value="">Keep current ({model.readonly||'not reported'})</option><option value="ON">On</option><option value="OFF">Off</option><option value="INHERIT">Inherit</option></select></label>
   </>}
   <div className="storage-edit-actions"><button type="button" className="btn secondary" disabled={busy||guestBusy} onClick={onClose}>Cancel</button><button className="btn primary" type="submit" disabled={busy||guestBusy} aria-busy={busy}>{busy?'Saving…':'Save Changes'}</button></div>
  </form>}
  {model?.type==='VM Volume'&&<GuestStorageAllocation resource={resource} onSaved={onSaved} disabled={busy} onBusy={setGuestBusy}/>}
 </Modal>;
}
