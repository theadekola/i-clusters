import fs from 'node:fs';import {recoveryMessages} from './recovery-copy.mjs';
const root=new URL('../',import.meta.url),keys=recoveryMessages(),packs={};
for(const [locale,code] of [['en-GB','en'],['fr-FR','fr'],['es-ES','es'],['de-DE','de'],['pt-PT','pt']]){const pack=JSON.parse(fs.readFileSync(new URL('src/i18n/packs/'+code+'.json',root),'utf8'));packs[locale]=Object.fromEntries(keys.map(key=>[key,pack[key]||key]))}
const runtime=`/* Generated from bundled language packs. No network requests or session changes. */
(function(){
 if(!document.documentElement||typeof MutationObserver==='undefined')return;
 const packs=${JSON.stringify(packs).replace(/</g,'\\u003c')};
 let locale='en-GB';const original=new WeakMap(),written=new WeakMap();
 function select(){try{const saved=localStorage.getItem('iclusters_language');locale=Object.hasOwn(packs,saved)?saved:'en-GB'}catch{locale='en-GB'}document.documentElement.lang=locale;document.documentElement.dir='ltr'}
 const escape=value=>value.replace(/[.*+?^\u0024{}()|[\\]\\\\]/g,'\\\\$&');
 function copy(value){if(locale==='en-GB')return value;const key=value.replace(/\\s+/g,' ').trim(),pack=packs[locale],prefix=value.match(/^\\s*/)[0],suffix=value.match(/\\s*$/)[0];if(Object.hasOwn(pack,key))return prefix+pack[key]+suffix;for(const source of Object.keys(pack).sort((a,b)=>b.length-a.length)){if(!/\\{\\d+\\}/.test(source))continue;const positions=[];let offset=0,pattern='';for(const match of source.matchAll(/\\{(\\d+)\\}/g)){pattern+=escape(source.slice(offset,match.index))+'([\\\\s\\\\S]*?)';positions.push(match[1]);offset=match.index+match[0].length}const match=key.match(new RegExp('^'+pattern+escape(source.slice(offset))+'$'));if(match){const values=Object.fromEntries(positions.map((position,index)=>[position,match[index+1]]));return prefix+pack[source].replace(/\\{(\\d+)\\}/g,(_,position)=>values[position])+suffix}}return value}
 function render(){if(!globalThis.document?.documentElement)return;const walker=document.createTreeWalker(document.documentElement,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const node=walker.currentNode;if(node.parentElement?.closest('script,style,pre,code,svg,[translate="no"]'))continue;if(!original.has(node)||node.data!==written.get(node))original.set(node,node.data);const value=copy(original.get(node));written.set(node,value);if(node.data!==value)node.data=value}for(const code of document.querySelectorAll('pre,code'))code.dir='ltr'}
 function start(){select();render();new MutationObserver(render).observe(document.documentElement,{childList:true,subtree:true,characterData:true});window.addEventListener('storage',event=>{if(event.key==='iclusters_language'||event.key===null){select();render()}})}
 window.iclustersRecoveryCopy=copy;if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();`;
fs.writeFileSync(new URL('public/recovery-languages.js',root),runtime+'\n');
const path=new URL('public/sw.js',root);let worker=fs.readFileSync(path,'utf8');const block='/* START RECOVERY I18N */\n'+runtime+'\n/* END RECOVERY I18N */';
const embedded=block.replace(/\\/g,'\\\\').replace(/\$/g,'\\$').replace(/`/g,'\\`');
if(worker.includes('/* START RECOVERY I18N */'))worker=worker.replace(/\/\* START RECOVERY I18N \*\/[\s\S]*?\/\* END RECOVERY I18N \*\//,()=>embedded);
else worker=worker.replace('<script>\n(function(){',()=>'<script>\n'+embedded+'\n(function(){');
fs.writeFileSync(path,worker);console.log('Bundled '+keys.length+' recovery messages for all five locales, including the self-contained offline screen.');
