import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
process.env.JWT_SECRET||='a'.repeat(64);process.env.JWT_REFRESH_SECRET||='b'.repeat(64);
const {createApp}=await import('../src/app.js');

test('browser first-owner registration validates transport and input, hashes passwords and closes after creation',async()=>{
 let owner=null,hash,inserts=0;const sql=[];
 const client={release(){},async query(query,values){sql.push(query);if(query.startsWith('SELECT EXISTS'))return {rows:[{registered:!!owner}]};if(query.startsWith('INSERT INTO users')){inserts++;hash=values[2];owner={id:'owner',email:values[0],name:values[1],username:values[3],role:'owner',status:'active'};return {rows:[owner]};}return {rows:[]};}};
 const db={query:client.query.bind(client),connect:async()=>client};
 const app=createApp({db});app.set('trust proxy',1);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 const input={name:'First Owner',username:'FIRST_OWNER',password:'First-owner-test-password',role:'admin'};
 const post=(body=input,headers={})=>fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-Proto':'https','Origin':base.replace('http:','https:'),...headers},body:JSON.stringify(body)});
 try{
  const setup=await fetch(base+'/api/auth/setup');assert.equal(setup.headers.get('cache-control'),'no-store');assert.deepEqual(await setup.json(),{registrationOpen:true,needsOwner:true});
  assert.equal((await post(input,{'X-Forwarded-Proto':'http'})).status,400);
  assert.equal((await post(input,{Origin:'https://other.example'})).status,403);
  assert.equal((await post(input,{Origin:'null'})).status,403);
  for(const bad of [{...input,password:'short'},{...input,password:'é'.repeat(40)},{...input,username:'../owner'},{...input,name:''}])assert.equal((await post(bad)).status,400);
  assert.equal(inserts,0);
  const response=await post();assert.equal(response.status,201);assert.equal(response.headers.get('cache-control'),'no-store');const result=await response.json();assert.equal(result.user.username,'first_owner');assert.equal(result.user.role,'owner');assert.equal(result.accessToken,undefined);assert.equal(result.user.password_hash,undefined);assert.ok(!JSON.stringify(result).includes(input.password));assert.equal(await bcrypt.compare(input.password,hash),true);
  assert.ok(sql.indexOf('LOCK TABLE users IN EXCLUSIVE MODE')<sql.findIndex(s=>s.startsWith('INSERT INTO users')));
  assert.deepEqual(await (await fetch(base+'/api/auth/setup')).json(),{registrationOpen:false,needsOwner:false});
  assert.equal((await post({...input,username:'second_owner'})).status,409);assert.equal(inserts,1);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
});
