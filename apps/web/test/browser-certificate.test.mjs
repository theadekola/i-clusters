import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';import {execFileSync} from 'node:child_process';import {X509Certificate} from 'node:crypto';import {build} from 'esbuild';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'iclusters-ca-test-'));
const bundle=await build({entryPoints:[new URL('../src/browser-certificate.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',write:false});fs.writeFileSync(path.join(directory,'certificate.mjs'),bundle.outputFiles[0].text);
const {readBrowserCertificate}=await import(pathToFileURL(path.join(directory,'certificate.mjs')));
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(directory,'private.key'),'-out',path.join(directory,'root.crt'),'-days','1','-subj','/CN=Fixture only'],{stdio:'ignore'});
const pem=fs.readFileSync(path.join(directory,'root.crt'),'utf8'),originalFetch=globalThis.fetch;
test.after(()=>{globalThis.fetch=originalFetch;fs.rmSync(directory,{recursive:true,force:true})});
test('certificate read is same-origin, credential-free and hashes the public DER rather than PEM formatting',async()=>{
 let options;globalThis.fetch=async(url,init)=>{assert.equal(url,'/local-ca.crt');options=init;return new Response(pem)};
 const result=await readBrowserCertificate(new AbortController().signal);assert.equal(result.fingerprint,new X509Certificate(pem).fingerprint256);assert.equal(result.pem,pem);assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');assert.ok(options.signal);assert.ok(!result.pem.includes('PRIVATE KEY'));
});
test('unavailable, HTML, private-key and multi-certificate responses cannot become downloads',async()=>{
 for(const response of [new Response('Missing',{status:404}),new Response('<html>Login</html>'),new Response(fs.readFileSync(path.join(directory,'private.key'),'utf8')),new Response(pem+pem)]){
 globalThis.fetch=async()=>response;await assert.rejects(readBrowserCertificate(new AbortController().signal),/certificate|Certificate/);
 }
});
test('oversized certificate bodies stop reading and cancel the response stream',async()=>{
 let cancelled=false;globalThis.fetch=async()=>new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(40000))},cancel(){cancelled=true}}));
 await assert.rejects(readBrowserCertificate(new AbortController().signal),/Unexpected/);assert.equal(cancelled,true);
});
test('missing browser Web Crypto still permits a public certificate download without claiming a computed fingerprint',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');Object.defineProperty(globalThis,'crypto',{value:{},configurable:true});globalThis.fetch=async()=>new Response(pem);
 try{const result=await readBrowserCertificate(new AbortController().signal);assert.equal(result.pem,pem);assert.equal(result.fingerprint,null)}finally{if(descriptor)Object.defineProperty(globalThis,'crypto',descriptor);else delete globalThis.crypto}
});
