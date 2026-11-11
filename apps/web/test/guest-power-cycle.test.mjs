import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const bundle=await build({
  entryPoints:[new URL('../src/guest-power-cycle.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm',
  plugins:[{name:'test-api',setup(builder){
    builder.onResolve({filter:/\/api$/},()=>({path:'api',namespace:'fixture'}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const api=(...args)=>globalThis.cycleAPI(...args);export const confirmedApi=api;'}));
  }}]
});
const {submitRestart,restartMessage,historyLink}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
after(()=>{delete globalThis.cycleAPI});
const id='d413df36-81b8-4c18-b006-28f514f61895';
for(const kind of ['vm','lxc'])for(const power of ['running','stopped'])test(kind+' '+power+' binds its one maintenance request to the scoped receipt',async()=>{
  const writes=[],target={id:'107',node:'n1',name:'guest',kind,reason:'update'};
  globalThis.cycleAPI=async(path,init)=>{
    if(path===`/proxmox/${kind}/n1/107/details?view=power`)return {status:{status:power}};
    assert.equal(path,`/actions/proxmox/${kind}/107/${power==='running'?'reboot':'start'}`);
    writes.push(JSON.parse(init.body));return {result:{restart:{id}}};
  };
  await submitRestart(target,'cluster',id,new AbortController().signal);
  assert.deepEqual(writes,[{node:'n1',maintenance:{id,cluster:'cluster',name:'guest',reason:'update'}}]);
});

test('recovery requests startup only and binds the superseded task',async()=>{
  const target={id:'107',node:'n1',name:'guest',kind:'lxc',reason:'update'};
  const record={id,node:'n1',guest:'107',kind:'lxc',phase:'recoverable',task:'old-task'};
  let writes=0;
  globalThis.cycleAPI=async(path,options)=>{
    assert.equal(path,'/actions/proxmox/lxc/107/start');assert.equal(JSON.parse(options.body).maintenance.previousTask,'old-task');
    writes++;return {result:{restart:{id}}};
  };
  for(const bad of [{phase:'monitoring'},{task:null},{guest:'108'},{kind:'vm'}])
    await assert.rejects(submitRestart(target,'cluster',id,new AbortController().signal,{...record,...bad}));
  await submitRestart(target,'cluster',id,new AbortController().signal,record);assert.equal(writes,1);
});

test('unknown power state prevents any write',async()=>{
  globalThis.cycleAPI=async(path)=>{assert.ok(path.endsWith('?view=power'));return {status:{status:'running',qmpstatus:'paused'}}};
  await assert.rejects(submitRestart({node:'n1',kind:'vm',id:'107',reason:'setup',name:'guest'},'cluster',id,new AbortController().signal),/power state/);
});
test('progress distinguishes confirmed power, agent and incomplete receipts and links the exact restart',()=>{
  assert.match(restartMessage({phase:'unknown'}),/may have been accepted/);
  assert.match(restartMessage({phase:'recoverable'}),/stopped/);
  assert.match(restartMessage({phase:'verifying'}),/Verifying/);
  assert.match(restartMessage({phase:'complete',kind:'vm',reason:'setup'}),/Agent has responded/);
  assert.equal(new URL(historyLink({id}),'https://fixture').searchParams.get('restart'),id);
});
