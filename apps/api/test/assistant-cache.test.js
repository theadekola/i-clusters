import test from 'node:test';
import assert from 'node:assert/strict';
import Redis from 'ioredis';
import {assistantContext,inventoryAnswer,questionContext} from '../src/ai.js';
import {cacheMeasurements,readMeasurements,closeMeasurementCache} from '../src/assistant-cache.js';
const snapshot={sampledAt:new Date().toISOString(),proxmox:{nodes:[{name:'node01',ip:'192.0.2.12'}],vms:Array.from({length:31},(_,id)=>({name:'machine-'+id}))}};
const inventory=assistantContext(snapshot,Infinity);
test('assistant answers inventory questions and selects named guests beyond the first page',()=>{
 assert.equal(inventoryAnswer(inventory,'which ip address is node01'),'node01 has IP address 192.0.2.12.');
 assert.equal(inventoryAnswer(inventory,'how many virtual machine did the clusters have?'),'The cluster has 31 virtual machines.');
 assert.equal(inventoryAnswer(inventory,'how many VMs are running?'),null);
 assert.equal(questionContext(inventory,'What about machine-30?').proxmox.vms.items.some(r=>r.name==='machine-30'),true);
});
test('Redis reuses only the selected profile and exact sample',{skip:!process.env.REDIS_URL},async()=>{
 const probe=new Redis(process.env.REDIS_URL),previous=process.env.ICLUSTERS_CLUSTER_PROFILE;
 try{
  await probe.ping();
  const source={...snapshot,sampledAt:new Date().toISOString()};
  for(let i=0;i<40;i++){
   await cacheMeasurements(source,()=>inventoryWithTime());
   if((await readMeasurements(source,()=>({}))).sampledAt)break;
   await new Promise(resolve=>setTimeout(resolve,50));
  }
  function inventoryWithTime(){return {...inventory,sampledAt:source.sampledAt}}
  assert.deepEqual(await readMeasurements(source,()=>null),JSON.parse(JSON.stringify(inventoryWithTime())));
  process.env.ICLUSTERS_CLUSTER_PROFILE='separate-fixture';
  assert.equal(await readMeasurements(source,()=>null),null);
 }finally{closeMeasurementCache();probe.disconnect();if(previous===undefined)delete process.env.ICLUSTERS_CLUSTER_PROFILE;else process.env.ICLUSTERS_CLUSTER_PROFILE=previous;}
});
