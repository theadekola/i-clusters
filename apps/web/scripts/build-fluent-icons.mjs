import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const lucideRoot=path.resolve(path.dirname(require.resolve('lucide-react/package.json')),'dist/esm');
const definitions={};
for(const match of fs.readFileSync(path.join(lucideRoot,'lucide-react.js'),'utf8').matchAll(/export \{([^}]+)\} from ['"](.+?)['"]/g))for(const item of match[1].split(',')){const name=item.trim().match(/^default as (\w+)$/)?.[1];if(name)definitions[name]=path.resolve(lucideRoot,match[2]);}
function literal(node){
 if(ts.isStringLiteral(node)||ts.isNumericLiteral(node))return ts.isNumericLiteral(node)?Number(node.text):node.text;
 if(ts.isArrayLiteralExpression(node))return node.elements.map(literal);
 if(ts.isObjectLiteralExpression(node))return Object.fromEntries(node.properties.map(p=>[p.name.text,literal(p.initializer)]));
 throw Error('Unsupported vector literal');
}
function vector(name){const file=definitions[name];if(!file)return null;const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let result;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='__iconNode')result=literal(n.initializer);else ts.forEachChild(n,visit)}visit(ast);return result;}
const web=fileURLToPath(new URL('../',import.meta.url)),output=path.join(web,'public/assets/icons');
const pack=JSON.parse(fs.readFileSync(path.join(output,'pack-manifest.json'),'utf8'));
const names=JSON.parse(fs.readFileSync(new URL('./fluent-icon-names.json',import.meta.url),'utf8'));
const mapped={LayoutDashboard:'dashboard',Database:'datasets',Network:'network',HardDriveDownload:'backups',Activity:'monitoring',Bell:'notifications',Sparkles:'ai-assistant',Terminal:'shell',FolderOpen:'file-manager',Users:'users',Server:'nodes',Monitor:'virtual-machines',Container:'docker-containers',Box:'lxc-containers',Boxes:'clusters',Archive:'backups',FileText:'logs',Calendar:'events',CalendarClock:'backup-schedules',History:'alert-history',Settings:'settings',Settings2:'advanced',Palette:'appearance',Info:'about',Globe:'dns',Layers:'snapshots',LayoutGrid:'applications',Grid2X2:'applications',Route:'routing',Shield:'security',ShieldCheck:'permissions',ShieldAlert:'firewall',Lock:'api-tokens',LockKeyhole:'api-tokens',SlidersHorizontal:'advanced',ListChecks:'tasks',ListChecks2:'tasks',Workflow:'topology',Puzzle:'integrations',Smartphone:'mobile-access',Wifi:'interfaces',Gauge:'performance',ChartNoAxesColumn:'traffic-analysis',Folder:'shares',File:'images'};
const kebab=name=>name.replace(/([a-z0-9])([A-Z])/g,'$1-$2').replace(/([A-Z])([A-Z][a-z])/g,'$1-$2').toLowerCase();
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const palettes={blue:['#86d4ff','#0878e5','#14429f'],teal:['#78f0e1','#0bba9e','#086a67'],purple:['#dbc2ff','#9562ef','#4d2a9c'],red:['#ffc4bb','#f35465','#9a204d'],amber:['#ffe7a6','#f6ae32','#b75a0a']};
function frame(label,content,palette='blue',light=false){
 const [a,b,c]=palettes[palette];
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-labelledby="fluent-title"><title id="fluent-title">${escape(label)}</title><defs><linearGradient id="fluent-body" x1="0" y1="0" x2=".85" y2="1"><stop stop-color="${a}"/><stop offset=".48" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient><linearGradient id="fluent-edge" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="${c}" stop-opacity=".6"/></linearGradient><linearGradient id="fluent-face" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="${light?'#fff':'#173968'}"/><stop offset="1" stop-color="${light?'#e6f5ff':'#075a91'}"/></linearGradient><filter id="fluent-shadow" x="-35%" y="-35%" width="170%" height="190%"><feGaussianBlur in="SourceAlpha" stdDeviation="1.4"/><feOffset dy="2"/><feComponentTransfer><feFuncA type="linear" slope=".24"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><g filter="url(#fluent-shadow)"><rect x="7" y="8" width="50" height="48" rx="12" fill="url(#fluent-body)" stroke="url(#fluent-edge)" stroke-width="1.2"/><rect x="11" y="12" width="42" height="40" rx="9" fill="url(#fluent-face)" stroke="#d7f4ff" stroke-opacity=".8"/><path d="M18 12h27" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity=".65"/>${content}</g></svg>\n`;
}
const registry={};
for(const row of pack)registry[row.filename.slice(0,-4)]={file:row.filename,label:row.label,source:'user-pack'};
const exports={};
for(const name of names){
 const asset=mapped[name]||kebab(name);exports[name]=asset;
 if(registry[asset])continue;
 const node=vector(name);
 if(!Array.isArray(node))throw Error('Missing vector definition for '+name);
 const shapes=node.map(([tag,attributes])=>'<'+tag+' '+Object.entries(attributes).filter(([key])=>key!=='key').map(([key,value])=>`${key}="${escape(value)}"`).join(' ')+'/>').join('');
 const glyph=`<g transform="translate(14 14) scale(1.5)" fill="none" stroke="${palettes.blue[2]}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" opacity=".5">${shapes}</g><g transform="translate(14 12.5) scale(1.5)" fill="none" stroke="#f1ffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${shapes}</g>`;
 const palette=/Trash|XCircle|Octagon|AlertCircle/.test(name)?'red':/Check|Save|Play|Power/.test(name)?'teal':/Sun|AlertTriangle|TriangleAlert|Lightbulb/.test(name)?'amber':/Moon|Eye|Paintbrush|Cpu|Memory/.test(name)?'purple':'blue';
 fs.writeFileSync(path.join(output,asset+'.svg'),frame(name.replace(/([a-z])([A-Z])/g,'$1 $2'),glyph,palette));
 registry[asset]={file:asset+'.svg',label:name,source:'lucide-styled',license:'ISC'};
}
const brands=JSON.parse(fs.readFileSync(path.join(web,'public/assets/brands/manifest.json'),'utf8')),brandMap={};
for(const brand of brands){
 if(['proxmox','docker','truenas','zimaos'].includes(brand.id)&&registry[brand.id]){brandMap[brand.id]=brand.id;continue;}
 const asset='brand-'+brand.id,source=fs.readFileSync(path.join(web,'public',brand.file),'utf8');
 const box=source.match(/viewBox=["']([^"']+)["']/)?.[1].split(/[ ,]+/).map(Number);if(!box||box.length!==4)throw Error('Invalid brand viewBox '+brand.id);
 const inner=source.replace(/^[\s\S]*?<svg\b[^>]*>/,'').replace(/<\/svg>\s*$/,'');
 const factor=Math.min(32/box[2],32/box[3]),x=32-box[2]*factor/2,y=32-box[3]*factor/2;
 const content=`<g transform="translate(${x} ${y}) scale(${factor}) translate(${-box[0]} ${-box[1]})">${inner}</g>`;
 fs.writeFileSync(path.join(output,asset+'.svg'),frame(brand.name,content,brand.category==='os'?'purple':'blue',true));
 registry[asset]={file:asset+'.svg',label:brand.name,source:'brand-styled',license:brand.license,upstream:brand.source};brandMap[brand.id]=asset;
}
const hashes=Object.fromEntries(Object.keys(registry).sort().map(key=>[key,{...registry[key],sha256:createHash('sha256').update(fs.readFileSync(path.join(output,registry[key].file))).digest('hex')} ]));
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(hashes,null,2)+'\n');
fs.writeFileSync(path.join(web,'src/fluent-icon-registry.ts'),'// Generated by scripts/build-fluent-icons.mjs.\nexport const actionIcons='+JSON.stringify(exports,null,2)+' as const;\nexport const brandIcons='+JSON.stringify(brandMap,null,2)+' as const;\nexport const availableIcons='+JSON.stringify(Object.keys(registry).sort())+' as const;\n');
fs.writeFileSync(path.join(web,'src/icons.ts'),'// Shared Fluent-style interface icons. Generated by scripts/build-fluent-icons.mjs.\nimport {makeIcon} from "./components/FluentIcon";\nexport type {FluentIconProps as LucideProps} from "./components/FluentIcon";\n'+Object.entries(exports).map(([name,asset])=>`export const ${name}=/* @__PURE__ */makeIcon('${name}','${asset}');`).join('\n')+'\n');
fs.copyFileSync(require.resolve('lucide-react/package.json').replace(/package.json$/,'LICENSE'),path.join(output,'lucide-ISC.txt'));
console.log(`Preserved ${pack.length} supplied icons; built ${Object.keys(registry).length-pack.length} matching icons; covered ${names.length} action names and ${brands.length} system identities.`);
