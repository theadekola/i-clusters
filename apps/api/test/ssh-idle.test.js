import test from 'node:test';
import assert from 'node:assert/strict';
import {shellDeadline,shellExpired,updateShellPresence,SHELL_IDLE_MS} from '../src/ssh-idle.js';
test('shell expires after twenty minutes of visible inactivity',()=>{
 const s={mode:'shell',touched:0};
 assert.equal(shellExpired(s,SHELL_IDLE_MS-1),false);
 assert.equal(shellExpired(s,SHELL_IDLE_MS),true);
 updateShellPresence(s,'active',1000);
 assert.equal(shellExpired(s,SHELL_IDLE_MS),false);
});
test('screen suspension preserves remaining idle time across mobile or desktop sleep',()=>{
 const s={mode:'shell',touched:0};
 updateShellPresence(s,'hidden',5*60000);
 updateShellPresence(s,'hidden',6*60000);
 assert.equal(shellExpired(s,24*60*60000),false);
 updateShellPresence(s,'visible',24*60*60000);
 assert.equal(shellExpired(s,24*60*60000+15*60000-1),false);
 assert.equal(shellExpired(s,24*60*60000+15*60000),true);
});
test('SFTP retains its existing keepalive policy',()=>{
 assert.equal(shellExpired({mode:'sftp',touched:0},60001),true);
});

test('SFTP keeps a 24 hour deadline during activity and suspension',()=>{
 const opened=1000,expiresAt=shellDeadline('sftp',opened);
 assert.equal(expiresAt,opened+24*60*60*1000);
 const session={mode:'sftp',expiresAt,touched:expiresAt-1};
 assert.equal(shellExpired(session,expiresAt-1),false);
 updateShellPresence(session,'hidden',expiresAt-1);
 assert.equal(shellExpired(session,expiresAt),true);
});

test('active and suspended Shell sessions can continue past 48 hours',()=>{
 const opened=1000,later=opened+49*60*60*1000;
 const session={mode:'shell',expiresAt:shellDeadline('shell',opened),touched:opened};
 assert.equal(session.expiresAt,undefined);
 updateShellPresence(session,'hidden',opened);
 assert.equal(shellExpired(session,later),false);
 updateShellPresence(session,'active',later);
 assert.equal(shellExpired(session,later),false);
 assert.equal(shellExpired(session,later+SHELL_IDLE_MS),true);
});
