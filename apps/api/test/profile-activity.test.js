import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const connection=process.env.OWNER_SETUP_TEST_DATABASE_URL;
test('profile rename and picture persist, sign-ins keep their owner, and activity respects the current account and cluster',{skip:!connection},async()=>{
  const schema='profile_'+randomUUID().replaceAll('-','');
  const temp=await mkdtemp(path.join(tmpdir(),'profile-test-'));
  const db=new pg.Pool({connectionString:connection}),url=new URL(connection);
  url.searchParams.set('options','-c search_path='+schema);
  Object.assign(process.env,{DATABASE_URL:url.toString(),JWT_SECRET:randomBytes(48).toString('hex'),JWT_REFRESH_SECRET:randomBytes(48).toString('hex'),DATA_DIR:temp});
  const {migrate,pool}=await import('../src/db.js');
  const {createApp}=await import('../src/app.js');
  let server;
  try{
    await db.query('CREATE SCHEMA '+schema);await migrate(pool);
    const password='test-profile-fixture-password',hash=await bcrypt.hash(password,4);
    const add=async name=>(await pool.query("INSERT INTO users(username,name,password_hash,role) VALUES($1,$1,$2,'auditor') RETURNING id",[name,hash])).rows[0].id;
    const id=await add('original'),other=await add('other');
    const app=createApp({profiles:null});
    server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance))});
    async function call(method,route,body,token,status=200){
      const res=await fetch('http://127.0.0.1:'+server.address().port+'/api'+route,{method,headers:{'Content-Type':'application/json','User-Agent':'test-browser',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
      const result=await res.json();assert.equal(res.status,status,JSON.stringify(result));return result;
    }
    const {accessToken:token}=await call('POST','/auth/login',{username:'original',password});
    const form={name:'New name',contactEmail:'person@example.test',timeZone:'Europe/London',bio:'Test',username:'ReNamed',revision:'',picturePixels:Buffer.alloc(128*128*4,170).toString('base64')};
    const saved=await call('PUT','/account/profile',form,token);
    assert.equal(saved.username,'renamed');assert.ok(saved.profile.pictureVersion);
    await call('PUT','/account/profile',{...form,name:'Stale'},token,409);
    await call('PUT','/account/profile',{...form,revision:saved.profile.revision,username:'other'},token,409);
    const me=await call('GET','/auth/me',null,token);assert.equal(me.user.username,'renamed');
    const pic=await call('GET','/account/profile-picture/'+id,null,token);assert.match(pic.image,/^data:image\/png;base64,iVBOR/);
    const next=await call('PUT','/account/profile',{name:'Legacy edit',contactEmail:'',timeZone:'UTC',bio:''},token);
    assert.equal(next.profile.pictureVersion,saved.profile.pictureVersion);assert.equal(next.username,'renamed');
    await call('POST','/auth/login',{username:'original',password},null,401);
    const signed=await call('POST','/auth/login',{username:'renamed',password});
    const otherLogin=await call('POST','/auth/login',{username:'other',password});
    await call('GET','/account/profile-picture/'+id,null,otherLogin.accessToken,403);
    await pool.query("INSERT INTO audit_logs(user_id,action,resource,status,cluster_id,created_at) VALUES($1,'storage.read','disk','success','default',NOW()-INTERVAL '9 days'),($1,'wrong.cluster','hidden','success','secondary',NOW())",[id]);
    const report=await call('GET','/audit?accountId='+id,null,signed.accessToken);
    assert.equal(report.summary.signin.current,2);assert.equal(report.summary.infrastructure.previous,1);
    assert.equal(report.logins.filter(row=>row.current).length,1);assert.equal(report.logins.length,2);
    assert.ok(report.logins.every(row=>row.device==='test-browser'&&row.ip&&!row.tag));
    assert.ok(report.logs.every(r=>r.action!=='wrong.cluster'));
    assert.deepEqual((await call('GET','/audit?accountId='+other,null,token)).logs.map(r=>r.action),['auth.login']);
  }finally{
    if(server)await new Promise(r=>server.close(r));await pool.end();
    await db.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await db.end();await rm(temp,{recursive:true,force:true});
  }
});
