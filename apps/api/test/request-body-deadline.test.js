import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {requestBodyDeadline} from '../src/request-body-deadline.js';
test('only binary file upload bodies receive the longer timeout and rejected unfinished bodies close promptly',()=>{
 const original=globalThis.setTimeout,oldClear=globalThis.clearTimeout;let delay,clearCount=0;
 globalThis.setTimeout=(_callback,ms)=>{delay=ms;return {unref(){}}};globalThis.clearTimeout=()=>{clearCount++};
 try{for(const [method,path,type,expected] of [['POST','/api/proxmox/storage-file-upload','application/json',120000],['PUT','/api/proxmox/storage-file-upload/'+'a'.repeat(48),'application/octet-stream',7200000],['PUT','/api/proxmox/storage-file-upload/'+'a'.repeat(48),'application/json',120000]]){
  let destroyed=false;const req=Object.assign(new EventEmitter(),{method,path,headers:{'content-length':'10','content-type':type},complete:false,destroy(){destroyed=true}}),res=new EventEmitter();requestBodyDeadline(req,res,()=>{});assert.equal(delay,expected);res.emit('finish');assert.equal(destroyed,true);
 }assert.equal(clearCount,3)}finally{globalThis.setTimeout=original;globalThis.clearTimeout=oldClear}
});
