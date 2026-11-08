import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
async function offlineHTML(){
 const events={};vm.runInNewContext(source,{self:{addEventListener:(name,fn)=>events[name]=fn},fetch:async()=>{throw Error('unreachable')},Response,URL,AbortController,setTimeout,clearTimeout});
 let promise;events.fetch({request:{method:'GET',mode:'navigate',url:'https://host/'},respondWith:p=>promise=p});return (await promise).text();
}
function recovery(html,fetch,address='https://controller.test/'){
 const events={},timers=new Map(),nodes=Object.fromEntries(['retry','status','address'].map(id=>[id,{textContent:'',disabled:false,addEventListener:(name,fn)=>events[id+':'+name]=fn}]));let count=0,reloads=0;
 const location={href:address,reload:()=>reloads++},history={state:null,replaceState:(_state,_unused,url)=>{location.href=url}};
 const document={hidden:false,getElementById:id=>nodes[id],addEventListener:(name,fn)=>events['document:'+name]=fn};
 vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{document,window:{addEventListener:(name,fn)=>events['window:'+name]??=fn},location,history,URL,fetch,AbortController,setTimeout:(fn,ms)=>{const id=++count;timers.set(id,{fn,ms});return id},clearTimeout:id=>timers.delete(id)});
 return {document,nodes,events,timers,location,reloads:()=>reloads};
}
test('navigation failures and server errors return a self-contained responsive screen; auth errors stay untouched',async()=>{
 const events={};let status=502;
 vm.runInNewContext(source,{self:{addEventListener:(name,fn)=>events[name]=fn},fetch:async()=>new Response('upstream error',{status}),Response,URL,AbortController,setTimeout,clearTimeout});
 let response;events.fetch({request:{method:'GET',mode:'navigate',url:'https://host/'},respondWith:p=>response=p});const fallback=await response,html=await fallback.text();
 assert.equal(fallback.status,503);assert.match(html,/viewport-fit=cover/);assert.match(html,/prefers-color-scheme:light/);assert.match(html,/safe-area-inset/);assert.match(html,/<p role="status">Connection interrupted. Reconnecting automatically.<\/p>/);assert.match(html,/<a href="\/api\/health">/);assert.match(html,/<a href="\/connection-check.html">/);assert.doesNotMatch(html,/<link[^>]+rel="stylesheet"|<img[^>]+src=/);assert.match(html,/rel="apple-touch-icon"/);assert.equal(fallback.headers.get('Cache-Control'),'no-store');
 status=403;events.fetch({request:{method:'GET',mode:'navigate',url:'https://host/'},respondWith:p=>response=p});assert.equal((await response).status,403);
});
test('retry probes public health without credentials or cache and reloads only after verified recovery',async()=>{
 const calls=[],page=recovery(await offlineHTML(),async(path,options)=>{calls.push({path,options});return path==='/'?new Response('<div id="root"></div>',{headers:{'Content-Type':'text/html'}}):{ok:true,json:async()=>({ok:true})}});
 await [...page.timers.values()].find(t=>t.ms===5000).fn();assert.equal(page.reloads(),1);assert.equal(calls[0].path,'/api/health');assert.equal(calls[0].options.cache,'no-store');assert.equal(calls[0].options.credentials,'omit');
});
test('server failures and captive-portal responses do not cause a reload loop',async()=>{
 for(const response of [{ok:false},{ok:true,json:async()=>({ok:false})},{ok:true,json:async()=>{throw Error('HTML response')}}]){
  const page=recovery(await offlineHTML(),async()=>response);await page.events['window:online']();assert.equal(page.reloads(),0);assert.ok([...page.timers.values()].some(t=>t.ms===5000));
 }
});
test('checks time out, pause in hidden pages and stop after leaving the page',async()=>{
 let calls=0;const page=recovery(await offlineHTML(),async(path,{signal})=>{calls++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout'))))});
 const checking=[...page.timers.values()].find(t=>t.ms===5000).fn();await page.events['window:online']();assert.equal(calls,1);
 [...page.timers.values()].find(t=>t.ms===6000).fn();await checking;assert.equal(page.reloads(),0);
 page.document.hidden=true;page.events['document:visibilitychange']();assert.equal(page.timers.size,0);await page.events['window:online']();assert.equal(calls,1);
 page.events['window:pagehide']();page.document.hidden=false;await page.events['window:online']();assert.equal(calls,1);
});

test('direct API navigation preserves original network and TLS errors instead of replacing them with an app notice',()=>{
 const events={};let calls=0;
 vm.runInNewContext(source,{self:{addEventListener:(name,fn)=>events[name]=fn},fetch:()=>{calls++;throw Error('must not intercept')},Response,URL,AbortController,setTimeout,clearTimeout});
 for(const path of ['/api','/api/health','/api/health?check=mobile','/api/auth/me','/connection-check.html','/proxmox?tab=VMs&__iclusters_reconnect=1']){
  events.fetch({request:{method:'GET',mode:'navigate',url:'https://host'+path},respondWith:()=>assert.fail('API navigation intercepted')});
 }
 for(const request of [{cache:'reload'},{isReloadNavigation:true},{method:'POST'}]){
  events.fetch({request:{method:'GET',mode:'navigate',url:'https://host/proxmox',...request},respondWith:()=>assert.fail('native navigation intercepted')});
 }
 assert.equal(calls,0);
});

test('refresh from recovery goes to the network and probes the original deep link before reopening it',async()=>{
 const paths=[];
 const page=recovery(await offlineHTML(),async path=>{
  paths.push(path);
  return path==='/api/health'?Response.json({ok:true}):new Response('<div id="root"></div>',{headers:{'Content-Type':'text/html'}});
 },'https://controller.test/proxmox?tab=VMs#details');
 assert.equal(page.nodes.retry.href,'https://controller.test/proxmox?tab=VMs&__iclusters_reconnect=1#details');
 assert.equal(page.location.href,page.nodes.retry.href);
 await page.events['window:online']();
 assert.deepEqual(paths,['/api/health','/proxmox?tab=VMs']);
 assert.equal(page.reloads(),1);
});

test('Retry connection reloads a deep link even when its fragment already matches',async()=>{
 const page=recovery(await offlineHTML(),()=>assert.fail('manual retry should navigate'),'https://controller.test/proxmox#details');
 let prevented=false;
 page.events['retry:click']({preventDefault:()=>{prevented=true}});
 assert.equal(prevented,true);
 assert.equal(page.reloads(),1);
});

test('healthy API with a failed or non-dashboard frontend never reloads the offline page',async()=>{
 for(const shell of [new Response('failed',{status:502}),new Response('<html>proxy login</html>',{headers:{'Content-Type':'text/html'}})]){
  const page=recovery(await offlineHTML(),async path=>path==='/api/health'?new Response('{"ok":true}') : shell);
  await page.events['window:online']();assert.equal(page.reloads(),0);assert.equal(page.nodes.status.textContent,"");
 }
});

test('a stalled navigation returns a bounded fallback even when the transport ignores abort',async()=>{
 const events={},timers=new Map();let count=0;
 vm.runInNewContext(source,{self:{addEventListener:(name,fn)=>events[name]=fn},fetch:()=>new Promise(()=>{}),Response,URL,AbortController,setTimeout:(fn,ms)=>{timers.set(++count,{fn,ms});return count},clearTimeout:id=>timers.delete(id)});
 let response;events.fetch({request:{method:'GET',mode:'navigate',url:'https://host/'},respondWith:p=>response=p});assert.ok([...timers.values()].some(t=>t.ms===15000));[...timers.values()][0].fn();
 assert.match(await (await response).text(),/Reconnecting automatically/);assert.equal(timers.size,0);
});
