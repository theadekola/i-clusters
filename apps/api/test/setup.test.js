import {test} from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import {claimOwnerFromConsole,setupStatus} from '../src/setup.js';
const input={name:'First Owner',email:'OWNER@example.test',password:'A strong test password'};
await test('console claiming requires valid account details',async()=>{
 const db={connect:async()=>({release(){},async query(sql){assert.ok(!sql.startsWith('INSERT INTO users'));return {rows:[{registered:false}]}}})};
 for(const [body,status] of [[{...input,password:'short'},400],[{...input,password:'é'.repeat(40)},400],[{...input,email:'invalid'},400]]){
  await assert.rejects(claimOwnerFromConsole(db,body),error=>error.status===status);
 }
});
await test('first owner is hashed, registration locks the table and closes without creating another account',async()=>{
 let registered=false,hash,connectionReleased=false;const queries=[];
 const client={async query(sql,values){queries.push(sql);
  if(sql.startsWith('SELECT EXISTS'))return {rows:[{registered}]};
  if(sql.startsWith('INSERT INTO users')){hash=values[2];registered=true;return {rows:[{id:'owner',email:values[0],name:values[1],role:'owner',status:'active'}]};}
  return {rows:[]};
 },release(){connectionReleased=true;}};
 const db={query:client.query.bind(client),connect:async()=>client};
 assert.deepEqual(await setupStatus(db),{needsOwner:true,registrationOpen:true});
 const user=await claimOwnerFromConsole(db,input);assert.equal(user.email,'owner@example.test');assert.equal(user.role,'owner');assert.equal(await bcrypt.compare(input.password,hash),true);
 assert.ok(queries.indexOf('LOCK TABLE users IN EXCLUSIVE MODE')<queries.findIndex(q=>q.startsWith('INSERT INTO users')));
 assert.ok(connectionReleased);assert.deepEqual(await setupStatus(db),{needsOwner:false,registrationOpen:false});
 await assert.rejects(claimOwnerFromConsole(db,{...input,email:'another@example.test'}),error=>error.status===409);
 assert.equal(queries.at(-1),'ROLLBACK');assert.equal(queries.filter(q=>q.startsWith('INSERT INTO users')).length,1);
});

test('first-use registration creates a username-only owner without requiring an email',async()=>{
 let values;const client={release(){},query:async(sql,args)=>{if(sql.startsWith('SELECT EXISTS'))return {rows:[{registered:false}]};if(sql.startsWith('INSERT INTO users')){values=args;return {rows:[{id:'new',username:args[3],name:args[1],email:args[0],role:'owner'}]}}return {rows:[]}}};
 const owner=await claimOwnerFromConsole({connect:async()=>client},{name:'Owner',username:'New_Owner',password:'A strong test password'});assert.equal(values[0],null);assert.equal(values[3],'new_owner');assert.equal(owner.username,'new_owner');assert.equal(owner.email,null);
});
