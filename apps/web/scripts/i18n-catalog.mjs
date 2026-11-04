import {recoveryMessages} from './recovery-copy.mjs';
import fs from 'node:fs';import path from 'node:path';import ts from 'typescript';import {fileURLToPath} from 'node:url';
const web=fileURLToPath(new URL('../',import.meta.url));
export const normalize=value=>value.replace(/\s+/g,' ').trim();
export const decodeJSX=value=>value.replace(/&(?:amp|lt|gt|quot|apos|nbsp);|&#(?:x[0-9a-f]+|[0-9]+);/gi,entity=>{const named={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '};if(named[entity])return named[entity];const hex=entity[2]?.toLowerCase()==='x',number=Number.parseInt(entity.slice(hex?3:2,-1),hex?16:10);return Number.isInteger(number)&&number>=0&&number<=0x10ffff?String.fromCodePoint(number):entity});
const terms=new Set('owner admin operator viewer auditor read-only unsupported interrupted queued scheduled unconfigured cancelled connected disconnected running stopped paused online offline unknown enabled disabled pending completed failed active inactive success warning critical error read write used available healthy unhealthy none all yes no local shared loading reachable unreachable partial degraded stale unverified verified aborted skipped configured needs_setup setup_available not-assigned successful failure waiting locked unlocked trusted untrusted readonly start stop restart pause unpause resume shutdown reboot suspend reset edit remove delete create save cancel view inspect details install update refresh export import restore enable disable acknowledge resolve reconnect connect recover name type status source target detail total address action provider protocol channel result reason date time duration memory cpu latency upload download destination schedule retention user role permission volume network path size health free'.split(' '));
function eligible(value){const text=normalize(value);if(!text||text.length>1800||!/[A-Za-z]/.test(text)||/^(https?:|wss?:|\/|#|data:|[.][./])/.test(text))return false;if(/^[A-Z][A-Z &-]{2,30}$/.test(text))return true;if(!text.includes(' ')&&!text.includes('{'))return /^[A-Z][a-z]+(?:[A-Z][a-z]+)*$/.test(text)||terms.has(text);if(/^(?:[$@]|--|\(\w+-|calc\(|rgb\(|rgba\(|var\(|\{\{|\*|[{}])/.test(text.replace(/\{\d+\}/g,'VALUE'))||/[|]|&&|=>/.test(text)||/[{}]/.test(text.replace(/\{\d+\}/g,'')))return false;if(/^(?:btn|icon-|settings-|vm-|docker-|network-|storage-|flex |grid |const |import |export |function |return |<|\^)/.test(text))return false;if(/[<>]/.test(text)||text.includes('SELECT ')||text.includes('CREATE ')||text.includes('BEGIN ')||text.includes('ssh-')||text.includes('-----'))return false;return /\b[A-Za-z]{2,}\b/.test(text)}
const generated=new Set(['bundled-icon-images.ts','brand-assets.ts','fluent-icon-registry.ts','icons.ts','product-logo.ts']);
function files(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()&&!['node_modules','dist','i18n'].includes(entry.name)?files(path.join(directory,entry.name)):entry.isFile()&&/\.(tsx?|js)$/.test(entry.name)&&!generated.has(entry.name)?[path.join(directory,entry.name)]:[])}
export function collect({includeApi=true}={}){
 const keys=new Set([...recoveryMessages(),'United Kingdom','France','Spain','Germany','Portugal','Unsupported interface language.','The language pack could not be loaded.']);
 const add=(value,force=false)=>{const key=normalize(value);if(eligible(key)||force&&/[A-Za-z]/.test(key)&&key.length<1800)keys.add(key)};
 for(const file of [...files(path.join(web,'src')),...(includeApi?files(path.join(web,'../api/src')):[])]){
  const source=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  function visit(node){
   if(ts.isJsxElement(node)&&/^[a-z]/.test(node.openingElement.tagName.getText(ast))){let slot=0;const key=node.children.map(child=>ts.isJsxText(child)?child.text:ts.isJsxExpression(child)&&!child.expression?'':'{'+slot+++'}').join('');if(slot&&/[A-Za-z]/.test(key.replace(/\{\d+\}/g,''))){add(key,true);add(decodeJSX(key),true)}}
   if(ts.isJsxAttribute(node)&&['className','id','href','to','src','style','name','type','value','key','pattern','accept'].includes(node.name.getText(ast)))return;
   if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)||ts.isJsxText(node)){add(node.text,ts.isJsxText(node));if(ts.isJsxText(node))add(decodeJSX(node.text),true)}
   else if(ts.isTemplateExpression(node))add(node.head.text+node.templateSpans.map((part,index)=>'{'+index+'}'+part.literal.text).join(''));
   ts.forEachChild(node,visit);
  }
  visit(ast);
 }
 return {keys:[...keys].sort()};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const result=collect();fs.writeFileSync(path.join(web,'src/i18n/packs/en.json'),JSON.stringify(Object.fromEntries(result.keys.map(key=>[key,key])),null,2)+'\n');fs.writeFileSync(path.join(web,'src/i18n/manifest.json'),JSON.stringify({schema:1,keyCount:result.keys.length},null,2)+'\n');console.log('Extracted '+result.keys.length+' interface/message keys.')}
