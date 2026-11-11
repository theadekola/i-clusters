import {createHash} from 'node:crypto';
import {clusterConfig} from './cluster-config.js';
import {pve} from './connectors.js';
import {assertGuestPlacement} from './ssh-target.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (message,status=409) => Object.assign(Error(message),{status});
const terminal = ['complete','failed','reviewed'];
const publicRow = ({owner_id,cluster,revision,...row}) => row;
const clusterId = config => createHash('sha256').update(String(config.url||'').replace(/\/$/,'')).digest('hex');
const bootGrace = 30000;

export function createGuestRestarts(db,{config=clusterConfig,request=pve,now=Date.now}={}) {
  async function get(owner,scope,id) {
    if(!uuid.test(id)) throw fail('Invalid restart identifier.',400);
    const {rows} = await db.query('SELECT * FROM guest_restarts WHERE id=$1 AND owner_id=$2 AND cluster=$3',[id,owner,scope]);
    if(!rows.length) throw fail('Restart record not found.',404);
    return rows[0];
  }

  // Each observation applies only to the attempt it read. A slow poll from
  // another tab cannot overwrite a newer receipt or a recovery submission.
  async function observe(row,phase,power,detail='',stoppedSince=null) {
    if(row.phase===phase && row.power===power && row.detail===detail && Number(row.stopped_since)===Number(stoppedSince)) return row;
    const {rows} = await db.query(`UPDATE guest_restarts SET phase=$3,power=$4,detail=$5,stopped_since=$6,revision=revision+1,updated_at=NOW()
      WHERE id=$1 AND revision=$2 RETURNING *`,[row.id,row.revision,phase,power,detail,stoppedSince]);
    return rows[0] || get(row.owner_id,row.cluster,row.id);
  }

  async function idle(node,id,read) {
    const path='/nodes/'+node;
    const permissions=await read('/access/permissions?'+new URLSearchParams({path}));
    if(![true,false,0,1].includes(permissions?.[path]?.['Sys.Audit'])) throw fail('Node task visibility is required to confirm that startup is safe.',403);
    const tasks=await read(path+'/tasks?'+new URLSearchParams({source:'active',vmid:id,limit:'500'}));
    if(!Array.isArray(tasks)||tasks.length>=500) throw fail('Active guest tasks could not be verified.');
    return tasks.every(t=>String(t?.id)===id && Number(t.endtime)>0 && t.status && t.status!=='RUNNING');
  }

  function target(row,c) {
    const read=(path,init)=>request(path,init,c);
    const base='/nodes/'+row.node+'/'+(row.kind==='vm'?'qemu':'lxc')+'/'+row.guest;
    const power=async()=>{
      const s=await read(base+'/status/current');
      return s?.status==='running' ? s.qmpstatus||'running' : s?.status||'unknown';
    };
    return {read,base,power};
  }

  async function inspect(row,c) {
    if(terminal.includes(row.phase)) return row;
    if(!row.task) return row.phase==='submitting' && now()-Number(row.attempt_at)>120000
      ? observe(row,'unknown',row.power) : row;
    const {read,base,power}=target(row,c);
    const task=await read('/nodes/'+row.node+'/tasks/'+encodeURIComponent(row.task)+'/status');
    const state=await power();
    if(task?.status==='running') return observe(row,'monitoring',state);
    if(task?.status!=='stopped'||!task.exitstatus) throw fail('Proxmox has not reported a final task result.',502);
    const error=task.exitstatus==='OK'?'':String(task.exitstatus).slice(0,1000);
    if(state==='stopped') {
      const since=row.stopped_since||new Date(now());
      if(now()-Number(since)>=bootGrace && await idle(row.node,row.guest,read))
        return observe(row,'recoverable',state,error,since);
      return observe(row,'booting',state,error,since);
    }
    if(error) return observe(row,'failed',state,error);
    if(state!=='running') return observe(row,'booting',state);
    if(row.kind==='vm'&&row.reason==='setup') {
      // Record the confirmed running state even when the agent is still booting.
      row=await observe(row,'verifying',state);
      if(row.phase!=='verifying') return row;
      const os=await read(base+'/agent/get-osinfo',{timeoutMs:4000});
      const info=os && Object.hasOwn(os,'result')?os.result:os;
      if(!info||typeof info!=='object'||Array.isArray(info)||!Object.keys(info).length) return row;
    }
    return observe(row,'complete',state);
  }

  async function status(owner,id) {
    const c=config(),row=await get(owner,clusterId(c),id);
    try{return publicRow(await inspect(row,c))}
    catch(error){return {...publicRow(await get(owner,row.cluster,id)),readError:error.message}}
  }

  async function list(owner) {
    const scope=clusterId(config());
    const {rows}=await db.query(`SELECT * FROM guest_restarts WHERE owner_id=$1 AND cluster=$2 AND dismissed=FALSE
      AND (phase NOT IN ('complete','failed','reviewed') OR id IN (
        SELECT id FROM guest_restarts WHERE owner_id=$1 AND cluster=$2 AND NOT dismissed
        AND phase IN ('complete','failed','reviewed') ORDER BY started_at DESC LIMIT 10))
      ORDER BY started_at DESC`,[owner,scope]);
    return {cluster:scope,restarts:rows.map(publicRow)};
  }

  async function history(owner,id,hours) {
    const c=config(),row=await get(owner,clusterId(c),id);
    const limitHours=Number(hours||24);
    if(!Number.isInteger(limitHours)||limitHours<1||limitHours>720)throw fail('Invalid task history range.',400);
    const since=String(Math.floor(now()/1000-limitHours*3600));
    const report={restart:publicRow(row),nodes:[{node:row.node}],sampledAt:new Date(now()).toISOString()};
    try {
      const rows=await target(row,c).read('/nodes/'+row.node+'/tasks?'+new URLSearchParams({source:'all',vmid:row.guest,since,limit:'500'}));
      if(!Array.isArray(rows))throw fail('Guest task history is unavailable.',502);
      const tasks=rows.filter(t=>t.node===row.node&&String(t.id)===row.guest);
      return {...report,tasks,errors:[],truncated:rows.length===500?[row.node]:[],coverage:{complete:rows.length<500}};
    } catch(error) {
      return {...report,tasks:[],errors:[error.message],truncated:[],coverage:{complete:false}};
    }
  }

  async function submit(owner,kind,guest,operation,body) {
    const c=config(),scope=clusterId(c),m=body.maintenance;
    const node=body.node,id=m?.id;
    if(!uuid.test(id)||!['vm','lxc'].includes(kind)||!/^\d+$/.test(guest)||!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(node)
      ||!['start','reboot'].includes(operation)||!['update','setup'].includes(m.reason)||typeof m.name!=='string'||m.name.length>255)
      throw fail('Invalid maintenance restart request.',400);
    if(m.cluster!==scope) throw fail('The Proxmox connection changed. Reopen the restart dialog.');
    const {read,base,power}=target({node,kind,guest},c);
    let row=(await db.query('SELECT * FROM guest_restarts WHERE id=$1',[id])).rows[0];
    if(row && (row.cluster!==scope||row.owner_id!==owner||row.node!==node||row.kind!==kind||row.guest!==guest||row.reason!==m.reason))
      throw fail('Restart identifier belongs to a different request.');
    if(row && m.previousTask===undefined) return publicRow(row);
    if(m.previousTask!==undefined) {
      if(operation!=='start'||!row||typeof m.previousTask!=='string'||!m.previousTask) throw fail('Invalid startup recovery request.',400);
      if(row.task!==m.previousTask) return publicRow(row);
      row=await inspect(row,c);
      if(row.phase!=='recoverable'||row.task!==m.previousTask) throw fail('Startup is not available. Recheck the guest and its tasks.');
    } else {
      const earlier=(await db.query("SELECT * FROM guest_restarts WHERE cluster=$1 AND guest=$2 AND phase NOT IN ('complete','failed','reviewed')",[scope,guest])).rows[0];
      if(earlier && !terminal.includes((await inspect(earlier,c)).phase)) throw fail('A restart is already tracked for this guest. Review it before submitting another.');
    }
    await assertGuestPlacement(node,guest,kind==='vm'?'qemu':'lxc',read);
    if(m.previousTask && !await idle(node,guest,read)) throw fail('Another guest task is active. Recheck before starting.');
    const expected=operation==='start'?'stopped':'running';
    if(await power()!==expected) throw fail('The guest power state changed. Recheck before continuing.');
    // Persist the claim before dispatch. The unique index arbitrates submissions
    // across users and workers. Recovery can claim the previous UPID only once.
    const claim=m.previousTask
      ? await db.query(`UPDATE guest_restarts SET task=NULL,phase='submitting',operation='start',attempt_at=NOW(),updated_at=NOW(),detail='',stopped_since=NULL,revision=revision+1
          WHERE id=$1 AND revision=$2 AND task=$3 AND phase='recoverable' RETURNING *`,[id,row.revision,m.previousTask])
      : await db.query(`INSERT INTO guest_restarts (id,owner_id,cluster,node,kind,guest,name,reason,operation,power)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING RETURNING *`,[id,owner,scope,node,kind,guest,m.name,m.reason,operation,expected]);
    if(!claim.rowCount) throw fail('The restart changed in another session. Check its progress.');
    let task;
    try{
      task=await read(base+'/status/'+operation,{method:'POST'});
      if(typeof task!=='string'||!task) throw Error('Proxmox did not return a task ID.');
    }catch(error){
      return publicRow(await observe(claim.rows[0],'unknown',expected,String(error.message).slice(0,1000)));
    }
    const saved=await db.query("UPDATE guest_restarts SET task=$2,phase='monitoring',revision=revision+1,updated_at=NOW() WHERE id=$1 AND phase IN ('submitting','unknown') AND task IS NULL RETURNING *",[id,task]);
    return publicRow(saved.rows[0]||await get(owner,scope,id));
  }

  async function dismiss(owner,id) {
    const c=config(),row=await get(owner,clusterId(c),id);
    if(row.phase==='unknown') {
      // The caller explicitly reviewed history. Release this record only after
      // verifying that the node has no active task for the guest.
      if(!await idle(row.node,row.guest,target(row,c).read)) throw fail('Another guest task is active. Recheck before continuing.');
    } else if(!terminal.includes(row.phase)&&!['verifying','recoverable'].includes(row.phase)) throw fail('This restart is still active.');
    const result=await db.query("UPDATE guest_restarts SET dismissed=TRUE,phase=CASE WHEN phase IN ('unknown','verifying','recoverable') THEN 'reviewed' ELSE phase END, revision=revision+1 WHERE id=$1 AND revision=$2",[id,row.revision]);
    if(!result.rowCount)throw fail('The restart changed in another session. Check its progress.');
    return {ok:true};
  }
  return {list,status,submit,dismiss,history};
}
