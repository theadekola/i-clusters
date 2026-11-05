// Read-only deployment check. Uses the existing CI root through NODE_EXTRA_CA_CERTS.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {X509Certificate} from 'node:crypto';
const origin='https://localhost:6002',expected=new X509Certificate(fs.readFileSync('/tmp/iclusters-ci-root.crt'));
const response=await fetch(origin+'/local-ca.crt',{redirect:'error',signal:AbortSignal.timeout(10000)});
assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/application\/x-x509-ca-cert/);assert.match(response.headers.get('content-disposition'),/attachment.*i-clusters-root[.]crt/);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
const pem=await response.text(),certificate=new X509Certificate(pem);assert.equal(certificate.ca,true);assert.equal(certificate.fingerprint256,expected.fingerprint256);assert.doesNotMatch(pem,/PRIVATE KEY/);assert.equal((pem.match(/BEGIN CERTIFICATE/g)||[]).length,1);
for(const path of ['/root.key','/local-ca.crt/root.key','/data/caddy/pki/authorities/local/root.key']){
 const result=await fetch(origin+path,{redirect:'error',signal:AbortSignal.timeout(10000)});assert.doesNotMatch(await result.text(),/-----BEGIN (?:\w+ )?PRIVATE KEY-----/);
}
console.log('Browser certificate export matches the persistent public root; private-key paths are not exposed.');
