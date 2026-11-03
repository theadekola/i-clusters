// Proxmox config sizes use binary units; never infer allocation from guest usage.
export function configuredVolumeSize(value){
 const match=String(value||'').match(/(?:^|,)size=(\d+(?:\.\d+)?)([KMGTPE]?)(?:i?B)?(?:,|$)/i);
 if(!match)return null;
 const bytes=Number(match[1])*1024**('KMGTPE'.indexOf(match[2].toUpperCase())+1);
 return Number.isSafeInteger(bytes)&&bytes>0?bytes:null;
}
export function containerVolumes(config){
 return Object.entries(config||{}).filter(([key,value])=>/^(rootfs|mp\d+)$/.test(key)&&typeof value==='string').map(([disk,value])=>({disk,resourceId:value.split(',')[0].replace(/^volume=/,''),size:configuredVolumeSize(value),mountpoint:disk==='rootfs'?'/':value.match(/(?:^|,)mp=([^,]+)/)?.[1]||null}));
}
