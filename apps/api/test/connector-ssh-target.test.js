import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'connector-address-'));process.env.JWT_SECRET='a'.repeat(64);process.env.JWT_REFRESH_SECRET='b'.repeat(64);
const {connectorSSHAddress}=await import('../src/connector-ssh-target.js');
test('paired Proxmox node address comes from the matching cluster node rather than DNS or another guest',async()=>{const calls=[],result=await connectorSSHAddress({hostname:'node01',kind:'proxmox'},{query:async p=>{calls.push(p);return [{type:'node',name:'node02',ip:'192.0.2.11'},{type:'node',name:'node01',ip:'192.0.2.10'}]}});assert.equal(result.host,'192.0.2.10');assert.equal(result.source,'proxmox');assert.deepEqual(calls,['/cluster/status']);const qualified=await connectorSSHAddress({hostname:'node01.example.test'},{query:async()=>[{type:'node',name:'node01',ip:'192.0.2.10'}]});assert.equal(qualified.host,'192.0.2.10');});
test('missing permissions, ambiguous names, invalid IPs and standalone hosts keep manual address entry',async()=>{const node={hostname:'node01'};for(const query of [async()=>{throw Error('403 secret should not be returned')},async()=>[{type:'node',name:'node01.a',ip:'192.0.2.10'},{type:'node',name:'node01.b',ip:'192.0.2.11'}],async()=>[{type:'node',name:'node01',ip:'not-an-ip'},{type:'node',name:'node01.other',ip:'192.0.2.11'}]]){const r=await connectorSSHAddress(node,{query});assert.equal(r.host,'');assert.equal(r.source,'manual');assert.ok(!JSON.stringify(r).includes('secret'));}const r=await connectorSSHAddress({...node,kind:'docker'},{query:async()=>{throw Error('Must not read Proxmox for a standalone host')}});assert.equal(r.host,'');});
test('paired Docker connectors use their own live interface before querying Proxmox',async()=>{
 const reports=()=>[{id:'elsewhere',kind:'docker',online:true},{id:'paired',kind:'docker',online:true,network:{status:'ok',receivedAt:Date.now(),interfaces:[{name:'docker0',addresses:['172.17.0.1/16']},{name:'eth0',addresses:['192.0.2.43/24']}]}}];
 const result=await connectorSSHAddress({id:'paired',kind:'docker',hostname:'display-name'},{reports,query:assert.fail});
 assert.equal(result.host,'192.0.2.43');assert.equal(result.source,'connector');
});
test('paired VM and CT addresses use only the running guest identified in the pairing',async()=>{
 for(const kind of ['qemu','lxc']){
  const node={id:'paired',kind:'docker',pairingTarget:'pve:'+kind+'/122'};
  const query=async path=>{
   if(path==='/cluster/resources')return [{node:'pve',vmid:122,type:kind,status:'running'}];
   assert.equal(path,'/nodes/pve/'+kind+'/122/'+(kind==='qemu'?'agent/network-get-interfaces':'interfaces'));
   return kind==='qemu'?{result:[{name:'eth0','ip-addresses':[{'ip-address':'192.0.2.22'}]}]}:[{name:'eth0',inet:'192.0.2.22/24'}];
  };
  const reports=()=>[];
  assert.equal((await connectorSSHAddress(node,{query,reports})).host,'192.0.2.22');
  assert.equal((await connectorSSHAddress(node,{query:async()=>[{node:'other',vmid:122,type:kind,status:'running'}],reports})).host,'');
 }
});
test('connector SSH address endpoint is owner-only and returns no pairing material',async()=>{const {createApp}=await import('../src/app.js'),agents=await import('../src/node-agents.js'),paired=agents.pairNode(agents.createPairing().code,'node01');let lookups=0;const app=createApp({authenticate:(req,res,next)=>{req.user={sub:'fixture',role:req.headers['x-role']||'viewer'};next()},connectorAddress:async n=>{lookups++;assert.equal(n.id,paired.id);return {host:'192.0.2.10',source:'proxmox'}},audit:async()=>{throw Error('Read-only lookup must not write an audit action')}}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api/node-agents/`;try{for(const role of ['viewer','operator','admin']){const r=await fetch(base+paired.id+'/ssh-target',{headers:{'x-role':role}});assert.equal(r.status,403);}assert.equal(lookups,0);const r=await fetch(base+paired.id+'/ssh-target',{headers:{'x-role':'owner'}});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(await r.json(),{host:'192.0.2.10',source:'proxmox'});assert.equal(lookups,1);assert.equal((await fetch(base+'unknown/ssh-target',{headers:{'x-role':'owner'}})).status,404);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));agents.revokeAgent(paired.id)}});
