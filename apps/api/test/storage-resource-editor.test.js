import test from 'node:test';
import assert from 'node:assert/strict';
import {createStorageResourceEditor} from '../src/storage-resource-editor.js';
import {approvalTargetForPath,resolveActionApproval} from '../src/action-approval.js';
import {datasetInventory} from '../src/datasets.js';
const GiB=1024**3,target={provider:'proxmox',resourceId:'local-lvm:vm-100-disk-0',node:'node01',vmid:'100'};
function proxmox(kind='qemu'){
 const writes=[],config={digest:'a'.repeat(40),[kind==='qemu'?'scsi0':'rootfs']:target.resourceId+',size=120G'},guest={vmid:100,node:'node01',type:kind},volume={vmid:100,volid:target.resourceId,content:kind==='qemu'?'images':'rootdir',size:120*GiB};
 const query=async(path,options)=>{if(options){writes.push({path,options});return 'UPID:node01:task'}if(path==='/cluster/resources')return [guest];if(path.endsWith('/config'))return config;if(path.endsWith('/content'))return [volume];throw Error(path)};
 return {editor:createStorageResourceEditor({query}),config,guest,volume,writes};
}
test('VM and CT editors resolve the actual attached disk and send an absolute grow with its digest',async()=>{
 for(const kind of ['qemu','lxc']){
  const f=proxmox(kind),model=await f.editor.inspect(target);assert.equal(f.writes.length,0);
  const r=await f.editor.update({...target,revision:model.revision,sizeGiB:150});assert.equal(r.task,'UPID:node01:task');assert.equal(f.writes.length,1);
  assert.equal(f.writes[0].path,`/nodes/node01/${kind}/100/resize`);const body=new URLSearchParams(f.writes[0].options.body);assert.equal(body.get('disk'),kind==='qemu'?'scsi0':'rootfs');assert.equal(body.get('size'),'150G');assert.equal(body.get('digest'),'a'.repeat(40));
 }
});
test('shrinks, stale revisions, moved guests, detached disks and unavailable size never write',async()=>{
 for(const change of [f=>f.guest.node='other',f=>delete f.config.scsi0,f=>f.config.lock='backup',f=>delete f.volume.size,f=>f.config.digest='b'.repeat(40)]){
  const f=proxmox(),model=await f.editor.inspect(target);change(f);await assert.rejects(f.editor.update({...target,revision:model.revision,sizeGiB:150}));assert.equal(f.writes.length,0);
 }
 for(const sizeGiB of [0,119,120,120.5,NaN,Infinity,'150']){const f=proxmox(),m=await f.editor.inspect(target);await assert.rejects(f.editor.update({...target,revision:m.revision,sizeGiB}));assert.equal(f.writes.length,0);}
 const f=proxmox(),m=await f.editor.inspect(target);await assert.rejects(f.editor.update({...target,revision:m.revision,sizeGiB:150},()=>{throw Error('connection changed')}));assert.equal(f.writes.length,0);
});
test('duplicate attachments and unsupported properties fail closed',async()=>{
 const f=proxmox();f.config.scsi1=f.config.scsi0;await assert.rejects(f.editor.inspect(target),/uniquely attached/);
 const g=proxmox(),m=await g.editor.inspect(target);await assert.rejects(g.editor.update({...target,revision:m.revision,sizeGiB:150,readonly:'ON'}),/size increases only/);assert.equal(g.writes.length,0);
});
function truenas(type='FILESYSTEM'){
 const writes=[],d={id:'tank/media',type,locked:false,quota:{parsed:50*GiB},volsize:{parsed:100*GiB},used:{parsed:20*GiB},compression:{value:'lz4'},readonly:{value:'off'},volblocksize:{parsed:16384}};
 const editor=createStorageResourceEditor({tn:async(method,args)=>{if(method==='pool.dataset.query')return [d];writes.push({method,args});return d}});
 return {editor,d,writes,target:{provider:'truenas',resourceId:d.id}};
}
test('TrueNAS edits whitelist properties and preserve unrelated storage settings',async()=>{
 const f=truenas(),m=await f.editor.inspect(f.target);f.d.used.parsed=21*GiB;await f.editor.update({...f.target,revision:m.revision,quotaGiB:75,compression:'ZSTD',readonly:'ON',mountpoint:'/wrong',destroy:true});
 assert.deepEqual(f.writes,[{method:'pool.dataset.update',args:['tank/media',{quota:75*GiB,compression:'ZSTD',readonly:'ON'}]}]);
 const z=truenas('VOLUME'),v=await z.editor.inspect(z.target);await z.editor.update({...z.target,revision:v.revision,sizeGiB:125});assert.equal(z.writes[0].args[1].volsize,125*GiB);
});
test('TrueNAS stale, locked, below-used quota and shrinking volume changes do not mutate',async()=>{
 const f=truenas(),m=await f.editor.inspect(f.target);
 for(const changes of [{quotaGiB:-1},{quotaGiB:10},{compression:'invalid'},{readonly:'invalid'},{sizeGiB:150},{}])await assert.rejects(f.editor.update({...f.target,revision:m.revision,...changes}));
 f.d.quota.parsed=60*GiB;await assert.rejects(f.editor.update({...f.target,revision:m.revision,quotaGiB:75}),/changed/);f.d.locked=true;await assert.rejects(f.editor.inspect(f.target),/Unlock/);assert.equal(f.writes.length,0);
 const z=truenas('VOLUME'),v=await z.editor.inspect(z.target);await assert.rejects(z.editor.update({...z.target,revision:v.revision,sizeGiB:90}),/increase/);assert.equal(z.writes.length,0);
});
test('Proxmox storage edits require node SSH approval and reject invalid node targets',async()=>{
 assert.equal(approvalTargetForPath('/storage/datasets/edit',target,'PUT'),'node:node01');
 assert.equal(approvalTargetForPath('/storage/datasets/edit',{provider:'truenas'},'PUT'),null);
 await assert.rejects(resolveActionApproval('/storage/datasets/edit',{...target,node:'../other'},'PUT'),/Invalid node target/);
});

test('shared volumes use the guest owner node rather than the first storage listing node',async()=>{
 const inventory=await datasetInventory({proxmox:true,guests:{vms:[{id:'100',node:'node02',status:'running',disk:40,diskTotal:100}]},inventory:async()=>({errors:[],resources:[{node:'node01',name:'shared',shared:true,status:'online'},{node:'node02',name:'shared',shared:true,status:'online'}]}),query:async()=>[{volid:'shared:vm-100-disk-0',vmid:100,content:'images',size:200}]});
 assert.equal(inventory.resources.length,1);assert.equal(inventory.resources[0].node,'node02');assert.equal(inventory.resources[0].guestUsage.used,40);
});
