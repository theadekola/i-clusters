import {containerVolumes,configuredVmDisks} from './proxmox-volume.js';
import {pve} from './connectors.js';
import {truenas,encode,required,httpError} from './infrastructure.js';
import {storageInventory,storageSummary} from './storage.js';

const number=v=>{if(v==null)return null;const n=Number(v?.parsed??v?.rawvalue??v?.value??v);return Number.isFinite(n)?n:null;};
const value=v=>v?.value??v??null;
export function normalizeDataset(d){
 const used=number(d.used),available=number(d.available),quota=number(d.quota),volsize=number(d.volsize);
 return {id:`truenas:${d.id||d.name}`,resourceId:d.id||d.name,name:d.name,provider:'truenas',pool:d.name.split('/')[0],type:d.type==='VOLUME'?'ZFS Volume':'Dataset',used,available,size:d.type==='VOLUME'?volsize:quota>0?quota:null,mountpoint:value(d.mountpoint),compression:value(d.compression),deduplication:value(d.deduplication),readonly:value(d.readonly),created:value(d.creation),status:d.locked===true?'Locked':d.mounted?.value==='no'?'Unmounted':d.mounted?.value==='yes'?'Mounted':'Reported',usedByDataset:number(d.usedbydataset),quota:quota>0?quota:null};
}
export async function datasetInventory({proxmox=false,truenasEnabled=false,snapshot={},guests={},query=pve,tn=truenas,inventory=storageInventory}={}){
 const resources=[],errors=[],pools=[];let coverage={complete:true};
 const guestUsage=(row,node)=>{
  if(number(row.used)!=null||number(row.available)!=null)return null;
  const list=row.content==='images'?guests.vms:guests.lxc;
  const guest=(list||[]).find(g=>String(g.id)===String(row.vmid)&&g.node===node&&g.status==='running'&&g.nodeAvailable!==false);
  const used=number(guest?.disk),total=number(guest?.diskTotal);
  if(used==null||total==null||used<0||total<=0||used>total)return null;
  return {used,available:total-used,total,scope:'guest',guestId:String(guest.id),source:row.content==='images'?'QEMU guest agent':'Container filesystem'};
 };
 if(proxmox)try{
  let result;
  try{result=await inventory();}catch(error){result={resources:[],errors:[`Proxmox pools: ${error.message}`],coverage:{complete:false}};}
  coverage=result.coverage||coverage;errors.push(...result.errors);pools.push(...result.resources.map(p=>({...p,provider:'proxmox'})));
  let {vms,lxc:containers}=guests;
  if(!Array.isArray(containers)||!Array.isArray(vms))try{
   const all=await query('/cluster/resources');
   if(!Array.isArray(all))throw Error('Unexpected guest inventory');
   const fromCluster=type=>all.filter(g=>g.type===type).map(g=>({...g,id:g.vmid}));
   containers??=fromCluster('lxc');vms??=fromCluster('qemu');
  }catch(e){coverage={...coverage,complete:false};errors.push(`Guest inventory: ${e.message}`);}

  const seen=new Set();const online=result.resources.filter(p=>p.status==='online');
  for(let i=0;i<online.length;i+=5)await Promise.all(online.slice(i,i+5).map(async p=>{
   try{const rows=await query(`/nodes/${encode(p.node)}/storage/${encode(p.name)}/content`);
    for(const row of rows.filter(r=>['images','rootdir'].includes(r.content))){const key=p.shared===true?`shared:${row.volid}`:`${p.node}:${row.volid}`;if(seen.has(key))continue;seen.add(key);
     const owns=g=>String(g.id??g.vmid)===String(row.vmid)&&(p.shared===true||g.node===p.node);
     const ct=containers?.find(owns);
     const guest=ct||(row.content==='images'?vms:containers)?.find(owns);
     const owner=p.shared===true&&guest?.node?guest.node:p.node;
     resources.push({id:`proxmox:${key}`,resourceId:row.volid,name:row.volid,provider:'proxmox',pool:p.name,node:owner,type:ct||row.content==='rootdir'?'CT Volume':'VM Volume',size:number(row.size),used:number(row.used),available:number(row.available),guestUsage:ct||row.content==='rootdir'?null:guestUsage(row,owner),mountpoint:null,status:'Reported',vmid:row.vmid??null,format:row.format||null,shared:p.shared});
    }
   }catch(e){coverage={...coverage,complete:false};errors.push(`${p.node}/${p.name} volumes: ${e.message}`);}
  }));
  // Pool content excludes host devices and may omit an attached virtual disk.
  const machines=(vms||[]).filter(vm=>vm.node&&vm.nodeAvailable!==false&&/^\d+$/.test(String(vm.id??vm.vmid)));
  for(let i=0;i<machines.length;i+=5)await Promise.all(machines.slice(i,i+5).map(async vm=>{
   const vmid=String(vm.id??vm.vmid),node=vm.node;
   try{
    const disks=vm.attachedDisks??configuredVmDisks(await query(`/nodes/${encode(node)}/qemu/${vmid}/config?current=1`));
    for(const device of disks){
     const {resourceId,kind,slot,size}=device;
     const listed=resources.find(r=>r.provider==='proxmox'&&r.type==='VM Volume'&&r.resourceId===resourceId&&String(r.vmid)===vmid&&(r.node===node||r.shared));
     if(listed){listed.disk=slot;listed.node=node;listed.size??=size;continue;}
     const managed=kind==='managed';
     resources.push({id:`proxmox:vm:${node}:${vmid}:${slot}`,resourceId,name:resourceId,provider:'proxmox',node,vmid,disk:slot,
      type:managed?'VM Volume':kind==='host'?'VM host disk':'VM file disk',pool:managed?resourceId.split(':')[0]:null,
      size,used:null,available:null,mountpoint:null,editable:false,status:'Attached'});
    }
   }catch(e){coverage={...coverage,complete:false};errors.push(`${node}/VM ${vmid} disks: ${e.message}`);}
  }));
  for(let i=0;i<(containers||[]).length;i+=5)await Promise.all(containers.slice(i,i+5).map(async guest=>{
   const vmid=String(guest.id??guest.vmid),node=guest.node;
   if(!node||!/^\d+$/.test(vmid))return;
   try{
    const config=await query(`/nodes/${encode(node)}/lxc/${vmid}/config`);
    if(!config||typeof config!=='object'||Array.isArray(config))throw Error('Configuration unavailable');
    for(const volume of containerVolumes(config)){
     const managed=volume.resourceId.includes(':')&&!volume.resourceId.startsWith('/');
     let row=resources.find(r=>r.resourceId===volume.resourceId&&(r.node===node||r.shared)&&String(r.vmid)===vmid&&(!r.disk||r.disk===volume.disk));
     if(!row){row={id:`proxmox:ct:${node}:${vmid}:${volume.disk}`,provider:'proxmox',resourceId:volume.resourceId,name:volume.resourceId,pool:managed?volume.resourceId.split(':')[0]:'Host bind mounts',node,vmid,used:null,available:null,status:'Reported'};resources.push(row);}
     Object.assign(row,{type:managed?'CT Volume':'CT Bind Mount',node,disk:volume.disk,mountpoint:volume.mountpoint,size:volume.size??row.size??null,editable:managed,guestUsage:volume.disk==='rootfs'?guestUsage({...row,content:'rootdir',vmid},node):null});
    }
   }catch(e){coverage={...coverage,complete:false};errors.push(`${node}/CT ${vmid} volumes: ${e.message}`);}
  }));
 }catch(e){coverage={...coverage,complete:false};errors.push(`Proxmox: ${e.message}`);}
 if(truenasEnabled&&(!Array.isArray(snapshot.pools)||(snapshot.errors||[]).some(e=>/^pool\.(query|dataset\.query):/.test(e))))coverage={...coverage,complete:false};
 if(truenasEnabled)try{resources.push(...(await tn('pool.dataset.query',[[],{extra:{flat:true}}])).map(normalizeDataset));pools.push(...(snapshot.pools||[]));}catch(e){coverage={...coverage,complete:false};errors.push(`TrueNAS: ${e.message}`);}
 return {resources,summary:storageSummary(pools,coverage),pools,errors,snapshots:snapshot.snapshots||[],truenasEnabled,sampledAt:new Date().toISOString()};
}
export function datasetCreateInput(input){
 const name=required(input.name,'Dataset path');if(!/^[^/@\s]+(?:\/[^/@\s]+)+$/.test(name)||name.split('/').some(s=>['.','..'].includes(s)))throw httpError('Enter a pool/dataset path');
 const type=input.type||'FILESYSTEM';if(!['FILESYSTEM','VOLUME'].includes(type))throw httpError('Unsupported dataset type');
 const body={name,type};if(input.compression){if(!['LZ4','ZSTD','OFF','INHERIT'].includes(input.compression))throw httpError('Unsupported compression');body.compression=input.compression;}
 if(type==='VOLUME'){const size=Number(input.volsize);if(!Number.isSafeInteger(size)||size<1024**2||size%16384!==0)throw httpError('Volume size must be a positive multiple of 16 KiB');body.volsize=size;body.volblocksize='16K';}
 else if(input.quota!=null&&input.quota!==''){const quota=Number(input.quota);if(!Number.isSafeInteger(quota)||quota<0)throw httpError('Quota must be a non-negative byte count');body.quota=quota;}
 return body;
}
export function datasetPermissionsInput(input,path){
 if(typeof input.mode!=='string'||!/^0?[0-7]{3}$/.test(input.mode))throw httpError('Mode must contain three octal permission digits');
 const body={path,mode:input.mode,options:{recursive:false,traverse:false,stripacl:false}};
 for(const key of ['uid','gid'])if(input[key]!=null&&input[key]!==''){const id=Number(input[key]);if(!Number.isInteger(id)||id<0||id>2147483647)throw httpError(`${key} must be a non-negative numeric ID`);body[key]=id;}
 return body;
}
export async function datasetRoot(id,tn=truenas){
 const rows=await tn('pool.dataset.query',[[['id','=',required(id,'Dataset')]]]);const d=rows.find(r=>r.id===id);
 const mountpoint=value(d?.mountpoint);if(!d||d.type!=='FILESYSTEM'||d.locked||typeof mountpoint!=='string'||!mountpoint.startsWith('/mnt/')||mountpoint.includes('/../'))throw httpError('Dataset has no accessible filesystem mountpoint');
 return mountpoint;
}
