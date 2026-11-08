import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const result=await build({entryPoints:[new URL('../src/overview-data.ts',import.meta.url).pathname],bundle:true,format:'esm',platform:'node',write:false});const {overviewData}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const sample={nodes:[{id:'n1',name:'n1',status:'online',cpu:10,memoryPercent:20},{id:'n2',name:'n2',status:'offline',cpu:90,memoryPercent:80}],guests:[],storage:[{id:'storage/n1/local-lvm',node:'n1',usage:60,status:'online'},{id:'storage/n2/local-lvm',node:'n2',usage:90,status:'offline'}],resources:[{id:'a',name:'alpha',node:'n1',host:'guest1',kind:'Docker container',status:'running'},{id:'b',name:'beta',node:'n2',host:'guest2',kind:'Docker container',status:'running'}],alerts:[{id:'old',resourceId:'storage/n1/local-lvm',source:'local-lvm',status:'active'},{id:'new',node:'n1',source:'local-lvm',status:'active'},{id:'other',node:'n2',source:'local-lvm',status:'active'}],services:[{name:'proxmox',status:'reachable'},{name:'Docker n1 / guest1',provider:'docker',status:'reachable'}]};
test('services search never changes scoped container inventory',()=>{const d=overviewData(sample,null,'','alpha');assert.equal(d.resources.length,1);assert.equal(d.inventory.length,2);});
test('node ownership filters new and historical storage alerts and backups including global jobs',()=>{const d=overviewData(sample,{points:[{node:'n1'},{node:'n2'}],jobs:[{node:'n1'},{node:'n2'},{name:'global'}]},'n1','');assert.deepEqual(d.alerts.map(a=>a.id),['old','new']);assert.equal(d.points.length,1);assert.equal(d.jobs.length,2);});
test('resource averages exclude offline rows and return unknown when nothing reports',()=>{const d=overviewData(sample,null,'','');assert.equal(d.cpu,10);assert.equal(d.memory,20);assert.equal(d.disk,60);const offline=overviewData(sample,null,'n2','');assert.equal(offline.cpu,null);assert.equal(offline.memory,null);assert.equal(offline.disk,null);});
test('failed and partial readings never establish complete inventory',()=>{assert.equal(overviewData({...sample,services:[{name:'proxmox',status:'partial'}]},null,'','').inventoryKnown,false);assert.equal(overviewData({...sample,services:[{name:'proxmox',status:'error'}]},null,'','').inventoryKnown,false);assert.equal(overviewData({...sample,services:[...sample.services,{provider:'docker',status:'error'}]},null,'','').dockerKnown,false);});

test('backup summary requires complete configured archive coverage and explains an empty visible scope',()=>{
 const base={points:[],jobs:[],errors:[]};
 const unconfigured=overviewData(sample,{...base,archiveInventory:{configured:false,complete:false}},'','');assert.equal(unconfigured.backupKnown,false);assert.match(unconfigured.backupDetail,/Connect Proxmox/);
 const incomplete=overviewData(sample,{...base,archiveInventory:{configured:true,complete:false}},'','');assert.equal(incomplete.backupKnown,false);assert.match(incomplete.backupDetail,/incomplete/);
 const empty=overviewData(sample,{...base,archiveInventory:{configured:true,complete:true,visibleStorage:0}},'','');assert.equal(empty.backupKnown,true);assert.match(empty.backupDetail,/No Proxmox backup storage visible/);
 const measured=overviewData(sample,{...base,points:[{node:'n1'}],archiveInventory:{configured:true,complete:true,visibleStorage:1}},'','');assert.equal(measured.backupKnown,true);assert.equal(measured.points.length,1);assert.equal(measured.backupDetail,'Proxmox backup archives');
});

test('a node with one verified Docker host links even with an empty inventory; multiple engines stay unscoped',()=>{
 const data={nodes:[],resources:[],services:[{provider:'docker',hostId:'agent:qemu/101',node:'n1',status:'reachable',containerCount:0,runningCount:0},{provider:'docker',hostId:'agent:qemu/102',node:'n2',status:'reachable',containerCount:1,runningCount:1}]};
 const scoped=overviewData(data,null,'n1','');
 assert.equal(scoped.dockerHost,'agent:qemu/101');assert.equal(scoped.dockerKnown,true);assert.equal(scoped.dockerCount,0);
 assert.equal(overviewData(data,null,'','').dockerHost,null);
 assert.equal(overviewData(data,null,'n3','').dockerKnown,false);
});
