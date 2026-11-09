const titles={
 VM:{stopped:'VM stopped',offline:'VM offline',paused:'VM paused',suspended:'VM suspended','host offline':'VM unreachable: host offline'},
 CT:{stopped:'CT stopped',offline:'CT offline',paused:'CT paused',suspended:'CT suspended','host offline':'CT unreachable: host offline'}
};

// Use the cluster-wide guest ID so a migration keeps the same incident.
export function guestAvailability(proxmox){
 const observations=new Map(),conditions=[];
 if(!proxmox?.guestAlertScope)return {observations,conditions};
 const nodes=new Map((proxmox.nodes||[]).map(node=>[node.name,node.status]));
 const coverage=new Map((proxmox.nodeCoverage||[]).map(row=>[row.node,row.readings]));
 for(const [kind,rows,type] of [['VM',proxmox.vms,'qemu'],['CT',proxmox.lxc,'lxc']]){
  for(const guest of rows||[]){
   if(!/^\d+$/.test(guest.id)||!guest.node)continue;
   const key=`guest-availability:${proxmox.guestAlertScope}:${type}:${guest.id}`;
   if(observations.has(key)){observations.set(key,null);continue}
   const host=nodes.get(guest.node);
   const hostOffline=host==='offline'&&proxmox.nodeInventory?.complete===true;
   const verified=host==='online'&&coverage.get(guest.node)?.includes(type);
   let status=hostOffline?'host offline':verified?guest.powerStatus||guest.status:'unknown';
   if(guest.template)status='template';
   const source=`${kind} ${guest.id} (${guest.name||guest.id}) on ${guest.node}`;
   observations.set(key,{status,kind,source,node:guest.node,id:guest.id});
  }
 }
 for(const [key,observed] of observations){
  if(!observed||!Object.hasOwn(titles[observed.kind],observed.status))continue;
  const {status,kind,source,node,id}=observed,hostOffline=status==='host offline';
  conditions.push({key,guestScope:proxmox.guestAlertScope,guestType:kind==='VM'?'qemu':'lxc',resourceId:id,node,provider:'proxmox',source,
   title:titles[kind][status],
   severity:['stopped','offline','host offline'].includes(status)?'critical':'warning',
   details:hostOffline?`Proxmox reports host ${node} offline. The power state of ${source} cannot be verified.`:`Proxmox reports ${source} is ${status}.`});
 }
 return {observations,conditions};
}

export function reconcileGuestAlert(alert,snapshot,observations){
 const pve=snapshot.proxmox,observed=observations.get(alert.key);
 if(observed?.status==='running'){
  Object.assign(alert,{status:'resolved',resolvedAt:snapshot.sampledAt,source:observed.source,node:observed.node});
  return;
 }
 // Removal or loss of visibility is distinct from a verified return to service.
 const disconnected=snapshot.services.some(s=>s.id==='proxmox'&&s.status==='not-configured');
 const switched=pve?.guestAlertScope&&pve.guestAlertScope!==alert.guestScope;
 const inventoryRead=pve?.resourceInventoryComplete&&pve.nodeInventory?.complete&&pve.nodes?.length>0&&
   pve.nodes.every(n=>n.status==='online'&&pve.nodeCoverage?.some(row=>row.node===n.name&&row.readings.includes(alert.guestType)));
 if(disconnected||switched||observed?.status==='template'||(inventoryRead&&!observations.has(alert.key))){
  Object.assign(alert,{status:'resolved',resolvedAt:snapshot.sampledAt,resolution:'no-longer-monitored',details:'This guest is no longer monitored in this inventory.'});
 }
}
