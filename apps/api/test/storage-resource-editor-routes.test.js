import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.JWT_SECRET='a'.repeat(64);process.env.JWT_REFRESH_SECRET='b'.repeat(64);
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'storage-edit-route-'));
const {createApp}=await import('../src/app.js');
const writes=[],model={provider:'truenas',resourceId:'tank/media',type:'Dataset',revision:'fixture-revision'};
const app=createApp({authenticate:(req,res,next)=>{req.user={sub:'fixture',role:req.headers['x-role']||'owner'};next()},audit:async()=>{},monitor:{invalidate(){}},guestStorageService:{inspect:async(_input,guard)=>{guard();return {model,plan:{supported:true}}},expand:async()=>{throw Error('Unexpected guest write')}},storageEditor:{inspect:async()=>model,update:async(body,guard)=>{guard();writes.push(body);return {accepted:true}}}});
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}/api/storage/datasets/edit`;
const call=async(role,method='GET',body,confirmation)=>{const r=await fetch(base,{method,headers:{'x-role':role,'Content-Type':'application/json',...(confirmation?{'X-IClusters-Confirm':confirmation}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}};
try{
 await test('storage edit reads and writes reject non-administrator roles',async()=>{
  for(const role of ['viewer','operator','auditor']){assert.equal((await call(role)).status,403);assert.equal((await call(role,'PUT',{})).status,403);}assert.equal(writes.length,0);
 });
 await test('guest storage routes require an administrator and explicit approval before mutation',async()=>{
  for(const role of ['viewer','operator','auditor'])for(const method of ['GET','PUT']){
   const response=await fetch(base.replace('/edit',method==='GET'?'/guest-layout':'/guest-expand'),{method,headers:{'x-role':role,'Content-Type':'application/json'},...(method==='PUT'?{body:'{}'}:{})});assert.equal(response.status,403);
  }
  const inspection=await fetch(base.replace('/edit','/guest-layout'),{headers:{'x-role':'owner'}});assert.equal(inspection.status,200);const checked=await inspection.json();assert.ok(checked.connectionScope);assert.equal(checked.plan.supported,true);
  const write=await fetch(base.replace('/edit','/guest-expand'),{method:'PUT',headers:{'x-role':'owner','Content-Type':'application/json'},body:JSON.stringify({provider:'proxmox',node:'one',connectionScope:checked.connectionScope})});assert.equal(write.status,409);assert.ok((await write.json()).confirmationPhrase);
 });
 await test('edits require fresh confirmation and the same controller connection',async()=>{
  const opened=await call('owner');assert.equal(opened.status,200);assert.ok(opened.body.connectionScope);
  const body={...model,connectionScope:opened.body.connectionScope,quotaGiB:100};
  const challenge=await call('owner','PUT',body);assert.equal(challenge.status,409);assert.equal(writes.length,0);
  assert.equal((await call('owner','PUT',body,challenge.body.confirmationPhrase)).status,200);assert.equal(writes.length,1);
  const stale={...body,connectionScope:'old'};const changed=await call('owner','PUT',stale);assert.equal((await call('owner','PUT',stale,changed.body.confirmationPhrase)).status,409);assert.equal(writes.length,1);
 });
}finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(process.env.DATA_DIR,{recursive:true,force:true});}
