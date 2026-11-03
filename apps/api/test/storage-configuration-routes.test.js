import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.JWT_SECRET='a'.repeat(64);process.env.JWT_REFRESH_SECRET='b'.repeat(64);process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'storage-configuration-routes-'));
const {createApp}=await import('../src/app.js');let prepared=0;
const app=createApp({authenticate:(req,res,next)=>{req.user={sub:'fixture',role:req.headers['x-role']||'owner'};next()},audit:async()=>{},monitor:{invalidate(){}},storageConfigurationManager:{options:async()=>({resources:[{id:'local'}],nodes:[{node:'one'}]}),inspect:async()=>({id:'local',revision:'revision'}),mounts:async()=>[],browse:async()=>({model:{id:'local'},files:[],uploadTypes:['iso']}),uploadTarget:async()=>{prepared++;throw Error('No confirmed upload expected')},configure:async()=>{throw Error('No confirmed configuration expected')}}});
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api`;
const call=async(url,role='owner',method='GET',body,headers={})=>{const r=await fetch(base+url,{method,headers:{'x-role':role,'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}};
try{
 await test('configuration and import routes require an administrator while content browsing allows viewers',async()=>{
  for(const role of ['viewer','operator','auditor']){
   for(const url of ['/proxmox/storage-options','/proxmox/storage-mounts/one','/proxmox/storage-configure/local'])assert.equal((await call(url,role)).status,403);
   for(const url of ['/proxmox/storage-configure','/proxmox/storage-file-upload'])assert.equal((await call(url,role,'POST',{})).status,403);
   assert.equal((await call('/proxmox/storage-file-upload/'+'a'.repeat(48),role,'PUT',{})).status,403);
  }
  assert.equal((await call('/proxmox/storage-files/one/local','viewer')).status,200);const options=await call('/proxmox/storage-options');assert.equal(options.status,200);assert.ok(options.body.connectionScope);
 });
 await test('file imports need confirmation and node password approval before a binary ticket can exist',async()=>{
  const body={node:'one',id:'local',filename:'linux.iso',content:'iso',size:1};const challenge=await call('/proxmox/storage-file-upload','owner','POST',body);assert.equal(challenge.status,409);assert.equal(challenge.body.sshTarget,'node:one');assert.ok(challenge.body.confirmationPhrase);
  assert.equal((await call('/proxmox/storage-file-upload','owner','POST',body,{'X-IClusters-Confirm':challenge.body.confirmationPhrase})).status,428);assert.equal(prepared,0);
  assert.equal((await call('/proxmox/storage-file-upload/'+'a'.repeat(48),'owner','PUT',{})).status,403);
 });
}finally{await new Promise(r=>server.close(r));fs.rmSync(process.env.DATA_DIR,{recursive:true,force:true})}
