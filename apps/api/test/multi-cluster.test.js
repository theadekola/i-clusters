import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID,generateKeyPairSync} from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import ssh2 from 'ssh2';

const database=process.env.OWNER_SETUP_TEST_DATABASE_URL;
const privileges=['Sys.Audit','VM.Audit','VM.Allocate','VM.PowerMgmt','VM.Config.CPU','VM.Config.Memory','VM.Config.Disk','VM.Config.Network','VM.Config.Options','Datastore.Audit','Datastore.AllocateSpace'];
async function listen(server){
  await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
  return server.address().port;
}
async function provider(name,tls){
  const writes=[],secret=randomBytes(16).toString('hex');
  const fixture={writes,finished:false};
  const server=https.createServer(tls,(req,res)=>{
    const url=new URL(req.url,'https://fixture'),route=url.pathname.replace('/api2/json','');
    let data;
    if(req.headers.authorization!=='PVEAPIToken=fixture@pve!hub='+secret){res.writeHead(401);res.end();return}
    if(req.method==='POST'){writes.push(route);data='UPID:fixture-'+name}
    else if(route==='/cluster/resources')data=[{node:'node01',type:'node',status:'online'},{node:'node01',type:'qemu',id:'qemu/100',vmid:100,name:name+'-VM',status:'running'}];
    else if(route==='/nodes'||route==='/cluster/status')data=[{name:'node01',node:'node01',type:'node',ip:'127.0.0.1',status:'online'}];
    else if(route==='/access/permissions')data={[url.searchParams.get('path')]:Object.fromEntries(privileges.map(p=>[p,1]))};
    else if(route.endsWith('/status/current'))data={status:'running',name:name+'-VM'};
    else if(route.includes('/tasks/')&&route.endsWith('/status'))data=fixture.finished?{status:'stopped',exitstatus:'OK'}:{status:'running'};
    else data=[];
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({data}));
  });
  const port=await listen(server);
  return Object.assign(fixture,{server,config:{name,host:'127.0.0.1',port,tokenId:'fixture@pve!hub',tokenSecret:secret,verifyTls:false}});
}

test('two independent clusters isolate duplicate guest IDs, approvals and in-flight restarts across reloads',{skip:!database,timeout:90000},async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'iclusters-profiles-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const schema='profiles_'+randomUUID().replaceAll('-',''),admin=new pg.Pool({connectionString:database});
  await admin.query('CREATE SCHEMA '+schema);
  const databaseUrl=new URL(database);databaseUrl.searchParams.set('options','-c search_path='+schema);
  const db=new pg.Pool({connectionString:databaseUrl.href});
  t.after(async()=>{await db.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end()});

  let tlsDir=process.env.ICLUSTERS_TEST_TLS_DIR;
  if(!tlsDir){
    tlsDir=dir;
    execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=localhost','-keyout',path.join(dir,'key.pem'),'-out',path.join(dir,'cert.pem')],{stdio:'ignore'});
  }
  const tls={key:await fs.readFile(path.join(tlsDir,'key.pem')),cert:await fs.readFile(path.join(tlsDir,'cert.pem'))};
  const home=await provider('Home',tls),office=await provider('Office',tls);
  t.after(()=>{for(const {server} of [home,office]){server.closeAllConnections();server.close()}});
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048}),password=randomBytes(20).toString('hex');
  const ssh=new ssh2.Server({hostKeys:[privateKey.export({format:'pem',type:'pkcs1'})]},client=>{
    client.on('error',()=>{});
    client.on('authentication',ctx=>ctx.method==='password'&&ctx.username==='root'&&ctx.password===password?ctx.accept():ctx.reject());
    client.on('ready',()=>client.on('session',accept=>accept().on('exec',(accept,reject,info)=>{
      if(info.command!=='/usr/bin/id -u')return reject();
      const stream=accept();stream.write('0\n');stream.exit(0);stream.end();
    })));
  });
  const sshPort=await listen(ssh);t.after(()=>ssh.close());
  const placeholder=net.createServer(),port=await listen(placeholder);await new Promise(r=>placeholder.close(r));
  const base='http://127.0.0.1:'+port,env={PATH:process.env.PATH,NODE_ENV:'test',DATABASE_URL:databaseUrl.href,DATA_DIR:dir,PORT:String(port),
    JWT_SECRET:randomBytes(32).toString('hex'),JWT_REFRESH_SECRET:randomBytes(32).toString('hex'),ICLUSTERS_USAGE_REPORTING:'off',
    PROXMOX_URL:'https://127.0.0.1:'+home.config.port,PROXMOX_TOKEN_ID:home.config.tokenId,PROXMOX_TOKEN_SECRET:home.config.tokenSecret,PROXMOX_VERIFY_TLS:'false'};
  let child,logs='';
  async function start(){
    child=spawn(process.execPath,[fileURLToPath(new URL('../src/server.js',import.meta.url))],{env,stdio:['ignore','pipe','pipe']});
    for(const pipe of [child.stdout,child.stderr])pipe.on('data',chunk=>{logs=(logs+chunk).slice(-3500)});
    for(let i=0;i<150;i++){
      if(child.exitCode!==null)throw Error(logs);
      try{if((await fetch(base+'/api/health')).ok)return}catch{}
      await delay(80);
    }
    throw Error('Controller start timed out. '+logs);
  }
  async function stop(){if(child&&child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill();await exited}}
  t.after(stop);
  await start();
  const hash=await bcrypt.hash(password,4);
  for(const role of ['owner','viewer'])await db.query('INSERT INTO users(username,email,name,role,password_hash) VALUES($1,$2,$1,$1,$3)',[role,role+'@example.test',hash]);
  async function api(route,{token,body,method=body?'POST':'GET',headers={},status=200}={}){
    const res=await fetch(base+'/api'+route,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
    const json=await res.json();
    assert.equal(res.status,status,route+' '+JSON.stringify(json));return json;
  }
  const login=async username=>(await api('/auth/login',{body:{username,password}})).accessToken;
  const owner=await login('owner'),viewer=await login('viewer');
  await api('/cluster-profiles',{status:401});
  await api('/cluster-profiles',{token:viewer,body:office.config,status:403});
  const {profile}=await api('/cluster-profiles',{token:owner,body:office.config,status:201});
  const scope='/cluster-profiles/'+profile.id+'/api';
  const profiles=(await api('/cluster-profiles',{token:viewer})).clusters;
  assert.deepEqual(profiles.map(p=>p.id),['default',profile.id]);
  for(const item of profiles)assert.deepEqual(Object.keys(item).sort(),['configured','endpoint','id','name']);
  assert.ok(!(await fs.readFile(path.join(dir,'clusters',profile.id,'proxmox-connection.json'),'utf8')).includes(office.config.tokenSecret));
  await api('/cluster-profiles',{token:owner,body:office.config,status:409});
  await api('/cluster-profiles/'+randomUUID()+'/api/connections/proxmox',{token:owner,status:404});
  await api(scope+'/auth/me',{token:owner,status:404});
  await api(scope+'/connections/proxmox',{token:viewer,status:403});
  const config=async prefix=>(await api(prefix+'/connections/proxmox',{token:owner})).cluster;
  assert.equal((await config('')).port,home.config.port);
  assert.equal((await config(scope)).port,office.config.port);
  const pairing=await api(scope+'/node-agents/pairing',{token:owner,body:{kind:'proxmox',name:'node01'}});
  const join={code:pairing.code,name:'node01',kind:'proxmox'};
  await api('/node-agent/pair',{body:join,status:401});
  const paired=await api(scope+'/node-agent/pair',{body:join});
  await api('/node-agent/setup-script',{token:paired.token,body:{},status:401});
  assert.equal((await api(scope+'/node-agents',{token:owner})).nodes.length,1);
  assert.deepEqual((await api('/node-agents',{token:owner})).nodes,[]);
  const history=prefix=>api(prefix+'/maintenance/restarts',{token:owner});
  const homeScope=(await history('')).cluster,officeScope=(await history(scope)).cluster;
  assert.notEqual(homeScope,officeScope);
  const action='/actions/proxmox/vm/100/reboot',id=randomUUID();
  const body={node:'node01',maintenance:{name:'Office-VM',reason:'update',id,cluster:officeScope}};
  const challenge=await api(scope+action,{token:owner,body,status:409});
  const target={target:challenge.sshTarget,path:action,method:'POST',body,port:sshPort};
  const {host,fingerprint}=await api(scope+'/ssh/fingerprint',{token:owner,body:{...target,action:true}});
  const grant=await api(scope+'/ssh/connect',{token:owner,body:{...target,mode:'authorize',host,fingerprint,username:'root',password}});
  const headers={'x-iclusters-confirm':challenge.confirmationPhrase,'x-iclusters-ssh-grant':grant.token};
  await api(action,{token:owner,headers,body,status:428});
  const queued=await api(scope+action,{token:owner,headers,body});
  assert.equal(queued.result.restart.phase,'monitoring');
  assert.deepEqual((await history('')).restarts,[]);
  assert.deepEqual(home.writes,[]);
  assert.deepEqual(office.writes,['/nodes/node01/qemu/100/status/reboot']);
  office.finished=true;
  await stop();await start();
  assert.equal((await config(scope)).name,'Office');
  const receipt=await api(scope+'/maintenance/restarts/'+id,{token:owner});
  assert.equal(receipt.phase,'complete');
  await api('/maintenance/restarts/'+id,{token:owner,status:404});
  await api(scope+'/connections/proxmox',{method:'DELETE',token:owner});
  await api(scope+'/connections/proxmox',{token:owner,status:404});
  assert.equal((await config('')).port,home.config.port);
  const restored=await api('/cluster-profiles',{token:owner,body:office.config,status:201});
  assert.equal(restored.profile.id,profile.id,'Reconnecting restores the original workspace');
  assert.equal((await api(scope+'/maintenance/restarts/'+id,{token:owner})).phase,'complete');
  assert.deepEqual(home.writes,[]);
});
