import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,useLocation,useNavigate} from 'react-router-dom';import {JSDOM} from 'jsdom';import {build} from 'esbuild';
function Location(){const location=useLocation(),navigate=useNavigate();return React.createElement(React.Fragment,null,React.createElement('output',{'data-location':location.pathname+location.search,hidden:true}),React.createElement('button',{onClick:()=>navigate(-1)},'Back'),React.createElement('button',{onClick:()=>navigate(1)},'Forward'))}
const rootPath=fileURLToPath(new URL('../',import.meta.url));
async function component(file){
 const directory=fs.mkdtempSync(path.join(rootPath,'node_modules','audit-ui-'));
 const result=await build({entryPoints:[path.join(rootPath,'src',file)],bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',write:false,plugins:[{name:'fixture-api',setup(b){b.onResolve({filter:/\/api$/},()=>({path:'fixture-api',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const clearTokens=()=>{};export const api=(...a)=>globalThis.__auditApi(...a);export const confirmedApi=(...a)=>globalThis.__auditConfirmed(...a);export function setDockerHost(id){localStorage.setItem('iclusters_docker_host',id);window.dispatchEvent(new Event('iclusters-connection'));}` }));}}]});
 const modulePath=path.join(directory,'component.mjs');fs.writeFileSync(modulePath,result.outputFiles[0].text);const module=await import(pathToFileURL(modulePath));return {module,cleanup:()=>fs.rmSync(directory,{recursive:true,force:true})};
}
async function mounted(file,props,api,mobile=true,initialEntries=['/storage?filter=keep']){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://iclusters.test'});const originals={};for(const k of ['window','document','localStorage','Event','CustomEvent','HTMLElement','ResizeObserver','FormData']){originals[k]=globalThis[k];globalThis[k]=dom.window[k];}
 globalThis.ResizeObserver=class {observe(){}disconnect(){}};dom.window.matchMedia=()=>({matches:mobile,addEventListener(){},removeEventListener(){}});globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.__auditApi=api;globalThis.__auditConfirmed=api;dom.window.confirm=()=>true;
 const built=await component(file),container=dom.window.document.getElementById('root'),root=createRoot(container);const Component=built.module.default;
 const render=async values=>{await act(async()=>{root.render(React.createElement(MemoryRouter,{initialEntries},React.createElement(Location),React.createElement(Component,values)));await new Promise(r=>setTimeout(r,0));});};
 await render(props);
 return {dom,container,render,click:async button=>{assert.ok(button,'Expected control is rendered');await act(async()=>{button.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));});},close:async()=>{await act(async()=>root.unmount());dom.window.close();built.cleanup();for(const k of Object.keys(originals)){if(originals[k]===undefined)delete globalThis[k];else globalThis[k]=originals[k];}delete globalThis.__auditApi;delete globalThis.__auditConfirmed;}};
}
const button=(container,label)=>[...container.querySelectorAll('button')].find(b=>b.textContent.trim()===label);
const pool=(id)=>({id:id+'/local',provider:'proxmox',name:'local',node:id,type:'dir',status:'online',capacity:1000,used:400,available:600,usage:40});
const inventory={pools:[pool('a'),pool('b')],summary:{pools:2,online:2,capacity:2000,used:800,available:1200},snapshots:[{id:'s1'},{id:'s2'}],alerts:[],services:[],errors:[]};
test('snapshot overview card displays the count under its correct label',async()=>{
 const page=await mounted('pages/Storage.tsx',{},async p=>p==='/auth/me'?{user:{role:'viewer'}}:p==='/storage?view=pools'?inventory:{tasks:[],history:[],content:[]});try{const stats=page.container.querySelector('.storage-overview-stats');assert.equal(stats.children[4].querySelector('strong').textContent,'2');assert.equal(stats.children[4].querySelector('small').textContent,'Snapshots')}finally{await page.close()}
});
test('inspecting a pool keeps one history and content request',async()=>{
 const calls=[];const page=await mounted('pages/Storage.tsx',{},async p=>{calls.push(p);return p==='/auth/me'?{user:{role:'viewer'}}:p==='/storage?view=pools'?inventory:{tasks:[],history:[],content:[]}});try{const target='/proxmox/storage/a/local?timeframe=day';assert.equal(calls.filter(p=>p===target).length,1);await page.click(page.container.querySelector('button[aria-label^="Inspect "]'));assert.equal(calls.filter(p=>p===target).length,1);assert.equal(page.container.querySelectorAll('[aria-label="History period"]').length,1)}finally{await page.close()}
});
test('Storage tabs preserve query parameters and follow browser history',async()=>{
 const page=await mounted('pages/Storage.tsx',{},async p=>p==='/auth/me'?{user:{role:'viewer'}}:p==='/storage?view=pools'?inventory:{resources:[],tasks:[],errors:[]});try{await page.click([...page.container.querySelectorAll('[role=tab]')].find(b=>b.textContent==='Disks'));assert.ok(page.container.querySelector('.storage-disks'));assert.equal(page.container.querySelector('[data-location]').getAttribute('data-location'),'/storage?filter=keep&tab=Disks');await page.click(button(page.container,'Back'));assert.equal(page.container.querySelector('[aria-selected=true]').textContent,'Storage Pools');await page.click(button(page.container,'Forward'));assert.equal(page.container.querySelector('[aria-selected=true]').textContent,'Disks')}finally{await page.close()}
});
const shares=[{id:'a',resourceId:1,name:'A',protocol:'SMB',provider:'truenas',path:'/mnt/tank/a',description:'A original',enabled:true},{id:'b',resourceId:2,name:'B',protocol:'SMB',provider:'truenas',path:'/mnt/tank/b',description:'B original',enabled:true}];
test('share forms close when their original resource disappears and cannot write to a replacement',async()=>{
 let resources=shares;const writes=[];const page=await mounted('pages/StorageShares.tsx',{onTab(){}},async(p,init)=>{if(init?.method){writes.push({p,body:JSON.parse(init.body)});return {}}return p==='/auth/me'?{user:{role:'owner'}}:{resources,services:[],truenasEnabled:true,errors:[]}});
 try{await page.click(button(page.container,'Edit Share'));assert.equal(page.container.querySelector('input[name=path]').value,'/mnt/tank/a');const oldForm=page.container.querySelector('.modal form'),oldSubmit=oldForm[Object.keys(oldForm).find(k=>k.startsWith('__reactProps'))].onSubmit;resources=[shares[1]];await act(async()=>{const detail={prefixes:['/storage/shares'],requests:[]};window.dispatchEvent(new CustomEvent('iclusters-resource-refresh',{detail}));await Promise.all(detail.requests)});assert.ok(page.container.querySelector('.share-detail-card').textContent.includes('B'));assert.equal(page.container.querySelector('.modal'),null);assert.ok(page.container.textContent.includes('selected resource changed'));await act(async()=>oldSubmit({preventDefault(){},currentTarget:oldForm}));assert.deepEqual(writes,[]);await page.click(button(page.container,'Edit Share'));assert.equal(page.container.querySelector('input[name=path]').value,'/mnt/tank/b');await act(async()=>{page.container.querySelector('.modal form').dispatchEvent(new page.dom.window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0))});assert.equal(writes[0].p,'/storage/shares/smb/2');assert.equal(writes[0].body.path,'/mnt/tank/b');}finally{await page.close()}
});
const datasets=[{id:'a',name:'tank/a',resourceId:'tank/a',pool:'tank',provider:'truenas',type:'Dataset',mountpoint:'/mnt/tank/a'},{id:'b',name:'tank/b',resourceId:'tank/b',pool:'tank',provider:'truenas',type:'Dataset',mountpoint:'/mnt/tank/b'}];
test('dataset permission forms close when the original dataset disappears',async()=>{
 let resources=datasets;const writes=[];const page=await mounted('pages/StorageDatasets.tsx',{onTab(){}},async(p,init)=>{if(init?.method){writes.push({p,body:JSON.parse(init.body)});return {}}return p==='/auth/me'?{user:{role:'owner'}}:p.includes('/permissions?')?{permissions:{uid:1000,gid:1000}}:{resources,summary:{},snapshots:[],truenasEnabled:true,errors:[]}});
 try{await page.click(button(page.container,'View Permissions'));await page.click(button(page.container,'Set Permissions'));page.container.querySelector('input[name=mode]').value='750';resources=[datasets[1]];await act(async()=>{const detail={prefixes:['/storage/datasets'],requests:[]};window.dispatchEvent(new CustomEvent('iclusters-resource-refresh',{detail}));await Promise.all(detail.requests)});assert.equal(page.container.querySelector('.modal'),null);assert.deepEqual(writes,[]);await page.click(button(page.container,'View Permissions'));await page.click(button(page.container,'Set Permissions'));page.container.querySelector('input[name=mode]').value='750';await act(async()=>{page.container.querySelector('.modal form').dispatchEvent(new page.dom.window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0))});assert.equal(writes[0].body.dataset,'tank/b');}finally{await page.close()}
});
test('dataset browse content is cleared when selection changes',async()=>{
 const page=await mounted('pages/StorageDatasets.tsx',{onTab(){}},async p=>p==='/auth/me'?{user:{role:'owner'}}:p.includes('/browse?')?{entries:[{name:'secret-file-from-a',path:'/mnt/tank/a/file',type:'FILE',size:1}]}:{resources:datasets,summary:{},snapshots:[],truenasEnabled:true,errors:[]});try{await page.click(button(page.container,'Browse Dataset'));const filter=page.container.querySelector('[aria-label="Search datasets or volumes"]');await act(async()=>{filter[Object.keys(filter).find(k=>k.startsWith('__reactProps'))].onChange({target:{value:'tank/b'}})});assert.equal(page.container.querySelector('.modal'),null);assert.ok(!page.container.textContent.includes('secret-file-from-a'))}finally{await page.close()}
});
test('late SMART failures cannot appear under a different selected disk',async()=>{
 let fail;const resources=[{id:'a',name:'/dev/sda',node:'a',provider:'proxmox',size:100},{id:'b',name:'/dev/sdb',node:'b',provider:'proxmox',size:200}];const page=await mounted('pages/StorageDisks.tsx',{onTab(){}},async p=>p.includes('/smart?')?new Promise((_r,reject)=>fail=reject):{resources});try{await page.click(button(page.container,'Read S.M.A.R.T.'));const host=page.container.querySelector('[aria-label="Disk host"]');await act(async()=>{host.value='b';host.dispatchEvent(new page.dom.window.Event('change',{bubbles:true}))});await act(async()=>fail(Error('Disk A read failed')));await page.click(page.container.querySelector('button[aria-label="Inspect /dev/sdb on b"]'));assert.ok(page.container.querySelector('.disk-details').textContent.includes('b'));assert.equal(page.container.querySelector('[role=alert]'),null);assert.equal(button(page.container,'Read S.M.A.R.T.').disabled,false)}finally{await page.close()}
});
test('Performance source and time-range changes request the selected measurements',async()=>{
 const paths=[],sources=[{id:'node:a',node:'a',name:'a',type:'node'},{id:'qemu:b:200',node:'b',name:'vm',type:'qemu'}];const page=await mounted('pages/StoragePerformance.tsx',{onTab(){}},async p=>{paths.push(p);return {sources,selected:p.includes('qemu')?sources[1]:sources[0],series:[{time:1700000000000,cpu:25,memoryPercent:50,diskRead:1048576,diskWrite:1048576,netIn:1048576,netOut:0}],current:{status:'running'},pools:[],errors:[]}});try{const source=page.container.querySelector('[aria-label="Performance source"]');await act(async()=>{source.value='qemu:b:200';source.dispatchEvent(new page.dom.window.Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,0))});const period=page.container.querySelector('[aria-label="Performance time range"]');await act(async()=>{period.value='week';period.dispatchEvent(new page.dom.window.Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,0))});assert.ok(paths.includes('/storage/performance?timeframe=week&source=qemu%3Ab%3A200'));assert.ok(page.container.querySelector('.performance-stats').textContent.includes('2.00 MiB/s'));assert.ok(page.container.querySelector('.performance-stats').textContent.includes('25.0%'))}finally{await page.close()}
});

test('pending share and dataset reads are cancelled and late results cannot reopen changed resources',async()=>{
 for(const [file,resources,readButton,readPath] of [['StorageShares',shares,'Permissions','/permissions'],['StorageDatasets',datasets,'View Permissions','/permissions?']]){
  let complete,signal;const page=await mounted('pages/'+file+'.tsx',{onTab(){}},async(p,init)=>p==='/auth/me'?{user:{role:'owner'}}:p.includes(readPath)?new Promise(r=>{complete=r;signal=init.signal}):{resources,summary:{},services:[],snapshots:[],truenasEnabled:true,errors:[]});try{await page.click(button(page.container,readButton));await page.click(page.container.querySelector(file==='StorageShares'?'button[aria-label="Inspect B"]':'tr[aria-label="Select tank/b"]'));assert.equal(signal.aborted,true);assert.equal(page.container.querySelector('.modal'),null);await act(async()=>complete({permissions:{uid:987654}}));assert.ok(!page.container.textContent.includes('987654'))}finally{await page.close()}
 }
});
test('the same resource ID with a changed filesystem path invalidates open permission forms',async()=>{
 let resources=datasets;const writes=[];const page=await mounted('pages/StorageDatasets.tsx',{onTab(){}},async(p,init)=>{if(init?.method){writes.push(p);return {}}return p==='/auth/me'?{user:{role:'owner'}}:p.includes('/permissions?')?{permissions:{uid:1000}}:{resources,summary:{},snapshots:[],truenasEnabled:true,errors:[]}});try{await page.click(button(page.container,'View Permissions'));await page.click(button(page.container,'Set Permissions'));resources=[{...datasets[0],mountpoint:'/mnt/tank/moved'},datasets[1]];await act(async()=>{const detail={prefixes:['/storage/datasets'],requests:[]};window.dispatchEvent(new CustomEvent('iclusters-resource-refresh',{detail}));await Promise.all(detail.requests)});assert.equal(page.container.querySelector('.modal'),null);assert.deepEqual(writes,[])}finally{await page.close()}
});
test('Storage deep links reopen supported tabs and invalid values fall back to pools',async()=>{
 for(const [tab,expected] of [['Shares','Shares'],['Datasets / Volumes','Datasets / Volumes'],['removed-tab','Storage Pools']]){const page=await mounted('pages/Storage.tsx',{},async p=>p==='/auth/me'?{user:{role:'viewer'}}:p==='/storage?view=pools'?inventory:{resources:[],tasks:[],summary:{},services:[],errors:[]},true,['/storage?tab='+encodeURIComponent(tab)]);try{assert.equal(page.container.querySelector('[aria-selected=true]').textContent,expected)}finally{await page.close()}}
});
test('partial coverage is visible with missing nodes and unavailable cluster totals',async()=>{
 const d={...inventory,summary:{...inventory.summary,complete:false,capacity:null,used:null,available:null,measuredCapacity:1000,coverage:{complete:false,missingNodes:['b']}}};const page=await mounted('pages/Storage.tsx',{},async p=>p==='/auth/me'?{user:{role:'viewer'}}:p==='/storage?view=pools'?d:{history:[],tasks:[],content:[]});try{assert.ok(page.container.textContent.includes('Missing nodes: b'));assert.equal(page.container.querySelector('.storage-overview-stats').children[1].querySelector('strong').textContent,'Unavailable')}finally{await page.close()}
});
test('late SMART success cannot overwrite a newer selected-disk report or clear its loading state',async()=>{
 let completeA,completeB,signalA;const resources=[{id:'a',name:'/dev/sda',node:'a',provider:'proxmox'},{id:'b',name:'/dev/sdb',node:'b',provider:'proxmox'}];const page=await mounted('pages/StorageDisks.tsx',{onTab(){}},async(p,init)=>p.includes('/a/smart?')?new Promise(r=>{completeA=r;signalA=init.signal}):p.includes('/b/smart?')?new Promise(r=>completeB=r):{resources});try{await page.click(button(page.container,'Read S.M.A.R.T.'));await page.click(page.container.querySelector('button[aria-label="Inspect /dev/sdb on b"]'));assert.equal(signalA.aborted,true);await page.click(button(page.container,'Read S.M.A.R.T.'));await act(async()=>completeA({report:{health:'OLD REPORT'},sampledAt:new Date().toISOString()}));assert.ok(button(page.container,'Reading...').disabled);assert.ok(!page.container.textContent.includes('OLD REPORT'));await act(async()=>completeB({report:{health:'PASSED'},sampledAt:new Date().toISOString()}));assert.ok(page.container.querySelector('.disk-details').textContent.includes('PASSED'))}finally{await page.close()}
});

const clusterConfigurations=[{id:'local',type:'dir',content:['import','iso','vztmpl'],path:'/var/lib/vz',nodes:[],shared:false,enabled:true},{id:'backup-ssd',type:'dir',content:['backup'],path:'/mnt/pve/backup-ssd',nodes:['node01'],shared:false,enabled:true},{id:'local-lvm',type:'lvmthin',content:['images','rootdir'],vgname:'pve',thinpool:'data',nodes:[],shared:false,enabled:true},{id:'media-storage',type:'dir',content:['snippets','vztmpl','backup','images','iso','rootdir'],path:'/mnt/pve/media-storage',nodes:['node02'],shared:false,enabled:true}];
test('Storage Configuration shows each enabled cluster storage ID once even when its node mount is offline',async()=>{
 const page=await mounted('pages/Storage.tsx',{},async p=>p==='/auth/me'?{user:{role:'viewer'}}:p==='/proxmox/storage/configuration'?{resources:clusterConfigurations}:p==='/storage?view=pools'?{...inventory,pools:[{id:'node02/media-storage',name:'media-storage',node:'node02',provider:'proxmox',status:'offline'}]}:{tasks:[],content:[],history:[]});
 try{const availability=page.container.querySelector('[aria-label="Storage availability"]');await act(async()=>{availability.value='not-assigned';availability.dispatchEvent(new page.dom.window.Event('change',{bubbles:true}));});await page.click([...page.container.querySelectorAll('[role=tab]')].find(b=>b.textContent==='Configuration'));assert.equal(page.container.querySelectorAll('.configuration-table tbody tr').length,4);const row=[...page.container.querySelectorAll('.configuration-table tbody tr')].find(row=>row.textContent.includes('media-storage'));assert.equal(row.querySelector('.badge.green').textContent,'Enabled');assert.ok(row.textContent.includes('/mnt/pve/media-storage'));assert.ok(row.textContent.includes('node02'));assert.ok(!row.querySelector('[aria-label^="Disable storage"]'));assert.equal(page.container.querySelector('.storage-scope-note'),null);await page.click(page.container.querySelector('[aria-label="View contents media-storage"]'));assert.match(page.container.textContent,/Storage Contents/);assert.equal(page.container.querySelector('.modal'),null);await page.click(button(page.container,'Back to Configuration'));assert.equal(page.container.querySelectorAll('.configuration-table tbody tr').length,4);}finally{await page.close()}
});
test('configuration power action sends the chosen cluster enable state and failures remain visible',async()=>{
 for(const fail of [false,true]){const writes=[];let enabled=false,changed=0;const page=await mounted('pages/StorageConfiguration.tsx',{admin:true,onTab(){},onChanged(){changed++}},async(p,init)=>{if(init?.method==='PUT'){writes.push({p,body:JSON.parse(init.body)});if(fail)throw Error('Proxmox permission denied');enabled=true;return {}}return {resources:[{...clusterConfigurations[0],enabled},{...clusterConfigurations[1],id:'unknown',enabled:null}]}});
 try{assert.equal(page.container.querySelector('[aria-label="Enable storage unknown across assigned nodes"]').disabled,true);await page.click(page.container.querySelector('[aria-label="Enable storage local across assigned nodes"]'));assert.deepEqual(writes,[{p:'/proxmox/storage/local/enabled',body:{enabled:true}}]);if(fail){assert.ok(page.container.querySelector('[role=alert]').textContent.includes('permission denied'));assert.equal(changed,0)}else{assert.ok(page.container.querySelector('[aria-label="Disable storage local across assigned nodes"]'));assert.equal(changed,1);assert.ok(page.container.querySelector('[role=status]').textContent.includes('enabled in the cluster configuration'))}await page.click(button(page.container,'Configure Disk'));assert.ok(page.container.querySelector('.modal select[aria-label="Disk / storage"]'));}finally{await page.close()}}
});
test('configuration read errors can be retried without reporting any fabricated enabled storage',async()=>{
 let reads=0;const page=await mounted('pages/StorageConfiguration.tsx',{admin:false,onTab(){},onChanged(){}},async()=>{if(++reads===1)throw Error('Storage configuration unavailable');return {resources:clusterConfigurations}});
 try{assert.ok(page.container.querySelector('[role=alert]'));assert.equal(page.container.querySelectorAll('tbody tr').length,0);assert.ok([...page.container.querySelectorAll('.storage-configuration-stats .stat-value')].every(el=>el.textContent==='Unknown'));await page.click(button(page.container,'Refresh'));assert.equal(page.container.querySelectorAll('tbody tr').length,4);assert.equal(page.container.querySelector('[role=alert]'),null);}finally{await page.close()}
});

test('storage pools hide foreign node registrations and open TrueNAS setup directly without the scope note',async()=>{
 const page=await mounted('pages/Storage.tsx',{},async p=>p==='/auth/me'?{user:{role:'owner'}}:p.startsWith('/storage?')?{pools:[{id:'node01/local',name:'local',provider:'proxmox',node:'node01',status:'online',applicable:true},{id:'node01/media-storage',name:'media-storage',provider:'proxmox',node:'node01',status:'not-assigned',applicable:false},{id:'node01/backup',name:'offline-backup',provider:'proxmox',node:'node01',status:'offline',applicable:true}],summary:{},providerInventory:{truenas:{configured:false}}}:{tasks:[]});
 try{const table=page.container.querySelector('.storage-pool-table');assert.ok(!table.textContent.includes('media-storage'));assert.ok(table.textContent.includes('offline-backup'));assert.equal(page.container.querySelector('.storage-scope-note'),null);const add=[...page.container.querySelectorAll('a')].find(a=>a.textContent==='Connect TrueNAS');assert.ok(add);assert.equal(add.getAttribute('href'),'/settings?tab=Connections&setup=truenas');await page.click(add);assert.equal(page.container.querySelector('output').getAttribute('data-location'),'/settings?tab=Connections&setup=truenas');}finally{await page.close()}
});

test('dataset selection keeps scoped guest usage in the table without a resource details popup',async()=>{
 const resource={id:'proxmox:one:local:vm-100-disk-0',resourceId:'local:vm-100-disk-0',name:'local:vm-100-disk-0',node:'one',provider:'proxmox',type:'VM Volume',pool:'local',size:200,used:null,available:null,guestUsage:{used:40,available:60,total:100,scope:'guest'},status:'Reported'};
 const page=await mounted('pages/StorageDatasets.tsx',{onTab(){}},async p=>p==='/auth/me'?{user:{role:'viewer'}}:{resources:[resource],summary:{},errors:[]});
 try{assert.equal(page.container.querySelector('.dataset-layout .dataset-detail-card'),null);assert.equal(page.container.querySelector('.modal'),null);assert.match(page.container.querySelector('tbody').textContent,/Guest total/);await page.click(page.container.querySelector('tbody .resource-identity'));assert.equal(page.container.querySelector('.modal'),null);assert.ok(page.container.querySelector('tbody'));}finally{await page.close()}
});

const GiB=1024**3;
const disk={id:'disk-b',name:'local:vm-101-disk-0',resourceId:'local:vm-101-disk-0',provider:'proxmox',node:'node01',vmid:101,type:'VM Volume',pool:'local',disk:'scsi0',size:120*GiB,revision:'fresh',connectionScope:'connection'};
const layout={model:disk,connectionScope:'connection',plan:{supported:true,token:'guest-token',diskBytes:150*GiB,capacityBytes:50*GiB,availableBytes:10*GiB,source:'/dev/vg/root',filesystem:'ext4',missingTools:[]}};
const expanded={verified:true,changed:true,before:{capacityBytes:50*GiB},after:{capacityBytes:150*GiB,availableBytes:100*GiB}};
async function submitResize(page,modal){
 modal.querySelector('input[name=sizeGiB]').value='150';
 await act(async()=>{
  modal.querySelector('form').dispatchEvent(new page.dom.window.Event('submit',{bubbles:true,cancelable:true}));
  await new Promise(resolve=>setTimeout(resolve,0));
 });
}

test('Modify disk keeps the dialog open until the selected VM resize and allocation are verified',async()=>{
 const writes=[],resources=[{...disk,id:'disk-a',name:'other'},disk];
 let finishTask,finishResize,reads=0,checks=0;
 const page=await mounted('pages/StorageDatasets.tsx',{onTab(){}},async(path,init)=>{
  if(init?.method==='PUT'){
   writes.push([path,JSON.parse(init.body)]);
   return path.endsWith('/guest-expand')?{result:expanded}:{result:{task:'UPID:node01:task'}};
  }
  if(path==='/auth/me')return {user:{role:'owner'}};
  if(path.startsWith('/storage/datasets/edit?')){
   const params=new URLSearchParams(path.split('?')[1]);
   assert.equal(params.get('resourceId'),disk.resourceId);assert.equal(params.get('vmid'),'101');
   return ++reads===1?disk:new Promise(resolve=>finishResize=resolve);
  }
  if(path==='/tasks/node01/UPID%3Anode01%3Atask')return new Promise(resolve=>finishTask=resolve);
  if(path.startsWith('/storage/datasets/guest-layout?')){checks++;return reads===1?layout:{...layout,model:{...disk,size:150*GiB,revision:'after-resize'}}}
  return {resources,summary:{},errors:[]};
 });
 try{
  const edit=page.container.querySelector('[aria-label="Modify disk local:vm-101-disk-0"]');
  assert.equal(edit.textContent,'Modify disk');assert.equal(edit.querySelector('svg'),null);
  assert.equal(button(page.container,'Select'),undefined);
  await page.click(edit);const modal=page.container.querySelector('[role=dialog]');
  await submitResize(page,modal);
  assert.deepEqual(writes,[['/storage/datasets/edit',{provider:'proxmox',resourceId:disk.resourceId,node:'node01',vmid:101,revision:'fresh',connectionScope:'connection',sizeGiB:150,allocationMode:'guest'}]]);
  assert.equal(checks,1);assert.match(modal.textContent,/Verifying the new disk size/);
  await act(async()=>finishTask({status:'stopped',exitstatus:'OK'}));
  assert.equal(checks,1);assert.equal(modal.querySelector('form'),null);
  await act(async()=>finishResize({...disk,size:150*GiB}));
  assert.equal(checks,2);assert.ok(page.container.querySelector('[role=dialog]')===modal);
  assert.match(modal.textContent,/Allocate disk space/);assert.equal(writes.length,1);
  await page.click(button(modal,'Expand guest filesystem'));
  assert.deepEqual(writes[1],['/storage/datasets/guest-expand',{provider:'proxmox',resourceId:disk.resourceId,node:'node01',vmid:101,revision:'after-resize',connectionScope:'connection',guestToken:'guest-token'}]);
  assert.match(modal.querySelector('.connection-success').textContent,/Disk expanded successfully.*50 GiB to 150 GiB/);
 }finally{await page.close()}
});

test('a failed task or interrupted verification never starts allocation or submits another resize',async()=>{
 let outcome='failed',checks=0,writes=0;
 const page=await mounted('components/StorageResourceEditor.tsx',{resource:disk,onClose(){},onSaved(){}},async(path,init)=>{
  if(init?.method){writes++;return {result:{task:'UPID:node01:task'}}}
  if(path.startsWith('/tasks/')){
   if(outcome==='offline')throw Error('Connection unavailable');
   return {status:'stopped',exitstatus:outcome==='failed'?'ERROR':'OK'};
  }
  if(path.includes('/guest-layout')){checks++;return layout}
  return {...disk,size:(writes?150:120)*GiB,connectionScope:writes?'changed':'connection'};
 });
 try{
  const modal=page.container.querySelector('[role=dialog]');await submitResize(page,modal);
  assert.match(modal.querySelector('[role=alert]').textContent,/ERROR/);
  outcome='offline';await page.click(button(modal,'Check resize status'));
  assert.match(modal.querySelector('[role=alert]').textContent,/unavailable/);
  outcome='ok';await page.click(button(modal,'Check resize status'));
  assert.match(modal.querySelector('[role=alert]').textContent,/connection changed/);
  assert.equal(writes,1);assert.equal(checks,1);assert.equal(modal.querySelector('.connection-success'),null);
 }finally{await page.close()}
});

test('unsupported VM layout requires an explicit disk-only resize and never starts guest allocation',async()=>{
 let reads=0,checks=0;const writes=[];
 const page=await mounted('components/StorageResourceEditor.tsx',{resource:disk,onClose(){},onSaved(){}},async(path,init)=>{
  if(init?.method){writes.push(JSON.parse(init.body));return {result:{accepted:true}}}
  if(path.includes('/guest-layout')){checks++;throw Error('Automatic allocation requires one attached disk')}
  return {...disk,size:(++reads===1?120:150)*GiB};
 });
 try{
  const modal=page.container.querySelector('[role=dialog]');
  assert.match(modal.textContent,/one attached disk/);assert.equal(button(modal,'Save Changes'),undefined);
  await submitResize(page,modal);assert.equal(writes.length,0);
  await page.click(button(modal,'Expand virtual disk only'));
  assert.equal(writes.length,1);assert.equal(writes[0].allocationMode,'disk-only');assert.equal(checks,1);
  assert.match(modal.querySelector('.connection-success').textContent,/Guest filesystem allocation was skipped/);
 }finally{await page.close()}
});

test('a synchronous container resize confirms the measured size without a VM allocation step',async()=>{
 let resized=false;
 const resource={...disk,type:'CT Volume',disk:'rootfs'};
 const page=await mounted('components/StorageResourceEditor.tsx',{resource,onClose(){},onSaved(){}},async(path,init)=>{
  assert.match(path,/datasets\/edit/);
  if(init?.method){resized=true;return {result:{accepted:true}}}
  return {...resource,size:(resized?150:120)*GiB};
 });
 try{
  const modal=page.container.querySelector('[role=dialog]');await submitResize(page,modal);
  assert.match(modal.querySelector('.connection-success').textContent,/Disk expanded successfully/);
 }finally{await page.close()}
});

test('TrueNAS edit failures retain the form and cancelling an editor cannot submit an old form',async()=>{
 const writes=[],resource=datasets[0],page=await mounted('pages/StorageDatasets.tsx',{onTab(){}},async(p,init)=>{
  if(p==='/auth/me')return {user:{role:'owner'}};
  if(p.startsWith('/storage/datasets/edit?'))return {...resource,revision:'fresh',connectionScope:'connection',compression:'LZ4',readonly:'OFF',quota:0};
  if(init?.method){writes.push(JSON.parse(init.body));throw Error('Storage settings changed. Reopen Edit.');}
  return {resources:datasets,summary:{},errors:[]};
 });
 try{
  await page.click(page.container.querySelector('[aria-label="Modify disk tank/a"]'));const form=page.container.querySelector('.modal form');form.querySelector('[name=quotaGiB]').value='50';
  await act(async()=>{form.dispatchEvent(new page.dom.window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0))});assert.match(page.container.querySelector('.modal [role=alert]').textContent,/settings changed/);assert.equal(form.querySelector('[name=quotaGiB]').value,'50');assert.equal(writes[0].resourceId,'tank/a');
  const submit=form[Object.keys(form).find(k=>k.startsWith('__reactProps'))].onSubmit;await page.click(button(page.container,'Cancel'));await act(async()=>submit({preventDefault(){},currentTarget:form}));assert.equal(writes.length,1);assert.equal(page.container.querySelector('.modal'),null);
 }finally{await page.close()}
});


test('checking existing space shows the verified result in a popup without resizing the disk',async()=>{
 for(const result of [expanded,{...expanded,changed:false,after:expanded.before},{verified:false}]){
  const writes=[];
  const page=await mounted('components/StorageResourceEditor.tsx',{resource:disk,onClose(){},onSaved(){}},async(path,init)=>{
   if(init?.method){writes.push(path);return {result}}
   return path.includes('/guest-layout')?layout:disk;
  });
  try{
   const modal=page.container.querySelector('[role=dialog]');
   await page.click(button(modal,'Check usable space'));
   assert.match(modal.textContent,/50 GiB/);assert.equal(modal.querySelector('form'),null);
   await page.click(button(modal,'Expand guest filesystem'));
   assert.deepEqual(writes,['/storage/datasets/guest-expand']);
   if(result.verified)assert.match(modal.querySelector('.connection-success').textContent,result.changed?/Disk expanded successfully/:/Capacity is unchanged/);
   else{assert.match(modal.querySelector('[role=alert]').textContent,/not verified/);assert.equal(modal.querySelector('.connection-success'),null)}
   assert.equal(button(modal,'Expand guest filesystem'),undefined);
  }finally{await page.close()}
 }
});
test('unsupported guest allocation cannot execute and errors require checking the layout again',async()=>{
 for(const unsupported of [true,false]){
  const writes=[];
  const page=await mounted('components/GuestStorageAllocation.tsx',{resource:disk,onComplete(){assert.fail('unexpected completion')},onBusy(){}},async(path,init)=>{
   if(init?.method){writes.push(path);throw Error('Guest storage changed. Recheck before retrying.')}
   return {...layout,plan:{...layout.plan,supported:!unsupported,missingTools:unsupported?['growpart']:[]}};
  });
  try{
   const expand=button(page.container,'Expand guest filesystem');assert.equal(expand.disabled,unsupported);
   if(unsupported){assert.match(page.container.textContent,/growpart/);assert.equal(writes.length,0)}
   else{await page.click(expand);assert.match(page.container.querySelector('[role=alert]').textContent,/Recheck/);assert.equal(button(page.container,'Expand guest filesystem'),undefined)}
  }finally{await page.close()}
 }
});

test('Configure Disk selects detected storage and saves compatible uses against the current revision',async()=>{
 const calls=[],model={id:'local',type:'dir',path:'/var/lib/vz',content:['iso'],allowedContent:['iso','backup','import'],nodes:['one'],enabled:true,shared:false,revision:'fresh',connectionScope:'scope'};
 const page=await mounted('components/DiskConfiguration.tsx',{onSaved(){},onBusy(){}},async(p,init)=>{calls.push({p,init});if(init?.method)return {ok:true};return p==='/proxmox/storage-options'?{resources:[{id:'local',type:'dir'}],nodes:[{node:'one'}],connectionScope:'scope'}:model});
 try{const selector=page.container.querySelector('[aria-label="Disk / storage"]');assert.equal(selector.tagName,'SELECT');await act(async()=>{selector.value='local';selector.dispatchEvent(new page.dom.window.Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,0))});const backup=[...page.container.querySelectorAll('fieldset label')].find(l=>l.textContent==='Backups').querySelector('input');await page.click(backup);await act(async()=>{page.container.querySelector('form').dispatchEvent(new page.dom.window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0))});const write=calls.find(c=>c.init?.method);assert.equal(write.p,'/proxmox/storage-configure');assert.deepEqual(JSON.parse(write.init.body),{mode:'existing',node:'one',id:'local',content:['iso','backup'],nodes:['one'],enabled:true,shared:false,revision:'fresh',connectionScope:'scope'});assert.equal(page.container.querySelector('input[name=path]'),null)}finally{await page.close()}
});
test('configuration eye opens contents with file import and backup-only storage opens its dataset scope',async()=>{
 for(const backup of [false,true]){
  const row={id:backup?'backup-ssd':'local',type:'dir',content:backup?['backup']:['iso'],enabled:true,nodes:['one']};const calls=[];
  const page=await mounted('pages/StorageConfiguration.tsx',{admin:true,onTab(){},onChanged(){}},async(p,init)=>{calls.push({p,init});if(init?.method==='POST')return {result:{uploadId:'ticket'}};if(init?.method==='PUT')return {result:{accepted:true,filename:'unique-linux.iso'}};if(p==='/proxmox/storage/configuration')return {resources:[row]};if(p==='/proxmox/storage')return {resources:[{name:'local',node:'one'}]};return {files:[{volid:'local:iso/existing.iso',content:'iso',size:100}],uploadTypes:['iso'],connectionScope:'scope'}});
  try{await page.click(page.container.querySelector('[aria-label="View contents '+row.id+'"]'));if(backup){assert.match(page.container.querySelector('[data-location]').getAttribute('data-location'),/tab=Restore%20Points&storage=backup-ssd/)}else{assert.match(page.container.textContent,/existing.iso/);assert.equal(page.container.querySelector('.task-details'),null);await page.click(button(page.container,'Import File'));const file=new page.dom.window.File(['iso bytes'],'linux.iso',{type:'application/octet-stream'}),input=page.container.querySelector('[aria-label="File to import"]');await act(async()=>input[Object.keys(input).find(k=>k.startsWith('__reactProps'))].onChange({target:{files:[file]}}));await act(async()=>{page.container.querySelector('.modal form').dispatchEvent(new page.dom.window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0))});const prepared=calls.find(c=>c.init?.method==='POST');assert.equal(JSON.parse(prepared.init.body).id,'local');assert.equal(JSON.parse(prepared.init.body).filename,'linux.iso');const sent=calls.find(c=>c.init?.method==='PUT');assert.equal(sent.p,'/proxmox/storage-file-upload/ticket');assert.equal(sent.init.body,file);assert.equal(sent.init.headers['Content-Type'],'application/octet-stream');assert.match(page.container.textContent,/File imported as unique-linux.iso/);}}
  finally{await page.close()}
 }
});

test('a slow manual content refresh cannot replace files from a newly selected node',async()=>{
 let reads=0,complete;const storage={id:'local',content:['iso'],nodes:['one','two']};const page=await mounted('components/StorageContents.tsx',{storage,admin:false,onBack(){}},async p=>{if(p==='/proxmox/storage')return {resources:[{name:'local',node:'one'},{name:'local',node:'two'}]};if(p.includes('/one/')&&++reads===2)return new Promise(r=>complete=r);return {files:[{volid:p.includes('/two/')?'node-two.iso':'node-one.iso',content:'iso'}],uploadTypes:[]}});
 try{let pending;await act(async()=>{button(page.container,'Refresh').dispatchEvent(new page.dom.window.MouseEvent('click',{bubbles:true}));await new Promise(r=>setTimeout(r,0))});const node=page.container.querySelector('[aria-label="Storage contents node"]');await act(async()=>{node.value='two';node.dispatchEvent(new page.dom.window.Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,0))});assert.match(page.container.textContent,/node-two.iso/);await act(async()=>{complete({files:[{volid:'late-node-one.iso'}],uploadTypes:[]});await new Promise(r=>setTimeout(r,0))});assert.match(page.container.textContent,/node-two.iso/);assert.ok(!page.container.textContent.includes('late-node-one.iso'))}finally{await page.close()}
});

test('pool eye actions open the capacity and selected pool popup, retaining table filters and closing if that pool disappears',async()=>{
 let pools=inventory.pools;const writes=[];const page=await mounted('pages/Storage.tsx',{},async(p,init)=>{if(init?.method)writes.push(p);return p==='/auth/me'?{user:{role:'viewer'}}:p==='/storage?view=pools'?{...inventory,pools,summary:{...inventory.summary,distribution:pools.map(r=>({...r,key:r.provider+':'+r.id}))}}:{tasks:[],history:[],content:[]}});
 try{
  assert.equal(page.container.querySelector('.storage-overview-grid aside'),null);assert.equal(page.container.querySelector('.storage-distribution'),null);assert.ok(!page.container.querySelector('[role=dialog]'));
  const eye=page.container.querySelector('button[aria-label="Inspect local on b"]'),row=eye.closest('tr');await page.click(row.querySelector('.storage-resource-name'));assert.equal(row.getAttribute('aria-selected'),'true');assert.ok(!page.container.querySelector('[role=dialog]'),'Selecting pool content must not inspect it');await act(async()=>row.dispatchEvent(new page.dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true})));assert.ok(!page.container.querySelector('[role=dialog]'));eye.focus();await page.click(eye);let modal=page.container.querySelector('[role=dialog]');assert.ok(modal);assert.match(modal.textContent,/Inspect Pool/);assert.ok(modal.querySelector('.storage-distribution'));assert.match(modal.querySelector('.storage-inspected-pool .task-details').textContent,/Hostb/);
  await page.click(modal.querySelector('[aria-label="Close dialog"]'));assert.ok(!page.container.querySelector('[role=dialog]'));assert.ok(document.activeElement===eye);assert.equal(page.container.querySelector('[aria-label="Storage node"]').value,'all');
  await page.click(eye);pools=[inventory.pools[0]];await act(async()=>{const detail={prefixes:['/storage'],requests:[]};window.dispatchEvent(new CustomEvent('iclusters-resource-refresh',{detail}));await Promise.all(detail.requests)});assert.ok(!page.container.querySelector('[role=dialog]'));assert.deepEqual(writes,[]);
 }finally{await page.close()}
});
test('disk details stay off the page until the chosen eye opens its popup and the full report stacks above it',async()=>{
 const resources=[{id:'a',name:'/dev/sda',node:'a',provider:'proxmox',model:'Disk A',serial:'serial-a',size:100},{id:'b',name:'/dev/sdb',node:'b',provider:'proxmox',model:'Disk B',serial:'serial-b',size:200}];
 const page=await mounted('pages/StorageDisks.tsx',{onTab(){}},async()=>({resources}));try{
  assert.equal(page.container.querySelector('.disk-detail-card'),null);await page.click([...page.container.querySelectorAll('.disk-capacity-list button')].find(button=>button.textContent.includes('/dev/sdb')));assert.ok(!page.container.querySelector('[role=dialog]'),'Selecting a capacity item must not inspect it');const eye=page.container.querySelector('button[aria-label="Inspect /dev/sdb on b"]'),row=eye.closest('tr');await page.click(row.querySelector('.storage-resource-name'));assert.equal(row.getAttribute('aria-selected'),'true');assert.ok(!page.container.querySelector('[role=dialog]'));eye.focus();await page.click(eye);const modal=page.container.querySelector('[role=dialog]');assert.match(modal.textContent,/Disk Details/);assert.match(modal.textContent,/serial-b/);assert.ok(!modal.textContent.includes('serial-a'));assert.ok(button(modal,'Refresh S.M.A.R.T.'));
  await page.click(button(modal,'View Details'));assert.equal(page.container.querySelectorAll('[role=dialog]').length,2);const report=[...page.container.querySelectorAll('[role=dialog]')].at(-1);assert.match(report.textContent,/serial-b/);await page.click(report.querySelector('[aria-label="Close dialog"]'));assert.equal(page.container.querySelectorAll('[role=dialog]').length,1);await page.click(modal.querySelector('[aria-label="Close dialog"]'));assert.ok(!page.container.querySelector('[role=dialog]'));assert.ok(document.activeElement===eye);
 }finally{await page.close()}
});


test('configuration summaries precede tabs and count only explicit enabled and shared flags',async()=>{
 const resources=[{id:'local',enabled:true,shared:false,content:['iso']},{id:'archive',enabled:false,shared:true,content:['backup']},{id:'unknown',enabled:null,shared:null,content:[]}];
 const page=await mounted('pages/StorageConfiguration.tsx',{admin:false,onTab(){},onChanged(){}},async()=>({resources}));try{
  const metrics=page.container.querySelector('.storage-configuration-stats');assert.ok(metrics.compareDocumentPosition(page.container.querySelector('[role=tablist]'))&4);
  assert.deepEqual([...metrics.querySelectorAll('.stat-value')].map(el=>el.textContent),['3','1 reported','1 reported','1']);
 }finally{await page.close();}
});

test('configuration summaries distinguish a complete empty inventory from missing flags',async()=>{
 for(const resources of [[],[{id:'unknown'}]]){const page=await mounted('pages/StorageConfiguration.tsx',{admin:false,onTab(){},onChanged(){}},async()=>({resources}));try{
  assert.deepEqual([...page.container.querySelectorAll('.storage-configuration-stats .stat-value')].map(el=>el.textContent),resources.length?['1','Unknown','Unknown','Unknown']:['0','0','0','0']);
 }finally{await page.close();}}
});
