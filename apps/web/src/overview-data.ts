import {archiveScopeComplete,distinctBackupPoints} from './backup-selection';
const measured=(rows:any[],key:string)=>{const values=rows.map(r=>r[key]).filter(v=>typeof v==='number'&&Number.isFinite(v));return values.length?values.reduce((sum,v)=>sum+v,0)/values.length:null;};
export function overviewData(data:any,backup:any,node:string,search:string){
 const nodes=(data.nodes||[]).filter((n:any)=>!node||n.name===node);
 const guests=(data.guests||[]).filter((g:any)=>!node||g.node===node);
 const storage=(data.storage||[]).filter((s:any)=>!node||s.node===node);
 const inventory=(data.resources||[]).filter((r:any)=>!node||r.host===node||r.node===node);
 const resources=inventory.filter((r:any)=>(r.name+' '+r.host+' '+r.kind).toLowerCase().includes(search.toLowerCase()));
 const belongs=(a:any)=>a.node===node||a.source===node||[...(data.storage||[]),...(data.nodes||[]),...(data.guests||[]),...(data.resources||[])].some((r:any)=>String(r.id)===String(a.resourceId)&&(r.node===node||r.name===node||r.host===node));
 const alerts=(data.alerts||[]).filter((a:any)=>a.status!=='resolved'&&(!node||belongs(a)));
 const reporting=nodes.filter((n:any)=>n.status==='online');
 const proxmox=(data.services||[]).find((s:any)=>s.provider==='proxmox'||s.name==='proxmox');
 const inventoryKnown=data.resourceInventoryComplete===true||proxmox?.status==='reachable';
 const dockerRows=inventory.filter((r:any)=>r.kind==='Docker container'&&r.status!=='stale');
 const rowHosts=new Set(dockerRows.map((r:any)=>r.hostId).filter(Boolean));
 const engines=(data.services||[]).filter((s:any)=>(s.provider==='docker'||s.name==='docker')&&s.status!=='not-configured');
 const scopedEngines=engines.filter((s:any)=>!node||s.node===node||rowHosts.has(s.hostId||'direct'));
 const dockerKnown=scopedEngines.length>0&&scopedEngines.every((s:any)=>s.status==='reachable');
 const hostIds=new Set<string|null>(scopedEngines.map((s:any)=>s.hostId||(s.id==='docker'||s.name==='docker'?'direct':null)));
 for(const row of dockerRows)hostIds.add(row.hostId||null);
 // A directly connected Engine can also be paired through Proxmox. Discovery
 // deduplicates its rows globally, so use the paired inventory for that node.
 const singleEngine=node&&scopedEngines.length===1?scopedEngines[0]:null;
 const dockerCount=singleEngine?.containerCount??dockerRows.length;
 const dockerRunning=singleEngine?.runningCount??dockerRows.filter((r:any)=>r.status==='running').length;
 const dockerHost=hostIds.size===1?[...hostIds][0]:null;

 const backupErrors=backup?.errors||[];
 const backupKnown=archiveScopeComplete(backup,node);
 const backupIssue=backup?.archiveInventory?.issues?.find((issue:any)=>issue.code==='storage-unavailable'&&(!node||issue.node===node));
 const backupOtherErrors=backupErrors.filter((message:string)=>!(backup?.archiveInventory?.issues||[]).some((issue:any)=>issue.message===message));
 const backupProblems=Array.from(new Set<string>((backup?.archiveInventory?.issues||[]).map((issue:any)=>issue.node).filter((name:any)=>typeof name==='string'&&name&&(!node||name===node)))).sort().map(name=>({node:name,issues:backup.archiveInventory.issues.filter((issue:any)=>issue.node===name)}));
 const jobsKnown=!!backup&&(backup.providerInventory?.jobs?backup.providerInventory.jobs.configured===true&&backup.providerInventory.jobs.complete===true:!backupErrors.length);
 const backupDetail=!backup?'Not measured':backup.archiveInventory?.configured===false?'Connect Proxmox to discover archives':backupIssue?`${backupIssue.node}/${backupIssue.storage} unavailable`:!backupKnown?'Inventory incomplete or unavailable':backup.archiveInventory?.visibleStorage===0?'No Proxmox backup storage visible':'Proxmox backup archives';
 const points=distinctBackupPoints((backup?.points||[]).filter((p:any)=>!node||p.node===node));
 const backupCount=backupKnown||points.length>0?points.length:null;
 const jobs=(backup?.jobs||[]).filter((j:any)=>!node||!j.node||j.node===node);
 return {nodes,guests,storage,inventory,resources,alerts,cpu:measured(reporting,'cpu'),memory:measured(reporting,'memoryPercent'),disk:measured(storage.filter((s:any)=>s.status==='online'),'usage'),inventoryKnown,dockerKnown,dockerCount,dockerRunning,dockerHost,points,jobs,backupErrors,backupKnown,backupDetail,backupCount,backupIssue,backupProblems,backupOtherErrors,jobsKnown};
}
