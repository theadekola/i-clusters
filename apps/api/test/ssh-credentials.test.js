import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createClusterStore} from '../src/cluster-config.js';
import {saveSSH,savedSSH,publicSavedSSH,deleteSavedSSH,SSH_CREDENTIAL_LIFETIME} from '../src/ssh-credentials.js';
import {connectSSH} from '../src/ssh-access.js';
import {shellExpired} from '../src/ssh-idle.js';

test('saved credentials are scoped to user, cluster and mode, with expiry for SFTP',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ssh-expiry-'));
 const before={DATA_DIR:process.env.DATA_DIR,JWT_SECRET:process.env.JWT_SECRET};
 t.after(()=>{for(const [key,value] of Object.entries(before))if(value===undefined)delete process.env[key];else process.env[key]=value;fs.rmSync(directory,{recursive:true,force:true})});
 process.env.DATA_DIR=directory;process.env.JWT_SECRET='fixture-ssh-key-'.repeat(4);
 let now=Date.now();t.mock.method(Date,'now',()=>now);
 const target='vm:node01:100',connection={host:'192.0.2.10',port:22,username:'alice',password:'secret-fixture',fingerprint:'fixture'};
 const shell=saveSSH('alice',target,'shell',connection);
 assert.equal(shell.expiresAt,undefined);
 assert.equal(savedSSH('alice',target,'sftp'),null);
 await assert.rejects(connectSSH({saved:true,target,mode:'sftp'},'alice'),e=>e.status===404);
 await assert.rejects(connectSSH({...connection,target,mode:'sftp',useSavedPassword:true,password:''},'alice'),/changed connection/);
 assert.equal(savedSSH('bob',target),null);
 process.env.DATA_DIR=path.join(directory,'other');assert.equal(savedSSH('alice',target),null);process.env.DATA_DIR=directory;

 const storedSftp=saveSSH('alice',target,'sftp',{...connection,password:'sftp-fixture'});
 assert.equal(storedSftp.expiresAt-storedSftp.savedAt,SSH_CREDENTIAL_LIFETIME);
 assert.equal(savedSSH('alice',target,'sftp').password,'sftp-fixture');
 now+=1000;
 assert.equal(saveSSH('alice',target,'sftp',storedSftp,storedSftp).expiresAt,storedSftp.expiresAt);
 assert.ok(!JSON.stringify(publicSavedSSH('alice')).includes('secret-fixture'));
 assert.equal(shellExpired({mode:'sftp',touched:storedSftp.expiresAt,credentialsExpireAt:storedSftp.expiresAt},storedSftp.expiresAt),true);

 const store=createClusterStore(path.join(directory,'ssh-connections.json'),undefined,v=>v);
 const legacy='node:legacy',unverified='node:unverified';
 store.save({...store.read(),['alice:'+legacy]:{...connection,savedAt:storedSftp.savedAt,expiresAt:storedSftp.expiresAt},['alice:'+unverified]:connection});
 assert.ok(savedSSH('alice',legacy));
 assert.equal(savedSSH('alice',unverified),null);
 now=storedSftp.expiresAt;
 assert.equal(savedSSH('alice',target,'sftp'),null);
 assert.equal(savedSSH('alice',legacy),null);
 assert.equal(savedSSH('alice',target).password,connection.password);
 deleteSavedSSH('alice',target,'shell');
 assert.equal(savedSSH('alice',target),null);
 assert.deepEqual(store.read(),{});
});
