import crypto from 'node:crypto';
import {pve} from './connectors.js';
import {truenas} from './infrastructure.js';
const GiB=1024**3;
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const numeric=value=>{const raw=value?.parsed??value?.rawvalue??value?.value??value;if(raw==null||raw==='')return null;const n=Number(raw);return Number.isFinite(n)?n:null};
const text=value=>String(value?.value??value??'').toUpperCase();
const revision=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function identity(input){
 if(!['proxmox','truenas'].includes(input.provider)||typeof input.resourceId!=='string'||input.resourceId.length>512||!input.resourceId||/[\s@]/.test(input.resourceId))fail('Select a valid storage resource');
 if(input.provider==='proxmox'&&(!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(input.node||'')||!/^\d+$/.test(String(input.vmid||''))))fail('Select the volume node and guest');
 return {provider:input.provider,resourceId:input.resourceId,...(input.provider==='proxmox'?{node:input.node,vmid:String(input.vmid)}:{})};
}
export function createStorageResourceEditor({query=pve,tn=truenas}={}){
 async function inspect(input){
  const target=identity(input);
  if(target.provider==='truenas'){
   if(!target.resourceId.includes('/')||target.resourceId.split('/').some(p=>!p||p==='.'||p==='..'))fail('Select a child dataset or ZFS volume');
   const rows=await tn('pool.dataset.query',[[['id','=',target.resourceId]]]);if(!Array.isArray(rows))fail('Current dataset settings are unavailable',502);const d=rows.find(d=>d.id===target.resourceId);
   if(!d||!['FILESYSTEM','VOLUME'].includes(d.type))fail('Storage resource is no longer available',409);
   if(d.locked)fail('Unlock the dataset in TrueNAS before editing',409);
   const model={...target,type:d.type==='VOLUME'?'ZFS Volume':'Dataset',size:numeric(d.volsize),quota:numeric(d.quota),used:numeric(d.used),compression:text(d.compression),readonly:text(d.readonly),blocksize:numeric(d.volblocksize)};
   return {...model,revision:revision({...model,used:undefined})};
  }
  const resources=await query('/cluster/resources');
  if(!Array.isArray(resources))fail('Current guest inventory is unavailable',502);
  const guest=resources.find(r=>String(r.vmid)===target.vmid&&r.node===target.node&&['qemu','lxc'].includes(r.type));
  if(!guest)fail('The guest moved or is unavailable. Refresh storage.',409);
  const base=`/nodes/${encodeURIComponent(target.node)}/${guest.type}/${target.vmid}`;
  const config=await query(base+'/config');
  if(!config||typeof config!=='object')fail('Current guest configuration is unavailable',502);
  if(config.lock||config.template)fail('Locked guests and templates cannot be resized here',409);
  const pattern=guest.type==='qemu'?/^(scsi|sata|ide|virtio)\d+$/:/^(rootfs|mp\d+)$/;
  const disks=Object.entries(config).filter(([key,value])=>pattern.test(key)&&typeof value==='string'&&!/(?:^|,)media=cdrom(?:,|$)/.test(value)&&value.split(',')[0].replace(/^file=/,'')===target.resourceId);
  if(disks.length!==1)fail('This volume is not uniquely attached to the selected guest. Refresh storage.',409);
  const pool=target.resourceId.split(':')[0];if(!target.resourceId.includes(':'))fail('Only managed storage volumes can be resized');
  const content=await query(`/nodes/${encodeURIComponent(target.node)}/storage/${encodeURIComponent(pool)}/content`);
  if(!Array.isArray(content))fail('Current storage content is unavailable',502);
  const volume=content.find(v=>v.volid===target.resourceId&&String(v.vmid)===target.vmid&&v.content===(guest.type==='qemu'?'images':'rootdir'));
  const size=numeric(volume?.size);
  if(!volume||!Number.isSafeInteger(size)||size<=0||!/^[a-f0-9]{40}$/.test(config.digest||''))fail('Current volume size or configuration revision is unavailable',409);
  const model={...target,type:guest.type==='qemu'?'VM Volume':'CT Volume',disk:disks[0][0],size,digest:config.digest};
  return {...model,revision:revision(model)};
 }
 async function update(input,guard=()=>{}){
  const model=await inspect(input);
  if(input.revision!==model.revision)fail('Storage settings changed. Close and reopen Edit before saving.',409);
  const body={};
  if(input.sizeGiB!==undefined){
   const size=input.sizeGiB*GiB;
   if(typeof input.sizeGiB!=='number'||!Number.isSafeInteger(size)||!Number.isInteger(input.sizeGiB)||input.sizeGiB<1||model.type==='Dataset')fail('Enter a whole-number volume size in GiB');
   if(!Number.isSafeInteger(model.size)||size<=model.size)fail('Volume size must increase. Shrinking is not supported.');
   if(model.provider==='truenas'&&(!Number.isSafeInteger(model.blocksize)||model.blocksize<=0||size%model.blocksize))fail('Volume size must align with the existing block size');
   body.volsize=size;
  }
  if(model.provider==='proxmox'){
   if(input.compression!==undefined||input.readonly!==undefined||input.quotaGiB!==undefined)fail('This Proxmox volume supports size increases only');
   if(!body.volsize)fail('Enter the new volume size');
   const kind=model.type==='VM Volume'?'qemu':'lxc';
   guard();
   const result=await query(`/nodes/${encodeURIComponent(model.node)}/${kind}/${model.vmid}/resize`,{method:'PUT',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({disk:model.disk,size:input.sizeGiB+'G',digest:model.digest}).toString()});
   return {...(typeof result==='string'&&result.startsWith('UPID:')?{task:result}:{}),resourceId:model.resourceId,size:body.volsize,accepted:true};
  }
  if(input.quotaGiB!==undefined){
   const quota=input.quotaGiB*GiB;
   if(model.type!=='Dataset'||typeof input.quotaGiB!=='number'||!Number.isSafeInteger(quota)||quota<0||(quota>0&&quota<GiB))fail('Quota must be zero for unlimited, or at least 1 GiB');
   if(quota&&model.used!=null&&quota<model.used)fail('Quota cannot be below currently used space');
   body.quota=quota;
  }
  if(input.compression!==undefined){if(!['LZ4','ZSTD','OFF','INHERIT'].includes(input.compression))fail('Unsupported compression');body.compression=input.compression;}
  if(input.readonly!==undefined){if(!['ON','OFF','INHERIT'].includes(input.readonly))fail('Unsupported read-only setting');body.readonly=input.readonly;}
  if(!Object.keys(body).length)fail('Choose at least one storage setting to change');
  guard();
  await tn('pool.dataset.update',[model.resourceId,body]);
  return {resourceId:model.resourceId,accepted:true};
 }
 return {inspect,update};
}
export const storageResourceEditor=createStorageResourceEditor();
