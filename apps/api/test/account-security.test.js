import test from 'node:test';
import assert from 'node:assert/strict';
process.env.JWT_SECRET='a'.repeat(64);process.env.JWT_REFRESH_SECRET='b'.repeat(64);
const {renewAccountSession}=await import('../src/account-security.js');
test('MFA session renewal cannot adopt a later password reset or session revocation',async()=>{let issued=0;const db={query:async()=>({rowCount:1,rows:[{id:'owner',token_version:12}]})},issue=async user=>{issued++;return {version:user.token_version}};await assert.rejects(()=>renewAccountSession(db,'owner',11,{},issue),e=>e.status===401);assert.equal(issued,0);assert.deepEqual(await renewAccountSession(db,'owner',12,{},issue),{version:12});assert.equal(issued,1)});

test('profile edits validate fields and write only to the signed-in account',async()=>{
 const {accountSecurityRouter}=await import('../src/account-security.js');
 const queries=[],audit=[];
 const router=accountSecurityRouter({db:{query:async(...args)=>{
   queries.push(args);
   const [name,profile,,username]=args[1];
   return {rowCount:1,rows:[{name,username:username||'existing',profile}]};
 }},audit:async(...args)=>audit.push(args),limiter:(req,res,next)=>next()});
 const route=router.stack.find(layer=>layer.route?.path==='/profile').route.stack[0].handle;
 const req={user:{sub:'self'},get:()=>undefined,body:{id:'other',role:'owner',name:' Sample ',contactEmail:'contact@example.test',timeZone:'Europe/London',bio:'Example'}};
 let status=200,body;const res={status(n){status=n;return this},json(value){body=value}};
 await route(req,res);
 assert.equal(status,200);assert.equal(queries[0][1][2],'self');assert.equal(queries[0][1][3],null);
 assert.equal(body.username,'existing');assert.equal(body.name,'Sample');assert.equal(audit[0][2],'self');
 for(const bad of [{name:''},{contactEmail:'invalid'},{timeZone:'not-a-zone'},{bio:'a'.repeat(301)},{username:'bad name'},{picturePixels:'bad'}]){
  await route({...req,body:{...req.body,...bad}},res);assert.equal(status,400);
 }
 assert.equal(queries.length,1);
 const pixels=Buffer.alloc(128*128*4,180).toString('base64');
 await route({...req,body:{...req.body,username:'Updated.User',picturePixels:pixels}},res);
 assert.equal(queries[1][1][3],'updated.user');assert.equal(queries[1][1][4].subarray(1,4).toString(),'PNG');
 assert.ok(body.profile.pictureVersion);assert.equal(body.profile.picturePixels,undefined);
});
