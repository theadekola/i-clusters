export function topologyGuestName(guest:any){const name=String(guest.name||'').trim();return name&&name!==String(guest.id)?name:guest.kind==='lxc'?'Unnamed container':'Unnamed virtual machine';}
export function topologyPercent(value:any){return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100?`${value.toFixed(0)}%`:'Unavailable';}
export function topologyState(resource:any,parent?:string){if(parent&&parent!=='online'||resource.nodeAvailable===false)return 'unknown';if(['online','running'].includes(resource.status))return resource.status;if(['offline','stopped','paused','suspended'].includes(resource.status))return resource.status;return 'unknown';}
export function clusterTopology(data:any,search=''){
 const nodes=new Map<string,any>(),guests=new Map<string,any>();
 const members=data?.nodeInventory?.complete===true&&Array.isArray(data.nodeInventory.members)?new Set<string>(data.nodeInventory.members):null;
 for(const node of data?.nodes||[]){const name=node.name||node.node;if(name&&(!members||members.has(name))){const coverage=data?.nodeCoverage?.find((r:any)=>r.node===name),verified=node.status==='online'&&(!Array.isArray(data?.nodeCoverage)||coverage?.readings?.includes('status'));nodes.set(name,{...node,name,status:node.status==='online'&&!verified?'unknown':node.status,reportedStatus:node.status,connectionReason:verified?'Current Proxmox node status was read successfully.':node.status==='offline'?'Proxmox reports this node offline.':'A current Proxmox node status could not be verified. The server may still be reachable directly; check cluster communication and API permissions.',kind:'node',guests:[]});}}
 for(const [kind,rows] of [['qemu',data?.vms||[]],['lxc',data?.lxc||[]]] as const){for(const row of rows){if(!row.node||row.id==null||members&&!members.has(row.node))continue;const key=`${row.node}:${kind}:${row.id}`;guests.set(key,{...row,status:row.status==='running'&&['paused','suspended'].includes(row.powerStatus)?row.powerStatus:row.status,kind,key});if(!nodes.has(row.node))nodes.set(row.node,{name:row.node,kind:'node',status:'unknown',connectionReason:'Only guest inventory references this node. Its Proxmox connection is unconfirmed; this does not establish that the server is powered off.',guests:[]});}}
 for(const guest of guests.values())nodes.get(guest.node).guests.push(guest);
 const query=search.trim().toLowerCase();
 const matches=(r:any)=>`${r.name} ${r.id??''} ${r.kind==='lxc'?'ct container':r.kind==='qemu'?'vm virtual machine':'node'} ${r.ip||''} ${(r.addresses||[]).join(' ')}`.toLowerCase().includes(query);
 const result=[...nodes.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(node=>({...node,guests:node.guests.filter((g:any)=>!query||matches(node)||matches(g)).sort((a:any,b:any)=>String(a.id).localeCompare(String(b.id),undefined,{numeric:true}))})).filter(node=>!query||matches(node)||node.guests.length);
 return {name:data?.clusterStatus?.find((r:any)=>r.type==='cluster')?.name||'Connected infrastructure',nodes:result};
}

export function topologyGuestAddress(guest:any,parent?:string){
 if(topologyState(guest,parent)!=='running')return 'IP unavailable';
 const addresses=(guest.addresses||[]).filter((v:any)=>typeof v==='string'&&/^(?:\d{1,3}\.){3}\d{1,3}$/.test(v)&&v.split('.').every((p:string)=>Number(p)<=255));
 return [...new Set(addresses)].join(' · ')||'IP unavailable';
}
// One storage entry per server and pool, with links only from current guest
// configuration. Orphan volumes, bind mounts and inferred IP subnets add no links.
export function topologyStorage(nodes:any[],pools:any[],connections:any[]){
 return nodes.map(node=>{
  const rows=new Map<string,any>();
  for(const pool of pools||[])if(pool.node===node.name&&(pool.name||pool.storage)){
   const name=pool.name||pool.storage;rows.set(name,{name,status:pool.status||'unknown',guests:[]});
  }
  for(const guest of node.guests){
   const config=connections.find(c=>c.key===guest.key);if(!config)continue;
   for(const name of config.storage||[]){
    if(!rows.has(name))rows.set(name,{name,status:'unknown',guests:[]});
    rows.get(name).guests.push(guest.key);
   }
  }
  return {node:node.name,pools:[...rows.values()].sort((a,b)=>a.name.localeCompare(b.name))};
 });
}
