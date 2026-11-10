// Read only the guest configuration needed by the topology. Never expose full
// configs, which can include cloud-init credentials and other private settings.
export function guestTopologyConnections(config){
 const storage=new Set(),vlans=new Set();let networks=0;
 for(const [key,value] of Object.entries(config)){
  if(typeof value!=='string')continue;
  if(/^(?:scsi|sata|ide|virtio|efidisk|tpmstate|unused)\d+$/.test(key)||/^(?:rootfs|mp\d+)$/.test(key)){
   if(key.startsWith('unused')||/(?:^|,)media=cdrom(?:,|$)/.test(value))continue;
   const volume=value.split(',')[0].replace(/^(?:file|volume)=/,'');
   const match=/^([A-Za-z][A-Za-z0-9_-]*):/.exec(volume);if(match)storage.add(match[1]);
  }
  if(/^net\d+$/.test(key)){
   networks++;const fields=Object.fromEntries(value.split(',').map(field=>field.split('=')));
   if(fields.tag&&/^\d+$/.test(fields.tag)&&Number(fields.tag)>=1&&Number(fields.tag)<=4094)vlans.add(Number(fields.tag));
   for(const tag of (fields.trunks||'').split(';'))if(/^\d+$/.test(tag)&&Number(tag)>=1&&Number(tag)<=4094)vlans.add(Number(tag));
  }
 }
 return {storage:[...storage].sort(),vlans:[...vlans].sort((a,b)=>a-b),networks};
}
export async function topologyConnections(snapshot,query){
 const guests=[],errors=[],nodes=new Set((snapshot.nodes||[]).filter(n=>n.status==='online').map(n=>n.name));
 const rows=[...(snapshot.vms||[]).map(g=>({...g,kind:'qemu'})),...(snapshot.lxc||[]).map(g=>({...g,kind:'lxc'}))].filter(g=>nodes.has(g.node)&&g.nodeAvailable!==false&&/^\d+$/.test(String(g.id)));
 for(let i=0;i<rows.length;i+=5)await Promise.all(rows.slice(i,i+5).map(async guest=>{
  const key=`${guest.node}:${guest.kind}:${guest.id}`;
  try{
   const config=await query(`/nodes/${encodeURIComponent(guest.node)}/${guest.kind}/${guest.id}/config`);
   if(!config||typeof config!=='object'||Array.isArray(config))throw Error('Guest configuration unavailable');
   guests.push({key,...guestTopologyConnections(config)});
  }catch(e){errors.push(`${guest.node}/${guest.kind}/${guest.id}: ${e.message}`);}
 }));
 return {guests,errors,sampledAt:new Date().toISOString()};
}
