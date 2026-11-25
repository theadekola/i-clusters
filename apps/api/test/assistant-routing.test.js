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

test('the suspended assistant preserves encrypted data and never contacts a provider',async t=>{
 const {createConfigurationStore}=await import('../src/runtime-configuration.js');
 const {createAssistantHistory}=await import('../src/assistant-history.js');
 const directory=path.join(process.env.DATA_DIR,'suspended');
 const configuration=createConfigurationStore(directory);
 configuration.save('ai',{AI_PROVIDER:'openai',OPENAI_API_KEY:'saved-fixture'});
 const history=createAssistantHistory(process.env.DATA_DIR);
 history.begin('fixture',1,1,'Keep this chat').finish({answer:'Saved answer'});
 const files=[path.join(directory,'ai.json'),path.join(process.env.DATA_DIR,'assistant-history',fs.readdirSync(path.join(process.env.DATA_DIR,'assistant-history'))[0])];
 const before=files.map(file=>fs.readFileSync(file));
 const server=createApp({profiles:null,configuration,monitor:{sample:async()=>({services:[],alerts:[]}),invalidate(){}},db:{query:async()=>({rows:[]})},audit:async()=>{},authenticate:(req,res,next)=>{req.user={sub:'fixture',role:'owner'};next()}}).listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 t.after(()=>{server.closeAllConnections();server.close()});
 const base='http://127.0.0.1:'+server.address().port+'/api',original=fetch;
 const outbound=[];
 t.mock.method(globalThis,'fetch',async (url,options)=>{
  if(String(url).startsWith(base))return original(url,options);
  outbound.push(url);
  throw Error('Unexpected provider request');
 });
 for(const [method,endpoint,body] of [
  ['POST','/ai/chat',{message:'web: test'}],
  ['POST','/ai/health',{}],
  ['GET','/ai/conversations'],
  ['GET','/ai/conversations/1'],
  ['PATCH','/ai/conversations/1',{title:'Changed'}],
  ['DELETE','/ai/conversations/1'],
  ['POST','/ai/conversations/import',{threads:[]}],
  ['GET','/configuration/ai'],
  ['PUT','/configuration/%61i',{OPENAI_API_KEY:'replacement'}],
  ['DELETE','/configuration/ai'],
  ['POST','/configuration/ai/models',{}],
  ['POST','/configuration/ai/test',{confirm:true}]
 ]){
  const response=await fetch(base+endpoint,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  assert.equal(response.status,404,method+' '+endpoint);
 }
 assert.equal((await fetch(base+'/alerts')).status,200);
 assert.equal((await fetch(base+'/configuration/truenas')).status,200);
 assert.deepEqual(outbound,[]);
 assert.equal(configuration.environment({OPENAI_API_KEY:'legacy-env',SMTP_PORT:'587'}).OPENAI_API_KEY,undefined);
 assert.equal(configuration.environment({OPENAI_API_KEY:'legacy-env',SMTP_PORT:'587'}).SMTP_PORT,'587');
 assert.deepEqual(files.map(file=>fs.readFileSync(file)),before);
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
