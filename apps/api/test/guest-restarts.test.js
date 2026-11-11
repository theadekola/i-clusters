// Run against a disposable schema. Power commands go only to the fixture provider.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import http from 'node:http';
import pg from 'pg';
import {migrate} from '../src/db.js';
import {createGuestRestarts} from '../src/guest-restarts.js';

const connectionString=process.env.OWNER_SETUP_TEST_DATABASE_URL;
test('durable maintenance restart recovery on PostgreSQL',{skip:!connectionString},async t=>{
  const schema='restart_'+randomUUID().replaceAll('-','');
  const admin=new pg.Pool({connectionString});
  await admin.query('CREATE SCHEMA '+schema);
  const db=new pg.Pool({connectionString,options:'-c search_path='+schema});
  try{
    await migrate(db);
    const users=(await db.query("INSERT INTO users(username,name,password_hash) VALUES ('alice','Alice','fixture'),('bob','Bob','fixture') RETURNING id")).rows;
    const [alice,bob]=users.map(u=>u.id);
    for(const kind of ['vm','lxc'])await t.test(kind+' can resume and safely recover the same guest',async()=>{
      let clock=Date.now(),cluster='one',power='running',taskStatus='running',active=[],audit=true,unreachable=false;
      const writes=[],receipts=[],calls=[];
      const guest=kind==='vm'?'133':'134',type=kind==='vm'?'qemu':'lxc',base='/nodes/n1/'+type+'/'+guest;
      function make(){
        return createGuestRestarts(db,{now:()=>clock,config:()=>({url:cluster,tokenId:'fixture'}),request:async(path,init,c)=>{
          calls.push(path);assert.equal(c.url,cluster);
          if(path==='/cluster/resources')return [{type,node:'n1',vmid:guest}];
          if(path===base+'/status/current')return {status:power};
          if(path===base+'/agent/get-osinfo'){if(unreachable)throw Error('agent unavailable');return {result:{name:'Debian'}}}
          if(path==='/access/permissions?path=%2Fnodes%2Fn1')return {'/nodes/n1':audit?{'Sys.Audit':0}:{}};
          if(path.startsWith('/nodes/n1/tasks?source=active')){assert.ok(path.includes('vmid='+guest));return active}
          if(path.startsWith('/nodes/n1/tasks?source=all'))return [{id:guest,node:'n1',upid:receipts.at(-1)},{id:'999',node:'n1',upid:'other'}];
          if(path.startsWith('/nodes/n1/tasks/'))return {status:taskStatus,exitstatus:taskStatus==='stopped'?'OK':undefined};
          if(init?.method==='POST'&&[base+'/status/reboot',base+'/status/start'].includes(path)){
            writes.push(path);const task='UPID:n1:'+randomUUID();receipts.push(task);return task;
          }
          assert.fail('Unexpected provider request '+path);
        }});
      }
      const api=make(),id=randomUUID();
      const scope=(await api.list(alice)).cluster;
      const body={node:'n1',maintenance:{id,cluster:scope,reason:'setup',name:'fixture '+kind}};
      const submit=()=>api.submit(alice,kind,guest,'reboot',body);
      await Promise.allSettled([submit(),submit()]);
      assert.equal(writes.length,1);
      const accepted=await submit();assert.equal(accepted.task,receipts[0]);assert.equal(writes.length,1);
      // A new service instance represents reopening the browser or controller.
      const reopened=make();
      assert.equal((await reopened.list(alice)).restarts[0].id,id);
      assert.deepEqual((await reopened.list(bob)).restarts,[]);
      await assert.rejects(reopened.status(bob,id),{status:404});
      cluster='two';await assert.rejects(reopened.status(alice,id),{status:404});cluster='one';
      power='stopped';assert.equal((await reopened.status(alice,id)).phase,'monitoring');
      taskStatus='stopped';assert.equal((await reopened.status(alice,id)).phase,'booting');
      clock+=31000;
      active=[{id:guest,status:'RUNNING'}];assert.equal((await reopened.status(alice,id)).phase,'booting');
      active=[];audit=false;assert.match((await reopened.status(alice,id)).readError,/visibility/);
      audit=true;assert.equal((await reopened.status(alice,id)).phase,'recoverable');
      const recover=()=>reopened.submit(alice,kind,guest,'start',{node:'n1',maintenance:{...body.maintenance,previousTask:accepted.task}});
      active=[{id:guest,status:'RUNNING'}];await assert.rejects(recover);assert.equal(writes.length,1);
      active=[];power='running';await assert.rejects(recover);assert.equal(writes.length,1);
      // Use a fresh stopped attempt for the race after the external start above.
      const id2=randomUUID(),body2={node:'n1',maintenance:{...body.maintenance,id:id2}};
      const second=await api.submit(alice,kind,guest,'reboot',body2);
      power='stopped';await api.status(alice,id2);clock+=31000;
      const start=()=>api.submit(alice,kind,guest,'start',{node:'n1',maintenance:{...body2.maintenance,previousTask:second.task}});
      await Promise.allSettled([start(),start()]);
      assert.deepEqual(writes,[base+'/status/reboot',base+'/status/reboot',base+'/status/start']);
      assert.equal((await start()).task,receipts[2]);
      power='running';unreachable=kind==='vm';
      if(unreachable){const pending=await api.status(alice,id2);assert.equal(pending.phase,'verifying');assert.equal(pending.power,'running');assert.match(pending.readError,/agent unavailable/);unreachable=false}
      assert.equal((await api.status(alice,id2)).phase,'complete');
      const history=await api.history(alice,id2,24);assert.deepEqual(history.tasks.map(t=>t.upid),[receipts[2]]);
      assert.equal(calls.includes(base+'/agent/get-osinfo'),kind==='vm');
      await api.dismiss(alice,id2);assert.ok(!(await api.list(alice)).restarts.some(r=>r.id===id2));
    });
    await t.test('HTTP routes preserve SSH approval and resume a lost browser receipt from the correct account',async()=>{
      // A real controller and PostgreSQL talk to a disposable HTTP provider.
      const envKeys=['PROXMOX_URL','PROXMOX_TOKEN_ID','PROXMOX_TOKEN_SECRET','JWT_SECRET','JWT_REFRESH_SECRET'];
      const previous=envKeys.map(key=>process.env[key]);
      const writes=[];
      let live,taskRunning=true;
      const provider=http.createServer((req,res)=>{
        const path=req.url.replace('/api2/json','');
        let data;
        if(path==='/cluster/resources')data=[{type:'lxc',node:'pve',vmid:199}];
        else if(path==='/nodes/pve/lxc/199/status/current')data={status:'running'};
        else if(path==='/nodes/pve/lxc/199/status/reboot'&&req.method==='POST'){writes.push(path);data='UPID:pve:vzreboot:199'}
        else if(path==='/nodes/pve/tasks/UPID%3Apve%3Avzreboot%3A199/status')data=taskRunning?{status:'running'}:{status:'stopped',exitstatus:'OK'};
        else if(path.startsWith('/nodes/pve/tasks?source=all&vmid=199'))data=[{node:'pve',id:'199',upid:'UPID:pve:vzreboot:199'}];
        else res.statusCode=404;
        res.setHeader('content-type','application/json');res.end(JSON.stringify({data}));
      });
      await new Promise(r=>provider.listen(0,'127.0.0.1',r));
      try{
        Object.assign(process.env,{PROXMOX_URL:'http://127.0.0.1:'+provider.address().port,PROXMOX_TOKEN_ID:'fixture@pve!fixture',PROXMOX_TOKEN_SECRET:'fixture',JWT_SECRET:'t'.repeat(64),JWT_REFRESH_SECRET:'r'.repeat(64)});
        const {createApp}=await import('../src/app.js'),{issueGrant}=await import('../src/ssh-access.js');
        const app=createApp({db,authenticate:(req,res,next)=>{req.user={sub:req.get('x-account')||alice,role:req.get('x-role')||'operator'};next()},audit:async()=>{},monitor:{invalidate(){}}});
        await new Promise(r=>{live=app.listen(0,'127.0.0.1',r)});
        const call=async(path,options={})=>fetch('http://127.0.0.1:'+live.address().port+'/api'+path,options);
        const list='/maintenance/restarts',endpoint='/actions/proxmox/lxc/199/reboot',id=randomUUID();
        const scope=(await (await call(list)).json()).cluster;
        const body={node:'pve',maintenance:{cluster:scope,id,name:'fixture CT',reason:'update'}};
        const post={method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)};
        const challenge=await call(endpoint,post);assert.equal(challenge.status,409);
        post.headers['x-iclusters-confirm']=(await challenge.json()).confirmationPhrase;
        assert.equal((await call(endpoint,post)).status,428);assert.deepEqual(writes,[]);
        post.headers['x-iclusters-ssh-grant']=issueGrant(alice,'POST',endpoint,body,'node:pve');
        const accepted=await call(endpoint,post);assert.equal(accepted.status,200);
        await accepted.arrayBuffer(); // discard the response as a disconnected browser would
        assert.equal((await call(list,{headers:{'x-role':'viewer'}})).status,403);
        assert.equal((await call(list+'/'+id,{headers:{'x-account':bob}})).status,404);
        assert.equal((await (await call(list)).json()).restarts[0].id,id);
        assert.equal((await (await call(list+'/'+id)).json()).phase,'monitoring');
        taskRunning=false;assert.equal((await (await call(list+'/'+id)).json()).phase,'complete');
        const history=await (await call(list+'/'+id+'/history')).json();assert.equal(history.tasks[0].id,'199');
        assert.equal(writes.length,1);
      }finally{
        if(live)await new Promise(r=>live.close(r));
        await new Promise(r=>provider.close(r));
        envKeys.forEach((key,i)=>{if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i]});
      }
    });
    await t.test('a missing provider receipt survives reopening and cannot replay power',async()=>{
      let active=[],posts=0,clock=Date.now();
      const deps={now:()=>clock,config:()=>({url:'test',tokenId:'fixture'}),request:async path=>{
        if(path==='/cluster/resources')return [{node:'n',vmid:'111',type:'qemu'}];
        if(path.endsWith('/current'))return {status:'running'};
        if(path.endsWith('/reboot')){posts++;throw Error('response lost')}
        if(path.startsWith('/access/'))return {'/nodes/n':{'Sys.Audit':1}};
        if(path.includes('source=active'))return active;
        assert.fail(path);
      }};
      const api=createGuestRestarts(db,deps),id=randomUUID(),cluster=(await api.list(alice)).cluster;
      const body={node:'n',maintenance:{cluster,id,reason:'update',name:'guest'}};
      assert.equal((await api.submit(alice,'vm','111','reboot',body)).phase,'unknown');
      const reopened=createGuestRestarts(db,deps);
      assert.equal((await reopened.status(alice,id)).phase,'unknown');
      await reopened.submit(alice,'vm','111','reboot',body);assert.equal(posts,1);
      active=[{id:'111',status:'RUNNING'}];await assert.rejects(reopened.dismiss(alice,id));
      active=[];await reopened.dismiss(alice,id);assert.equal((await reopened.status(alice,id)).phase,'reviewed');
      await reopened.submit(alice,'vm','111','reboot',body);assert.equal(posts,1);
    });
  }finally{await db.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end()}
});
