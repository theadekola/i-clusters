import test from 'node:test';
import assert from 'node:assert/strict';
import {retentionCleanup} from '../src/retention-cleanup.js';

function fixture(){
 const service=retentionCleanup(),writes=[],reads=[];
 const job={id:'nightly',storage:'nas',node:'node02',vmid:'200,201,202',exclude:'202'};
 const input={jobId:job.id,node:job.node,storage:job.storage,rule:'keep-last=7',vmid:'200,201'};
 const provider=async(path,init)=>{
  if(path==='/cluster/backup/nightly')return job;
  const id=new URL(path,'https://provider.invalid').searchParams.get('vmid');
  assert.ok(id,'cleanup requires a guest ID in every provider request');
  if(init?.method==='DELETE'){writes.push(id);return 'task-'+id}
  reads.push(id);
  return [{vmid:Number(id),volid:'nas:backup/'+id,mark:'remove'}];
 };
 const preview=params=>service.preview(params,'admin','cluster',provider);
 const run=params=>service.run(params,'admin','cluster',provider);
 return {input,job,writes,reads,preview,run};
}

test('cleanup preserves included and excluded IDs and consumes the reviewed preview once',async()=>{
 const f=fixture();
 for(const vmid of ['', '202','200,999'])await assert.rejects(f.preview({...f.input,vmid}));
 assert.deepEqual(f.reads,[]);
 const result=await f.preview(f.input);
 assert.deepEqual(result.scope.included,[200,201]);
 assert.deepEqual(result.scope.excluded,[202]);
 assert.deepEqual(f.reads,['200','201']);
 assert.deepEqual(f.writes,[]);
 const submission={...f.input,previewToken:result.previewToken};
 assert.deepEqual((await f.run(submission)).tasks.map(row=>row.vmid),[200,201]);
 await assert.rejects(f.run(submission));
 assert.deepEqual(f.writes,['200','201']);
});

test('a changed selection or changed provider job requires another preview',async()=>{
 const f=fixture();
 const first=await f.preview(f.input);
 await assert.rejects(f.run({...f.input,vmid:'201',previewToken:first.previewToken}));
 const second=await f.preview(f.input);
 f.job.exclude='201,202';
 await assert.rejects(f.run({...f.input,previewToken:second.previewToken}));
 assert.deepEqual(f.writes,[]);
});
