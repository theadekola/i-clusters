import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import ssh2 from 'ssh2';
import {once} from 'node:events';
import {guestUpdateCommand} from '../src/guest-package-update.js';
import {connectSSH,openGuestUpdate,shellSession,closeShell,writeShellInput} from '../src/ssh-access.js';
test('guest updates use a separate PTY on the verified connection, bound to the logged-in guest session',async()=>{
 const key=crypto.generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs1',format:'pem'});
 const fingerprint='SHA256:'+crypto.createHash('sha256').update(ssh2.utils.parseKey(key).getPublicSSH()).digest('base64').replace(/=+$/,'');
 const commands=[],clients=new Set();
 const server=new ssh2.Server({hostKeys:[key]},client=>{
  clients.add(client);client.on('error',()=>{});client.on('authentication',ctx=>ctx.accept());
  client.on('ready',()=>client.on('session',accept=>{const session=accept();session.on('pty',accept=>accept());
   session.on('shell',accept=>{const channel=accept();channel.on('data',chunk=>channel.write(chunk))});
   session.on('exec',(accept,_reject,info)=>{commands.push(info.command);const channel=accept();channel.on('data',()=>{channel.exit(0);channel.end()})});
  }));
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const connect=target=>connectSSH({host:'127.0.0.1',port:server.address().port,fingerprint,username:'tester',password:'test',target,mode:'shell'},'owner','login');
 try{
  for(const target of ['node:pve','vm:pve:104','lxc:pve:105']){
   const parent=await connect(target),start=(sid='login',ip='127.0.0.1')=>openGuestUpdate(parent.id,'owner',sid,async()=>ip);
   if(target.startsWith('node:')){await assert.rejects(start(),{status:403});closeShell(parent.id,'owner');continue}
   await assert.rejects(start('other'),{status:403});await assert.rejects(start('login','192.0.2.1'),{status:409});
   const child=await start();await assert.rejects(start(),{status:409});
   const s=shellSession(child.id,'owner'),done=once(s.stream,'close');writeShellInput(s,'n\n');await done;
   closeShell(child.id,'owner');assert.equal(shellSession(parent.id,'owner').closed,false);closeShell(parent.id,'owner');
  }
  assert.deepEqual(commands,[guestUpdateCommand,guestUpdateCommand]);
 }finally{for(const client of clients)client.end();server.close()}
});
