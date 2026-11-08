import {randomUUID,createHash} from 'node:crypto';
import {encode,httpError,integer,required,retention} from './infrastructure.js';

function guestIds(value){
 const parts=String(value??'').trim().split(/[,;\s]+/).filter(Boolean);
 if(parts.some(id=>!/^\d+$/.test(id)))throw httpError('Enter guest IDs separated by commas.');
 return [...new Set(parts.map(id=>integer(id,'Guest ID',100)))].sort((a,b)=>a-b);
}

async function resolve(input,read){
 const node=required(input.node,'Node'),storage=required(input.storage,'Backup storage');
 const rule=retention(input.rule),jobId=required(input.jobId,'Backup job');
 const job=await read('/cluster/backup/'+encode(jobId));
 const nodes=String(job.node??'').split(/[,\s]+/).filter(Boolean);
 if((nodes.length&&!nodes.includes(node))||(job.storage&&storage!==job.storage))
  throw httpError('The node or storage is outside the backup job scope.',409);
 const included=guestIds(job.vmid),excluded=guestIds(job.exclude),requested=guestIds(input.vmid);
 if(!requested.length)throw httpError('Select at least one guest before previewing cleanup.');
 if(requested.some(id=>excluded.includes(id)||(included.length&&!included.includes(id))))
  throw httpError('The selection contains a guest outside the backup job scope.',409);
 if(!included.length||job.pool){
  const guests=await read('/cluster/resources?type=vm');
  const eligible=new Set(guests.filter(g=>g.node===node&&['qemu','lxc'].includes(g.type)).map(g=>Number(g.vmid)));
  if(requested.some(id=>!eligible.has(id)))throw httpError('Guest membership on this node could not be confirmed.',409);
  if(job.pool){
   const pool=await read('/pools/'+encode(job.pool));
   const members=new Set((pool.members||[]).filter(g=>['qemu','lxc'].includes(g.type)).map(g=>Number(g.vmid)));
   if(requested.some(id=>!members.has(id)))throw httpError('Guest membership in this pool could not be confirmed.',409);
  }
 }
 return {jobId,node,storage,rule,included:requested,excluded};
}

function pathFor(scope,id){
 return '/nodes/'+encode(scope.node)+'/storage/'+encode(scope.storage)+'/prunebackups?'+
  new URLSearchParams({'prune-backups':scope.rule,vmid:String(id)});
}

async function inspect(scope,read){
 const items=[];
 for(const id of scope.included){
  const rows=await read(pathFor(scope,id));
  if(!Array.isArray(rows))throw httpError('Unexpected archive preview response.',502);
  for(const row of rows){
   if(!row?.volid||Number(row.vmid)!==id)throw httpError('Unexpected archive preview response.',502);
   const keep=row.mark==='remove'?false:['keep','protected','renamed'].includes(row.mark)?true:null;
   if(keep===null)throw httpError('Unexpected archive preview response.',502);
   items.push({...row,vmid:id,keep});
  }
 }
 return items;
}

function fingerprint(scope,items){
 const decisions=items.map(r=>JSON.stringify([r.vmid,r.volid,r.mark])).sort();
 return createHash('sha256').update(JSON.stringify([scope,decisions])).digest('hex');
}

export function retentionCleanup(){
 const previews=new Map();
 return {
  async preview(input,owner,connection,read){
   const scope=await resolve(input,read),items=await inspect(scope,read);
   const token=randomUUID();
   for(const [key,value] of previews)if(value.expires<=Date.now()||value.owner===owner)previews.delete(key);
   previews.set(token,{owner,connection,scope,hash:fingerprint(scope,items),expires:Date.now()+10*60*1000});
   return {scope,items,previewToken:token};
  },
  async run(input,owner,connection,read){
   const record=previews.get(input.previewToken);
   const stale=()=>httpError('The cleanup preview has changed or expired. Preview again.',409);
   if(!record||record.owner!==owner||record.connection!==connection||record.expires<=Date.now())throw stale();
   previews.delete(input.previewToken);
   const scope=await resolve(input,read);
   if(JSON.stringify(scope)!==JSON.stringify(record.scope))throw stale();
   const items=await inspect(scope,read);
   if(record.hash!==fingerprint(scope,items)||record.expires<=Date.now())throw stale();
   const tasks=[];
   for(const id of new Set(items.filter(r=>!r.keep).map(r=>r.vmid))){
    try{tasks.push({vmid:id,task:await read(pathFor(scope,id),{method:'DELETE'})})}
    catch(error){
     const submitted=tasks.map(t=>t.vmid+' / '+t.task).join(', ');
     throw httpError(['Guest ID',id,error.message,submitted&&'Submitted tasks',submitted].filter(Boolean).join(' · '),502);
    }
   }
   return {node:scope.node,tasks,task:tasks.map(t=>t.task).join(', ')};
  }
 };
}
