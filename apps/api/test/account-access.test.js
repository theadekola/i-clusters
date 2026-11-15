import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import express from 'express';
import bcrypt from 'bcryptjs';
import {inventoryIdentity} from '../src/account-access.js';

test('inventory tokens accept only the two inventory reads',async()=>{
 const query=()=>{throw Error('Unexpected database query')};
 for(const [method,route] of [['POST','/api/proxmox'],['GET','/api/account/security'],['GET','/api/ssh'],['GET','/api/clusters/other/proxmox']]){
  assert.equal(await inventoryIdentity(query,'icl_'+'f'.repeat(64),method,route),null);
 }
});

const connection=process.env.OWNER_SETUP_TEST_DATABASE_URL;
test('account controls rotate sessions, manage inventory tokens and verify remembered browsers', {skip:!connection},async()=>{
 const schema='access_'+randomUUID().replaceAll('-',''),admin=new pg.Pool({connectionString:connection});
 const url=new URL(connection);url.searchParams.set('options','-c search_path='+schema);
 process.env.DATABASE_URL=url.toString();process.env.JWT_SECRET=randomBytes(32).toString('hex');process.env.JWT_REFRESH_SECRET=randomBytes(32).toString('hex');
 const temp=await mkdtemp(path.join(os.tmpdir(),'account-access-'));process.env.DATA_DIR=temp;
 const {pool,migrate}=await import('../src/db.js'),{issueTokens,auth}=await import('../src/security.js');
 const {createApp}=await import('../src/app.js'),{digest}=await import('../src/mfa.js');
 let server;
 try{
  await admin.query('CREATE SCHEMA '+schema);await migrate(pool);
  const password='Local fixture password',hash=await bcrypt.hash(password,4);
  const user=(await pool.query("INSERT INTO users(id,name,username,password_hash,role) VALUES(gen_random_uuid(),'Owner','owner',$1,'owner') RETURNING *",[hash])).rows[0];
  const app=express();app.get('/api/proxmox',auth,(req,res)=>res.json({role:req.user.role}));app.use(createApp({profiles:null,onSessionRevoked:()=>{}}));
  server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener))});
  const base='http://127.0.0.1:'+server.address().port+'/api';
  const call=async(route,{body,bearer,cookie,status=200}={})=>{
   const response=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-IClusters-Browser':'1',...(bearer?{Authorization:'Bearer '+bearer}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
   const data=await response.json();assert.equal(response.status,status,data.error||route);return {data,cookies:response.headers.getSetCookie()};
  };
  let session=(await issueTokens(user)).accessToken;
  const created=await call('/account/tokens',{bearer:session,status:201,body:{password,name:'Inventory job',days:7}});
  const token=created.data.secret;assert.match(token,/^icl_[a-f0-9]{64}$/);
  const list=await call('/account/tokens',{bearer:session});assert.equal(list.data.tokens.length,1);assert.equal(list.data.tokens[0].secret,undefined);
  assert.equal((await call('/proxmox',{bearer:token})).data.role,'viewer');
  await call('/account/security',{bearer:token,status:401});await call('/account/tokens/revoke',{bearer:session,body:{password,id:created.data.id}});await call('/proxmox',{bearer:token,status:401});
  const remembered=await call('/account/remember',{bearer:session,body:{password,enabled:true}});
  assert.ok(remembered.data.rememberUntil>Date.now());await call('/account/security',{bearer:session,status:401});
  session=remembered.data.accessToken;assert.equal((await call('/account/security',{bearer:session})).data.remember,true);
  const forgotten=await call('/account/remember',{bearer:session,body:{password,enabled:false}});assert.equal(forgotten.data.rememberUntil,undefined);
  session=forgotten.data.accessToken;
  // Install an enrolled account and one-use codes to exercise real verification without waiting for TOTP time steps.
  const {seal}=await import('../src/mfa.js');await pool.query('UPDATE users SET two_factor_enabled=TRUE,totp_secret=$1 WHERE id=$2',[seal('JBSWY3DPEHPK3PXP'),user.id]);
  const codes=Array.from({length:3},()=>randomBytes(16).toString('hex').toUpperCase());
  for(const code of codes)await pool.query('INSERT INTO mfa_recovery_codes(user_id,code_hash) VALUES($1,$2)',[user.id,digest(code)]);
  await call('/account/device-policy',{bearer:session,body:{password,code:codes[0],enabled:true}});
  const login={username:'owner',password,remember:true};const fresh=await call('/auth/login',{body:login});assert.equal(fresh.data.mfaRequired,true);
  const verified=await call('/auth/mfa',{body:{challengeToken:fresh.data.challengeToken,code:codes[1]}});
  const device=verified.cookies.find(v=>v.startsWith('__Host-iclusters-device='));assert.ok(device);assert.ok(verified.cookies.some(v=>v.startsWith('__Host-iclusters-refresh=')));
  const cookie=device.split(';')[0];assert.ok((await call('/auth/login',{body:login,cookie})).data.accessToken);
  assert.equal((await call('/auth/login',{body:login})).data.mfaRequired,true);
  await call('/account/device-policy',{bearer:session,body:{password,code:codes[2],enabled:false}});
  assert.equal((await call('/auth/login',{body:login,cookie})).data.mfaRequired,true);
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));await pool.end();await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.end();await rm(temp,{recursive:true,force:true});
 }
});
