import test from 'node:test';
import assert from 'node:assert/strict';
process.env.JWT_SECRET='a'.repeat(64);process.env.JWT_REFRESH_SECRET='b'.repeat(64);
const {renewAccountSession}=await import('../src/account-security.js');
test('MFA session renewal cannot adopt a later password reset or session revocation',async()=>{let issued=0;const db={query:async()=>({rowCount:1,rows:[{id:'owner',token_version:12}]})},issue=async user=>{issued++;return {version:user.token_version}};await assert.rejects(()=>renewAccountSession(db,'owner',11,{},issue),e=>e.status===401);assert.equal(issued,0);assert.deepEqual(await renewAccountSession(db,'owner',12,{},issue),{version:12});assert.equal(issued,1)});

test('profile edits validate fields and write only to the signed-in account',async()=>{
 const {accountSecurityRouter}=await import('../src/account-security.js');
 const queries=[],audit=[];
 const router=accountSecurityRouter({db:{query:async(...args)=>queries.push(args)},audit:async(...args)=>audit.push(args),limiter:(req,res,next)=>next()});
 const route=router.stack.find(layer=>layer.route?.path==='/profile').route.stack[0].handle;
 const req={user:{sub:'self'},get:()=>undefined,body:{id:'other',role:'owner',name:' Sample ',contactEmail:'contact@example.test',timeZone:'Europe/London',bio:'Example'}};
 let status=200,body;const res={status(n){status=n;return this},json(value){body=value}};
 await route(req,res);
 assert.equal(status,200);assert.deepEqual(queries[0][1],['Sample',{contactEmail:'contact@example.test',timeZone:'Europe/London',bio:'Example'},'self']);
 assert.deepEqual(body,{name:'Sample',profile:queries[0][1][1]});assert.equal(audit[0][2],'self');
 for(const bad of [{name:''},{contactEmail:'invalid'},{timeZone:'not-a-zone'},{bio:'a'.repeat(301)}]){
  await route({...req,body:{...req.body,...bad}},res);assert.equal(status,400);
 }
 assert.equal(queries.length,1);
});
