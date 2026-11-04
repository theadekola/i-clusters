import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';import {JSDOM} from 'jsdom';import React,{act} from 'react';import {createRoot} from 'react-dom/client';
const web=fileURLToPath(new URL('../',import.meta.url)),folder=path.join(web,'public/assets/icons'),manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json')));
test('the supplied pack and all added action and identity icons are complete, local and passive SVGs',()=>{
 const pack=JSON.parse(fs.readFileSync(path.join(folder,'pack-manifest.json')));assert.equal(pack.length,70);assert.equal(Object.values(manifest).filter(row=>row.source==='user-pack').length,70);
 for(const [name,row] of Object.entries(manifest)){
  assert.equal(row.file,name+'.svg');const bytes=fs.readFileSync(path.join(folder,row.file));assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
  const dom=new JSDOM(bytes.toString(),{contentType:'image/svg+xml'});try{assert.equal(dom.window.document.documentElement.getAttribute('viewBox'),'0 0 64 64');assert.equal(dom.window.document.querySelector('script,foreignObject,image'),null);for(const element of dom.window.document.querySelectorAll('*'))for(const attribute of element.attributes){assert.ok(!/^on/i.test(attribute.name));if(/(?:^|:)href$/.test(attribute.name))assert.ok(attribute.value.startsWith('#'));}assert.doesNotMatch(bytes.toString(),/<!ENTITY|url\(["']?https?:/i);}finally{dom.window.close()}
 }
 for(const row of pack)assert.equal(manifest[row.filename.slice(0,-4)].source,'user-pack');
 assert.ok(fs.readFileSync(path.join(folder,'lucide-ISC.txt'),'utf8').includes('Permission to use'));
});
function files(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(directory,e.name)):e.name.endsWith('.tsx')||e.name.endsWith('.ts')?[path.join(directory,e.name)]:[])}
test('the entire UI uses the shared icon exports and every export points to a real asset',()=>{
 const source=fs.readFileSync(path.join(web,'src/icons.ts'),'utf8'),names=JSON.parse(fs.readFileSync(path.join(web,'scripts/fluent-icon-names.json')));
 assert.equal([...source.matchAll(/export const (\w+)=/g)].length,names.length);
 for(const name of names)assert.match(source,new RegExp('export const '+name+'='));
 for(const match of source.matchAll(/makeIcon\('[^']+','([^']+)'\)/g))assert.ok(manifest[match[1]],match[1]);
 for(const file of files(path.join(web,'src')))assert.doesNotMatch(fs.readFileSync(file,'utf8'),/from ['"]lucide-react['"]/,path.relative(web,file));
 const brands=fs.readFileSync(path.join(web,'src/brand-assets.ts'),'utf8');assert.doesNotMatch(brands,/bundled-icon-images|data:image/);for(const match of brands.matchAll(/\/assets\/icons\/([a-z0-9-]+)\.svg/g))assert.ok(manifest[match[1]],match[1]);
});
test('icons retain refs, click propagation, spinner hooks, accessible names and a local failure fallback',async()=>{
 const directory=fs.mkdtempSync(path.join(web,'node_modules','fluent-test-'));
 const bundled=await build({stdin:{contents:"export {RefreshCw,Eye,Plus} from './icons';export {default as PageIcon} from './components/PageIcon';",resolveDir:path.join(web,'src'),loader:'tsx'},bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',write:false});
 const file=path.join(directory,'fixture.mjs');fs.writeFileSync(file,bundled.outputFiles[0].text);const {RefreshCw,Eye,PageIcon}=await import(pathToFileURL(file)),dom=new JSDOM('<div id="root"></div>',{url:'https://icons.test'}),old={};
 for(const key of ['window','document','HTMLElement','SVGElement','Event']){old[key]=globalThis[key];globalThis[key]=dom.window[key]}globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const root=createRoot(document.getElementById('root')),ref=React.createRef(),calls=[];
 try{
  await act(async()=>root.render(React.createElement('button',{onClick:()=>calls.push('clicked')},React.createElement(RefreshCw,{ref,size:20,'aria-label':'Refresh readings'}))));
  const icon=document.querySelector('svg');assert.equal(ref.current,icon);assert.ok(icon.classList.contains('lucide-refresh-cw'));assert.equal(icon.getAttribute('aria-label'),'Refresh readings');assert.equal(icon.getAttribute('aria-hidden'),null);assert.equal(icon.getAttribute('width'),'20');assert.equal(icon.querySelector('image').getAttribute('href'),'/assets/icons/refresh-cw.svg');
  await act(async()=>icon.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));assert.deepEqual(calls,['clicked']);
  await act(async()=>root.render(React.createElement(Eye,{size:24})));assert.equal(document.querySelector('svg').getAttribute('aria-hidden'),'true');
  await act(async()=>document.querySelector('image').dispatchEvent(new Event('error')));assert.equal(document.querySelector('image'),null);assert.ok(document.querySelector('svg rect'));
  await act(async()=>root.render(React.createElement(PageIcon,{name:'dashboard',size:24})));assert.equal(document.querySelector('img').getAttribute('src'),'/assets/icons/dashboard.svg');
  await act(async()=>document.querySelector('img').dispatchEvent(new Event('error')));assert.equal(document.querySelector('img'),null);assert.ok(document.querySelector('.fluent-fallback'));
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,value] of Object.entries(old)){if(value===undefined)delete globalThis[key];else globalThis[key]=value}fs.rmSync(directory,{recursive:true,force:true})}
});
