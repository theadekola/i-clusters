export function backupTargets(resources:any[],node:string){return resources.filter(r=>r.node===node&&r.status==='online'&&String(r.content||'').split(',').includes('backup'));}
export function guestTargets(guests:any[],node:string){return guests.filter(g=>g.node===node);}
export function restoreLocation(archiveId:string){return `/restore?archive=${encodeURIComponent(archiveId)}`;}

// Storage names alone never prove that archives on different nodes are shared.
export function distinctBackupPoints(points:any[],preferredId=''){
 const groups=new Map<string,any>();
 for(const point of points){const key=JSON.stringify([point.shared===true?'shared':'local',point.shared===true?'':point.node,point.storage,point.volid||point.id]);if(!groups.has(key)||point.id===preferredId)groups.set(key,point);}
 return Array.from(groups.values());
}

export function backupArchivesLocation(storage?:string,node?:string){const params=new URLSearchParams({tab:'Backup Archives'});if(storage)params.set('storage',storage);if(node)params.set('node',node);return '/backups?'+params;}

export function archiveScopeComplete(data:any,node:string){
 const coverage=data?.archiveInventory;
 if(!coverage)return !!data&&!data.errors?.length;
 if(!coverage.configured)return false;
 if(node&&Array.isArray(coverage.completeNodes))return coverage.completeNodes.includes(node);
 return coverage.complete===true;
}

export function jobNodes(job:any):string[]{
 return String(job.node??'').split(/[,\s]+/).filter(Boolean);
}

export function jobIncludesNode(job:any,node:string){
 const nodes=jobNodes(job);
 return !node||node==='all'||!nodes.length||nodes.includes(node);
}

export function nextTime(job:any):number|null{
 const raw=job['next-run']??job.next_run;
 if(typeof raw!=='number'&&typeof raw!=='string')return null;
 const value=typeof raw==='string'?raw.trim():raw;
 const millis=typeof value==='number'||/^\d+(\.\d+)?$/.test(value)?Number(value)*1000:Date.parse(value);
 return millis>0&&Number.isFinite(new Date(millis).getTime())?millis:null;
}

const scheduleDate=new Intl.DateTimeFormat(undefined,{
 year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'
});
export function formatNextRun(millis:number){return scheduleDate.format(millis)}

export function backupPolicyIncludesNode(row:any,node:string){
 if(node==='all')return true;
 return row.provider==='truenas'?row.node===node:jobIncludesNode(row,node);
}

export function backupNodeLabel(row:any){
 return row.node||(row.provider==='proxmox'?'All Nodes':'Not reported');
}
