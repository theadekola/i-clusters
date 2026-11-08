import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const out=await build({entryPoints:['src/topology-flow.ts'],write:false,format:'esm'});
const {guestActivity,nodeActivity}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
test('guest activity needs two distinct recent readings from the same running guest',()=>{
 const g=(at,rx,tx,uptime=100)=>({status:'running',key:'a:qemu:1',networkSample:{at,rx,tx,uptime}});
 const collect=(row,prev,now=row.networkSample.at)=>guestActivity([row],prev.samples,now,prev.flows);
 const first=collect(g(1000,10,30),{samples:new Map(),flows:new Map()});assert.equal(first.flows.size,0);
 const second=collect(g(2000,12,30),first);assert.deepEqual(second.flows.get('a:qemu:1'),{rx:true,tx:false,until:62000});
 assert.equal(collect(g(2000,12,30),second,63000).flows.size,0);
 assert.equal(collect(g(3000,11,45),second).flows.size,0);
 assert.equal(collect(g(3000,15,45,2),second).flows.size,0);
 assert.equal(collect({...g(3000,15,45),status:'stopped'},second).flows.size,0);
});
test('node activity ignores stale, down and missing readings',()=>{
 const row={node:'one',status:'up',telemetryStatus:'ok',networkSampledAt:new Date(1000).toISOString(),rxMbps:0,txMbps:2};
 assert.equal(nodeActivity([row],2000).get('one').tx,true);
 for(const r of [{...row,status:'down'},{...row,txMbps:null},{...row,telemetryStatus:'offline'}])assert.equal(nodeActivity([r],2000).size,0);
 assert.equal(nodeActivity([row],21000).size,0);
});
