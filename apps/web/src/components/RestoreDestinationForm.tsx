import {useState} from 'react';
import {useApi} from '../hooks';
import {inventoryComplete} from '../proxmox-state';

export default function RestoreDestinationForm({archive,busy,error,onSubmit}:{archive:any;busy:boolean;error:string;onSubmit:(event:any)=>void}){
 const cluster=useApi<any>('/proxmox',null),stores=useApi<any>('/proxmox/storage',null),[node,setNode]=useState(archive.node||'');
 const ready=inventoryComplete(cluster.data,cluster.error)&&inventoryComplete(stores.data,stores.error)&&Array.isArray(cluster.data?.vms)&&Array.isArray(cluster.data?.lxc)&&Array.isArray(stores.data?.resources);
 const resources=stores.data?.resources||[],guests=[...(cluster.data?.vms||[]),...(cluster.data?.lxc||[])],used=new Set(guests.map((guest:any)=>Number(guest.id??guest.vmid)));
 const ids:number[]=[];for(let id=100;id<100000&&ids.length<100;id++)if(!used.has(id))ids.push(id);
 const nodes=Array.from(new Set<string>([archive.node,...resources.filter((store:any)=>archive.shared===true&&store.name===archive.storage&&store.shared===true&&store.status==='online').map((store:any)=>store.node)].filter(Boolean)));
 const content=archive.type==='lxc'?'rootdir':'images',targets=resources.filter((store:any)=>store.node===node&&store.status==='online'&&store.applicable!==false&&String(store.content||'').split(',').includes(content)&&!(content==='images'&&['iscsi','iscsidirect'].includes(store.type)));
 const submit=(event:any)=>{const values=new FormData(event.currentTarget);if(busy||!ready||!ids.includes(Number(values.get('vmid')))||!targets.some((target:any)=>target.name===values.get('storage'))||!nodes.includes(String(values.get('node')))){event.preventDefault();return}onSubmit(event)};
 return <form className="form-grid" onSubmit={submit}>
 <p className="restore-name">{archive.volid}</p>
 <label>Unused VM / container ID<select name="vmid" required disabled={!ready||busy}><option value="">Select an unused ID</option>{ready&&ids.map(id=><option key={id} value={id}>{id}</option>)}</select></label>
 <label>Destination storage<select key={node} name="storage" required disabled={!ready||busy}><option value="">Select storage for this node</option>{targets.map((store:any)=><option key={store.id||store.name} value={store.name}>{store.name}</option>)}</select></label>
 <label>Destination node<select name="node" required value={node} disabled={!ready||busy} onChange={event=>setNode(event.target.value)}>{nodes.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
 {!ready&&<p role="status">Restore choices require complete guest and storage inventory. Refresh discovery and try again.</p>}
 {ready&&!targets.length&&<p role="status">No compatible active destination storage is reported for this node.</p>}
 {(error||cluster.error||stores.error)&&<p role="alert" className="error">{error||cluster.error||stores.error}</p>}
 <button type="button" className="btn secondary" disabled={busy||cluster.loading||stores.loading} onClick={()=>Promise.all([cluster.refresh(),stores.refresh()])}>Refresh</button>
 <button type="submit" className="btn primary" aria-busy={busy} disabled={busy||!ready||!targets.length}>{busy?'Submitting...':'Restore'}</button>
 </form>;
}
