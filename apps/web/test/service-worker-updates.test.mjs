import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
const built=await build({entryPoints:[new URL('../src/service-worker.ts',import.meta.url).pathname],bundle:true,format:'iife',globalName:'worker',write:false});
function setup(register){
 const events={},intervals=new Map(),document={hidden:false,addEventListener:(name,fn)=>events[name]=fn,removeEventListener:name=>delete events[name]};
 const window={isSecureContext:true,addEventListener:(name,fn)=>events[name]=fn,removeEventListener:name=>delete events[name],setInterval:fn=>{intervals.set(1,fn);return 1},clearInterval:id=>intervals.delete(id)};
 const context={navigator:{serviceWorker:{register}},window,document};vm.createContext(context);vm.runInContext(built.outputFiles[0].text,context);
 return {events,intervals,document,stop:context.worker.startWorkerUpdates()};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('recovery code refreshes on startup, network return and visibility without reloading forms',async()=>{
 let updates=0,registrations=0;const p=setup(async(path,options)=>{assert.equal(path,'/sw.js');assert.equal(options.updateViaCache,'none');registrations++;return {update:async()=>updates++}});
 await tick();assert.equal(updates,1);await p.events.online();assert.equal(updates,2);
 p.document.hidden=true;p.events.visibilitychange();await tick();assert.equal(updates,2);
 p.document.hidden=false;p.events.visibilitychange();await tick();assert.equal(updates,3);p.stop();assert.equal(p.intervals.size,0);assert.equal(Object.keys(p.events).length,0);assert.equal(registrations,3);
});
test('outages are caught and a stopped registration does not keep updating',async()=>{
 const failing=setup(async()=>{throw Error('offline')});await tick();failing.stop();
 let finish;const pending=setup(()=>new Promise(resolve=>finish=resolve));pending.stop();finish({update:()=>assert.fail('update after stop')});await tick();
});
