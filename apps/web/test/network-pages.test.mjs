import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,useLocation} from 'react-router-dom';import {JSDOM} from 'jsdom';import {build} from 'esbuild';
function Location(){const location=useLocation();return React.createElement('output',{'data-location':location.pathname+location.search,hidden:true})}
const rootPath=fileURLToPath(new URL('../',import.meta.url));
async function component(file){
 const directory=fs.mkdtempSync(path.join(rootPath,'node_modules','audit-ui-'));
 const result=await build({entryPoints:[path.join(rootPath,'src',file)],bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',write:false,plugins:[{name:'fixture-api',setup(b){b.onResolve({filter:/\/api$/},()=>({path:'fixture-api',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const clearTokens=()=>{};export const api=(...a)=>globalThis.__auditApi(...a);export const confirmedApi=(...a)=>globalThis.__auditConfirmed(...a);export function setDockerHost(id){localStorage.setItem('iclusters_docker_host',id);window.dispatchEvent(new Event('iclusters-connection'));}` }));}}]});
 const modulePath=path.join(directory,'component.mjs');fs.writeFileSync(modulePath,result.outputFiles[0].text);const module=await import(pathToFileURL(modulePath));return {module,cleanup:()=>fs.rmSync(directory,{recursive:true,force:true})};
}
async function mounted(file,props,api,mobile=true){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://iclusters.test'});const originals={};for(const k of ['window','document','localStorage','Event','CustomEvent','HTMLElement','FormData','ResizeObserver']){originals[k]=globalThis[k];globalThis[k]=dom.window[k];}
 globalThis.ResizeObserver=class {observe(){}disconnect(){}};dom.window.matchMedia=()=>({matches:mobile,addEventListener(){},removeEventListener(){}});globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.__auditApi=api;globalThis.__auditConfirmed=api;dom.window.confirm=()=>true;
 const built=await component(file),container=dom.window.document.getElementById('root'),root=createRoot(container);const Component=built.module.default;
 const render=async values=>{await act(async()=>{root.render(React.createElement(MemoryRouter,null,React.createElement(Location),React.createElement(Component,values)));await new Promise(r=>setTimeout(r,0));});};
 await render(props);
 return {dom,container,render,click:async button=>{assert.ok(button,'Expected control is rendered');await act(async()=>{button.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));});},close:async()=>{await act(async()=>root.unmount());dom.window.close();built.cleanup();for(const k of Object.keys(originals)){if(originals[k]===undefined)delete globalThis[k];else globalThis[k]=originals[k];}delete globalThis.__auditApi;delete globalThis.__auditConfirmed;}};
}
const button=(container,label)=>[...container.querySelectorAll('button')].find(b=>b.textContent.trim()===label);
const refresh=async(prefix)=>act(async()=>{const detail={prefixes:[prefix],requests:[]};window.dispatchEvent(new CustomEvent('iclusters-resource-refresh',{detail}));await Promise.all(detail.requests)});
const choose=async(page,selector,value)=>act(async()=>{const el=page.container.querySelector(selector);assert.ok(el);el.value=value;el.dispatchEvent(new page.dom.window.Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,0))});
test('Network map keeps Docker networks available through their dedicated tab',async()=>{
 const page=await mounted('pages/Network.tsx',{},async p=>p==='/docker/hosts'?{hosts:[],directEnabled:true}:p==='/proxmox'?{nodes:[],vms:[],lxc:[]}:{interfaces:[],networks:[{id:'n',name:'media',driver:'bridge',subnets:'172.22.0.0/16'}],dockerHost:{id:'direct',name:'media-server'},connectors:[]});
 try{assert.ok(page.container.querySelector('.cluster-topology'));assert.equal(page.container.querySelector('.network-map-bottom'),null);await page.click(button(page.container,'Docker Networks'));assert.ok(page.container.querySelector('[aria-label="Docker host for resource views"]'));assert.ok(page.container.textContent.includes('Selected host: media-server'));assert.ok(page.container.querySelector('tbody').textContent.includes('172.22.0.0/16'));}finally{await page.close()}
});

test('Traffic navigation remains available with empty and failed node discovery',async()=>{
 for(const failed of [false,true]){const page=await mounted('pages/NetworkTraffic.tsx',{navigation:React.createElement('nav',{'data-audit-tabs':true},'Tabs')},async()=>{if(failed)throw Error('Node discovery failed');return {nodes:[],interfaces:[]}});try{assert.ok(page.container.querySelector('[data-audit-tabs]'));if(failed)assert.ok(page.container.querySelector('[role=alert]').textContent.includes('failed'))}finally{await page.close()}}
});
test('Traffic distribution preserves measured zero and keeps missing directions unavailable',async()=>{
 for(const [sample,label] of [[{netin:0,netout:0},'0.00 Mbps'],[{netin:125000},'Unavailable']]){const page=await mounted('pages/NetworkTraffic.tsx',{},async p=>p==='/proxmox/network'?{nodes:[{node:'a'}],interfaces:[]}:{history:[{time:100,...sample}]});try{assert.ok(page.container.querySelector('.traffic-ring').textContent.includes(label));if(label==='0.00 Mbps')assert.ok(page.container.querySelector('.traffic-ring-legend').textContent.includes('No traffic'));else assert.ok(!page.container.querySelector('.device-summary').textContent.includes('100.0%'))}finally{await page.close()}}
});
test('DNS blocks stale edits and reload remounts form before confirmed save with clear field',async()=>{
 let resolver={node:'a',search:'local',dns1:'192.0.2.1',dns2:'2001:db8::1'},writes=[];const page=await mounted('pages/NetworkDNS.tsx',{},async(p,init)=>{if(init?.method==='PUT'){writes.push({p,body:JSON.parse(init.body)});return {}}return p==='/auth/me'?{user:{role:'owner'}}:{resolvers:[resolver],errors:[]}});
 try{await page.click(button(page.container,'Configure DNS'));resolver={...resolver,dns1:'192.0.2.2'};await refresh('/network/dns');assert.equal(page.container.querySelector('input[name=dns1]').value,'192.0.2.1');assert.equal(button(page.container,'Save DNS Settings').disabled,true);await page.click(button(page.container,'Reload Configuration'));assert.equal(page.container.querySelector('input[name=dns1]').value,'192.0.2.2');assert.equal(button(page.container,'Save DNS Settings').disabled,false);page.container.querySelector('input[name=dns2]').value='';await act(async()=>{page.container.querySelector('.modal form').dispatchEvent(new page.dom.window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0))});assert.equal(writes[0].p,'/network/dns/a');assert.equal(writes[0].body.dns2,'');assert.equal(writes[0].body.expectedConfig.dns1,'192.0.2.2');assert.ok(page.container.textContent.includes('updated'));assert.match(page.container.querySelector('.connection-success').textContent,/DNS configuration saved/);await act(async()=>{await new Promise(r=>setTimeout(r,2100))});assert.equal(page.container.querySelector('.modal'),null);await page.click(button(page.container,'Configure DNS'));assert.equal(page.container.querySelector('.connection-success'),null);assert.ok(page.container.querySelector('.modal form'))}finally{await page.close()}
});
test('Interface aggregate selector identifies and fetches selected node independently of selected interface',async()=>{
 const calls=[];const page=await mounted('pages/ProxmoxNetworks.tsx',{interfaceView:true,role:'viewer'},async p=>{calls.push(p);return p==='/proxmox/network'?{nodes:[{node:'a'},{node:'b'}],interfaces:[{id:'a/nic0',name:'nic0',node:'a',type:'eth',status:'up'}],errors:[]}:{node:p.includes('/b')?'b':'a',history:[{time:100,netin:125000,netout:125000}]}});
 try{await choose(page,'[aria-label="Traffic node"]','b');assert.ok(calls.some(p=>p.includes('/proxmox/network/b?')));assert.equal(page.container.querySelector('[aria-label="Traffic node"]').value,'b');assert.ok(page.container.querySelector('.interface-detail').textContent.includes('Node aggregate · b'));assert.ok(page.container.querySelector('.interface-detail').textContent.includes('nic0 · a'))}finally{await page.close()}
});
test('Devices expose failed provider coverage while retaining reported Docker hosts',async()=>{
 const page=await mounted('pages/NetworkDevices.tsx',{},async p=>p==='/docker/hosts'?{hosts:[{id:'d',name:'media',online:true}]}:{nodes:[],guests:[],services:[{provider:'proxmox',status:'error',error:'Permission denied'}]});try{assert.ok(page.container.querySelector('.network-stats').textContent.includes('Unknown'));assert.ok(page.container.querySelector('[role=alert]').textContent.includes('Permission denied'));assert.ok(page.container.textContent.includes('inventory is incomplete'));assert.ok(page.container.querySelector('tbody').textContent.includes('media'));assert.ok(page.container.querySelector('.device-ring').textContent.includes('Reported devices'))}finally{await page.close()}
});
test('Routing offers the correct native node review and apply link after staging without applying automatically',async()=>{
 const writes=[];const page=await mounted('pages/NetworkRouting.tsx',{onMap:()=>{}},async(p,init)=>{if(init?.method==='PUT'){writes.push({p,body:JSON.parse(init.body)});return {}}return p==='/auth/me'?{user:{role:'owner'}}:p==='/proxmox'?{cluster:{url:'https://pve.example.test:8006'}}:{nodes:[{node:'b'}],interfaces:[{id:'b/vmbr0',name:'vmbr0',iface:'vmbr0',node:'b',type:'bridge',gateway:'192.0.2.1',status:'up'}],errors:[]}});
 try{await page.click(page.container.querySelector('.network-routing button[aria-label^="Edit "]'));await act(async()=>{page.container.querySelector('.modal form').dispatchEvent(new page.dom.window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0))});assert.equal(writes.length,1);assert.equal(writes[0].p,'/proxmox/network/b/vmbr0');const link=[...page.container.querySelectorAll('a')].find(a=>a.textContent.includes('Review & Apply'));assert.ok(link.href.startsWith('https://pve.example.test:8006/'));assert.ok(link.href.includes('node%2Fb'));assert.ok(link.href.endsWith('network'))}finally{await page.close()}
});
test('Routing rejects unsafe native connection URLs and offers connection settings',async()=>{
 const page=await mounted('pages/NetworkRouting.tsx',{onMap:()=>{}},async p=>p==='/proxmox'?{cluster:{url:'javascript:alert(1)'}}:p==='/auth/me'?{user:{role:'viewer'}}:{nodes:[{node:'b'}],interfaces:[{id:'b/vmbr0',name:'vmbr0',node:'b',type:'bridge',gateway:'192.0.2.1'}]});try{assert.ok([...page.container.querySelectorAll('a')].some(a=>a.textContent==='Configure Proxmox connection URL'));assert.ok(![...page.container.querySelectorAll('a')].some(a=>a.href.startsWith('javascript:')))}finally{await page.close()}
});

test('Network overview omits the removed firewall page and quick actions',async()=>{
 const page=await mounted('pages/Network.tsx',{},async p=>p==='/auth/me'?{user:{role:'owner'}}:{interfaces:[],networks:[],connectors:[],nodes:[]});
 try{assert.equal(button(page.container,'Firewall'),undefined);assert.ok(!page.container.textContent.includes('Quick Actions'));assert.ok(!page.container.textContent.includes('Firewall Services'));assert.ok(button(page.container,'DNS'));assert.ok(button(page.container,'Routing'));}finally{await page.close()}
});

test('Docker network details stay scoped to the reporting Engine and unavailable reads do not become empty inventory',async()=>{
 const network={id:'common',name:'media',driver:'bridge',scope:'local',subnets:'172.22.0.0/16',gateways:'172.22.0.1'};
 let summary={interfaces:[],interfaceCoverage:null,dockerNetworksReported:true,dockerHost:{id:'alpha',name:'media-server'},networks:[network]};
 const page=await mounted('pages/Network.tsx',{},async p=>p==='/network'?summary:p==='/docker/hosts'?{hosts:[]}:p==='/proxmox'?{nodes:[]}:{});try{
  await page.click(button(page.container,'Docker Networks'));
  await page.click(button(page.container,'Details'));
  const details=Object.fromEntries([...page.container.querySelectorAll('.modal dl div')].map(row=>[row.querySelector('dt').textContent,row.querySelector('dd').textContent]));
  assert.deepEqual(details,{Name:'media',Host:'media-server',Driver:'bridge',Scope:'local',Subnet:'172.22.0.0/16',Gateways:'172.22.0.1'});
  summary={...summary,dockerHost:{id:'beta',name:'second'},dockerNetworksReported:false,errors:['Could not read beta inventory'],networks:[]};
  await refresh('/network');
  assert.equal(page.container.querySelector('.modal'),null);
  assert.match(page.container.textContent,/Docker network inventory unavailable/);
  assert.match(page.container.textContent,/Could not read beta inventory/);
  assert.match(page.container.querySelector('.network-stats').textContent,/Docker NetworksUnknown/);
  summary={...summary,dockerNetworksReported:true,errors:[]};await refresh('/network');
  assert.match(page.container.querySelector('.network-stats').textContent,/Docker Networks0/);
 }finally{await page.close()}
});
test('routing counts a successfully read empty node and keeps an unreadable node unknown',async()=>{
 let report={nodes:[{node:'down'},{node:'up'}],interfaces:[],errors:['down: unavailable'],coverage:{readNodes:['up'],missingNodes:['down']}};
 const page=await mounted('pages/NetworkRouting.tsx',{onMap(){}},async p=>p==='/proxmox/network'?report:{});try{
  const counts=()=>[...page.container.querySelectorAll('.route-node-count strong')].map(e=>e.textContent);
  assert.deepEqual(counts(),['Unknown','0']);
  report={...report,coverage:{readNodes:[],missingNodes:['up','down']}};await refresh('/proxmox/network');
  assert.deepEqual(counts(),['Unknown','Unknown']);
  assert.doesNotMatch(page.container.querySelector('.route-ring-legend').textContent,/0%/);
 }finally{await page.close()}
});
test('DNS counts domains independently across nodes and preserves unknown assignment counts',async()=>{
 let report={resolvers:[{node:'a',search:'corp.test lab.test lab.test'},{node:'b',search:'lab.test'}],errors:[]};
 const page=await mounted('pages/NetworkDNS.tsx',{},async p=>p==='/network/dns'?report:{});try{
  assert.deepEqual([...page.container.querySelectorAll('.list-row')].map(row=>[row.firstChild.textContent,row.lastChild.textContent]),[['corp.test','1 node'],['lab.test','2 nodes']]);
  report={resolvers:[],errors:['a: offline','b: offline']};await refresh('/network/dns');
  assert.deepEqual([...page.container.querySelectorAll('.dns-ring-legend b')].map(e=>e.textContent),['Unknown','Unknown','Unknown']);
 }finally{await page.close()}
});
test('traffic shares require paired samples from the same timestamp',async()=>{
 let history=[{time:100,netin:125000},{time:200,netout:375000}];
 const page=await mounted('pages/NetworkTraffic.tsx',{},async p=>p==='/proxmox/network'?{nodes:[{node:'a'}],interfaces:[]}:{history});try{
  assert.match(page.container.querySelector('.traffic-ring').textContent,/Unavailable/);
  history=[...history,{time:300,netin:3,netout:1}];await refresh('/proxmox/network/a');
  assert.match(page.container.querySelector('.traffic-ring-legend').textContent,/75.0%.*25.0%/);
 }finally{await page.close()}
});
test('device details show the reported guest addresses and power state without marking a partial inventory complete',async()=>{
 const page=await mounted('pages/NetworkDevices.tsx',{},async p=>p==='/docker/hosts'?{hosts:[]}:{resourceInventoryComplete:false,services:[{provider:'proxmox',status:'reachable'}],guests:[{id:'104',type:'qemu',name:'app',node:'one',status:'running',powerStatus:'paused',addresses:['192.0.2.104']}]});try{
  assert.match(page.container.querySelector('.device-details-card').textContent,/192\.0\.2\.104/);
  assert.match(page.container.querySelector('tbody').textContent,/paused/);
  assert.match(page.container.querySelector('.network-stats').textContent,/Reported Devices/);
  assert.equal([...page.container.querySelectorAll('a')].find(a=>a.textContent==='Add Connection').getAttribute('href'),'/settings?tab=Connections&setup=choose');
 }finally{await page.close()}
});
test('map distinguishes unverified, partially available and explicitly offline nodes',async()=>{
 let state={nodeInventory:{complete:false},nodes:[{name:'one',status:'unknown'}]};
 const page=await mounted('pages/Network.tsx',{},async p=>p==='/proxmox'?state:{});try{
  const root=()=>page.container.querySelector('.cluster-topology-root small').textContent;
  assert.equal(root(),'Unknown');
  state={...state,nodes:[{name:'one',status:'online'}]};await refresh('/proxmox');assert.equal(root(),'Partial availability');
  state={nodeInventory:{complete:true,members:['one']},nodes:[{name:'one',status:'offline'}]};await refresh('/proxmox');assert.equal(root(),'Nodes unavailable');
 }finally{await page.close()}
});
