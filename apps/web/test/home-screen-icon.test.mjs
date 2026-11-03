import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {JSDOM} from 'jsdom';
const publicPath=new URL('../public/',import.meta.url);
test('iPhone receives a versioned, explicitly sized Apple icon in initial HTML',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),doc=new JSDOM(html).window.document;
 const link=doc.querySelector('link[rel="apple-touch-icon"]');assert.equal(link.getAttribute('sizes'),'180x180');assert.equal(link.getAttribute('type'),'image/png');
 const url=new URL(link.getAttribute('href'),'https://controller.test:6002');assert.equal(url.pathname,'/apple-touch-icon.png');
 const png=fs.readFileSync(new URL('assets/iclusters-180.png',publicPath));assert.equal(url.searchParams.get('v'),crypto.createHash('sha256').update(png).digest('hex').slice(0,12));assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(16),180);assert.equal(png.readUInt32BE(20),180);
 assert.equal(doc.querySelector('meta[name="apple-mobile-web-app-title"]').content,'i-Clusters');assert.equal(doc.querySelector('meta[name="apple-mobile-web-app-capable"]').content,'yes');
});
test('manifest icons are real PNGs with version hashes and a stable installation identity',()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('manifest.webmanifest',publicPath),'utf8'));assert.equal(manifest.id,'/');assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/');
 for(const icon of manifest.icons){const url=new URL(icon.src,'https://controller.test'),png=fs.readFileSync(new URL(url.pathname.slice(1),publicPath));assert.equal(icon.type,'image/png');assert.equal(icon.sizes,png.readUInt32BE(16)+'x'+png.readUInt32BE(20));assert.equal(url.searchParams.get('v'),crypto.createHash('sha256').update(png).digest('hex').slice(0,12));}
});
test('diagnostic and offline pages also identify the Home Screen logo',()=>{
 for(const name of ['connection-check.html','sw.js']){const source=fs.readFileSync(new URL(name,publicPath),'utf8');assert.match(source,/rel="apple-touch-icon" sizes="180x180" type="image\/png" href="\/apple-touch-icon.png\?v=/);}
});
