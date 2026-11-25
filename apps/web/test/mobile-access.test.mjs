import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {build} from 'esbuild';
test('service worker leaves APIs untouched and never caches authenticated navigation',async()=>{
 const events={},source=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');let fail=false,calls=0;
 vm.runInNewContext(source,{self:{addEventListener:(name,fn)=>events[name]=fn},fetch:async request=>{calls++;if(fail)throw Error('offline');return new Response('live')},Response,URL,AbortController,setTimeout,clearTimeout});
 let response;events.fetch({request:{mode:'cors',url:'https://host/api/auth/me'},respondWith:()=>assert.fail('API intercepted')});assert.equal(calls,0);
 events.fetch({request:{method:'GET',mode:'navigate',url:'https://host/'},respondWith:p=>response=p});assert.equal(await (await response).text(),'live');
 fail=true;events.fetch({request:{method:'GET',mode:'navigate',url:'https://host/'},respondWith:p=>response=p});const offline=await response;assert.equal(offline.status,503);assert.equal(offline.headers.get('Cache-Control'),'no-store');assert.match(await offline.text(),/Connection interrupted/);
 assert.equal(source.includes('caches.'),false);
});

test('secondary exported reports retain the selected cluster identity',async()=>{
 const id='aaaabbbb-0000-4000-8000-000000000001';
 const result=await build({stdin:{contents:"export * from './cluster-context'",resolveDir:new URL('../src/',import.meta.url).pathname},bundle:true,format:'esm',write:false,define:{'globalThis.window':JSON.stringify({location:{pathname:'/clusters/'+id+'/settings'}})}});
 const scope=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
 scope.nameCluster('Office',{id,name:'Office / Test',endpoint:'office.example:8006'});
 assert.deepEqual(scope.reportCluster(),{id,name:'Office / Test',endpoint:'office.example:8006'});
 assert.equal(scope.clusterReportFilename('report.csv'),'Office-Test-'+id+'-report.csv');
 scope.nameCluster('',{id:'default',name:'Other'});
 assert.deepEqual(scope.reportCluster(),{id});
});
