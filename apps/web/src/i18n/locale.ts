import {useSyncExternalStore} from 'react';
import manifest from './manifest.json';
export const languages=[
 {id:'en-GB',nativeName:'English',dir:'ltr'},
 {id:'fr-FR',nativeName:'Français',dir:'ltr'},
 {id:'es-ES',nativeName:'Español',dir:'ltr'},
 {id:'de-DE',nativeName:'Deutsch',dir:'ltr'},
 {id:'pt-PT',nativeName:'Português',dir:'ltr'},
] as const;
export type Locale=typeof languages[number]['id'];
type Pack=Record<string,string>;
const storageKey='iclusters_language',listeners=new Set<()=>void>(),packs=new Map<Locale,Pack>();
const loaders:Record<Exclude<Locale,'en-GB'>,()=>Promise<{default:Pack}>>={
 'fr-FR':()=>import('./packs/fr.json'),'es-ES':()=>import('./packs/es.json'),'de-DE':()=>import('./packs/de.json'),'pt-PT':()=>import('./packs/pt.json'),
};
let active:Locale='en-GB',requestVersion=0;
export function getLocale(){return active}
export function readSavedLocale():Locale{
 try{
  const saved=localStorage.getItem(storageKey);
  return languages.find(language=>language.id===saved)?.id||'en-GB';
 }catch{return 'en-GB'}
}
const subscribe=(callback:()=>void)=>{listeners.add(callback);return()=>{listeners.delete(callback)}};
export function useLocale(){return useSyncExternalStore(subscribe,getLocale,()=> 'en-GB' as Locale)}
function apply(locale:Locale){active=locale;if(typeof document!=='undefined'){document.documentElement.lang=locale;document.documentElement.dir=languages.find(x=>x.id===locale)!.dir}listeners.forEach(callback=>callback())}
export async function setLocale(locale:Locale){
 if(!languages.some(x=>x.id===locale))throw Error('Unsupported interface language.');
 const ticket=++requestVersion;
 if(locale!=='en-GB'&&!packs.has(locale)){
  const module=await loaders[locale]();
  if(Object.keys(module.default).length!==manifest.keyCount||Object.values(module.default).some(value=>typeof value!=='string'||!value.trim()))throw Error('The language pack could not be loaded.');
  packs.set(locale,module.default);
 }
 if(ticket!==requestVersion)return;
 try{localStorage.setItem(storageKey,locale)}catch{/* Switching remains available when browser storage is blocked. */}
 apply(locale);
}
let listening=false;
export async function initializeLocale(){
 if(typeof window!=='undefined'&&!listening){listening=true;window.addEventListener('storage',event=>{if(event.key===storageKey||event.key===null)void initializeLocale()})}
 try{await setLocale(readSavedLocale())}catch{if(active==='en-GB')apply('en-GB')}
}
type Pattern={expression:RegExp;translation:string;positions:string[]};
const caches=new Map<Locale,Map<string,string>>(),patterns=new Map<Locale,Pattern[]>();
const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const numeric=/^\{0\} [A-Za-z]{3,}$/;
export function translate(text:string,locale:Locale=active):string{
 if(locale==='en-GB'||!text||text.length>4096||!/[A-Za-z]/.test(text))return text;
 const pack=packs.get(locale);if(!pack)return text;
 let cache=caches.get(locale);if(!cache){cache=new Map();caches.set(locale,cache)}
 const previous=cache.get(text);if(previous!==undefined)return previous;
 const key=text.replace(/\s+/g,' ').trim(),prefix=text.match(/^\s*/)?.[0]||'',suffix=text.match(/\s*$/)?.[0]||'';
 let result=Object.hasOwn(pack,key)?pack[key]:undefined;
 if(result===undefined&&/\s/.test(key)){
  let compiled=patterns.get(locale);
  if(!compiled){compiled=Object.keys(pack).filter(key=>/\{\d+\}/.test(key)&&(key.replace(/\{\d+\}/g,'').replace(/[^A-Za-z]/g,'').length>=6||numeric.test(key))).sort((a,b)=>b.length-a.length).map(key=>{
   const positions:string[]=[];let start=0,pattern='';
   for(const match of key.matchAll(/\{(\d+)\}/g)){pattern+=escape(key.slice(start,match.index))+(match.index===0&&numeric.test(key)?'([0-9٠-٩.,\\s]+)':'([\\s\\S]*?)');positions.push(match[1]);start=match.index!+match[0].length}
   return {expression:new RegExp('^'+pattern+escape(key.slice(start))+'$'),translation:pack[key],positions};
  });patterns.set(locale,compiled)}
  for(const pattern of compiled){const match=key.match(pattern.expression);if(match){const values=Object.fromEntries(pattern.positions.map((position,index)=>[position,match[index+1]]));result=pattern.translation.replace(/\{(\d+)\}/g,(_,position)=>values[position]??'{'+position+'}');break}}
 }
 const output=result===undefined?text:prefix+result+suffix;
 if(cache.size>=5000)cache.clear();cache.set(text,output);return output;
}
export function template(key:string,locale:Locale=active){const pack=packs.get(locale);return locale==='en-GB'||!pack||!Object.hasOwn(pack,key)?undefined:pack[key]}
