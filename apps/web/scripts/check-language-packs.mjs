import fs from 'node:fs';
import assert from 'node:assert/strict';
import {collect} from './i18n-catalog.mjs';
const root=new URL('../',import.meta.url),read=name=>JSON.parse(fs.readFileSync(new URL('src/i18n/'+name,root),'utf8'));
const en=read('packs/en.json'),keys=Object.keys(en),manifest=read('manifest.json'),includeApi=fs.existsSync(new URL('../api/src/',root));
assert.equal(keys.length,manifest.keyCount,'Catalogue manifest is stale. Run npm run i18n:extract.');
const extracted=collect({includeApi}).keys;
if(includeApi){
 const missing=extracted.filter(key=>!Object.hasOwn(en,key)),current=new Set(extracted),obsolete=keys.filter(key=>!current.has(key));
 assert.deepEqual({missing,obsolete},{missing:[],obsolete:[]},'Catalogue is stale. Run npm run i18n:extract and update all language packs. '+JSON.stringify({missing,obsolete}));
}
else for(const key of extracted)assert.ok(Object.hasOwn(en,key),'Missing interface copy: '+key);
const placeholders=text=>[...text.matchAll(/\{\d+\}/g)].map(x=>x[0]).sort();
for(const language of ['fr','es','de','pt']){
 const pack=read('packs/'+language+'.json');assert.equal(Object.keys(pack).length,keys.length,language+' has an incomplete catalogue.');assert.deepEqual(Object.keys(pack),keys,language+' has missing or obsolete keys.');
 for(const key of keys){assert.ok(typeof pack[key]==='string'&&pack[key].trim(),language+' has empty copy: '+key);assert.deepEqual(placeholders(pack[key]),placeholders(key),language+' changed substitutions: '+key)}
}
console.log('Validated '+keys.length+' messages in all five bundled languages.');
