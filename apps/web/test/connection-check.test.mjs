import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
const source=fs.readFileSync(new URL('../public/connection-check.js',import.meta.url),'utf8');
function page(fetch,registration,starts=true){
 const events={},nodes=Object.fromEntries(['check','reset','result','address'].map(id=>[id,{textContent:'',disabled:false,addEventListener:(event,fn)=>events[id]=fn}]));
 const {window}=new JSDOM('');const head={append(script){queueMicrotask(()=>starts?window.dispatchEvent(new window.CustomEvent('iclusters-boot-ready',{detail:{entry:script.src,ok:true}})):script.onerror())}};
 vm.runInNewContext(source,{window,URL,DOMParser:window.DOMParser,document:{head,createElement:tag=>window.document.createElement(tag),getElementById:id=>nodes[id]},location:{origin:'https://controller:6002'},navigator:{serviceWorker:{getRegistration:async()=>registration}},fetch,AbortController,setTimeout,clearTimeout});
 return {events,nodes};
}
test('diagnostics distinguishes healthy connection, failed frontend, database outage and proxy errors',async()=>{
 for(const [health,shell,message,starts] of [
  [new Response('{"ok":true}'),new Response('<div id="root"></div><script type="module" src="/assets/entry.js"></script>' ,{headers:{'Content-Type':'text/html'}}),/Connected.*dashboard, API and database/],
  [new Response('{"ok":true}'),new Response('<div id="root"></div><script type="module" src="/assets/entry.js"></script>',{headers:{'Content-Type':'text/html'}}),/dashboard is unavailable/,false],
  [new Response('{"ok":true}'),new Response('<div id="root"></div>',{headers:{'Content-Type':'text/html'}}),/dashboard is unavailable/],
  [new Response('{"ok":true}'),new Response('failure' ,{status:502}),/dashboard is unavailable/],
  [new Response('{"ok":false}',{status:503}),null,/database is unavailable/],
  [new Response('bad gateway',{status:502}),null,/HTTP 502/]
 ]){
  const calls=[],p=page(async(path,options)=>{calls.push(options);return path==='/api/health'?health:shell},null,starts);await p.events.check();assert.match(p.nodes.result.textContent,message);assert.equal(p.nodes.check.disabled,false);assert.ok(calls.every(c=>c.credentials==='omit'&&c.cache==='no-store'&&c.redirect==='error'));
 }
});
test('network failures do not pretend to detect a disconnected VPN or an invalid certificate',async()=>{
 const p=page(async()=>{throw new TypeError('Failed to fetch')});await p.events.check();assert.match(p.nodes.result.textContent,/may be a network route, firewall, HTTPS trust or server problem/);
});
test('recovery reset unregisters only the root-scoped worker and preserves browser sessions',async()=>{
 let removed=0;const p=page(null,{scope:'https://controller:6002/',unregister:async()=>{removed++;return true}});await p.events.reset();assert.equal(removed,1);assert.match(p.nodes.result.textContent,/sign-in data were preserved/);
 const other=page(null,{scope:'https://controller:6002/other/',unregister:()=>assert.fail('another worker removed')});await other.events.reset();assert.equal(other.nodes.reset.disabled,false);
 const failed=page(null,{scope:'https://controller:6002/',unregister:async()=>false});await failed.events.reset();assert.match(failed.nodes.result.textContent,/could not be reset/);
});
