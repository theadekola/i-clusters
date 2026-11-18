import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'assistant-routing-'));
process.env.JWT_SECRET='assistant-route-key-'.repeat(4);
process.env.JWT_REFRESH_SECRET='assistant-refresh-key-'.repeat(4);
const {createApp}=await import('../src/app.js');
const {publicWebSearch}=await import('../src/ai.js');
test.after(()=>fs.rmSync(process.env.DATA_DIR,{recursive:true,force:true}));

test('inventory and public questions use the saved API and persist answers per account',async t=>{
 const config={AI_PROVIDER:'openai',OPENAI_API_TYPE:'responses',OPENAI_API_KEY:'saved-fixture',OPENAI_MODEL:'saved-model'};
 const now=new Date().toISOString(),calls=[],audits=[];
 const sample={sampledAt:now,services:[{id:'proxmox',status:'reachable',sampledAt:now}],alerts:[],proxmox:{nodeInventory:{complete:true},resourceInventoryComplete:true,nodes:[{name:'node01',ip:'192.0.2.10'}],vms:[{name:'VM',node:'node01',status:'running'}],lxc:[]}};
 const server=createApp({profiles:null,configuration:{resolve:()=>config},monitor:{sample:async()=>sample,invalidate(){}},db:{query:async()=>({rows:[]})},audit:async(...args)=>audits.push(args),authenticate:(req,res,next)=>{req.user={sub:req.headers['x-user']||'alice',role:'owner'};next()}}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));
 t.after(()=>{server.closeAllConnections();server.close()});
 const base='http://127.0.0.1:'+server.address().port+'/api',original=fetch;
 let timeout=false;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  if(String(url).startsWith(base))return original(url,options);
  assert.equal(url,'https://api.openai.com/v1/responses');
  assert.equal(options.headers.Authorization,'Bearer saved-fixture');
  const body=JSON.parse(options.body);assert.equal(body.model,'saved-model');calls.push(body);
  if(timeout)throw new DOMException('Timed out','TimeoutError');
  return Response.json({output:[{type:'message',content:[{type:'output_text',text:'Reply from the saved provider'}]}]});
 });
 const send=body=>fetch(base+'/ai/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 let response=await send({message:'How many VMs are running?',threadId:1,exchangeId:1});
 assert.equal(response.status,200);assert.equal((await response.json()).result.mode,'openai');
 assert.match(JSON.parse(calls[0].input).context.verifiedAnswer,/1 running virtual machine/);
 response=await send({message:'web: public question',threadId:1,exchangeId:2});
 assert.equal(response.status,200);assert.deepEqual(JSON.parse(calls[1].input),{message:'web: public question'});
 assert.deepEqual(calls[1].tools,[{type:'web_search'}]);assert.equal(calls[1].tool_choice,'required');
 assert.equal((await (await fetch(base+'/ai/conversations/1')).json()).thread.rows.length,2);
 assert.deepEqual((await (await fetch(base+'/ai/conversations',{headers:{'x-user':'bob'}})).json()).threads,[]);
 assert.equal((await fetch(base+'/ai/conversations/1',{headers:{'x-user':'bob'}})).status,404);
 const count=calls.length;await send({message:'web: public question',threadId:1,exchangeId:2});assert.equal(calls.length,count);
 timeout=true;response=await send({message:'Another question',threadId:1,exchangeId:3});assert.equal(response.status,504);
 const failed=(await (await fetch(base+'/ai/conversations/1')).json()).thread.rows[2];
 assert.equal(failed.answer,undefined);assert.match(failed.error,/90 seconds/);
 assert.ok(!JSON.stringify(audits.map(row=>row.slice(1))).includes('Reply from the saved provider'));
});

test('search-capable saved providers return clickable citations and others report model-only replies',async t=>{
 const cases=[
  {id:'openai',type:'responses',data:{output:[{type:'web_search_call',status:'completed'},{type:'message',content:[{type:'output_text',text:'Answer [source]',annotations:[{type:'url_citation',url:'https://example.com/docs',title:'Docs',start_index:7,end_index:15}]}]}]},tool:'web_search'},
  {id:'anthropic',type:'messages',data:{content:[{type:'web_search_tool_result',content:[]},{type:'text',text:'Answer',citations:[{url:'https://example.com/docs',title:'Docs'}]}]},tool:'web_search_20250305'},
  {id:'gemini',type:'generate-content',data:{candidates:[{content:{parts:[{text:'Answer'}]},groundingMetadata:{webSearchQueries:['query'],groundingChunks:[{web:{uri:'https://example.com/docs',title:'Docs'}}],groundingSupports:[{segment:{endIndex:6},groundingChunkIndices:[0]}]}}]},tool:'google_search'}
 ];
 for(const fixture of cases){
  const mock=t.mock.method(globalThis,'fetch',async(url,options)=>{const body=JSON.parse(options.body);assert.ok(JSON.stringify(body.tools).includes(fixture.tool));return Response.json(fixture.data)});
  const result=await publicWebSearch({AI_PROVIDER:fixture.id,OPENAI_API_TYPE:fixture.type,OPENAI_API_KEY:'fixture',OPENAI_MODEL:'fixture-model'},'web: query');
  assert.equal(result.mode,fixture.id);assert.equal(result.webSearch,true);assert.equal(result.sources[0].url,'https://example.com/docs');assert.match(result.answer,/\[1\]\(https:\/\/example.com\/docs\)/);mock.mock.restore();
 }
 t.mock.method(globalThis,'fetch',async(url,options)=>{const body=JSON.parse(options.body);assert.equal(body.tools,undefined);assert.match(body.messages[0].content,/Live web search is unavailable/);return Response.json({choices:[{message:{content:'General knowledge'}}]})});
 const reply=await publicWebSearch({AI_PROVIDER:'deepseek',OPENAI_API_KEY:'fixture'},'web: query');
 assert.equal(reply.answer,'General knowledge');assert.equal(reply.mode,'deepseek');assert.equal(reply.webSearch,false);assert.match(reply.notice,/unavailable/);
});
