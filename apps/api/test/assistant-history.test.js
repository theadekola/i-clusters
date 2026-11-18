import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createAssistantHistory} from '../src/assistant-history.js';

test('saved conversations survive restart, remain private and retain more than twelve exchanges', t => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'assistant-history-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  process.env.JWT_SECRET='test-assistant-key-'.repeat(4);
  const store=createAssistantHistory(directory);
  for(let i=0;i<15;i++)store.begin('alice',1,i,'Question '+i).finish({answer:'Private reply '+i,mode:'openai'});
  const reopened=createAssistantHistory(directory);
  assert.equal(reopened.get('alice',1).rows.length,15);
  assert.equal(reopened.get('alice',1).rows[14].answer,'Private reply 14');
  assert.deepEqual(reopened.list('bob'),{threads:[]});
  assert.throws(()=>reopened.get('bob',1),e=>e.status===404);
  assert.deepEqual(createAssistantHistory(path.join(directory,'other-cluster')).list('alice'),{threads:[]});
  const file=path.join(directory,'assistant-history',fs.readdirSync(path.join(directory,'assistant-history'))[0]);
  assert.ok(!fs.readFileSync(file,'utf8').includes('Private reply'));
  assert.equal(fs.statSync(file).mode&0o777,0o600);
});

test('concurrent replies, edits, retries and deletion preserve saved state',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'assistant-races-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  process.env.JWT_SECRET='test-assistant-key-'.repeat(4);
  const store=createAssistantHistory(directory);
  const first=store.begin('alice',1,1,'first'),second=store.begin('alice',1,2,'second');
  assert.throws(()=>store.begin('alice',1,1,'first'),e=>e.status===409);
  store.edit('alice',1,{title:'Renamed',pinned:true});
  second.finish({answer:'Second',mode:'n8n'});first.finish({error:'Provider unavailable'});
  const retry=store.begin('alice',1,1,'first');
  assert.deepEqual(retry.history,[]);
  retry.finish({answer:'First',mode:'openai',notice:'A notice'});
  const saved=store.get('alice',1);
  assert.equal(saved.title,'Renamed');assert.equal(saved.pinned,true);
  assert.deepEqual(saved.rows.map(r=>r.answer),['First','Second']);
  assert.deepEqual(store.begin('alice',1,1,'first').result,{answer:'First',mode:'openai',notice:'A notice'});
  const last=store.begin('alice',1,3,'last');store.remove('alice',1);last.finish({answer:'Too late'});
  assert.deepEqual(store.list('alice'),{threads:[]});
  store.begin('alice',2,1,'Interrupted');
  assert.equal(store.get('alice',2).rows[0].pending,true);
  const recovered=createAssistantHistory(directory).get('alice',2).rows[0];
  assert.equal(recovered.pending,undefined);assert.match(recovered.error,/interrupted/);
});

test('browser history import is idempotent and preserves saved answers',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'assistant-import-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  process.env.JWT_SECRET='test-assistant-key-'.repeat(4);
  const store=createAssistantHistory(directory),threads=[{id:0,title:'Earlier chat',pinned:true,rows:[{id:10,question:'Earlier question',answer:'Earlier answer'}]}];
  store.import('alice',threads);store.import('alice',threads);
  assert.equal(store.list('alice').threads.length,1);
  assert.equal(store.get('alice',0).rows[0].answer,'Earlier answer');
  const other=[{id:0,rows:[{id:10,question:'Another browser',answer:'Keep this too'}]}];
  store.import('alice',other);store.import('alice',other);
  const saved=store.list('alice').threads;
  assert.equal(saved.length,2);
  assert.equal(saved[0].legacyImport,undefined);
  assert.equal(store.get('alice',saved[0].id).rows[0].answer,'Keep this too');
  assert.equal(store.get('alice',0).rows[0].answer,'Earlier answer');
  assert.throws(()=>store.import('alice',[{id:'../bob',rows:[]}]),e=>e.status===400);
});
