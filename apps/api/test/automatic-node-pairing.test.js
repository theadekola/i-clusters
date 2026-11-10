import {mkdtempSync as trustTemp,rmSync as trustRemove} from 'node:fs';
import {tmpdir as trustTmpdir} from 'node:os';
import {after as trustAfter} from 'node:test';
const trustOriginalDir=process.env.DATA_DIR,trustFixtureDir=trustTemp(trustTmpdir()+'/iclusters-known-host-fixture-');process.env.DATA_DIR=trustFixtureDir;
trustAfter(()=>{if(trustOriginalDir===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=trustOriginalDir;trustRemove(trustFixtureDir,{recursive:true,force:true})});
import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import ssh2 from 'ssh2';
import {createAutomaticNodePairing,executePairingSSH} from '../src/automatic-node-pairing.js';import {connectorRelease} from '../src/connector-release.js';
const password='fresh-ssh-password',fp='SHA256:'+crypto.createHash('sha256').update('key').digest('base64').replace(/=+$/,'');
function fixture({heartbeat=true,failedProbe=false,failedInstall=false,interrupted=false,gate,connect}={}){
 const config={url:'https://pve:8006',tokenId:'a@pve!t',tokenSecret:'provider-secret'},hosts=[],calls=[],revoked=[];
 const client=new EventEmitter();client.end=()=>{};client.connect=connect?options=>connect(client,options):o=>{assert.ok(o.hostVerifier(Buffer.from('key')));assert.ok(!o.hostVerifier(Buffer.from('wrong')));queueMicrotask(()=>client.emit('ready'))};
 const service=createAutomaticNodePairing({config:()=>config,query:async path=>{assert.equal(path,'/cluster/status');return [{type:'node',name:'node01',ip:'192.0.2.10'}]},nodes:()=>hosts,origin:()=> 'https://controller.test:6002',ca:()=>'',clientFactory:()=>client,pairing:()=>({code:'internal-code'}),pair:()=>{if(!heartbeat)hosts.push({id:'new-agent',hostname:'node01',kind:'proxmox',online:false});return {id:'new-agent',token:'node-only-token',kind:'proxmox'}},revoke:id=>revoked.push(id),heartbeatTimeout:0,run:async(_c,user,secret,payload)=>{assert.equal(user,'root');assert.equal(secret,password);calls.push({...payload});if(payload.mode==='probe'){if(gate)await gate;if(failedProbe)throw Error('SECRET_RAW_ERROR');return {ready:true,hostname:'node01'}}if(interrupted&&!payload.resume){
 hosts.push({id:'new-agent',hostname:'node01',kind:'proxmox',online:false});
 throw Object.assign(Error('disconnected'),{interrupted:true});
 }if(failedInstall)throw Error('SECRET_RAW_ERROR');if(heartbeat)hosts.push({id:'new-agent',hostname:'node01',kind:'proxmox',online:true,...connectorRelease,lastSeen:new Date(Date.now()+1000).toISOString()});return {installed:true}}});
 const input=async extra=>({...await service.target('node01'),username:'root',password,port:22,fingerprint:fp,confirm:true,verified:true,...extra});return {service,input,config,hosts,calls,revoked};
}
test('automatic node pairing checks identity before registering, installs and requires a fresh heartbeat',async()=>{const f=fixture(),job=await f.service.start(await f.input());await f.service.wait('node01');assert.equal(f.service.status(job.id).state,'completed');assert.deepEqual(f.calls.map(c=>c.mode),['probe','install']);assert.equal(f.calls[0].token,undefined);assert.equal(f.calls[1].token,'node-only-token');assert.ok(!JSON.stringify(f.service.status(job.id)).includes(password));assert.ok(!JSON.stringify(f.service.status(job.id)).includes('node-only-token'));assert.equal((await f.service.target('node01')).job.state,'completed')});
test('consent, identity, connection binding and duplicate pairing are enforced before installation',async()=>{for(const extra of [{confirm:false},{verified:false},{fingerprint:'wrong'},{password:'bad\npassword'},{username:'root;bad'},{host:'wrong'},{port:0},{connectionId:'stale'}]){const f=fixture();await assert.rejects(f.service.start(await f.input(extra)));assert.equal(f.calls.length,0)}const f=fixture();f.hosts.push({kind:'proxmox',hostname:'node01'});await assert.rejects(f.service.start(await f.input()),{status:409});assert.equal(f.calls.length,0)});
test('failed preflight never creates pairing, failed install revokes it and raw errors stay private',async()=>{for(const options of [{failedProbe:true},{failedInstall:true}]){const f=fixture(options),job=await f.service.start(await f.input());await f.service.wait('node01');assert.equal(f.service.status(job.id).state,'failed');assert.equal(f.revoked.length,options.failedInstall?1:0);assert.ok(!JSON.stringify(f.service.status(job.id)).includes('SECRET_RAW_ERROR'))}});
test('missing heartbeat remains unverified and can complete on a late matching heartbeat',async()=>{const f=fixture({heartbeat:false}),job=await f.service.start(await f.input());await f.service.wait('node01');assert.equal(f.service.status(job.id).state,'unverified');f.hosts.push({id:'new-agent',hostname:'node01',kind:'proxmox',online:true,...connectorRelease,lastSeen:new Date(Date.now()+1000).toISOString()});assert.equal(f.service.status(job.id).state,'completed')});
test('node address resolution and controller origin reject missing nodes and insecure controllers',async()=>{const f=fixture();await assert.rejects(f.service.target('other'));await assert.rejects(f.service.target('node;bad'));const bad=createAutomaticNodePairing({config:()=>({}),query:async()=>[{type:'node',name:'node01',ip:'192.0.2.10'}],origin:()=> 'http://controller'});await assert.rejects(bad.target('node01'),{status:409})});
test('real SSH transport keeps credentials and pairing payload out of shell arguments',async()=>{
 const pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048}),key=pair.privateKey.export({type:'pkcs1',format:'pem'}),fingerprint='SHA256:'+crypto.createHash('sha256').update(ssh2.utils.parseKey(key).getPublicSSH()).digest('base64').replace(/=+$/,''),commands=[],connections=[];
 const server=new ssh2.Server({hostKeys:[key]},client=>{connections.push(client);client.on('error',()=>{});client.on('authentication',ctx=>ctx.username==='ubuntu'&&ctx.password===password?ctx.accept():ctx.reject());client.on('ready',()=>client.on('session',accept=>accept().on('exec',(accept,_reject,info)=>{commands.push(info.command);const stream=accept();let input='';stream.on('data',chunk=>input+=chunk);stream.on('end',()=>{const [first,...rest]=input.split('\n');assert.equal(first,password);assert.equal(JSON.parse(rest.slice(1).join('\n')).token,'node-only-token');stream.write(JSON.stringify({installed:true}));stream.exit(0);stream.end()})})));});await new Promise(r=>server.listen(0,'127.0.0.1',r));const client=new ssh2.Client();try{await new Promise((resolve,reject)=>{client.on('ready',resolve);client.on('error',reject);client.connect({host:'127.0.0.1',port:server.address().port,username:'ubuntu',password,hostVerifier:key=>'SHA256:'+crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/,'')===fingerprint})});assert.equal((await executePairingSSH(client,'ubuntu',password,{token:'node-only-token'})).installed,true);assert.ok(commands[0].startsWith("sudo -k -S -p '' /usr/bin/python3 -c "));assert.ok(!commands[0].includes(password));assert.ok(!commands[0].includes('node-only-token'))}finally{client.end();for(const c of connections)c.end();await new Promise(r=>server.close(r))}
});
test('remote Python bootstrap validates node, refuses overwrite, writes protected config and rolls back failure',()=>{const result=spawnSync('python3',[new URL('./automatic-node-pairing.test.py',import.meta.url).pathname],{encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr)});
test('automatic pairing routes enforce owner and HTTPS, clear credentials and return pollable jobs',async()=>{
 process.env.JWT_SECRET||='a'.repeat(64);process.env.JWT_REFRESH_SECRET||='b'.repeat(64);const {createApp}=await import('../src/app.js');let starts=0;const audits=[];const app=createApp({authenticate:(req,res,next)=>{req.user={role:req.headers['x-role']||'viewer',sub:'test'};next()},nodePairing:{target:async()=>({node:'node01'}),status:()=>({id:'job',state:'completed'}),start:async()=>{starts++;return {id:'job',node:'node01',state:'connecting'}}},audit:async(req,...args)=>{assert.equal(req.body.password,'');audits.push(args)}});app.set('trust proxy',1);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api/node-agents/automatic-pairing`;
 try{for(const role of ['viewer','admin','operator'])for(const [method,path] of [['POST',''],['GET','/target?node=node01'],['GET','/job']])assert.equal((await fetch(base+path,{method,headers:{'x-role':role,'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify({password})}:{})})).status,403);
 assert.equal((await fetch(base,{method:'POST',headers:{'x-role':'owner','Content-Type':'application/json'},body:JSON.stringify({password})})).status,400);assert.equal(starts,0);
 const response=await fetch(base,{method:'POST',headers:{'x-role':'owner','Content-Type':'application/json','X-Forwarded-Proto':'https'},body:JSON.stringify({password})});assert.equal(response.status,202);assert.equal(starts,1);assert.ok(!JSON.stringify(audits).includes(password));assert.equal((await fetch(base+'/job',{headers:{'x-role':'owner'}})).headers.get('cache-control'),'no-store');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
});
test('controller CA export copies only the public certificate and clears stale LAN trust for public HTTPS',async()=>{
 const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'iclusters-controller-ca-'));try{
 const key=path.join(dir,'private.key'),cert=path.join(dir,'public.crt');const generated=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=Controller fixture']);assert.equal(generated.status,0);
 fs.mkdirSync(path.join(dir,'bin'));fs.writeFileSync(path.join(dir,'bin/docker'),'#!/bin/sh\ncase "$*" in "compose exec -T caddy cat /data/caddy/pki/authorities/local/root.crt") cat "$PAIR_FIXTURE_CERT";; *) exit 1;; esac\n',{mode:0o755});fs.writeFileSync(path.join(dir,'.env'),'CADDY_TLS=tls internal\n');const command=new URL('../../../deployment/export-controller-ca.sh',import.meta.url).pathname,env={...process.env,PATH:path.join(dir,'bin')+':'+process.env.PATH,PAIR_FIXTURE_CERT:cert};
 const result=spawnSync('sh',[command],{cwd:dir,env,encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr);const exported=path.join(dir,'secrets/ca/controller-ca.pem');assert.deepEqual(fs.readFileSync(exported),fs.readFileSync(cert));assert.ok(!fs.readFileSync(exported,'utf8').includes('PRIVATE KEY'));assert.equal(fs.statSync(exported).mode&0o777,0o644);
 const profile=path.join(dir,'secrets/ca/i-clusters.mobileconfig');assert.match(fs.readFileSync(profile,'utf8'),/com\.apple\.security\.root/);
 fs.writeFileSync(path.join(dir,'.env'),'CADDY_TLS=\n');assert.equal(spawnSync('sh',[command],{cwd:dir,env}).status,0);assert.equal(fs.existsSync(exported),false);assert.equal(fs.existsSync(profile),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('simultaneous automatic installation requests cannot pair the same node twice',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve),f=fixture({gate}),job=await f.service.start(await f.input());
 await assert.rejects(f.service.start(await f.input()),{status:409});release();await f.service.wait('node01');assert.equal(f.service.status(job.id).state,'completed');assert.equal(f.calls.filter(c=>c.mode==='install').length,1);
});
test('Docker pairing resolves guest IP and UUID without using its Proxmox node address',async()=>{
 const {createAutomaticDockerPairing}=await import('../src/automatic-docker-pairing.js');const service=createAutomaticDockerPairing({config:()=>({url:'https://pve',tokenId:'a@pve!t',tokenSecret:'secret'}),origin:()=> 'https://controller',query:async path=>{if(path==='/cluster/resources')return [{node:'node01',vmid:100,type:'qemu',status:'running'}];if(path.endsWith('/config'))return {agent:'1',smbios1:'uuid=selected-uuid',net0:'virtio=AA:BB:CC:DD:EE:FF'};if(path.endsWith('/network-get-interfaces'))return {result:[{'ip-addresses':[{'ip-address':'192.0.2.100'}]}]};throw Error('Unexpected '+path)}});const target=await service.target('node01:qemu/100');assert.equal(target.host,'192.0.2.100');assert.equal(target.identity.uuid,'selected-uuid');assert.equal(target.sshTarget,'vm:node01:100');await assert.rejects(service.target('node01:qemu/999'));
});

test('pairing reports distinct SSH authentication, trust and transport failures without exposing SSH output',async()=>{
 for(const [level,key,expected] of [
  ['client-authentication','key','SSH login failed.'],
  ['handshake','unexpected-key','SSH host key verification failed.'],
  ['client-timeout',null,'SSH could not connect to the selected host.'],
 ]){
  const f=fixture({connect(client,options){
   if(key) options.hostVerifier(Buffer.from(key));
   queueMicrotask(()=>client.emit('error',Object.assign(Error('sensitive SSH output'),{level})));
  }});
  const job=await f.service.start(await f.input());await f.service.wait('node01');
  const status=f.service.status(job.id);
  assert.equal(status.state,'failed');assert.ok(status.message.startsWith(expected));
  assert.ok(!status.message.includes('sensitive SSH output'));assert.equal(f.calls.length,0);
 }
});

test('standalone Docker target works without Proxmox and rejects malformed addresses',async()=>{
 const {createAutomaticDockerPairing}=await import('../src/automatic-docker-pairing.js');
 const service=createAutomaticDockerPairing({config:()=>({}),origin:()=>'https://controller',query:()=>assert.fail('unexpected Proxmox query')});
 for(const address of ['lab.example','192.0.2.11','2001:db8::1']){
  const target=await service.target('standalone:'+address);
  assert.equal(target.host,address);
  assert.deepEqual(target.identity,{standalone:true});
 }
 await assert.rejects(service.target('standalone:host/path'));
});

test('interrupted installation resumes with the original registration and verifies the heartbeat',async()=>{
 const f=fixture({interrupted:true});
 const job=await f.service.start(await f.input());
 await f.service.wait('node01');
 assert.equal(f.service.status(job.id).state,'interrupted');
 assert.deepEqual(f.revoked,[]);
 await assert.rejects(f.service.start(await f.input({resumeJob:job.id,port:2222})));
 await f.service.start(await f.input({resumeJob:job.id}));
 await f.service.wait('node01');
 assert.equal(f.service.status(job.id).state,'completed');
 assert.equal(f.calls.at(-1).resume,true);
 assert.equal(f.calls.at(-1).token,f.calls[1].token);
 f.hosts.length=0;
 assert.equal((await f.service.target('node01')).job,undefined);
 assert.equal(f.service.status(job.id).state,'failed');
});
test('a heartbeat after SSH disconnect completes pairing without another installation',async()=>{
 const f=fixture({interrupted:true}),job=await f.service.start(await f.input());
 await f.service.wait('node01');
 Object.assign(f.hosts[0],connectorRelease,{online:true,lastSeen:new Date(Date.now()+1000).toISOString()});
 assert.equal(f.service.status(job.id).state,'completed');
 assert.equal(f.calls.length,2);
});

test('real SSH disconnect after the host accepts installation preserves its registration',async()=>{
 const privateKey=crypto.generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs1',format:'pem'});
 const fingerprint='SHA256:'+crypto.createHash('sha256').update(ssh2.utils.parseKey(privateKey).getPublicSSH()).digest('base64').replace(/=+$/,'');
 const hosts=[],sessions=[],phases=[];
 const server=new ssh2.Server({hostKeys:[privateKey]},connection=>{
  sessions.push(connection);connection.on('error',()=>{});
  connection.on('authentication',ctx=>ctx.username==='root'&&ctx.password===password?ctx.accept():ctx.reject());
  connection.on('ready',()=>connection.on('session',accept=>accept().on('exec',open=>{
   const stream=open();let input='';
   stream.on('data',chunk=>{input+=chunk});
   stream.on('end',()=>{
    const payload=JSON.parse(input.slice(input.indexOf('\n')+1));phases.push(payload.mode);
    if(payload.mode==='install'){connection.end();return}
    stream.write(JSON.stringify({ready:true,hostname:'node01'}));stream.exit(0);stream.end();
   });
  })));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const service=createAutomaticNodePairing({config:()=>({}),origin:()=>'https://controller.test',resolveTarget:async()=>({host:'127.0.0.1'}),nodes:()=>hosts,
   pairing:()=>({code:'fixture'}),pair:()=>{hosts.push({id:'registered',hostname:'node01'});return {id:'registered',token:'fixture'}},revoke:()=>assert.fail('revoked after disconnect')});
  const input={...await service.target('node01'),port:server.address().port,username:'root',password,verified:true,confirm:true,fingerprint};
  const job=await service.start(input);await service.wait('node01');
  assert.equal(service.status(job.id).state,'interrupted');
  Object.assign(hosts[0],connectorRelease,{online:true,lastSeen:new Date().toISOString()});
  assert.equal(service.status(job.id).state,'completed');assert.deepEqual(phases,['probe','install']);
 }finally{sessions.forEach(connection=>connection.end());await new Promise(resolve=>server.close(resolve))}
});

test('Docker pairing offers VM agent setup only for an agent prerequisite',async()=>{
 const {createAutomaticDockerPairing}=await import('../src/automatic-docker-pairing.js');
 let kind='qemu',status='running',agent='0',failure,interfaces=[];
 const service=createAutomaticDockerPairing({
  config:()=>({}),origin:()=>'https://controller',
  query:async path=>{
   if(path==='/cluster/resources')return [{node:'node02',vmid:200,type:kind,status,name:'Media'}];
   if(path.endsWith('/config'))return {agent,net0:'virtio=12:34:56:78:90:AB'};
   const suffix=kind==='qemu'?'/agent/network-get-interfaces':'/interfaces';
   assert.ok(path.endsWith(suffix));
   if(failure)throw failure;
   return interfaces;
  },
 });
 const vm='node02:qemu/200';
 const first=await service.target(vm);
 assert.deepEqual(first.guestAgentSetup,{node:'node02',vmid:'200',name:'Media'});
 assert.equal(first.host,undefined);
 await assert.rejects(service.start({node:vm,confirm:true,verified:true,username:'root',password:'fixture',port:22,fingerprint:'SHA256:'+'a'.repeat(43),connectionId:first.connectionId}),/Verify QEMU Guest Agent/);
 agent='enabled=1';
 for(const message of ['Proxmox HTTP 500: No QEMU guest agent configured','QEMU guest agent is not running']){
  failure=Object.assign(Error(message),{providerStatus:500});
  assert.deepEqual((await service.target(vm)).guestAgentSetup,first.guestAgentSetup);
 }
 failure=Object.assign(Error('Permission denied'),{providerStatus:403});
 await assert.rejects(service.target(vm),/Permission denied/);
 failure=Object.assign(Error('Proxmox HTTP 500: network unreachable'),{providerStatus:500});
 await assert.rejects(service.target(vm),/network unreachable/);
 failure=null;
 await assert.rejects(service.target(vm),/usable SSH address/);
 status='stopped';
 await assert.rejects(service.target(vm),/running guest/);
 status='running';kind='lxc';agent=undefined;
 await assert.rejects(service.target('node02:lxc/200'),/network interface/);
 interfaces=[{inet:'192.0.2.10/24'}];
 assert.equal((await service.target('node02:lxc/200')).host,'192.0.2.10');
});
