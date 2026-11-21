import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.JWT_SECRET='a'.repeat(64);process.env.JWT_REFRESH_SECRET='b'.repeat(64);
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'iclusters-vm-install-'));
const {createApp}=await import('../src/app.js');
const calls=[];
let task={status:'running'},guests=[];
const upstream=http.createServer(async(req,res)=>{
 const chunks=[];for await(const chunk of req)chunks.push(chunk);
 calls.push({url:req.url,method:req.method,authorization:req.headers.authorization,body:Buffer.concat(chunks).toString()});res.setHeader('Content-Type','application/json');
 const responses={
  '/api2/json/nodes/pve1/storage':[{storage:'local',active:1,enabled:1,content:'images,iso,rootdir,vztmpl',avail:100*1024**3}],
  '/api2/json/nodes/pve1/storage/local/content?content=iso':[{content:'iso',volid:'local:iso/linux.iso'}],
  '/api2/json/cluster/nextid':321,
  '/api2/json/nodes/pve1/storage/local/content?content=vztmpl':[{content:'vztmpl',volid:'local:vztmpl/debian.tar.zst'}],
  '/api2/json/nodes/pve1/qemu':'UPID:fixture',
  '/api2/json/nodes/pve1/lxc':'UPID:fixture',
  '/api2/json/nodes/pve1/tasks/UPID%3Afixture/status':task,
  '/api2/json/cluster/resources':guests
 };res.end(JSON.stringify({data:responses[req.url]}));
});
await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
process.env.PROXMOX_URL=`http://127.0.0.1:${upstream.address().port}`;
process.env.PROXMOX_TOKEN_ID='fixture@pve!test';process.env.PROXMOX_TOKEN_SECRET='fixture-secret';
const audits=[];let invalidations=0;
const app=createApp({authenticate:(req,res,next)=>{if(!req.headers['x-test-role'])return res.status(401).json({error:'Authentication required'});req.user={sub:req.headers['x-test-user']||'fixture-user',role:req.headers['x-test-role'],permissionKeys:req.headers['x-test-permissions']?.split(',')};next();},audit:async(...args)=>audits.push(args),monitor:{invalidate:()=>invalidations++}});
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}/api`;
try{
 await test('installation media and creation retain authentication and operator permissions',async()=>{
  for(const endpoint of ['/proxmox/installation-media/pve1','/proxmox/vm'])for(const role of ['', 'viewer','auditor']){
   const method=endpoint.endsWith('/vm')?'POST':'GET';const r=await fetch(base+endpoint,{method,headers:{'Content-Type':'application/json',...(role?{'x-test-role':role}:{})},...(method==='POST'?{body:'{}'}:{})});assert.equal(r.status,role?403:401);
  }
  assert.equal(calls.length,0);
 });
 await test('operator discovery is read-only and uses existing configured API-token authentication',async()=>{
  const r=await fetch(base+'/proxmox/installation-media/pve1',{headers:{'x-test-role':'operator'}});assert.equal(r.status,200);const data=await r.json();assert.equal(data.isos[0].volid,'local:iso/linux.iso');assert.equal(calls.length,2);assert.ok(calls.every(c=>c.method==='GET'&&c.authorization==='PVEAPIToken=fixture@pve!test=fixture-secret'));assert.equal(invalidations,0);assert.equal(audits.length,0);
 });
 await test('creation preserves queued task envelope, auditing and monitor invalidation',async()=>{
  const r=await fetch(base+'/proxmox/vm',{method:'POST',headers:{'Content-Type':'application/json','x-test-role':'operator'},body:JSON.stringify({name:'fixture',node:'pve1',storage:'local',iso:'local:iso/linux.iso'})});assert.equal(r.status,200);const data=await r.json();assert.equal(data.ok,true);assert.equal(data.result.vmid,'321');assert.equal(data.result.node,'pve1');assert.equal(data.result.installationReady,true);assert.equal(data.result.task,'UPID:fixture');assert.equal(invalidations,1);assert.equal(audits[0][1],'proxmox.vm.create');assert.equal(audits[0][4],'queued');assert.deepEqual(calls.filter(c=>c.method!=='GET').map(c=>c.url),['/api2/json/nodes/pve1/qemu']);
 });
 await test('Finish queues startup only for permitted new guests and tracks their actual creation task', async()=>{
  const actor={'x-test-role':'admin'};
  const vm={name:'fixture',node:'pve1',storage:'local',openConsole:true};
  const ct={...vm,ostemplate:'local:vztmpl/debian.tar.zst',password:'fixture8',confirmPassword:'fixture8'};
  const create=async(kind,payload,headers=actor)=>{
   const response=await fetch(base+'/proxmox/'+kind,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(payload)});
   assert.equal(response.status,200);
   const {result}=await response.json();
   assert.match(result.creationReceipt,/^[a-f0-9-]+$/);
   const status=(overrides={})=>fetch(base+'/proxmox/creation/'+result.creationReceipt+'/status',{headers:{...headers,...overrides}});
   return {result,status,form:new URLSearchParams(calls.findLast(call=>call.method==='POST').body)};
  };

  for(const [path,type,payload] of [['vm','qemu',vm],['ct','lxc',ct]]){
   task={status:'running'};
   guests=[{node:'pve1',vmid:321,type,status:'running'}];
   const {status,form}=await create(path,payload);
   assert.equal(form.get('start'),'1');
   assert.equal(form.get('onboot'),'0');
   if (path==='ct') assert.equal(form.get('password'),ct.password);
   assert.deepEqual(await (await status()).json(),{state:'creating'});
   assert.equal((await status({'x-test-user':'other'})).status,404);
   task={status:'stopped',exitstatus:'OK'};
   guests=[{node:'other-node',vmid:321,type,status:'running'}];
   assert.deepEqual(await (await status()).json(),{state:'starting'});
   guests=[{node:'pve1',vmid:321,type,status:'stopped'}];
   assert.deepEqual(await (await status()).json(),{state:'starting'});
   guests[0].status='running';
   assert.deepEqual(await (await status()).json(),{state:'running'});
  }

  const warned=await create('ct',ct);
  task={status:'stopped',exitstatus:'WARNINGS: 1'};
  guests=[{node:'pve1',vmid:321,type:'lxc',status:'stopped'}];
  assert.deepEqual(await (await warned.status()).json(),{state:'starting'});
  guests[0].status='running';
  assert.deepEqual(await (await warned.status()).json(),{state:'running'});

  const startupFailed=await create('ct',ct);
  task={status:'stopped',exitstatus:'startup for container failed'};
  guests=[{node:'pve1',vmid:321,type:'lxc',status:'stopped'}];
  assert.deepEqual(await (await startupFailed.status()).json(),{state:'stopped'});
  guests[0].status='running';
  assert.deepEqual(await (await startupFailed.status()).json(),{state:'running'});

  const failed=await create('vm',vm);
  task={status:'stopped',exitstatus:'ERROR'};
  guests.push({node:'other-node',vmid:321,type:'qemu',status:'running'});
  guests.push({node:'pve1',vmid:322,type:'qemu',status:'running'});
  guests.push({node:'pve1',vmid:321,type:'qemu',status:'stopped',lock:'create'});
  const writes=calls.filter(c=>c.method!=='GET').length;
  const failure=await failed.status();
  assert.equal(failure.status,409);
  assert.equal((await failure.json()).error,'Guest creation failed. Check the Proxmox task history.');
  assert.equal(calls.filter(c=>c.method!=='GET').length,writes);

  task={status:'stopped',exitstatus:'OK'};
  guests=[{node:'pve1',vmid:321,type:'qemu',status:'stopped'}];
  const ha=await create('vm',{...vm,addHa:true});
  assert.equal(ha.form.get('start'),'0');
  assert.equal(ha.result.ha.receipt,ha.result.creationReceipt);
  assert.deepEqual(await (await ha.status()).json(),{state:'ha'});
  const limited=await create('vm',vm,{'x-test-role':'operator','x-test-permissions':'vm.view,vm.create'});
  assert.equal(limited.form.get('start'),'0');
  assert.deepEqual(await (await limited.status()).json(),{state:'stopped'});
  assert.equal((await limited.status({'x-test-permissions':'containers.view,containers.create'})).status,404);
 });

}finally{await Promise.all([new Promise(resolve=>server.close(resolve)),new Promise(resolve=>upstream.close(resolve))]);fs.rmSync(process.env.DATA_DIR,{recursive:true,force:true});}
