import assert from 'node:assert/strict';
const origin='https://localhost:6002';
async function read(path,type){
 const response=await fetch(new URL(path,origin),{redirect:'error',signal:AbortSignal.timeout(15000)});
 assert.equal(response.status,200,`${path} must be readable without authentication`);
 assert.match(response.headers.get('content-type')||'',type,`${path} must have the correct content type`);
 const data=Buffer.from(await response.arrayBuffer());assert.ok(data.length>0&&data.length<1000000);return data;
}
const manifest=JSON.parse((await read('/manifest.webmanifest',/application\/(?:manifest\+json|json|octet-stream)/)).toString());
assert.equal(manifest.display,'standalone');assert.ok(manifest.icons.length>=2);
for(const icon of [...manifest.icons,{src:'/assets/iclusters-180.png',sizes:'180x180'}]){
 const url=new URL(icon.src,origin);assert.equal(url.origin,origin);
 const png=await read(url.pathname+url.search,/image\/png/);
 assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 const [width,height]=icon.sizes.split('x').map(Number);assert.equal(png.readUInt32BE(16),width);assert.equal(png.readUInt32BE(20),height);
}
const worker=await read('/sw.js',/(?:application|text)\/javascript/);assert.match(worker.toString(),/addEventListener\('fetch'/);
const shell=(await read('/',/text\/html/)).toString();
const touch=shell.match(/<link\b[^>]*rel="apple-touch-icon"[^>]*>/)?.[0];assert.ok(touch,'Apple touch icon must be present in the initial HTML');assert.match(touch,/sizes="180x180"/);
const touchURL=new URL(touch.match(/href="([^"]+)"/)[1],origin);assert.equal(touchURL.origin,origin);assert.ok(touchURL.searchParams.get('v'));
for(const path of [touchURL.pathname+touchURL.search,'/apple-touch-icon.png','/apple-touch-icon-precomposed.png']){
 const png=await read(path,/image\/png/);assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(16),180);assert.equal(png.readUInt32BE(20),180);
}
const diagnostics=await read('/connection-check.html',/text\/html/);assert.match(diagnostics.toString(),/Check your i-Clusters connection/);
await read('/connection-check.js',/(?:application|text)\/javascript/);
for(const path of ['/sw.js','/connection-check.html','/connection-check.js']){
 const response=await fetch(new URL(path,origin),{signal:AbortSignal.timeout(15000)});
 assert.match(response.headers.get('cache-control')||'',/no-store/);
 await response.arrayBuffer();
}
const missing=await fetch(new URL('/assets/iclusters-missing-chunk.js',origin),{signal:AbortSignal.timeout(15000)});assert.equal(missing.status,404);await missing.arrayBuffer();
console.log('Mobile assets, uncached connection diagnostics and missing-chunk handling verified.');
