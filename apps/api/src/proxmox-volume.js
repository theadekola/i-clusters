// Proxmox config sizes use binary units; never infer allocation from guest usage.
export function configuredVolumeSize(value){
 const match=String(value||'').match(/(?:^|,)size=(\d+(?:\.\d+)?)([KMGTPE]?)(?:i?B)?(?:,|$)/i);
 if(!match)return null;
 const bytes=Number(match[1])*1024**(match[2]?'KMGTPE'.indexOf(match[2].toUpperCase())+1:0);
 return Number.isSafeInteger(bytes)&&bytes>0?bytes:null;
}
export function containerVolumes(config){
 return Object.entries(config||{}).filter(([key,value])=>/^(rootfs|mp\d+)$/.test(key)&&typeof value==='string').map(([disk,value])=>({disk,resourceId:value.split(',')[0].replace(/^volume=/,''),size:configuredVolumeSize(value),mountpoint:disk==='rootfs'?'/':value.match(/(?:^|,)mp=([^,]+)/)?.[1]||null}));
}

export function configuredVmDisks(config){
 if(!config||typeof config!=='object'||Array.isArray(config)||!Object.keys(config).length)throw Error('VM configuration unavailable');
 const disks=[];
 for(const [slot,options] of Object.entries(config)){
  if(!/^(?:scsi|sata|ide|virtio)\d+$/.test(slot)||typeof options!=='string')continue;
  const settings=options.split(',');
  const file=settings.find(option=>/^(file|volume)=/.test(option))??settings.find(option=>!option.includes('='));
  const resourceId=file?.replace(/^(?:file|volume)=/,'');
  if(!resourceId||resourceId==='none'||resourceId==='cdrom'||settings.includes('media=cdrom')||/(?:^|[:/])(?:vm-\d+-)?cloudinit(?:\.[a-z0-9]+)?$/.test(resourceId))continue;
  const kind=resourceId.startsWith('/dev/')?'host':resourceId.includes(':')&&!resourceId.startsWith('/')?'managed':'file';
  disks.push({slot,resourceId,kind,size:configuredVolumeSize(options)});
 }
 return disks;
}

// Read storage metadata only for attached managed disks whose config lacks a size.
export async function vmDiskSizes(config,guest,query){
 const disks=configuredVmDisks(config);
 const pools=new Map();
 for(const disk of disks.filter(d=>d.kind==='managed'&&d.size===null)){
  const pool=disk.resourceId.split(':')[0];
  if(!pools.has(pool)){
   let rows=[];
   try{rows=await query(`/nodes/${encodeURIComponent(guest.node)}/storage/${encodeURIComponent(pool)}/content?content=images`,{timeoutMs:5000});}catch{/* Keep the known attachment even when size cannot be read. */}
   pools.set(pool,Array.isArray(rows)?rows:[]);
  }
  const row=pools.get(pool).find(r=>r.volid===disk.resourceId&&r.content==='images');
  if(Number.isSafeInteger(row?.size)&&row.size>0)disk.size=row.size;
 }
 return disks;
}
