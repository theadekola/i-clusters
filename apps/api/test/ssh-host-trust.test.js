import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createSSHHostTrust,sshKeyFingerprint,verifySSHHostKey} from '../src/ssh-host-trust.js';
const first=sshKeyFingerprint(Buffer.from('first public host key')),changed=sshKeyFingerprint(Buffer.from('changed public host key'));
test('automatic SSH trust persists first contact and blocks changed keys without replacing the pin',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ssh-trust-')),file=path.join(directory,'known.json');
 try{const trust=createSSHHostTrust(file);assert.equal(trust('Host.EXAMPLE',22,first).source,'first-use');assert.equal(fs.statSync(file).mode&0o777,0o600);const before=fs.readFileSync(file,'utf8');assert.equal(createSSHHostTrust(file)('host.example',22,first).source,'known-host');assert.throws(()=>trust('host.example',22,changed),/key changed/);assert.equal(fs.readFileSync(file,'utf8'),before);assert.equal(trust('host.example',2222,changed).source,'first-use');assert.doesNotMatch(fs.readFileSync(file,'utf8'),/password|privateKey/);}finally{fs.rmSync(directory,{recursive:true,force:true})}
});
test('saved verified fingerprints constrain automatic enrollment and corrupt records fail closed',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ssh-trust-')),file=path.join(directory,'known.json');
 try{const trust=createSSHHostTrust(file);assert.throws(()=>trust('host',22,changed,first),/key changed/);assert.equal(fs.existsSync(file),false);assert.equal(trust('host',22,first,first).source,'saved-connection');fs.writeFileSync(file,'broken json');assert.throws(()=>trust('host',22,first),/could not be read/);}finally{fs.rmSync(directory,{recursive:true,force:true})}
});
test('mandatory live SSH verification checks the expected and persisted key before allowing authentication',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ssh-trust-')),old=process.env.DATA_DIR;process.env.DATA_DIR=directory;
 try{const key=Buffer.from('first public host key'),input={host:'fixture',port:22,fingerprint:first};assert.equal(verifySSHHostKey({...input,fingerprint:changed},key),false);assert.equal(fs.existsSync(path.join(directory,'ssh-known-hosts.json')),false);assert.equal(verifySSHHostKey(input,key),true);assert.equal(verifySSHHostKey({...input,fingerprint:changed},Buffer.from('changed public host key')),false);assert.equal(verifySSHHostKey(input,key),true);}finally{if(old===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=old;fs.rmSync(directory,{recursive:true,force:true})}
});

test('previously verified saved SSH keys are migrated without trusting a replacement key',async()=>{
 const {createClusterStore}=await import('../src/cluster-config.js');const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ssh-trust-')),oldDir=process.env.DATA_DIR,oldSecret=process.env.JWT_SECRET;process.env.DATA_DIR=directory;process.env.JWT_SECRET='fixture-secret-for-existing-saved-ssh-records';
 try{createClusterStore(path.join(directory,'ssh-connections.json'),()=>process.env.JWT_SECRET,v=>v).save({'owner:node:fixture':{host:'fixture',port:22,password:'must-stay-encrypted',fingerprint:first}});assert.equal(verifySSHHostKey({host:'fixture',port:22,fingerprint:changed},Buffer.from('changed public host key')),false);assert.equal(verifySSHHostKey({host:'fixture',port:22,fingerprint:first},Buffer.from('first public host key')),true);assert.doesNotMatch(fs.readFileSync(path.join(directory,'ssh-known-hosts.json'),'utf8'),/must-stay-encrypted/);}finally{if(oldDir===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=oldDir;if(oldSecret===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=oldSecret;fs.rmSync(directory,{recursive:true,force:true})}
});
