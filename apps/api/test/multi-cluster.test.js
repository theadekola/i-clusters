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
import {WebSocketServer} from 'ws';

const database=process.env.OWNER_SETUP_TEST_DATABASE_URL;
const privileges=['Sys.Audit','VM.Audit','VM.Allocate','VM.PowerMgmt','VM.Config.CPU','VM.Config.Memory','VM.Config.Disk','VM.Config.Network','VM.Config.Options','Datastore.Audit','Datastore.AllocateSpace'];
async function listen(server){
  await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
  return server.address().port;
}
async function provider(name,tls){
  const writes=[],secret=randomBytes(16).toString('hex');
  const fixture={writes,finished:false,nodeStatus:'online'};
  const cpu=name==='Home'?0.2:0.6;
  const vm={node:'node01',vmid:100,name:name+'-VM',status:'running',cpu,mem:1024**3,maxmem:2*1024**3};
  const ct={...vm,vmid:101,name:name+'-CT'};
  const disk={node:'node01',storage:name+'-pool',type:'dir',active:1,enabled:1,total:100*1024**3,used:25*1024**3,avail:75*1024**3,content:'backup,images'};
  const archive={volid:disk.storage+':backup/vzdump-qemu-100-2026_01_01-12_00_00.vma.zst',vmid:100,size:1024**3,content:'backup',ctime:Math.floor(Date.now()/1000)};
  const task={node:'node01',upid:'UPID:node01:00000001:00000001:00000001:vzdump:100:root@pam:',type:'vzdump',id:'100',status:'OK',starttime:Math.floor(Date.now()/1000)-60,endtime:Math.floor(Date.now()/1000)-30,user:name+'@pve'};
  const server=https.createServer(tls,(req,res)=>{
    const url=new URL(req.url,'https://fixture'),route=url.pathname.replace('/api2/json','');
    let data;
    if(!url.pathname.startsWith('/api2/json/')){
      if(req.method!=='GET'){res.writeHead(405);res.end();return}
      if(route==='/info')data={Name:name+'-engine',ServerVersion:'27.0.0',ID:'shared-engine',NCPU:2,MemTotal:4*1024**3};
      else if(route==='/containers/json')data=[{Id:'a'.repeat(64),Names:['/'+name+'-container'],Image:'fixture:1',State:'running',Status:'Up',Ports:[],Labels:{}}];
      else if(route==='/volumes')data={Volumes:[{Name:name+'-volume',Driver:'local'}]};
      else if(route==='/system/df')data={Images:[],Containers:[],Volumes:[]};
      else if(route.endsWith('/stats'))data={};
      else data=[];
      res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));return;
    }
    if(req.headers.authorization!=='PVEAPIToken=fixture@pve!hub='+secret){res.writeHead(401);res.end();return}
    if(req.method==='POST'){writes.push(route);data='UPID:fixture-'+name}
    else if(route==='/cluster/resources')data=[{node:'node01',type:'node',status:fixture.nodeStatus},{...vm,type:'qemu',id:'qemu/100'},{...ct,type:'lxc',id:'lxc/101'}];
    else if(route==='/nodes'||route==='/cluster/status'){
      data=[{name:'node01',node:'node01',type:'node',ip:'127.0.0.1',status:fixture.nodeStatus,local:1}];
      if(route==='/cluster/status'&&name==='Office')data.unshift({type:'cluster',name:'Office-membership',quorate:1});
    }
    else if(route==='/nodes/node01/qemu')data=[vm];
    else if(route==='/nodes/node01/lxc')data=[ct];
    else if(route==='/nodes/node01/status')data={cpu,cpuinfo:{cpus:4},memory:{used:2*1024**3,total:4*1024**3},uptime:3600};
    else if(route==='/storage'||route==='/nodes/node01/storage')data=[disk];
    else if(route.endsWith('/content'))data=[archive];
    else if(route==='/cluster/backup')data=[{id:name+'-job',node:'node01',storage:disk.storage,enabled:1,schedule:'daily',vmid:'100'}];
    else if(route==='/nodes/node01/tasks'||route==='/cluster/tasks')data=url.searchParams.has('source')&&url.searchParams.get('source')==='active'?[]:[task];
    else if(route==='/access/permissions')data={[url.searchParams.get('path')]:Object.fromEntries(privileges.map(p=>[p,1]))};
    else if(route==='/nodes/node01/qemu/100/config'&&url.searchParams.get('current')==='1')data={scsi0:disk.storage+':vm-100-disk-0,size=12G',scsi1:`/dev/disk/by-id/${name}-drive,size=${name==='Office'?512:128}G`,ide2:'none,media=cdrom'};
    else if(route.endsWith('/status/current')||route.endsWith('/config'))data=route.includes('/lxc/')?ct:vm;
    else if(route.includes('/tasks/')&&route.endsWith('/status'))data=fixture.finished?{status:'stopped',exitstatus:'OK'}:{status:'running'};
    else data=[];
    res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({data}));
  });
  const poolName=name+'-tank',properties={used:{parsed:1024**3},available:{parsed:3*1024**3}};
  const nas=new WebSocketServer({server,path:'/api/current'});
  nas.on('connection',socket=>{
    let authenticated=false;
    socket.on('message',raw=>{
      const {id,method,params}=JSON.parse(raw);
      const inventory={
        'system.info':{hostname:name+'-nas',version:'TrueNAS fixture'},
        'pool.query':[{id:1,name:poolName,status:'ONLINE'}],
        'pool.dataset.query':[{id:poolName,name:poolName,type:'FILESYSTEM',...properties},{id:poolName+'/data',name:poolName+'/data',type:'FILESYSTEM',...properties}],
        'pool.snapshot.query':[{id:poolName+'/data@fixture',properties:{}}],
        'disk.query':[{name:'sda',identifier:'shared-disk',serial:name+'-disk',size:1024**3}],
        'sharing.smb.query':[{id:1,name:name+'-share',path:'/mnt/'+poolName+'/data',enabled:true}]
      };
      if(method==='auth.login_with_api_key')authenticated=params[0]===secret;
      const result=method==='auth.login_with_api_key'?authenticated:inventory[method]??[];
      socket.send(JSON.stringify(authenticated?{jsonrpc:'2.0',id,result}:{jsonrpc:'2.0',id,error:{code:-32001,message:'Fixture credentials rejected'}}));
    });
  });
  const port=await listen(server);
  return Object.assign(fixture,{server,config:{name,host:'127.0.0.1',port,tokenId:'fixture@pve!hub',tokenSecret:secret,verifyTls:false}});
}

test('two independent clusters isolate duplicate guest IDs, approvals and in-flight restarts across reloads',{skip:!database,timeout:process.env.ICLUSTERS_AUDIT_WEB?1200000:90000},async t=>{
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
    client.on('ready',()=>client.on('session',acceptSession=>{
      const session=acceptSession();
      session.on('pty',accept=>accept());
      session.on('shell',accept=>{const channel=accept();channel.on('data',data=>channel.write(data))});
      session.on('sftp',accept=>{
        const sftp=accept();
        sftp.on('LSTAT',(id,file)=>file==='/fixture.txt'?sftp.attrs(id,{mode:0o100600,size:42}):sftp.status(id,2));
      });
      session.on('exec',(accept,reject,info)=>{
      if(info.command!=='/usr/bin/id -u')return reject();
      const stream=accept();stream.write('0\n');stream.exit(0);stream.end();
      });
    }));
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
  office.nodeStatus='offline';
  const profiles=(await api('/cluster-profiles',{token:viewer})).clusters;
  assert.deepEqual(profiles.map(p=>p.id),['default',profile.id]);
  assert.deepEqual(profiles.map(p=>p.status),['online','offline']);
  office.nodeStatus='online';
  for(const item of profiles)assert.deepEqual(Object.keys(item).sort(),['configured','endpoint','id','name','status']);
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
  // Assign two independent Engine endpoints with identical container IDs.
  for(const [prefix,fixture,name] of [['',home,'Home'],[scope,office,'Office']]){
    await api(prefix+'/connections/docker',{token:owner,method:'PUT',body:{url:'https://localhost:'+fixture.config.port,ca:tls.cert.toString(),cert:tls.cert.toString(),key:tls.key.toString()}});
    await api(prefix+'/configuration/truenas',{token:owner,method:'PUT',body:{
      TRUENAS_URL:'https://localhost:'+fixture.config.port,TRUENAS_API_KEY:fixture.config.tokenSecret,
      TRUENAS_API_MODE:'current',TRUENAS_VERIFY_TLS:'true',TRUENAS_CA_PEM:tls.cert.toString()
    }});
    const datasets=await api(prefix+'/storage/datasets',{token:owner});
    assert.ok(JSON.stringify(datasets).includes(name+'-tank/data'));
    const attached=datasets.resources.filter(r=>r.type==='VM host disk');
    assert.equal(attached.length,1);assert.equal(attached[0].resourceId,'/dev/disk/by-id/'+name+'-drive');
    assert.equal(attached[0].size,(name==='Office'?512:128)*1024**3);assert.equal(attached[0].used,null);
    const shares=await api(prefix+'/storage/shares',{token:owner});
    assert.ok(JSON.stringify(shares).includes(name+'-share'));
    const inventory=await api(prefix+'/proxmox?refresh=1',{token:owner});
    assert.equal(inventory.vms[0].id,'100');assert.equal(inventory.vms[0].name,name+'-VM');
    assert.equal(inventory.vms[0].attachedDisks.find(d=>d.kind==='host').size,attached[0].size);
    assert.equal(inventory.lxc[0].name,name+'-CT');
    assert.equal(inventory.nodes[0].cpu,name==='Home'?20:60);
    assert.equal(inventory.clusterStatus.find(row=>row.type==='cluster')?.name,name==='Office'?'Office-membership':undefined);
    assert.equal(inventory.storage[0].name,name+'-pool');
    const engine=await api(prefix+'/docker?refresh=1',{token:owner});
    assert.equal(engine.containers[0].name,name+'-container');
    const jobs=await api(prefix+'/backups/jobs',{token:owner});
    assert.ok(JSON.stringify(jobs).includes(name+'-job'));
  }
  for(const [prefix,name] of [['','Home'],[scope,'Office']]){
    await api(prefix+'/alerts/rules',{token:owner,body:{name:name+'-rule',metric:'cpu',provider:'proxmox',threshold:95}});
    await api(prefix+'/settings',{token:owner,method:'PUT',body:{siteName:name+'-controller',description:'Disposable test',refresh:30}});
  }
  for(const [prefix,name,other] of [['','Home','Office'],[scope,'Office','Home']]){
    assert.deepEqual((await api(prefix+'/alerts',{token:owner})).rules.map(r=>r.name),[name+'-rule']);
    assert.equal((await api(prefix+'/settings',{token:owner})).settings.siteName,name+'-controller');
    const audit=await api(prefix+'/audit',{token:owner});
    assert.ok(JSON.stringify(audit.logs).includes(name+'-rule'));
    assert.ok(!JSON.stringify(audit.logs).includes(other+'-rule'));
    const tasks=await api(prefix+'/proxmox/tasks',{token:owner});
    assert.ok(tasks.tasks.some(task=>task.user===name+'@pve'));
  }
  const updateFile=path.join(dir,'update-status.json');
  await fs.writeFile(updateFile,JSON.stringify({checkedAt:new Date().toISOString(),state:'ready',available:true}));
  for(const prefix of ['',scope]){
    const notices=await api(prefix+'/header-notifications',{token:owner});
    assert.ok(notices.attention.some(row=>row.id==='software-update'),'Controller update must be visible in every profile');
  }
  await fs.unlink(updateFile);
  const history=prefix=>api(prefix+'/maintenance/restarts',{token:owner});
  const homeScope=(await history('')).cluster,officeScope=(await history(scope)).cluster;
  assert.notEqual(homeScope,officeScope);
  const action='/actions/proxmox/vm/100/reboot',id=randomUUID();
  const body={node:'node01',maintenance:{name:'Office-VM',reason:'update',id,cluster:officeScope}};
  const challenge=await api(scope+action,{token:owner,body,status:409});
  const target={target:challenge.sshTarget,path:action,method:'POST',body,port:sshPort};
  const {host,fingerprint}=await api(scope+'/ssh/fingerprint',{token:owner,body:{...target,action:true}});
  for(const mode of ['shell','sftp']){
    const session=await api(scope+'/ssh/connect',{token:owner,body:{target:target.target,host,port:sshPort,fingerprint,mode,username:'root',password}});
    const path='/ssh/session/'+session.id;
    if(mode==='sftp'){
      const body={action:'stat',path:'/fixture.txt'};
      assert.equal((await api(scope+'/ssh/sftp/'+session.id,{token:owner,body})).size,42);
      await api('/ssh/sftp/'+session.id,{token:owner,body,status:404});
    }else{
      await api(scope+path,{token:owner,body:{input:'Office terminal'}});
      let output='';
      for(let i=0;i<25&&!output.includes('Office terminal');i++){
        output+=(await api(scope+path,{token:owner})).output;await delay(20);
      }
      assert.ok(output.includes('Office terminal'));await api(path,{token:owner,status:404});
    }
    await api(scope+path,{token:owner,method:'DELETE'});
  }
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
  if(process.env.ICLUSTERS_AUDIT_WEB==='1'){
    const {auditClusterReports}=await import('../../web/scripts/audit-cluster-reports.mjs');
    await auditClusterReports({base,owner,profile:profile.id,tls});
  }
  const probe='/cluster-profiles/'+profile.id+'/health';
  office.nodeStatus='offline';
  assert.deepEqual(await api(probe,{token:owner}),{id:profile.id,status:'offline'});
  await api(scope+'/connections/proxmox',{method:'DELETE',token:owner,status:403});
  assert.equal((await config(scope)).port,office.config.port);
  await api(scope+'/connections/proxmox',{method:'DELETE',token:owner,body:{password}});
  await api(scope+'/connections/proxmox',{token:owner,status:404});
  assert.equal((await config('')).port,home.config.port);
  const restored=await api('/cluster-profiles',{token:owner,body:office.config,status:201});
  assert.equal(restored.profile.id,profile.id,'Reconnecting restores the original workspace');
  assert.equal((await api(scope+'/maintenance/restarts/'+id,{token:owner})).phase,'complete');
  assert.deepEqual(home.writes,[]);
});
