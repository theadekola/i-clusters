import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuestStorage} from '../src/guest-storage.js';
import {approvalTargetForPath,resolveActionApproval} from '../src/action-approval.js';
const model={provider:'proxmox',type:'VM Volume',resourceId:'local:vm-100-disk-0',node:'one',vmid:'100',disk:'scsi0',digest:'a'.repeat(40),revision:'revision',size:120*1024**3};
function fixture(){
 const calls=[],config={digest:model.digest,scsi0:model.resourceId},plan={supported:true,token:'a'.repeat(64),diskBytes:model.size},state={output:plan,status:'running'};
 const service=createGuestStorage({editor:{inspect:async()=>model},wait:async()=>{},query:async(path,options)=>{
  calls.push({path,options});if(path.endsWith('/config'))return config;if(path.endsWith('/status/current'))return {status:state.status};
  if(path.endsWith('/agent/exec'))return {pid:123};if(path.includes('exec-status'))return {exited:true,exitcode:0,'out-data':JSON.stringify(state.output)};throw Error(path);
 }});return {calls,config,service,state,plan};
}
test('guest inspection runs only the fixed read script on the selected single-disk running VM',async()=>{
 const f=fixture(),r=await f.service.inspect(model);assert.equal(r.plan.token,f.plan.token);
 const execution=f.calls.find(c=>c.path.endsWith('/agent/exec'));const {command}=JSON.parse(execution.options.body);
 assert.deepEqual(command.slice(0,2),['/usr/bin/python3','-c']);assert.equal(command[3],'inspect');assert.equal(command.length,4);
});
test('guest expansion binds the checked resource revision and guest layout token',async()=>{
 const f=fixture();f.state.output={verified:true,changed:true};
 const r=await f.service.expand({...model,guestToken:f.plan.token});assert.equal(r.verified,true);
 const {command}=JSON.parse(f.calls.find(c=>c.options).options.body);assert.equal(command[3],'expand');assert.equal(command[4],f.plan.token);
});
test('multi-disk, stale, stopped and changed controller checks never start guest commands',async()=>{
 for(const mutate of [f=>f.config.scsi1='local:other',f=>f.config.digest='other',f=>f.state.status='stopped']){
  const f=fixture();mutate(f);await assert.rejects(f.service.inspect(model));assert.equal(f.calls.some(c=>c.options),false);
 }
 const f=fixture();await assert.rejects(f.service.expand({...model,revision:'old',guestToken:f.plan.token}));assert.equal(f.calls.some(c=>c.options),false);
 await assert.rejects(f.service.inspect(model,()=>{throw Error('connection changed')}));assert.equal(f.calls.some(c=>c.options),false);
});
test('guest errors, undetected virtual disk changes and unverified expansion never report success',async()=>{
 for(const output of [{error:'Encrypted layout unsupported'},{...fixture().plan,diskBytes:10}]){const f=fixture();f.state.output=output;await assert.rejects(f.service.inspect(model));}
 const f=fixture();f.state.output={accepted:true};await assert.rejects(f.service.expand({...model,guestToken:f.plan.token}),/not verified/);
});
test('guest expansion requires node password approval and invalid targets fail closed',async()=>{
 assert.equal(approvalTargetForPath('/storage/datasets/guest-expand',model,'PUT'),'node:one');
 await assert.rejects(resolveActionApproval('/storage/datasets/guest-expand',{...model,node:'../other'},'PUT'),/Invalid node/);
});
