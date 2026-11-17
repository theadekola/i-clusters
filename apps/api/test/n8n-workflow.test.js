import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=JSON.parse(readFileSync(new URL('../../../docs/examples/n8n-ollama.json',import.meta.url),'utf8'));
const nodes=new Map(workflow.nodes.map(node=>[node.name,node]));
function runCode(name,input){
 const run=new Function('$input',nodes.get(name).parameters.jsCode);
 return run({first:()=>({json:input})})[0].json;
}
test('the inactive workflow routes only explicit public terms to the fixed search endpoint',()=>{
 assert.equal(workflow.active,false);
 assert.equal(nodes.get('i-Clusters webhook').parameters.authentication,'headerAuth');
 const payload={headers:{Authorization:'fixture header'},body:{message:'web: Proxmox backup',context:{private:true},history:['private']}};
 const web=runCode('Select request',payload);
 assert.deepEqual(web,{mode:'web',query:'Proxmox backup'});
 const params=nodes.get('Search public web').parameters;
 assert.equal(params.url,'https://api.search.brave.com/res/v1/web/search');
 assert.equal(params.queryParameters.parameters.find(p=>p.name==='q').value,'={{ $json.query }}');
 assert.equal(params.sendBody,undefined);
 const results=runCode('Format source links',{web:{results:[{title:'Documentation',url:'https://example.org/docs'}]}});
 assert.equal(results.webSearch,true);
 assert.match(results.answer,/https:\/\/example.org\/docs/);
 assert.equal(runCode('Format source links',{type:'search'}).webSearch,true);
 assert.throws(()=>runCode('Format source links',{error:'failed'}));
 payload.body.message='Review my cluster';
 const local=runCode('Select request',payload);
 assert.equal(local.mode,'cluster');assert.ok(!JSON.stringify(local).includes('fixture header'));
 assert.deepEqual(runCode('Extract model reply',{message:{content:'Local reply'}}),{answer:'Local reply'});
});
