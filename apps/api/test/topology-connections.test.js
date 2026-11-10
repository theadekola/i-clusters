import test from 'node:test';
import assert from 'node:assert/strict';
import {guestTopologyConnections,topologyConnections} from '../src/topology-connections.js';
test('topology uses attached storage and explicit VLAN tags, excluding unused disks, ISO and host bind mounts',()=>{
 assert.deepEqual(guestTopologyConnections({scsi0:'local-lvm:vm-100-disk-0,size=32G',scsi1:'local-lvm:vm-100-disk-1',unused0:'old:vm-100-disk-2',ide2:'iso:installer.iso,media=cdrom',rootfs:'volume=local-zfs:subvol-100-disk-0',mp0:'/srv/data,mp=/data',net0:'virtio=aa,bridge=vmbr0,tag=20,trunks=10;20;4095',net1:'name=eth1,bridge=vmbr1',cipassword:'private'}),{storage:['local-lvm','local-zfs'],vlans:[10,20],networks:2});
});
test('configuration reads are scoped by server and type; offline and failed guests create no fabricated connections',async()=>{
 const calls=[];const result=await topologyConnections({nodes:[{name:'one',status:'online'},{name:'two',status:'offline'}],vms:[{id:100,node:'one'},{id:200,node:'two'}],lxc:[{id:100,node:'one'},{id:101,node:'one'}]},async path=>{calls.push(path);if(path.includes('/101/'))throw Error('Denied');return {rootfs:'local:vol',net0:'name=eth0,bridge=vmbr0',sshkeys:'private'};});
 assert.equal(calls.length,3);assert.ok(calls.every(p=>!p.includes('/two/')));assert.deepEqual(result.guests.map(g=>g.key).sort(),['one:lxc:100','one:qemu:100']);assert.equal(result.errors.length,1);assert.doesNotMatch(JSON.stringify(result),/private/);
});
