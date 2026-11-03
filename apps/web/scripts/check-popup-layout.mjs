// Render the production CSS with real shared dialogs and the disk form.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const web=fileURLToPath(new URL('../',import.meta.url));
const tools=process.env.ICLUSTERS_BROWSER_TOOLS||'/tmp/iclusters-browser-tools/node_modules';
const {chromium}=await import(pathToFileURL(process.env.ICLUSTERS_PLAYWRIGHT_MODULE||path.join(tools,'playwright-core/index.mjs')));
const executable=process.env.ICLUSTERS_CHROMIUM_EXECUTABLE||(await import(pathToFileURL(path.join(tools,'@sparticuz/chromium/build/index.js')))).default.executablePath();
const browser=await chromium.launch({executablePath:await executable,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-zygote','--single-process'],headless:true});
const output=process.env.ICLUSTERS_LAYOUT_ARTIFACTS||'/tmp/iclusters-popup-layout';await fs.mkdir(output,{recursive:true});
const bundle=await build({stdin:{loader:'tsx',resolveDir:path.join(web,'src'),contents:`
import React from 'react';import {createRoot} from 'react-dom/client';import {Modal} from './components/UI';import DiskConfiguration from './components/DiskConfiguration';
const root=createRoot(document.getElementById('root'));
window.renderSample=(sample)=>root.render(<div className={sample}><Modal open title={sample==='disk'?'Configure Disk':'Popup form'} onClose={()=>{}}>{sample==='disk'?<DiskConfiguration onBusy={()=>{}} onSaved={()=>{}}/>:<form className={'form-grid '+(sample==='guest-permission-form'?'guest-permission-form':'')}><label><input type="checkbox" defaultChecked/><span>Enable scheduled backup</span></label><label><input type="radio" name="mode"/><span>Selected nodes</span></label><label><span><input type="checkbox"/> I approve this operation</span></label><label>Storage<select><option>backup-ssd</option></select></label><label>Destination<input value="/mnt/pve/backup-ssd" readOnly/></label><button type="button" className="btn primary">Save Changes</button></form>}</Modal></div>);
window.disposeSample=()=>root.unmount();window.renderSample('disk');`},bundle:true,format:'iife',platform:'browser',jsx:'automatic',write:false,define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixture-api',setup(b){b.onResolve({filter:/\/api$/},()=>({path:'fixture-api',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const confirmedApi=()=>{throw Error('No writes in layout verification')};export async function api(path){if(path==='/proxmox/storage-options')return {resources:[{id:'backup-ssd',type:'dir',path:'/mnt/pve/backup-ssd'}],nodes:[{node:'node01'},{node:'node02'}],connectionScope:'fixture'};return {id:'backup-ssd',type:'dir',path:'/mnt/pve/backup-ssd',content:['backup'],allowedContent:['images','rootdir','iso','vztmpl','backup','snippets','import'],nodes:['node01'],enabled:true,shared:true,revision:'fixture',connectionScope:'fixture'};}` }));}}]});
const assets=await fs.readdir(path.join(web,'dist/assets'));const css=(await Promise.all(assets.filter(p=>p.endsWith('.css')).map(p=>fs.readFile(path.join(web,'dist/assets',p),'utf8')))).join('\n');
const page=await browser.newPage();await page.route('**/*',route=>route.abort());
try{
 for(const width of [320,390,430,768,1280]){
  await page.setViewportSize({width,height:900});
  await page.setContent(`<style>${css}</style><div id="root"></div>`);await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.getByLabel('Disk / storage',{exact:true}).selectOption('backup-ssd');await page.locator('.disk-use-options label').last().waitFor();
  const geometry=await page.evaluate(()=>{
   const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
   const choices=[...document.querySelectorAll('.disk-use-options label')].map(el=>({label:rect(el),box:rect(el.querySelector('input')),text:rect(el.querySelector('span')),textLabel:el.querySelector('span').textContent,textScrollWidth:el.querySelector('span').scrollWidth,textFont:getComputedStyle(el.querySelector('span')).font,textOverflow:el.querySelector('span').scrollWidth>el.querySelector('span').clientWidth+1,direction:getComputedStyle(el).flexDirection}));
   return {choices,modal:rect(document.querySelector('.modal')),horizontalOverflow:document.querySelector('.modal').scrollWidth>document.querySelector('.modal').clientWidth,summary:getComputedStyle(document.querySelector('.disk-storage-summary')).display,nodes:getComputedStyle(document.querySelector('.disk-node-controls')).display,summaryRects:[rect(document.querySelector('.disk-storage-summary p')),rect(document.querySelector('.disk-storage-summary label'))],nodeRects:[rect(document.querySelector('.disk-node-controls select')),rect(document.querySelector('.disk-node-controls label'))]};
  });
  await page.screenshot({path:path.join(output,`disk-${width}.png`)});
  assert.equal(geometry.choices.length,7);assert.equal(geometry.horizontalOverflow,false,`disk popup overflows at ${width}`);
  const first=geometry.choices[0];for(const c of geometry.choices.slice(0,3))assert.ok(Math.abs(c.label.y-first.label.y)<2,`disk options must be three across at ${width}`);
  assert.ok(geometry.choices[3].label.y>first.label.y+20);assert.equal(geometry.summary,'flex');assert.equal(geometry.nodes,'flex');for(const pair of [geometry.summaryRects,geometry.nodeRects])assert.ok(Math.abs(pair[0].y+pair[0].height/2-pair[1].y-pair[1].height/2)<2,`related controls must share a row at ${width}`);
  for(const c of geometry.choices){assert.equal(c.textOverflow,false,`option text does not fit at ${width}: ${JSON.stringify(c)}`);assert.equal(c.direction,'row');assert.equal(c.box.width,18);assert.ok(c.text.x>=c.box.right-1);assert.ok(c.text.right<=c.label.right+1,`option text overflows at ${width}`)}
  for(const sample of ['schedule-overview','retention-overview','vm-form','guest-permission-form','storage-shares','monitor-customize']){
   await page.evaluate(name=>window.renderSample(name),sample);await page.getByText('Enable scheduled backup',{exact:true}).waitFor();
   const result=await page.evaluate(()=>({overflow:document.querySelector('.modal').scrollWidth>document.querySelector('.modal').clientWidth,directions:[...document.querySelectorAll('.modal label:has(>input[type=checkbox]),.modal label:has(>input[type=radio])')].map(el=>getComputedStyle(el).flexDirection),widths:[...document.querySelectorAll('.modal input[type=checkbox],.modal input[type=radio]')].map(el=>el.getBoundingClientRect().width)}));
   assert.equal(result.overflow,false,`${sample} overflows at ${width}`);assert.ok(result.directions.every(v=>v==='row'),`${sample} stacks choices at ${width}`);assert.ok(result.widths.every(v=>v===18),`${sample} stretches native choices at ${width}`);
  }
  console.log(`Popup geometry passed at ${width}px`);await page.evaluate(()=>window.disposeSample());
 }
}finally{await browser.close()}
