import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
process.env.JWT_SECRET=randomBytes(32).toString('hex');
process.env.JWT_REFRESH_SECRET=randomBytes(32).toString('hex');
const {scopedRole}=await import('../src/security.js');

test('cluster grants restrict provider APIs independently of caller headers and installation administration',()=>{
 const grants={lab:'operator',production:'viewer'};
 const role=(url,profile,header)=>scopedRole('operator',grants,url,profile,header);
 assert.equal(role('/api/actions/proxmox/vm/100/start','lab'),'operator');
 assert.equal(role('/api/actions/proxmox/vm/100/start','production','lab'),'viewer');
 assert.equal(role('/api/dashboard','unassigned','lab'),null);
 assert.equal(role('/api/auth/me','default','lab'),'operator');
 assert.equal(role('/api/auth/me','default','unassigned'),'none');
 assert.equal(role('/api/users','lab'),'viewer');
 assert.equal(scopedRole('viewer',{lab:'admin'},'/api/dashboard','lab'),null);
});
