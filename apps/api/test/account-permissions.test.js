import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import pg from 'pg';
import {capabilities,validKeys,permits,permittedInventory} from '../src/permission-policy.js';

test('permissions narrow built-in roles, alternate action routes and inventory',()=>{
  const keys=['vm.view','vm.manage'];
  assert.equal(validKeys(['vm.create'],capabilities('operator')),false);
  assert.equal(validKeys(['users.create','users.view'],capabilities('viewer')),false);
  assert.equal(permits(keys,'POST','/actions/proxmox/vm/102/start'),true);
  assert.equal(permits(['network.view','network.delete'],'DELETE','/docker/network/test'),true);
  assert.equal(permits(['network.view'],'DELETE','/docker/network/test'),false);
  assert.equal(permits(['containers.view','containers.create'],'POST','/docker/container'),true);
  for(const [method,url,body] of [
    ['GET','/dashboard'],['GET','/proxmox/lxc/n/2/details'],['POST','/actions/proxmox/vm/102/delete'],
    ['POST','/ssh/connect',{mode:'shell'}],['POST','/ssh/connect',{mode:'authorize',path:'/actions/proxmox/vm/102/delete',method:'POST'}],
    ['PUT','/users/user/permissions'],['POST','/storage/snapshots/guest/delete',{kind:'qemu'}],
    ['POST','/actions/proxmox/vm/102/%64elete'],['GET','/new-endpoint']
  ]) assert.equal(permits(keys,method,url,body),false,url);
  const data={vms:[{id:'100'}],lxc:[{id:'103'}],nodes:[{name:'host'}],backupHistory:{tasks:[{}]}};
  const filtered=permittedInventory(data,keys);
  assert.deepEqual(filtered.vms,data.vms);assert.deepEqual(filtered.lxc,[]);assert.deepEqual(filtered.nodes,[]);
  assert.equal(filtered.backupHistory,undefined);assert.equal(permittedInventory(data,null),data);
});

const connection=process.env.OWNER_SETUP_TEST_DATABASE_URL;
test('saved permissions apply to existing sessions and inventory tokens, with protected owners and versioned history',{skip:!connection},async()=>{
  const schema='roles_'+randomUUID().replaceAll('-','');
  const admin=new pg.Pool({connectionString:connection}), url=new URL(connection);
  const temp=await mkdtemp(path.join(tmpdir(),'account-roles-'));
  url.searchParams.set('options','-c search_path='+schema);
  Object.assign(process.env,{DATABASE_URL:url.toString(),JWT_SECRET:randomBytes(32).toString('hex'),JWT_REFRESH_SECRET:randomBytes(32).toString('hex'),DATA_DIR:temp});
  const {pool,migrate}=await import('../src/db.js'), {issueTokens}=await import('../src/security.js');
  const {createApp}=await import('../src/app.js'),{createInventoryToken}=await import('../src/account-access.js');
  let server;
  try {
    await admin.query('CREATE SCHEMA '+schema);await migrate(pool);
    const add=async(role)=>(await pool.query('INSERT INTO users(name,username,password_hash,role) VALUES($1,$1,$2,$1) RETURNING *',[role,'unused'])).rows[0];
    const owner=await add('owner'), user=await add('operator'), another=await add('viewer');
    const ownerToken=(await issueTokens(owner)).accessToken,userToken=(await issueTokens(user)).accessToken;
    const inventory=(await createInventoryToken(pool,user,'test',3)).secret;
    let closed=[];
    const app=createApp({profiles:null,onSessionRevoked:id=>closed.push(id)});
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
    const call=async(token,method,resource,body,status=200)=>{
      const res=await fetch('http://127.0.0.1:'+server.address().port+'/api'+resource,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
      const data=await res.json();assert.equal(res.status,status,method+' '+resource+' '+JSON.stringify(data));return data;
    };
    const resource='/users/'+user.id+'/permissions', own='/users/'+owner.id+'/permissions';
    const original=await call(ownerToken,'GET',resource);assert.equal(original.editable,true);assert.equal(original.revision,0);
    assert.equal((await call(ownerToken,'GET',own)).editable,false);
    await pool.query('UPDATE users SET cluster_roles=$1 WHERE id=$2',[JSON.stringify({default:'viewer'}),user.id]);
    const scoped=await call(ownerToken,'GET',resource);
    assert.deepEqual(scoped.scopeCeiling,capabilities('viewer'));
    assert.deepEqual(scoped.ceiling,capabilities('operator'));
    await pool.query('UPDATE users SET cluster_roles=NULL WHERE id=$1',[user.id]);
    await call(userToken,'GET','/users/'+another.id+'/permissions',null,403);
    await call(userToken,'PUT',resource,{revision:0,keys:[]},403);
    await call(ownerToken,'PUT',own,{revision:0,keys:[]},403);
    await call(ownerToken,'PUT',resource,{revision:0,keys:['users.create']},400);
    const body={name:'Night shift',keys:['cluster.view']};
    await call(ownerToken,'POST','/users/permission-templates',body,201);
    await call(ownerToken,'POST','/users/permission-templates',{...body,name:'NIGHT SHIFT'},409);
    await call(userToken,'POST','/users/permission-templates',body,403);
    await call(ownerToken,'PUT',resource,{revision:0,keys:body.keys,template:'Read-Only Auditor'},400);
    await call(ownerToken,'PUT',resource,{revision:0,keys:body.keys,template:body.name});
    const saved=await call(ownerToken,'GET',resource);
    assert.deepEqual(saved.keys,body.keys);assert.equal(saved.template,body.name);assert.equal(saved.templates.at(-1).name,body.name);
    assert.equal(saved.changes[0].actor,owner.username);assert.ok(saved.changes[0].removed.includes('vm.manage'));
    await call(ownerToken,'PUT',resource,{revision:0,keys:[]},409);
    await call(userToken,'GET','/audit',null,403);
    await call(userToken,'GET','/users/'+another.id+'/permission-history',null,403);
    await call(inventory,'GET','/monitoring',null,403);
    assert.deepEqual((await call(userToken,'GET',resource)).keys,body.keys);
    assert.deepEqual((await call(ownerToken,'GET','/users/'+user.id+'/permission-history')).changes,saved.changes);
    await call(ownerToken,'PUT',resource,{revision:1,keys:original.ceiling});
    assert.deepEqual(closed,[user.id,user.id]);await call(userToken,'GET','/audit');
    assert.equal((await pool.query('SELECT permission_keys FROM users WHERE id=$1',[user.id])).rows[0].permission_keys,null);
  } finally {
    if(server) await new Promise(resolve=>server.close(resolve));await pool.end();
    await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.end();await rm(temp,{recursive:true,force:true});
  }
});
