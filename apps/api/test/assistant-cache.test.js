import test from 'node:test';
import assert from 'node:assert/strict';
import Redis from 'ioredis';
import {assistantContext,inventoryAnswer,questionContext,recentActivityAnswer,publicWebSearch} from '../src/ai.js';
import {cacheMeasurements,readMeasurements,closeMeasurementCache} from '../src/assistant-cache.js';
import {createHmac,randomUUID} from 'node:crypto';

function sample() {
 const sampledAt=new Date().toISOString();
 return {sampledAt,services:[{id:'proxmox',status:'reachable',sampledAt}],proxmox:{
  resourceInventoryComplete:true,nodeInventory:{complete:true},nodes:[{name:'node01',ip:'192.0.2.12'},{name:'node02'}],
  vms:Array.from({length:31},(_,id)=>({id:String(id),name:'machine-'+id,node:id<29?'node01':'node02',
   status:'running',powerStatus:id===0?'paused':'running',nodeAvailable:id!==30,template:id===1})),
  lxc:[{name:'ct-a',node:'node02',status:'stopped',template:false}]}};
}
test('uses complete inventory for node IPs, verified guest counts and individual states',()=>{
 const s=sample(),p=assistantContext(s,Infinity),ask=q=>inventoryAnswer(p,q);
 assert.match(ask('Which IP address is node01?'),/192\.0\.2\.12/);
 assert.match(ask('What are the IP addresses of node01 and node02?'),/192\.0\.2\.12.*not reported an IP address for node02/);
 assert.match(ask('What is the IP address of VM 30?'),/No current guest IP address/);
 assert.match(ask('how many virtual machine did the clusters have?'),/30 virtual machines.*Templates excluded: 1/);
 assert.match(ask('How many VMs are running?'),/28 running virtual machines.*Power state unknown for 1/);
 assert.match(ask('How many VMs are running on node01?'),/node01 has 27 running/);
 assert.match(ask('How many stopped LXC containers on node02?'),/node02 has 1 stopped LXC container/);
 assert.match(ask('How many CTs?'),/1 LXC container/);
 assert.match(ask('Is VM 0 running?'),/power state: paused/);
 assert.match(ask('Is VM 30 running?'),/power state: unknown/);
 assert.match(ask('How many VMs on unknown-node?'),/not reported/);
 assert.match(ask('How many containers?'),/LXC.*Docker/);
 assert.equal(ask('How many VMs have more than 8 GB of RAM?'),null);
 const bounded=questionContext(p,'What about machine-30?').proxmox.vms;
 assert.equal(bounded.items.length,24);
 assert.ok(bounded.items.some(r=>r.name==='machine-30'));
});
test('distinguishes a measured zero from absent, partial and stale telemetry',()=>{
 const s=sample();s.proxmox.vms=[];
 const ask=()=>inventoryAnswer(assistantContext(s,Infinity),'How many VMs are running?');
 assert.match(ask(),/0 running virtual machines/);
 s.services[0].status='partial';assert.match(ask(),/incomplete/);
 s.services[0].status='reachable';s.services[0].refreshing=true;assert.match(ask(),/incomplete/);
 s.services[0].sampledAt=new Date(Date.now()-180_000).toISOString();assert.match(ask(),/unavailable/);
 const context=questionContext(assistantContext(s,Infinity),'Describe my VMs');
 assert.equal(context.proxmox.status,'stale');assert.equal(context.proxmox.vms,undefined);
 delete s.proxmox;assert.match(ask(),/unavailable/);
});
test('can answer recent shared activity without a provider',()=>{
 assert.match(recentActivityAnswer('What shared activities happened most recently?',[{title:'Backup',status:'queued',time:'08:00'}]),/08:00.*Backup.*queued/);
 assert.match(recentActivityAnswer('Show recent activities',[]),/No shared activities/);
 assert.equal(recentActivityAnswer('Review my backup policy',[]),null);
});
test('public prompts use the saved n8n workflow and distinguish unconfirmed searches',async t=>{
 const config={AI_PROVIDER:'n8n',N8N_WEBHOOK_URL:'https://workflow.test/webhook/search',OPENAI_API_KEY:'fixture'};
 const mock=t.mock.method(globalThis,'fetch',async(url,options)=>{
  assert.equal(url,config.N8N_WEBHOOK_URL);
  assert.deepEqual(JSON.parse(options.body),{message:'web: public docs'});
  return Response.json({answer:'Public results',webSearch:true});
 });
 await assert.rejects(publicWebSearch({},'web: docs'),/API key/);
 await assert.rejects(publicWebSearch(config,'web: '),/search terms/);
 assert.equal(mock.mock.callCount(),0);
 assert.deepEqual(await publicWebSearch(config,'web: public docs'),{mode:'n8n',answer:'Public results',webSearch:true});
 mock.mock.mockImplementation(()=>Response.json({answer:'A model-only reply'}));
 const reply=await publicWebSearch(config,'web: docs');assert.equal(reply.answer,'A model-only reply');assert.equal(reply.webSearch,false);assert.match(reply.notice,/not confirmed/);
});

test('Redis isolates samples, refuses copied or damaged entries and bounds expiry by sample age',{skip:!process.env.REDIS_URL},async()=>{
 const probe=new Redis(process.env.REDIS_URL),priorProfile=process.env.ICLUSTERS_CLUSTER_PROFILE,priorSecret=process.env.JWT_SECRET;
 const profile=randomUUID();process.env.ICLUSTERS_CLUSTER_PROFILE=profile;process.env.JWT_SECRET ||= randomUUID();
 const s=sample();s.sampledAt=new Date(Date.now()-30_000).toISOString();
 const inventory=assistantContext(s,Infinity),keyFor=id=>'iclusters:assistant:v2:'+createHmac('sha256',process.env.JWT_SECRET)
  .update(JSON.stringify([id,process.env.DATA_DIR,s.proxmox.guestAlertScope,s.sampledAt])).digest('hex');
 const key=keyFor(profile),otherKey=keyFor(profile+'-other'),fallback=()=>null;
 try{
  await probe.ping();
  for(let i=0;i<40;i++){
   await cacheMeasurements(s,()=>inventory);
   if(await probe.exists(key))break;
   await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.deepEqual(await readMeasurements(s,fallback),JSON.parse(JSON.stringify(inventory)));
  const ttl=await probe.pttl(key);assert.ok(ttl>0&&ttl<=90_000);
  const raw=await probe.get(key);
  process.env.ICLUSTERS_CLUSTER_PROFILE=profile+'-other';
  assert.equal(await readMeasurements(s,fallback),null);
  await probe.set(otherKey,raw,'PX',5000);assert.equal(await readMeasurements(s,fallback),null);
  process.env.ICLUSTERS_CLUSTER_PROFILE=profile;
  for(const value of ['invalid',JSON.stringify({sampledAt:s.sampledAt}),JSON.stringify({body:'{}',tag:'invalid'})]){
   await probe.set(key,value,'PX',5000);assert.equal(await readMeasurements(s,fallback),null);
  }
  assert.equal(await readMeasurements({...s,sampledAt:new Date(Date.now()-180_000).toISOString()},fallback),null);
 }finally{
  try{await probe.del(key,otherKey)}finally{closeMeasurementCache();probe.disconnect();
   if(priorProfile===undefined)delete process.env.ICLUSTERS_CLUSTER_PROFILE;else process.env.ICLUSTERS_CLUSTER_PROFILE=priorProfile;
   if(priorSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=priorSecret;}
 }
});
