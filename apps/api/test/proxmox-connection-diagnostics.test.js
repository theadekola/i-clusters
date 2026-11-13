import test from 'node:test';
import assert from 'node:assert/strict';
import {proxmoxTestError} from '../src/proxmox-test-error.js';
import {pairingTargets} from '../src/pairing-targets.js';
test('Proxmox connection diagnostics distinguish authentication, permissions, TLS, network and endpoint failures without secrets',()=>{
 for(const [error,pattern] of [[{providerStatus:401},/token secret/],[{providerStatus:403},/PVEAdmin/],[{noNodes:true},/Privilege Separation/],[{code:'DEPTH_ZERO_SELF_SIGNED_CERT'},/certificate/],[{code:'ERR_TLS_CERT_ALTNAME_INVALID'},/does not match/],[{code:'ECONNREFUSED'},/8006/],[{code:'ENOTFOUND'},/DNS/],[{code:'ETIMEDOUT'},/timeout/],[{code:'EHOSTUNREACH'},/VLANs/],[{invalidResponse:true},/node inventory/],[{providerStatus:503},/HTTP 503/],[{},/could not be checked/]]){
 const message=proxmoxTestError({...error,message:'SECRET_TOKEN'});assert.match(message,pattern);assert.doesNotMatch(message,/SECRET_TOKEN/);
 }
});
test('pairing selectors discover only the requested host kind and return distinct guest IDs',async()=>{
 const options={config:()=>({url:'https://pve',tokenId:'a@pve!t',tokenSecret:'secret'}),query:async()=>[{type:'node',node:'node01'},{type:'qemu',node:'node01',vmid:101,name:'Media Server'},{type:'lxc',node:'node01',vmid:102,name:'Media Server'}],agents:()=>[{id:'d',kind:'docker',name:'External Docker'},{id:'p',kind:'proxmox',name:'node02'}]};
 const nodes=await pairingTargets('proxmox',options);assert.deepEqual(nodes.targets.map(t=>t.name),['node01','node02']);
 const docker=await pairingTargets('docker',options);assert.equal(docker.targets.length,3);assert.equal(new Set(docker.targets.map(t=>t.id)).size,3);assert.ok(docker.targets.some(t=>t.label.includes('CT 102')));assert.ok(!JSON.stringify(docker).includes('secret'));
 await assert.rejects(pairingTargets('other',options),{status:400});
 const failed=await pairingTargets('docker',{...options,query:async()=>{throw {providerStatus:401,message:'secret'}}});assert.equal(failed.targets.length,1);assert.match(failed.discoveryError,/rejected the API token/);
 const unconfigured=await pairingTargets('proxmox',{...options,config:()=>({}),query:async()=>{throw Error('must not run')}});assert.equal(unconfigured.targets.length,1);
});

test('Docker pairing merges registered, direct and node-reported hosts with matching guests',async()=>{
 const vm=(vmid,name)=>({node:'east',vmid,type:'qemu',name});
 const rows=[vm(100,'Example-Server'),vm(103,'renamed'),vm(104,'direct-engine'),vm(105,'new'),vm(106,'unrelated'),vm(107,'unrelated'),vm(108,'other-display-name')];
 const agents=()=>[{id:'a',name:'example-server',hostname:'example-server',kind:'docker'},
  {id:'b',name:'old-name',kind:'docker',pairingTarget:'west:qemu/103'},
  {id:'p',name:'east',kind:'proxmox',hosts:[{id:'qemu/105',name:'new',online:true}]},
  {id:'c',name:'internal-linux-host',kind:'docker'}];
 const result=await pairingTargets('docker',{agents,network:()=>[{id:'c',kind:'docker',online:true,network:{interfaces:[{mac:'02:00:00:00:00:64',addresses:['192.0.2.40/24']}]}}],
  direct:async()=>({id:'direct',name:'direct-engine',aliases:['direct-engine','192.0.2.20']}),
  config:()=>({url:'https://pve',tokenId:'id',tokenSecret:'secret'}),query:async path=>path==='/cluster/resources'?rows:path.includes('/108/')?{net0:'virtio=02:00:00:00:00:64'}:{}});
 assert.equal(result.targets.length,rows.length);
 assert.deepEqual(result.targets.filter(t=>t.paired).map(t=>t.id).sort(),[100,103,104,105,108].map(id=>'east:qemu/'+id));
 assert.deepEqual(result.targets.filter(t=>!t.paired).map(t=>t.id).sort(),['east:qemu/106','east:qemu/107']);
});
