import test from 'node:test';
import assert from 'node:assert/strict';
import {datasetInventory,normalizeDataset,datasetCreateInput,datasetRoot,datasetPermissionsInput} from '../src/datasets.js';
test('normalization keeps inherited free space separate from quota and volume size',()=>{
 const d=normalizeDataset({id:'tank/media',name:'tank/media',type:'FILESYSTEM',used:{parsed:100},available:{parsed:900},quota:{parsed:0},usedbydataset:{parsed:40},compression:{value:'lz4'}});
 assert.equal(d.size,null);assert.equal(d.usedByDataset,40);assert.equal(d.compression,'lz4');assert.equal(d.available,900);
 assert.equal(normalizeDataset({name:'tank/vol',type:'VOLUME',volsize:{parsed:2048}}).size,2048);
});
test('shared volumes are deduplicated and offline pools are not queried',async()=>{
 const calls=[];const result=await datasetInventory({proxmox:true,inventory:async()=>({errors:[],resources:[{node:'one',name:'nfs',shared:true,status:'online'},{node:'two',name:'nfs',shared:true,status:'online'},{node:'off',name:'local',status:'offline'}]}),query:async p=>{calls.push(p);return [{volid:'nfs:vm-100-disk-0',content:'images',size:100},{volid:'nfs:test.iso',content:'iso',size:80}];}});
 assert.equal(result.resources.length,1);assert.equal(result.resources[0].type,'VM Volume');assert.equal(result.resources[0].used,null);assert.equal(calls.length,3);
});
test('per-node volume failures retain successful resources',async()=>{
 const r=await datasetInventory({proxmox:true,inventory:async()=>({errors:[],resources:[{node:'one',name:'local',status:'online'},{node:'two',name:'local',status:'online'}]}),query:async p=>{if(p.includes('/two/'))throw Error('Denied');return [{volid:'local:subvol-1',content:'rootdir',size:100}];}});
 assert.equal(r.resources.length,1);assert.equal(r.errors.length,1);
});
test('create validates ZFS volume alignment, quota and allowed properties',()=>{
 assert.equal(datasetCreateInput({name:'tank/vol',type:'VOLUME',volsize:1024**3}).volblocksize,'16K');
 assert.throws(()=>datasetCreateInput({name:'tank/vol',type:'VOLUME',volsize:100}),/Volume size/);
 assert.throws(()=>datasetCreateInput({name:'tank/fs',quota:-1}),/Quota/);
 assert.throws(()=>datasetCreateInput({name:'tank'}),/pool\/dataset/);
 assert.throws(()=>datasetCreateInput({name:'tank/../fs'}),/pool\/dataset/);
 assert.throws(()=>datasetCreateInput({name:'tank/fs',compression:'invalid'}),/compression/);
 assert.equal(datasetCreateInput({name:'tank/fs',ignored:'not forwarded'}).ignored,undefined);
});
test('permission changes preserve ACLs and do not traverse children',()=>{
 const p=datasetPermissionsInput({mode:'750',uid:1000,recursive:true,stripacl:true},'/mnt/tank/fs');
 assert.equal(p.uid,1000);assert.deepEqual(p.options,{recursive:false,traverse:false,stripacl:false});
 assert.throws(()=>datasetPermissionsInput({mode:'999'},'/mnt/tank/fs'),/octal/);
 assert.throws(()=>datasetPermissionsInput({mode:'750',gid:-1},'/mnt/tank/fs'),/numeric ID/);
});
test('browse and permissions are bound to an unlocked detected filesystem',async()=>{
 const tn=async()=>[{id:'tank/fs',type:'FILESYSTEM',mountpoint:{value:'/mnt/tank/fs'}}];
 assert.equal(await datasetRoot('tank/fs',tn),'/mnt/tank/fs');
 await assert.rejects(()=>datasetRoot('absent',tn),/mountpoint/);
 await assert.rejects(()=>datasetRoot('tank/fs',async()=>[{id:'tank/fs',type:'VOLUME',mountpoint:'/mnt/tank/fs'}]),/mountpoint/);
 await assert.rejects(()=>datasetRoot('tank/fs',async()=>[{id:'tank/fs',type:'FILESYSTEM',locked:true,mountpoint:'/mnt/tank/fs'}]),/mountpoint/);
});

test('volume inventory exposes guest totals separately without fabricating per-volume usage',async()=>{
 const result=await datasetInventory({proxmox:true,guests:{vms:[{id:'100',node:'one',status:'running',disk:40,diskTotal:100}]},inventory:async()=>({errors:[],resources:[{node:'one',name:'local',status:'online'}]}),query:async()=>[{volid:'local:vm-100-disk-0',vmid:100,content:'images',size:200},{volid:'local:vm-100-disk-1',vmid:100,content:'images',size:300}]});
 for(const row of result.resources){assert.equal(row.used,null);assert.equal(row.available,null);assert.deepEqual(row.guestUsage,{used:40,available:60,total:100,scope:'guest',guestId:'100',source:'QEMU guest agent'});}
});
test('guest measurements require the matching node, guest type, running state and valid usage',async()=>{
 for(const guest of [{id:'100',node:'other',status:'running',disk:40,diskTotal:100},{id:'100',node:'one',status:'stopped',disk:40,diskTotal:100},{id:'100',node:'one',status:'running',nodeAvailable:false,disk:40,diskTotal:100},{id:'100',node:'one',status:'running',disk:110,diskTotal:100}]){
  const result=await datasetInventory({proxmox:true,guests:{vms:[guest]},inventory:async()=>({errors:[],resources:[{node:'one',name:'local',status:'online'}]}),query:async()=>[{volid:'local:vm-100-disk-0',vmid:100,content:'images',size:200}]});assert.equal(result.resources[0].guestUsage,null);
 }
});
test('native volume usage is not mixed with guest totals',async()=>{
 const result=await datasetInventory({proxmox:true,guests:{vms:[{id:'100',node:'one',status:'running',disk:40,diskTotal:100}]},inventory:async()=>({errors:[],resources:[{node:'one',name:'local',status:'online'}]}),query:async()=>[{volid:'local:vm-100-disk-0',vmid:100,content:'images',size:200,used:20}]});assert.equal(result.resources[0].used,20);assert.equal(result.resources[0].available,null);assert.equal(result.resources[0].guestUsage,null);
});


test('container configs restore absent CT volumes and correct images labels without applying root usage to mount points',async()=>{
 const result=await datasetInventory({proxmox:true,guests:{lxc:[{id:'200',node:'one',status:'running',disk:2,diskTotal:8}]},inventory:async()=>({errors:[],resources:[{node:'one',name:'local',status:'online'}]}),query:async path=>path.endsWith('/config')?{rootfs:'local:vm-200-disk-0,size=8G',mp0:'local:subvol-200-disk-1,mp=/data,size=20G',mp1:'/srv/shared,mp=/shared'}:[{vmid:200,volid:'local:vm-200-disk-0',content:'images',size:8*1024**3}]});
 assert.equal(result.resources.length,3);
 const root=result.resources.find(r=>r.disk==='rootfs');assert.equal(root.type,'CT Volume');assert.equal(root.mountpoint,'/');assert.equal(root.guestUsage.used,2);
 const data=result.resources.find(r=>r.disk==='mp0');assert.equal(data.size,20*1024**3);assert.equal(data.guestUsage,null);
 const bind=result.resources.find(r=>r.disk==='mp1');assert.equal(bind.type,'CT Bind Mount');assert.equal(bind.editable,false);assert.equal(bind.size,null);
});
test('CT config failures retain content rows and report partial coverage',async()=>{
 const result=await datasetInventory({proxmox:true,guests:{lxc:[{id:'200',node:'one'}]},inventory:async()=>({errors:[],resources:[{node:'one',name:'local',status:'online'}]}),query:async path=>{if(path.endsWith('/config'))throw Error('Denied');return [{vmid:200,volid:'local:vm-200-disk-0',content:'images',size:8}];}});
 assert.equal(result.resources[0].type,'CT Volume');assert.equal(result.summary.coverage.complete,false);assert.match(result.errors[0],/CT 200/);
});

test('VM attachments include direct devices, merge managed disks and keep pool and filesystem readings independent',async()=>{
 const GiB=1024**3;
 const {vmDiskSizes}=await import('../src/proxmox-volume.js');
 const config={scsi0:'pool:vm-100-root,size=32G',scsi1:'file=/dev/disk/by-id/fixture,backup=0,size=1073741824K',
  virtio0:'pool:vm-100-data',virtio1:'pool:vm-100-other',sata0:'/dev/unmeasured',ide0:'none',ide1:'pool:vm-100-cloudinit',ide2:'pool:iso/test.iso,media=cdrom,size=4G',
  unused0:'pool:detached,size=9G',efidisk0:'pool:efi,size=2M',tpmstate0:'pool:tpm,size=4M',hostpci0:'0000:01:01.0'};
 const listed=[{volid:'pool:vm-100-root',content:'images',vmid:100,size:32*GiB},{volid:'pool:vm-100-data',content:'images',vmid:100,size:16*GiB}];
 const requests=[];
 const attachments=await vmDiskSizes(config,{node:'fixture'},async p=>{requests.push(p);return listed});
 assert.deepEqual(requests,['/nodes/fixture/storage/pool/content?content=images']);
 assert.deepEqual(attachments.map(d=>[d.slot,d.kind,d.size]),[['scsi0','managed',32*GiB],['scsi1','host',1024*GiB],['virtio0','managed',16*GiB],['virtio1','managed',null],['sata0','host',null]]);
 const guests={vms:[{id:100,node:'fixture',status:'running',disk:null,attachedDisks:attachments}],lxc:[]};
 const result=await datasetInventory({proxmox:true,guests,inventory:async()=>({errors:[],resources:[{id:'fixture/pool',name:'pool',node:'fixture',shared:false,status:'online',capacity:90*GiB,used:40*GiB,available:50*GiB}]}),query:async()=>listed});
 assert.equal(result.resources.length,5);assert.equal(result.summary.capacity,90*GiB);assert.equal(result.summary.used,40*GiB);
 const host=result.resources.find(r=>r.disk==='scsi1');assert.equal(host.editable,false);assert.equal(host.pool,null);assert.equal(host.size,1024*GiB);
 assert.ok(result.resources.every(r=>r.used===null&&r.available===null));
 const partial=await datasetInventory({proxmox:true,guests,inventory:async()=>{throw Error('access denied')}});
 assert.equal(partial.summary.capacity,null);assert.equal(partial.summary.coverage.complete,false);assert.equal(partial.resources.find(r=>r.disk==='scsi1').size,host.size);
});

test('an unreadable CT config never assigns root usage to a pool-listed data mount',async()=>{
 const result=await datasetInventory({proxmox:true,guests:{vms:[],lxc:[{id:60,node:'one',status:'running',disk:20,diskTotal:50}]},
  inventory:async()=>({errors:[],resources:[{node:'one',name:'local',status:'online'}]}),
  query:async p=>{if(p.endsWith('/config'))throw Error('denied');return [{volid:'local:vm-60-extra',vmid:60,content:'images',size:500}]}});
 assert.equal(result.resources[0].guestUsage,null);assert.equal(result.summary.coverage.complete,false);
});
