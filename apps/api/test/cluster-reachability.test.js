import test from 'node:test';
import assert from 'node:assert/strict';
import {createClusterReachability} from '../src/cluster-reachability.js';

const config={url:'https://cluster.example:8006',tokenId:'viewer@pve!read',tokenSecret:'fixture'};
const rows=[{id:'default',config}];
test('cluster availability distinguishes offline nodes or unreachable endpoints from inconclusive reads',async()=>{
  for(const [nodes,expected] of [
    [[{status:'offline'},{status:'online'}],'online'],[[{status:'offline'}],'offline'],
    [[{status:'offline'},{}],'unknown'],[[],'unknown'],[null,'unknown']
  ])assert.deepEqual(await createClusterReachability()(rows,async()=>nodes),[expected]);
  for(const [error,expected] of [[{code:'ECONNREFUSED'},'offline'],[{message:'Connector request timed out'},'offline'],[{providerStatus:503},'offline'],[{providerStatus:403},'unknown'],[{code:'CERT_HAS_EXPIRED'},'unknown']]){
    assert.deepEqual(await createClusterReachability()(rows,async()=>{throw error}),[expected]);
  }
  const unconfigured=await createClusterReachability()([{id:'default',config:{}}],()=>assert.fail('unexpected probe'));
  assert.deepEqual(unconfigured,['not-configured']);
});
test('polls share one probe per profile, recover after an outage and invalidate changed credentials',async()=>{
  let time=0,status='offline',calls=0;
  const statuses=createClusterReachability(()=>time);
  const query=async(route,options,connection)=>{
    calls++;
    assert.equal(route,'/nodes');assert.ok(options.timeoutMs>0);assert.equal(connection.url,config.url);
    return [{status}];
  };
  assert.deepEqual(await Promise.all([statuses(rows,query),statuses(rows,query)]),[['offline'],['offline']]);
  assert.equal(calls,1);
  status='online';time=11000;
  assert.deepEqual(await statuses(rows,query),['online']);assert.equal(calls,2);
  const rotated=[{id:'default',config:{...config,tokenSecret:'replacement'}}];
  await statuses(rotated,query);assert.equal(calls,3);
  await statuses([],query);await statuses(rotated,query);assert.equal(calls,4);
});
