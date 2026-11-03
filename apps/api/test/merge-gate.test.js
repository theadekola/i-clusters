import test from 'node:test';
import assert from 'node:assert/strict';
import {assertReady} from '../../../deployment/check-pr-ready.mjs';
const sha='a'.repeat(40),pr={state:'open',draft:false,mergeable:true,head:{sha}},run={name:'checks',head_sha:sha,status:'completed',conclusion:'success'},checks={total_count:1,check_runs:[run]},status={total_count:0};
test('merge gate accepts only a reviewed head with completed successful application checks',()=>{
 assert.equal(assertReady(pr,checks,status,sha),sha);
 for(const change of [{draft:true},{mergeable:false},{state:'closed'},{head:{sha:'b'.repeat(40)}}])assert.throws(()=>assertReady({...pr,...change},checks,status,sha));
});
test('pending duplicate runs, failures, missing checks and failing statuses block merge',()=>{
 for(const invalid of [{total_count:0,check_runs:[]},{...checks,total_count:100},{...checks,check_runs:[run,{...run,status:'in_progress',conclusion:null}]},{...checks,check_runs:[{...run,conclusion:'failure'}]},{...checks,check_runs:[{...run,head_sha:'b'.repeat(40)}]}])assert.throws(()=>assertReady(pr,invalid,status,sha));
 assert.throws(()=>assertReady(pr,checks,{total_count:1,state:'pending'},sha));
 assert.throws(()=>assertReady(pr,checks,{total_count:1,state:'failure'},sha));
});
