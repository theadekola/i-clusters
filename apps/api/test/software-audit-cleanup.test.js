import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'audit-cleanup-'));process.env.JWT_SECRET='a'.repeat(64);process.env.JWT_REFRESH_SECRET='b'.repeat(64);
const {createApp}=await import('../src/app.js');
const {createConfigurationStore}=await import('../src/runtime-configuration.js');
const {createMonitor}=await import('../src/monitor.js');
const {publicDockerImage,publicDockerVolume,publicComposeLabels}=await import('../src/docker-public.js');
const {retireProviders,removeRetiredConfigurations}=await import('../src/retired-providers.js');
const {captureRequestActivity}=await import('../src/header-notifications.js');
test.after(()=>fs.rmSync(process.env.DATA_DIR,{recursive:true,force:true}));
test('read-only Docker inspection and compose discovery never include arbitrary secret metadata',()=>{
 const secret='do-not-return',image=publicDockerImage({Id:'img',RootFS:{Type:'layers',Layers:['sha256:a']},Config:{Env:['PASSWORD='+secret]},ContainerConfig:{Cmd:[secret]}}),volume=publicDockerVolume({Name:'data',Driver:'local',Options:{o:'password='+secret},Labels:{token:secret},Status:{secret},UsageData:{Size:12,RefCount:1,secret}});
 assert.equal(image.Id,'img');assert.deepEqual(image.RootFS.Layers,['sha256:a']);assert.equal(volume.UsageData.Size,12);assert.ok(!JSON.stringify({image,volume}).includes(secret));assert.deepEqual(publicComposeLabels({'com.docker.compose.project':'project',token:secret}),{'com.docker.compose.project':'project'});
});
test('missing, offline and removed metric resources preserve acknowledged alerts until a measured recovery',async()=>{
 for(const provider of ['proxmox','truenas']){const state={metrics:[],rules:[{id:'disk',provider,metric:'storage',threshold:90,name:'Disk',severity:'warning'}],alerts:[]};let row={id:'disk',name:'disk',usage:95,status:'online'};const monitor=createMonitor({[provider]:{configured:()=>true,read:async()=>({info:{hostname:'nas'},nodes:[],[provider==='proxmox'?'storage':'pools']:row?[row]:[],errors:[]})}},{get:()=>state,mutate:f=>f(state)},async()=>[]);await monitor.sample(true);const alert=state.alerts[0];alert.status='acknowledged';for(const next of [{...row,usage:null},{...row,status:'offline',usage:0},null]){row=next;await monitor.sample(true);assert.equal(alert.status,'acknowledged');}row={id:'disk',name:'disk',usage:20,status:'online'};await monitor.sample(true);assert.equal(alert.status,'resolved');}
});
test('disabled metric rules deliberately end a condition while resources remain unavailable',async()=>{const state={metrics:[],rules:[{id:'r',provider:'proxmox',metric:'cpu',threshold:80,enabled:false}],alerts:[{id:'a',key:'rule:r:proxmox:n',ruleId:'r',provider:'proxmox',metric:'cpu',resourceId:'n',status:'acknowledged'}]};await createMonitor({proxmox:{configured:()=>true,read:async()=>({nodes:[],errors:[]})}},{get:()=>state,mutate:f=>f(state)},async()=>[]).sample(true);assert.equal(state.alerts[0].status,'resolved')});
test('retired integrations lose credentials, rules, attention and queued deliveries without removing other providers',()=>{
 const state={alerts:[{id:'old',provider:'opnsense'},{id:'keep',provider:'proxmox'}],rules:[{provider:'tailscale'},{provider:'all'}],notificationQueue:[{alertId:'old'},{alertId:'keep'}],headerActivities:[{link:'/vpn'},{category:'opnsense'},{link:'/docker'}],headerObservations:{'provider:tailscale':'online','node:a':'online'},metrics:[{tailscale:{},cpu:1}]};retireProviders(state);assert.deepEqual(state.alerts,[{id:'keep',provider:'proxmox'}]);assert.equal(state.rules.length,1);assert.equal(state.notificationQueue.length,1);assert.equal(state.headerActivities.length,1);assert.deepEqual(state.headerObservations,{'node:a':'online'});assert.deepEqual(state.metrics,[{cpu:1}]);for(const name of ['opnsense','tailscale','truenas'])fs.writeFileSync(path.join(process.env.DATA_DIR,name+'.json'),'fixture');removeRetiredConfigurations(process.env.DATA_DIR);assert.ok(fs.existsSync(path.join(process.env.DATA_DIR,'truenas.json')));assert.ok(!fs.existsSync(path.join(process.env.DATA_DIR,'opnsense.json')));
});
test('pairing verification does not create a completed-action notification',()=>{const state={};captureRequestActivity(state,{route:{path:'/api/node-agents/pairing/status'},method:'POST',user:{sub:'owner',role:'owner'}},200);assert.equal(state.headerActivities,undefined)});
test('retired integrations stay unavailable through the API',async()=>{
 const configuration=createConfigurationStore(path.join(process.env.DATA_DIR,'config'));
 const server=createApp({configuration,monitor:{sample:async()=>({services:[],alerts:[]}),invalidate(){}},audit:async()=>{},authenticate:(req,res,next)=>{req.user={sub:'test',role:'owner'};next()},db:{query:async()=>({rows:[]})}}).listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/api';
 try{
  for(const endpoint of ['/opnsense','/vpn'])assert.equal((await fetch(base+endpoint)).status,404);
  for(const id of ['opnsense','tailscale'])assert.equal((await fetch(base+'/configuration/'+id)).status,400);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});
