import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,useLocation,useNavigate} from 'react-router-dom';import {JSDOM} from 'jsdom';import {build} from 'esbuild';
function Location(){const location=useLocation(),navigate=useNavigate();return React.createElement(React.Fragment,null,React.createElement('output',{'data-location':location.pathname+location.search,hidden:true}),React.createElement('button',{onClick:()=>navigate(-1)},'Back'),React.createElement('button',{onClick:()=>navigate(1)},'Forward'))}
const rootPath=fileURLToPath(new URL('../',import.meta.url));
async function component(file){
 const directory=fs.mkdtempSync(path.join(rootPath,'node_modules','audit-ui-'));
 const result=await build({entryPoints:[path.join(rootPath,'src',file)],bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'},write:false,plugins:[{name:'fixture-api',setup(b){b.onResolve({filter:/\/api$/},()=>({path:'fixture-api',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const clearTokens=()=>{};export const api=(...a)=>globalThis.__auditApi(...a);export const confirmedApi=(...a)=>globalThis.__auditConfirmed(...a);export function setDockerHost(id){localStorage.setItem('iclusters_docker_host',id);window.dispatchEvent(new Event('iclusters-connection'));}` }));}}]});
 const modulePath=path.join(directory,'component.mjs');fs.writeFileSync(modulePath,result.outputFiles[0].text);const module=await import(pathToFileURL(modulePath));return {module,cleanup:()=>fs.rmSync(directory,{recursive:true,force:true})};
}
async function mounted(file,props,api,mobile=true,initialEntries=['/docker?filter=keep']){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://iclusters.test'});const originals={};for(const k of ['window','document','localStorage','Event','CustomEvent','HTMLElement','ResizeObserver','FormData']){originals[k]=globalThis[k];globalThis[k]=dom.window[k];}
 globalThis.ResizeObserver=class {observe(){}disconnect(){}};dom.window.matchMedia=()=>({matches:mobile,addEventListener(){},removeEventListener(){}});globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.__auditApi=api;globalThis.__auditConfirmed=api;dom.window.confirm=()=>true;
 const built=await component(file),container=dom.window.document.getElementById('root'),root=createRoot(container);const Component=built.module.default;
 const render=async values=>{await act(async()=>{root.render(React.createElement(MemoryRouter,{initialEntries},React.createElement(Location),React.createElement(Component,values)));await new Promise(r=>setTimeout(r,0));});};
 await render(props);
 return {dom,container,render,click:async button=>{assert.ok(button,'Expected control is rendered');await act(async()=>{button.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));});},close:async()=>{await act(async()=>root.unmount());dom.window.close();built.cleanup();for(const k of Object.keys(originals)){if(originals[k]===undefined)delete globalThis[k];else globalThis[k]=originals[k];}delete globalThis.__auditApi;delete globalThis.__auditConfirmed;}};
}
const button=(container,label)=>[...container.querySelectorAll('button')].find(b=>b.textContent.trim()===label);

const inventory=(hostname='host-a',containers=[{id:'old-container',name:'old-app',image:'old:latest',status:'running'}])=>({host:{hostname},containers,images:[],volumes:[],networks:[],stacks:[]});
const dockerFixture=async p=>p==='/auth/me'?{user:{role:'owner'}}:p==='/docker'?inventory():p==='/docker/hosts'?{hosts:[],directEnabled:true}:p==='/docker/updates'?{rows:[],settings:{enabled:true,intervalHours:6}}:{nodes:[]};
test('container actions allow unpause only for paused containers',async()=>{
 const page=await mounted('pages/Docker.tsx',{},dockerFixture);try{
 await page.click(page.container.querySelector('[aria-label="Actions for old-app"]'));
 assert.equal(button(page.container,'unpause').disabled,true);assert.equal(button(page.container,'pause').disabled,false);assert.equal(button(page.container,'start').disabled,true);
 }finally{await page.close()}
});
test('switching Docker hosts closes old container actions and selects only current host resources',async()=>{
 const calls=[];const page=await mounted('pages/Docker.tsx',{},async(p,init)=>{calls.push({p,host:localStorage.getItem('iclusters_docker_host')||'',init});return p==='/docker'?inventory(localStorage.getItem('iclusters_docker_host')?'host-b':'host-a',localStorage.getItem('iclusters_docker_host')?[{id:'new-container',name:'new-app',status:'running'}]:undefined):dockerFixture(p)});
 try{await page.click(page.container.querySelector('[aria-label="Actions for old-app"]'));await act(async()=>{localStorage.setItem('iclusters_docker_host','host-b');window.dispatchEvent(new Event('iclusters-connection'));await new Promise(r=>setTimeout(r,0))});
 assert.ok(page.container.querySelector('h1').textContent.includes('host-b'));assert.equal(page.container.querySelector('.modal'),null);await page.click(page.container.querySelector('[aria-label="Actions for new-app"]'));await page.click(button(page.container,'restart'));assert.ok(calls.some(c=>c.host==='host-b'&&c.p==='/actions/docker/container/new-container/restart'));assert.ok(!calls.some(c=>c.p.startsWith('/actions/docker/container/old-container/')));
 }finally{await page.close()}
});
test('Docker tab navigation preserves query parameters and follows browser history',async()=>{
 const page=await mounted('pages/Docker.tsx',{},dockerFixture);try{await page.click([...page.container.querySelectorAll('[role=tab]')].find(b=>b.textContent==='Images'));assert.ok(page.container.querySelector('.docker-images'));assert.equal(page.container.querySelector('[data-location]').getAttribute('data-location'),'/docker?filter=keep&tab=Images');await page.click(button(page.container,'Back'));assert.equal(page.container.querySelector('[aria-selected=true]').textContent,'Containers');await page.click(button(page.container,'Forward'));assert.equal(page.container.querySelector('[aria-selected=true]').textContent,'Images')}finally{await page.close()}
});
test('late container log responses cannot overwrite another container logs',async()=>{
 let finishA;const data=inventory('host-a',[{id:'a',name:'A',status:'running'},{id:'b',name:'B',status:'running'}]);const page=await mounted('pages/Docker.tsx',{},async p=>p==='/docker'?data:p.includes('/a/logs')?new Promise(r=>finishA=r):p.includes('/b/logs')?{logs:'B logs'}:dockerFixture(p));
 try{await page.click(page.container.querySelector('[aria-label="Actions for A"]'));await page.click(button(page.container,'Logs'));await page.click(page.container.querySelector('[aria-label="Actions for B"]'));await page.click(button(page.container,'Logs'));assert.equal(page.container.querySelector('.task-log').textContent,'B logs');await act(async()=>finishA({logs:'A logs'}));assert.ok(page.container.querySelector('.modal').textContent.includes('Logs: B'));assert.equal(page.container.querySelector('.task-log').textContent,'B logs')}finally{await page.close()}
});
test('image usage respects actual image IDs when tags have changed',async()=>{
 const page=await mounted('pages/DockerImages.tsx',{data:{host:{hostname:'fixture'},images:[{id:'sha256:new',name:'app:latest',tags:['app:latest'],size:1024}],containers:[{id:'c',name:'old-app',image:'app:latest',imageId:'sha256:old'}]},enabled:true,admin:true,refresh:async()=>{}},async()=>({}));try{assert.ok(page.container.querySelector('tbody').textContent.includes('0 containers'));assert.ok(page.container.querySelector('tbody').textContent.includes('Unused'))}finally{await page.close()}
});
test('disappearing inspected volumes close the modal without selecting another removal target',async()=>{
 const writes=[],data={host:{hostname:'fixture'},volumes:[{id:'a',name:'volume-a'},{id:'b',name:'volume-b'}],containers:[]};const props={data,enabled:true,admin:true,refresh:async()=>{}};const page=await mounted('pages/DockerVolumes.tsx',props,async(p,init)=>{writes.push({p,init});return p==='/docker/volumes/usage'?{volumes:[{name:'volume-a',references:0},{name:'volume-b',references:0}]}:{}});
 try{await page.click(page.container.querySelector('[aria-label="Inspect volume-b"]'));assert.ok(page.container.querySelector('.modal').textContent.includes('volume-b'));await page.render({...props,data:{...data,volumes:[data.volumes[0]]}});assert.equal(page.container.querySelector('.modal'),null);assert.ok(page.container.textContent.includes('selected volume is no longer reported'));assert.ok(!writes.some(c=>c.init?.method==='DELETE'))}finally{await page.close()}
});

test('paused container actions follow current inventory state',async()=>{
 let state='paused';const page=await mounted('pages/Docker.tsx',{},async p=>p==='/docker'?inventory('fixture',[{id:'c',name:'app',status:state}]):dockerFixture(p));try{await page.click(page.container.querySelector('[aria-label="Actions for app"]'));assert.equal(button(page.container,'unpause').disabled,false);assert.equal(button(page.container,'pause').disabled,true);assert.equal(button(page.container,'start').disabled,true);assert.equal(button(page.container,'stop').disabled,false);state='exited';await act(async()=>{const detail={prefixes:['/docker'],requests:[]};window.dispatchEvent(new CustomEvent('iclusters-resource-refresh',{detail}));await Promise.all(detail.requests)});assert.equal(button(page.container,'start').disabled,false);assert.equal(button(page.container,'unpause').disabled,true);assert.equal(button(page.container,'stop').disabled,true)}finally{await page.close()}
});

test('image creation uses the inspected image ID and disappearing images close their forms',async()=>{
 const writes=[],data={host:{hostname:'fixture'},images:[{id:'sha256:a',name:'app:latest',tags:['app:latest']},{id:'sha256:b',name:'local:latest',tags:['local:latest']}],containers:[]};const props={data,enabled:true,admin:true,refresh:async()=>{}};const page=await mounted('pages/DockerImages.tsx',props,async(p,init)=>{writes.push({p,init});return {}});try{await page.click(page.container.querySelector('[aria-label="Inspect local:latest"]'));await page.click(button(page.container,'Run Container'));const form=page.container.querySelector('.modal form');form.querySelector('input[name=name]').value='new-container';await act(async()=>{form.dispatchEvent(new page.dom.window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0))});assert.equal(JSON.parse(writes.find(w=>w.p==='/docker/container').init.body).image,'sha256:b');await page.click(page.container.querySelector('[aria-label="Inspect local:latest"]'));await page.click(button(page.container,'Tag'));await page.render({...props,data:{...data,images:[data.images[0]]}});assert.equal(page.container.querySelector('.modal'),null);assert.ok(page.container.textContent.includes('selected image is no longer reported'));assert.ok(!writes.some(w=>w.p.includes('/tag')))}finally{await page.close()}
});

test('closing or switching hosts invalidates pending container logs',async()=>{
 let complete,signal;const page=await mounted('pages/Docker.tsx',{},async(p,init)=>p.includes('/old-container/logs')?new Promise(r=>{complete=r;signal=init.signal}):dockerFixture(p));try{await page.click(page.container.querySelector('[aria-label="Actions for old-app"]'));await page.click(button(page.container,'Logs'));await act(async()=>{localStorage.setItem('iclusters_docker_host','host-b');window.dispatchEvent(new Event('iclusters-connection'));await new Promise(r=>setTimeout(r,0))});assert.equal(signal.aborted,true);assert.equal(page.container.querySelector('.modal'),null);await act(async()=>complete({logs:'old host secrets'}));assert.ok(!page.container.textContent.includes('old host secrets'))}finally{await page.close()}
});

test('Docker deep links select supported tabs and invalid tabs fall back to Containers',async()=>{
 for(const [tab,expected] of [['Volumes','Volumes'],['removed-tab','Containers']]){const page=await mounted('pages/Docker.tsx',{},async p=>p==='/docker/volumes/usage'?{volumes:[]}:dockerFixture(p),true,['/docker?tab='+tab]);try{assert.equal(page.container.querySelector('[aria-selected=true]').textContent,expected)}finally{await page.close()}}
});


test('every Docker resource tab places host selection in its heading before its own metrics and navigation',async()=>{
 const cases=[['Containers','Docker Host: host-a',5],['Images','Docker Host: host-a',3],['Volumes','Docker Host: host-a',4],['Compose Stacks','Docker Host: host-a',4],['Events','Docker Host: host-a',5],['Updates','Docker Host: host-a',0]];
 for(const [tab,title,count] of cases){
  const page=await mounted('pages/Docker.tsx',{},dockerFixture,true,['/docker?tab='+encodeURIComponent(tab)]);
  try{
   const heading=page.container.querySelector('h1,h2'),picker=page.container.querySelector('.docker-host-selector.compact'),metrics=page.container.querySelectorAll('.metric-grid'),nav=page.container.querySelector('[aria-label="Docker resources"]');
   assert.ok(heading.textContent.startsWith(title),tab+' heading');const group=heading.closest('.docker-host-heading');assert.ok(group);assert.equal(group.querySelector(':scope>.badge').textContent,'Connected');assert.equal(heading.querySelector('.badge'),null);assert.equal(page.container.querySelectorAll('.docker-page-header').length,1,tab+' shares one host header');
   assert.ok(button(page.container,'Refresh Docker'));assert.ok(page.container.querySelector('a[href="/settings?tab=Connections"]'));
   assert.ok(heading.compareDocumentPosition(picker)&4,tab+' heading precedes host selection');
   assert.equal(metrics.length,count?1:0,tab+' has only its own metrics');if(count){assert.equal(metrics[0].children.length,count,tab+' metrics');assert.ok(picker.compareDocumentPosition(metrics[0])&4,tab+' host selection precedes metrics');assert.ok(metrics[0].compareDocumentPosition(nav)&4,tab+' metrics precede tabs');}
   assert.equal(page.container.querySelectorAll('.docker-host-selector.compact').length,1,tab+' has one host selector');assert.ok(picker.closest('.page-header,.volume-header,.vm-toolbar'),tab+' selector shares the title toolbar');assert.equal(page.container.querySelector('.docker-host-picker'),null);
  }finally{await page.close()}
 }
});
test('update notification deep links verify the exact host before opening its update inventory',async()=>{
 const calls=[];const page=await mounted('pages/Docker.tsx',{},async(p,init)=>{calls.push(p);if(p==='/docker/hosts/host-b/verify')return {host:{version:'29'}};if(p==='/docker/updates')return {rows:[],settings:{enabled:true,intervalHours:6}};return dockerFixture(p,init)},true,['/docker?tab=Updates&host=host-b']);
 try{await act(async()=>new Promise(r=>setTimeout(r,10)));assert.ok(calls.includes('/docker/hosts/host-b/verify'));assert.equal(localStorage.getItem('iclusters_docker_host'),'host-b');assert.ok(page.container.querySelector('.docker-updates'));assert.equal(page.container.querySelector('[data-location]').getAttribute('data-location'),'/docker?tab=Updates')}finally{await page.close()}
});
test('volume cells and keyboard select without inspection and its action opens details once',async()=>{
 const calls=[];const data={host:{hostname:'docker'},containers:[],volumes:[{id:'vol-one',name:'app-data',mountpoint:'/var/lib/docker/volumes/app-data'}]};
 const page=await mounted('pages/DockerVolumes.tsx',{data,enabled:true,admin:true,refresh:async()=>{}},async p=>{calls.push(p);return {Name:'app-data'}});
 try{const row=page.container.querySelector('[aria-label="Inspect volume app-data"]');assert.equal(row.tabIndex,0);await page.click(row.querySelectorAll('td')[2]);await act(async()=>row.dispatchEvent(new page.dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));await page.click(row.querySelector('.resource-identity'));assert.equal(page.container.querySelector('.modal'),null);assert.equal(row.getAttribute('aria-selected'),'true');assert.equal(calls.filter(p=>p==='/docker/volume/vol-one').length,0);assert.equal(row.firstElementChild.querySelectorAll('button').length,0);await page.click(button(row,'Inspect'));assert.ok(page.container.querySelector('.modal'));assert.equal(calls.filter(p=>p==='/docker/volume/vol-one').length,1)}finally{await page.close()}
});

test('image display uses one repository reference and keeps digests in technical details',async()=>{
 const digest='a'.repeat(64),reads=[];const image={id:'sha256:'+digest,name:`postgres:16, postgres@sha256:${digest}`,tags:['postgres:16',`postgres@sha256:${digest}`],digests:[`postgres@sha256:${digest}`],size:1024,created:1};
 const page=await mounted('pages/DockerImages.tsx',{data:{host:{},images:[image],containers:[]},enabled:true,admin:true,refresh:async()=>{}},async p=>{reads.push(p);return {Id:image.id,RepoDigests:image.digests,Architecture:'amd64',Os:'linux'}});
 try{const row=page.container.querySelector('tbody tr');assert.doesNotMatch(row.textContent,/sha256|a{64}/);assert.match(row.textContent,/postgres:16/);assert.ok(row.querySelector('[data-brand="postgresql"]'));
 await page.click(row.querySelectorAll('td')[1]);await page.click(row.querySelector('.resource-identity'));assert.equal(page.container.querySelector('.modal'),null);assert.equal(reads.length,0);await page.click(button(row,'Inspect'));assert.equal(reads[0],'/docker/image/'+encodeURIComponent(image.id));assert.equal(page.container.querySelector('.image-inspection h3').textContent,'postgres:16');assert.doesNotMatch(page.container.querySelector('.task-details').textContent,/sha256/);assert.match(page.container.querySelectorAll('.modal details')[1].textContent,/sha256/);
 }finally{await page.close()}
});

test('anonymous volume display explains its container and folder without changing its operation ID',async()=>{
 const name='a'.repeat(64),reads=[];const page=await mounted('pages/DockerVolumes.tsx',{data:{host:{},volumes:[{id:name,name,mountpoint:'/var/lib/docker/volumes/'+name+'/_data'}],containers:[{id:'wiki',name:'wikijs',mounts:[{Type:'volume',Name:name,Destination:'/wiki/data/content',RW:true}]}]},enabled:true,admin:true,refresh:async()=>{}},async p=>{reads.push(p);return p==='/docker/volumes/usage'?{volumes:[]}:{Name:name,Mountpoint:'/var/lib/docker/volumes/'+name+'/_data'}});
 try{const row=page.container.querySelector('tbody tr');assert.match(row.textContent,/wikijs · \/wiki\/data\/content/);assert.doesNotMatch(row.textContent,/a{64}|\/var\/lib/);await page.click(button(row,'Inspect'));assert.ok(reads.includes('/docker/volume/'+name));assert.equal(page.container.querySelector('.volume-inspection h3').textContent,'wikijs · /wiki/data/content');assert.doesNotMatch(page.container.querySelector('.task-details').textContent,/a{64}/);assert.match(page.container.querySelector('.modal details').textContent,/a{64}/);
 }finally{await page.close()}
});

test('published endpoints keep reported host bindings distinct from container IPs',async()=>{
 const built=await component('docker-display.ts');try{const display=built.module.publishedEndpoints;
 assert.deepEqual(display({portBindings:[{hostIp:'2001:db8::10',hostPort:8443,containerPort:443,protocol:'tcp'},{hostIp:'0.0.0.0',hostPort:5353,containerPort:53,protocol:'udp'},{hostIp:'127.0.0.1',hostPort:9000,containerPort:9000,protocol:'tcp'},{hostPort:70000,containerPort:80}]},{hostname:'control-vm'}),['[2001:db8::10]:8443 → 443/tcp','control-vm:5353 → 53/udp (all host IPv4 interfaces)','127.0.0.1:9000 → 9000/tcp (host loopback only)']);
 assert.deepEqual(display({networks:{app:{IPAddress:'172.20.0.2'}},ports:'80'},{}),[]);
 assert.deepEqual(display({portBindings:[{hostIp:'::',hostPort:8080,containerPort:80}]},{}),['Docker host:8080 → 80/tcp (all host IPv6 interfaces)']);
 }finally{built.cleanup()}
});

test('intentional action cancellation is quiet and never produces a success or write retry',async()=>{
 for(const message of ['Authentication cancelled','Confirmation cancelled','Permission denied']){
  let writes=0;const data={host:{hostname:'fixture'},volumes:[],containers:[]};const page=await mounted('pages/DockerVolumes.tsx',{data,enabled:true,admin:true,refresh:async()=>{}},async(p,init)=>{if(!init?.method)return {volumes:[]};writes++;throw Error(message)});
  try{await page.click(button(page.container,'Prune Unused Anonymous Volumes'));assert.equal(writes,1);assert.equal(button(page.container,'Prune Unused Anonymous Volumes').disabled,false);assert.equal(page.container.querySelector('[role=status]'),null);assert.equal(page.container.querySelector('.error')?.textContent||'',message==='Permission denied'?message:'')}finally{await page.close()}
 }
});

test('quiet cancellation matching retains host-change, transport and authentication failures',async()=>{
 const built=await component('action-cancellation.ts');try{const quiet=built.module.isActionCancelled;for(const message of ['Authentication cancelled','Confirmation cancelled'])assert.equal(quiet(Error(message)),true);for(const value of [null,undefined,Error('Authentication failed'),Error('Docker host changed. Action cancelled.'),Error('Connection was cancelled by the server'),Error('Failed to fetch')])assert.equal(quiet(value),false)}finally{built.cleanup()}
});

test('removed Docker Networks tab is absent and old links fall back to Containers',async()=>{
 const page=await mounted('pages/Docker.tsx',{},dockerFixture,true,['/docker?tab=Networks']);try{assert.equal([...page.container.querySelectorAll('[role=tab]')].some(el=>el.textContent==='Networks'),false);assert.ok(page.container.querySelector('.docker-table'));assert.equal(page.container.querySelector('.docker-networks'),null)}finally{await page.close()}
});

test('container cells select, actions open the popup and operations retain the exact target',async()=>{
 const writes=[],page=await mounted('pages/Docker.tsx',{},async(p,init)=>{if(init?.method){writes.push(p);return {}}return dockerFixture(p)});
 try{const row=page.container.querySelector('[aria-label="Container old-app"]');for(const cell of [...row.querySelectorAll('td')].slice(0,5)){await page.click(cell);assert.equal(page.container.querySelector('.modal'),null);assert.equal(row.getAttribute('aria-selected'),'true');assert.deepEqual(writes,[])}assert.equal(row.firstElementChild.querySelectorAll('button').length,0);await page.click(page.container.querySelector('[aria-label="Actions for old-app"]'));assert.match(page.container.querySelector('.modal').textContent,/old-app/);assert.match(page.container.querySelector('.modal').textContent,/old:latest/);await page.click(button(page.container,'stop'));assert.deepEqual(writes,['/actions/docker/container/old-container/stop'])}finally{await page.close()}
});

test('Logs and Back keep the Jellyfin row, host, search, status filter and scroll position',async()=>{
 const calls=[];
 const page=await mounted('pages/Docker.tsx',{},async(path,init)=>{
  calls.push([path,init?.method||'GET']);
  if(path==='/auth/me')return {user:{role:'viewer'}};
  if(path==='/docker')return inventory('media-host',[{id:'j',name:'Jellyfin',status:'running'},{id:'p',name:'Plex',status:'running'}]);
  if(path.endsWith('/logs'))return {logs:'Jellyfin ready'};
  return dockerFixture(path);
 });
 try{
  const search=page.container.querySelector('[aria-label="Search Docker resources"]');
  const status=page.container.querySelector('[aria-label="Container status"]');
  await act(async()=>{
   search.value='Jelly';
   search.dispatchEvent(new Event('input',{bubbles:true}));
   status.value='running';status.dispatchEvent(new Event('change',{bubbles:true}));
  });
  const row=page.container.querySelector('.docker-table tbody tr');
  assert.match(row.textContent,/Jellyfin.*media-host/);
  assert.equal(page.container.querySelectorAll('.docker-table tbody tr').length,1);
  const scroller=row.closest('.table-wrap');scroller.scrollTop=72;
  await page.click(row.querySelector('.container-logs'));
  assert.equal(page.container.querySelector('.task-log').textContent,'Jellyfin ready');
  await page.click(button(page.container,'Back'));
  assert.equal(page.container.querySelector('.task-log'),null);
  assert.equal(page.container.querySelector('.docker-table tbody tr'),row);
  assert.equal(row.getAttribute('aria-selected'),'true');
  assert.equal(search.value,'Jelly');assert.equal(status.value,'running');assert.equal(scroller.scrollTop,72);
  assert.ok(calls.every(([,method])=>method==='GET'));
 }finally{await page.close()}
});

test('all Docker tabs keep the shared host header above incomplete guest discovery diagnostics',async()=>{
 for(const tab of ['Containers','Images','Volumes','Compose Stacks','Events','Updates']){
  const page=await mounted('pages/Docker.tsx',{},async p=>p==='/docker'?{readOnly:true,containers:[],images:[],volumes:[],networks:[],stacks:[],note:'Guest inventory is read-only.',discoveryLimitations:['Guest agent unavailable.']}:dockerFixture(p),true,['/docker?tab='+encodeURIComponent(tab)]);
  try{const header=page.container.querySelector('.docker-page-header');assert.match(header.textContent,/Docker Host: Not connected/);assert.match(header.textContent,/Unavailable/);assert.ok(header.querySelector('a[href="/settings?tab=Connections&setup=docker"]'));assert.ok(button(page.container,'Refresh Docker'));assert.equal(page.container.querySelectorAll('.docker-host-selector.compact').length,1);const note=[...page.container.querySelectorAll('p')].find(p=>p.textContent==='Guest inventory is read-only.');assert.ok(header.compareDocumentPosition(note)&4);assert.equal(page.container.querySelectorAll('.docker-page-header').length,1);}finally{await page.close()}
 }
});
