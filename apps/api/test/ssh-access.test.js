import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {issueGrant,consumeGrant,actionTarget} from '../src/ssh-access.js';
test('SSH grants are single-use and bound to identity method target and payload',()=>{const body={node:'pve'},path='/actions/proxmox/vm/100/reboot';let token=issueGrant('alice','POST',path,body);assert.equal(consumeGrant(token,'bob','POST',path,body),false);assert.equal(consumeGrant(token,'alice','POST',path,body),false);token=issueGrant('alice','POST',path,body);assert.equal(consumeGrant(token,'alice','POST',path,{node:'other'}),false);token=issueGrant('alice','POST',path,body);assert.equal(consumeGrant(token,'alice','POST',path,body),true);assert.equal(consumeGrant(token,'alice','POST',path,body),false);});
test('target identification distinguishes nodes VMs and containers',()=>{assert.equal(actionTarget({sshLabel:'proxmox.node.power',params:{node:'pve'},body:{}}),'node:pve');assert.equal(actionTarget({params:{provider:'proxmox',resourceType:'lxc',resourceId:'103'},body:{node:'pve'}}),'node:pve');});

import ssh2 from 'ssh2';
const {Server}=ssh2;
import crypto from 'node:crypto';
import {connectSSH,closeShell,savedSSH,publicSavedSSH,shellSession,deleteSavedSSH} from '../src/ssh-access.js';
test('SSH authorization rejects unknown host keys and wrong passwords then issues an exact-action grant',async()=>{
 const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});const key=privateKey.export({type:'pkcs1',format:'pem'});
 const server=new Server({hostKeys:[key]},client=>{client.on('error',()=>{});client.on('authentication',ctx=>ctx.method==='password'&&ctx.username==='root'&&ctx.password==='correct'?ctx.accept():ctx.reject());client.on('ready',()=>client.on('session',accept=>{const session=accept();session.on('sftp',accept=>accept());session.on('pty',accept=>accept());session.on('shell',accept=>{const stream=accept();stream.on('data',()=>{});});session.on('exec',(accept,reject,info)=>{if(info.command!=='/usr/bin/id -u')return reject();const stream=accept();stream.write('0\n');stream.exit(0);stream.end();});}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const input={host:'127.0.0.1',port:server.address().port,username:'root',password:'correct',target:'node:pve',mode:'authorize',path:'/proxmox/node/pve/power/reboot',method:'POST',body:{}};
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ssh-save-'));
 const oldDir=process.env.DATA_DIR,oldSecret=process.env.JWT_SECRET;
 process.env.DATA_DIR=directory;process.env.JWT_SECRET='test-secret-'.repeat(4);
 try{
  let fingerprint;
  await assert.rejects(()=>connectSSH(input,'alice'),e=>{fingerprint=e.fingerprint;return e.status===409&&fingerprint.startsWith('SHA256:')});
  await assert.rejects(()=>connectSSH({...input,fingerprint,password:'wrong'},'alice'),/Check the username and password/);
  const result=await connectSSH({...input,fingerprint},'alice');
  assert.equal(consumeGrant(result.token,'alice','POST',input.path,{}),true);
  await assert.rejects(()=>connectSSH({...input,fingerprint,target:'node:other'},'alice'),/does not match/);
  const shellInput={...input,mode:'shell',fingerprint};
  const fresh=await connectSSH(shellInput,'alice');
  closeShell(fresh.id,'alice');
  assert.equal(savedSSH('alice',input.target),null);
  await assert.rejects(()=>connectSSH({...shellInput,password:'wrong',save:true},'alice'),/Check the username and password/);
  await assert.rejects(()=>connectSSH({...shellInput,target:'lxc:pve:210',password:'wrong',save:true},'alice'),error=>{
   assert.equal(error.code,'ssh_authentication_failed');
   assert.match(error.message,/container may allow root on its console/);
   return true;
  });
  assert.equal(savedSSH('alice','lxc:pve:210'),null);
  assert.equal(savedSSH('alice',input.target),null);

  const shell=await connectSSH({...shellInput,save:true},'alice');
  assert.equal(shellSession(shell.id,'alice').expiresAt,undefined);
  closeShell(shell.id,'alice');
  const shellVault=fs.readFileSync(path.join(directory,'ssh-connections.json'),'utf8');
  assert.equal(shellVault.includes('correct'),false);
  assert.equal(JSON.stringify(publicSavedSSH('alice')).includes('correct'),false);
  assert.deepEqual(publicSavedSSH('bob'),{});
  assert.equal(savedSSH('alice',input.target,'sftp'),null);
  const direct=await connectSSH({saved:true,mode:'shell',target:input.target},'alice','login');
  assert.equal(direct.host,input.host);
  assert.equal(shellSession(direct.id,'alice').target,input.target);
  closeShell(direct.id,'alice');
  await assert.rejects(()=>connectSSH({saved:true,mode:'shell',target:input.target},'bob'),{status:404});
  const reuse={...shellInput,password:'',useSavedPassword:true,save:true};
  const reconnect=await connectSSH(reuse,'alice');
  assert.equal(shellSession(reconnect.id,'alice').credentialsExpireAt,undefined);
  closeShell(reconnect.id,'alice');
  assert.equal(fs.readFileSync(path.join(directory,'ssh-connections.json'),'utf8'),shellVault);
  for (const changes of [{username:'other'},{host:'192.0.2.1'},{port:server.address().port===22?23:22},{fingerprint:'different'}])
   await assert.rejects(()=>connectSSH({...reuse,...changes},'alice'),/changed connection/);
  await assert.rejects(()=>connectSSH({...reuse,mode:'authorize'},'alice'),e=>e.status===403);
  await assert.rejects(()=>connectSSH(reuse,'bob'),/changed connection/);
  deleteSavedSSH('alice',input.target);
  await assert.rejects(()=>connectSSH(reuse,'alice'),/changed connection/);

  const files=await connectSSH({...input,mode:'sftp',fingerprint,save:true},'alice');
  closeShell(files.id,'alice');
  assert.equal(savedSSH('bob',input.target,'sftp'),null);
  assert.deepEqual(publicSavedSSH('bob','sftp'),{});
  assert.equal(publicSavedSSH('alice','sftp')[input.target].hasPassword,true);
  assert.equal(JSON.stringify(publicSavedSSH('alice','sftp')).includes('correct'),false);
  const retained=await connectSSH({...input,mode:'sftp',fingerprint,password:'',useSavedPassword:true,save:true},'alice');
  closeShell(retained.id,'alice');
  await assert.rejects(()=>connectSSH({...input,mode:'sftp',fingerprint,password:'',username:'other',useSavedPassword:true},'alice'),/changed connection/);
  assert.equal(savedSSH('alice',input.target,'sftp').password,'correct');
  assert.equal(fs.readFileSync(path.join(directory,'sftp-connections.json'),'utf8').includes('correct'),false);
  await assert.rejects(()=>connectSSH({mode:'sftp',saved:true,target:input.target},'bob'),e=>e.status===404);
  const again=await connectSSH({mode:'sftp',saved:true,target:input.target},'alice');
  const parallel=await connectSSH({mode:'sftp',saved:true,target:input.target},'alice');
  assert.notEqual(parallel.id,again.id);
  closeShell(again.id,'alice');
  assert.equal(shellSession(parallel.id,'alice').closed,false);
  const active=shellSession(parallel.id,'alice');
  assert.equal(active.credentialsExpireAt,savedSSH('alice',input.target,'sftp').expiresAt);
  active.credentialsExpireAt=Date.now();
  assert.throws(()=>shellSession(parallel.id,'alice'),/session expired/);
  deleteSavedSSH('bob',input.target,'sftp');
  assert.ok(savedSSH('alice',input.target,'sftp'));
  deleteSavedSSH('alice',input.target,'sftp');
  assert.equal(savedSSH('alice',input.target,'sftp'),null);
  await assert.rejects(()=>connectSSH({mode:'sftp',saved:true,target:input.target},'alice'),e=>e.status===404);
 }finally{
  server.close();
  if(oldDir===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=oldDir;
  if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;
  fs.rmSync(directory,{recursive:true,force:true});
 }
});

import {writeShellInput} from '../src/ssh-access.js';
test('shell input rejects oversized or malformed requests without writing and accepts the limit',()=>{
 const writes=[],session={stream:{write:text=>writes.push(text)}};
 for(const input of ['x'.repeat(8193),42,null])assert.throws(()=>writeShellInput(session,input),e=>e.status===400);
 assert.throws(()=>writeShellInput({...session,closed:true},'input'),e=>e.status===409);assert.deepEqual(writes,[]);writeShellInput(session,undefined);writeShellInput(session,'x'.repeat(8192));assert.equal(writes[0].length,8192);
});

test('PAM password login approves exact VM and CT power actions without requiring guest SSH',async()=>{
 const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});const key=privateKey.export({type:'pkcs1',format:'pem'});const clients=[];
 const server=new Server({hostKeys:[key]},client=>{clients.push(client);client.on('error',()=>{});client.on('authentication',ctx=>{if(ctx.method!=='keyboard-interactive')return ctx.reject(['keyboard-interactive']);ctx.prompt([{prompt:'Password: ',echo:false}],answers=>ctx.username==='root'&&answers[0]==='correct'?ctx.accept():ctx.reject(['keyboard-interactive']));});client.on('ready',()=>client.on('session',accept=>accept().on('exec',(accept,reject,info)=>{if(info.command!=='/usr/bin/id -u')return reject();const stream=accept();stream.write('0\n');stream.exit(0);stream.end()})));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const fingerprint='SHA256:'+crypto.createHash('sha256').update((await import('ssh2')).default.utils.parseKey(key).getPublicSSH()).digest('base64').replace(/=+$/,'');
 try{for(const kind of ['vm','lxc'])for(const action of ['start','shutdown','reboot']){const path=`/actions/proxmox/${kind}/101/${action}`,body={node:'pve'};const result=await connectSSH({host:'127.0.0.1',port:server.address().port,username:'root',password:'correct',fingerprint,target:'node:pve',mode:'authorize',path,method:'POST',body},'alice');assert.ok(result.token);assert.equal(consumeGrant(result.token,'alice','POST',path,body),true);assert.equal(consumeGrant(result.token,'alice','POST',path,body),false);}}
 finally{for(const client of clients)client.end();await new Promise(r=>server.close(r))}
});

test('Shell diagnoses key-only LXC SSH and uses an authorized key without saving secrets',async()=>{
 const hostKey=crypto.generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs1',format:'pem'});
 const passphrase='fixture-key-passphrase';
 const guestKey=crypto.generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs1',format:'pem',cipher:'aes-128-cbc',passphrase});
 const publicKey=ssh2.utils.parseKey(guestKey,passphrase).getPublicSSH();
 const clients=new Set(),attempts=[];
 const server=new Server({hostKeys:[hostKey]},client=>{
  clients.add(client);
  client.on('close',()=>clients.delete(client)).on('error',()=>{});
  client.on('authentication',ctx=>{
   attempts.push(ctx.method);
   if(ctx.method!=='publickey'||ctx.username!=='root'||!ctx.key.data.equals(publicKey))
    return ctx.reject(['publickey']);
   if(ctx.signature&&ssh2.utils.parseKey(ctx.key.data).verify(ctx.blob,ctx.signature,ctx.hashAlgo)!==true)
    return ctx.reject(['publickey']);
   ctx.accept();
  });
  client.on('ready',()=>client.on('session',accept=>{
   const session=accept();
   session.on('pty',accept=>accept());
   session.on('shell',accept=>accept().write('fixture guest shell\n'));
  }));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const fingerprint='SHA256:'+crypto.createHash('sha256').update(ssh2.utils.parseKey(hostKey).getPublicSSH()).digest('base64').replace(/=+$/,'');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ssh-key-only-'));
 const originalDirectory=process.env.DATA_DIR;
 process.env.DATA_DIR=directory;
 const input={host:'127.0.0.1',port:server.address().port,username:'root',fingerprint,target:'lxc:pve:210',mode:'shell'};
 try{
  await assert.rejects(()=>connectSSH({...input,password:'ignored-password'},'alice'),{
   code:'ssh_authentication_failed',message:/did not offer password login/
  });
  assert.deepEqual(attempts,['none']);
  await assert.rejects(()=>connectSSH({...input,privateKey:guestKey,keyPassphrase:'wrong'},'alice'),/could not be read/);
  const keyLogin={...input,privateKey:guestKey,keyPassphrase:passphrase};
  for(const changes of [{save:true},{saved:true},{mode:'sftp'},{mode:'authorize'}])
   await assert.rejects(()=>connectSSH({...keyLogin,...changes},'alice'),/unsaved Shell login/);
  const attemptsBeforeKey=attempts.length;
  await assert.rejects(()=>connectSSH({...keyLogin,fingerprint:'wrong'},'alice'),{status:409});
  assert.equal(attempts.length,attemptsBeforeKey);
  const session=await connectSSH(keyLogin,'alice');
  assert.ok(attempts.includes('publickey'));
  closeShell(session.id,'alice');
  assert.equal(savedSSH('alice',input.target),null);
  assert.ok(!fs.existsSync(path.join(directory,'ssh-connections.json')));
 }finally{
  for(const client of clients)client.end();
  await new Promise(resolve=>server.close(resolve));
  if(originalDirectory===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=originalDirectory;
  fs.rmSync(directory,{recursive:true,force:true});
 }
});
