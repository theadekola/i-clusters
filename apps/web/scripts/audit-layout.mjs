import {mkdirSync,readFileSync} from 'node:fs';
import {createHash,X509Certificate} from 'node:crypto';
/** Read-only browser audit using fixture APIs. Install Playwright + Chromium to run:
 * node scripts/audit-layout.mjs
 * PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE may point to an existing test runtime.
 */
import assert from 'node:assert/strict';
import {createServer,preview} from 'vite';
const auditLocale=process.env.LAYOUT_LOCALE||'en-GB',code=auditLocale.split('-')[0],pack=code==='en'?{}:JSON.parse(readFileSync(new URL('../src/i18n/packs/'+code+'.json',import.meta.url),'utf8')),copy=value=>pack[value]||value;
const languageChoices=[
 ['fr-FR','FR','Français','Vue d’ensemble'],
 ['es-ES','ES','Español','Resumen'],
 ['de-DE','DE','Deutsch','Übersicht'],
 ['pt-PT','PT','Português','Visão geral'],
 ['en-US','EN','English (US)','Overview'],
 ['en-GB','EN','English (UK)','Overview'],
];
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const browserTools=process.env.ICLUSTERS_BROWSER_TOOLS;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||(browserTools?pathToFileURL(path.join(browserTools,'playwright-core/index.mjs')).href:'playwright'));
const browserExecutable=process.env.CHROMIUM_EXECUTABLE||(browserTools?await(await import(pathToFileURL(path.join(browserTools,'@sparticuz/chromium/build/index.js')).href)).default.executablePath():undefined);
const root=fileURLToPath(new URL('../',import.meta.url));
const aiMetadata=process.env.LAYOUT_CONNECTION_CHOICES?(await import('../../api/src/ai-providers.js')).publicAIProviders():null;
const aiSchema=process.env.LAYOUT_CONNECTION_CHOICES?(await import('../../api/src/runtime-configuration.js')).configurationSchemas.ai:null;
let aiFixture=aiSchema?{id:'ai',name:'AI Assistant',disabled:true,providers:aiMetadata,fields:aiSchema.fields.map(f=>({...f,value:f.defaultValue||'',hasValue:false}))}:null;
const now=new Date().toISOString();
const guests=Array.from({length:8},(_,i)=>({id:100+i,vmid:100+i,name:['Control-VM','HomeCloud','Mssql-Server','my-app-App'][i%4],node:'node01',type:i===7?'lxc':'qemu',status:'running',cpu:i+1,memory:1024**3,memoryMax:4*1024**3,disk:10*1024**3,diskMax:32*1024**3,uptime:50000}));
const nodes=[{id:'node01',name:'node01',node:'node01',status:'online',cpu:5,memoryPercent:71,uptime:100000,ip:'192.0.2.10'}];
const sample={
 sampledAt:now,nodes,hosts:nodes,guests,vms:guests.filter(g=>g.type==='qemu'),lxc:guests.filter(g=>g.type==='lxc'),
 host:{hostname:'control-vm',version:'27.0.0',memory:4*1024**3},
 cluster:{name:'Homelab',url:'https://192.0.2.10:8006'},
 storage:[{id:'local',name:'local',node:'node01',status:'online',usage:28}],resources:guests,
 services:[{name:'Proxmox',provider:'proxmox',status:'reachable'},{name:'Docker',provider:'docker',status:'reachable'}],
 metrics:Array.from({length:24},(_,i)=>({time:new Date(Date.now()-(23-i)*3600000).toISOString(),cpu:5+i%4,memory:71,nodes:[{name:'node01',cpu:5+i%4,memory:71}]})),
 containers:[{id:'c1',name:'zabbix-postgres',image:'postgres:16',status:'running',cpu:2,memory:128*1024**2,ports:[],networks:[]}],
 images:[{id:'image1',tags:['postgres:16'],size:1024**3}],
 ...Object.fromEntries(['errors','alerts','networks','volumes','pools','datasets','disks','shares','interfaces','devices','routes','dns','rules','history','jobs','points','tasks','logs','users','connections','notifications','destinations','schedules','policies'].map(k=>[k,[]]))
};
const popupPools=['node01','node02'].map((node,index)=>({id:node+'/backup-ssd',name:'backup-ssd',provider:'proxmox',node,type:'dir',status:'online',applicable:true,capacity:(index+1)*1024**4,used:100*1024**3,available:(index+1)*1024**4-100*1024**3,usage:10,path:'/mnt/pve/backup-ssd',content:['backup']}));
const popupVolumes=[{id:'vm-volume',resourceId:'local-lvm:vm-103-disk-0',name:'local-lvm:vm-103-disk-0',node:'node01',vmid:103,provider:'proxmox',type:'VM Volume',pool:'local-lvm',size:150*1024**3,editable:true},{id:'dataset',resourceId:'tank/data',name:'tank/data',provider:'truenas',type:'Dataset',pool:'tank',mountpoint:'/mnt/tank/data',editable:true}];
function fixture(path){
 if(process.env.LAYOUT_STORAGE_POPUPS){
  if(path==='/storage')return {...sample,pools:popupPools,summary:{pools:2,online:2,capacity:3*1024**4,distribution:popupPools.map(row=>({...row,key:row.provider+':'+row.id}))}};
  if(path==='/storage/disks')return {...sample,resources:['node01','node02'].map((node,index)=>({id:node+'/sda',name:'/dev/sda',node,provider:'proxmox',type:'ssd',size:1024**4,health:'PASSED',model:'Fixture disk '+node,serial:'serial-'+node,wearout:87,gpt:true}))};
  if(path.includes('/smart'))return {report:{health:'PASSED',attributes:[],text:'Read-only fixture S.M.A.R.T. report'},sampledAt:now};
  if(path==='/storage/datasets')return {...sample,resources:popupVolumes,truenasEnabled:true};
 }

 if(path==='/dashboard'&&process.env.LAYOUT_CHART_HISTORY)return {...sample,metrics:process.env.LAYOUT_CHART_HISTORY==='empty'?[]:sample.metrics.slice(-1)};
 if(path==='/auth/setup')return {registrationOpen:false};
 if(aiFixture&&path==='/configuration/ai')return aiFixture;
 if(process.env.LAYOUT_PROXMOX_SAVE&&path==='/connections/proxmox')return {cluster:null};
 if(path==='/auth/me')return {user:{id:'owner',name:'Layout Review',role:process.env.LAYOUT_ROLE||'owner'}};
 if(path==='/header-notifications')return {attentionCount:1,updateCount:1,criticalCount:0,attention:[{id:'update',kind:'update',title:'Docker image update available',message:'control-vm / zabbix-postgres · postgres:16 has a new registry image',severity:'info',link:'/docker?tab=Updates'}]};
 if(path==='/docker/updates')return {rows:[],settings:{enabled:true,intervalHours:6}};
 if(path==='/account/sessions')return {sessions:[]};
 if(path==='/account/security')return {mfaEnabled:false,recoveryCodesRemaining:0};
 if(path==='/security')return {password:{minimumCharacters:12,maximumBytes:72},roles:['owner','admin','operator','viewer'],twoFactor:true};
 if(path==='/storage/shares')return {...sample,resources:[{id:'share-1',resourceId:'1',name:'Backups',protocol:'SMB',provider:'truenas',path:'/mnt/pool/backups',enabled:true}]};
 if(path==='/storage/disks')return {...sample,resources:[{id:'disk-1',name:'/dev/sda',provider:'proxmox',node:'node01',type:'ssd',size:100*1024**3,health:'PASSED'}]};
 if(path==='/storage/performance')return {...sample,sources:[],series:[],pools:[],datasetIO:[],shareThroughput:[]};
 if(path==='/updates')return process.env.LAYOUT_UPDATE_NOTICE?{configured:true,enabled:process.env.LAYOUT_UPDATE_NOTICE!=='stale',available:true,current:'fixture-old-release',latest:'fixture-new-release',changes:['Fix SSH popup layout'],state:process.env.LAYOUT_UPDATE_NOTICE==='stale'?'unavailable':'ready',message:process.env.LAYOUT_UPDATE_NOTICE==='stale'?'The updater has not reported a recent check.':'A new update is available.'}:{enabled:false,available:false};
 if(process.env.LAYOUT_STORAGE_CLEANUP&&path==='/storage')return {...sample,pools:[{id:'node01/local',name:'local',node:'node01',provider:'proxmox',status:'online',applicable:true},{id:'node01/media-storage',name:'media-storage',node:'node01',provider:'proxmox',status:'not-assigned',applicable:false}],summary:{pools:1},providerInventory:{truenas:{configured:false}}};
 if((process.env.LAYOUT_STORAGE_CLEANUP||process.env.LAYOUT_CONNECTION_CHOICES)&&path==='/configuration/truenas')return {id:'truenas',name:'TrueNAS',fields:[{key:'TRUENAS_URL',label:'HTTPS endpoint',type:'url',required:true,value:'',hasValue:false},{key:'TRUENAS_API_KEY',label:'API key',type:'password',required:true,value:'',hasValue:false}]};
 if(path==='/settings')return {settings:{refresh:30,siteName:'i-Clusters'},system:{},security:{},notifications:{},connections:[]};
 // Storage inventory reports node names; task and cluster inventories report node objects.
 if(path==='/proxmox/storage')return {...sample,nodes:nodes.map(node=>node.node),resources:[],coverage:{complete:true,expectedNodes:nodes.map(node=>node.node),readNodes:nodes.map(node=>node.node)}};
 if(path==='/backups')return {...sample,archiveInventory:{configured:true,complete:true}};
 if(path==='/proxmox/storage/configuration')return {resources:[{id:'local',type:'dir',enabled:true,shared:false,path:'/var/lib/vz',content:['iso','vztmpl']},{id:'local-lvm',type:'lvmthin',enabled:true,shared:null,vgname:'pve',thinpool:'data',content:['images','rootdir']},{id:'backup-ssd',type:'dir',enabled:true,shared:true,path:'/mnt/pve/backup-ssd',content:['backup'],nodes:['node01']}],sampledAt:new Date().toISOString()};
 if(path==='/docker/hosts')return {hosts:[{id:'docker-fixture',name:'control-vm',online:true}]};
 if(path==='/users')return {users:[{id:'owner',name:'Layout Review',email:'review@example.test',role:'owner',status:'active'}]};
 if(path==='/ssh/connections')return {};
 if(path==='/ssh/fingerprint')return {host:'192.0.2.100',fingerprint:'SHA256:'+'a'.repeat(43)};
 return sample;
}
const routes=['/','/proxmox','/docker','/storage','/network','/backups','/monitoring','/alerts','/ai','/users','/settings','/tools/sftp','/tools/shell'];
for(const [page,tabs] of Object.entries({
 proxmox:['Overview','Nodes','Virtual Machines','LXC Containers','Storage','Networks','Tasks & Logs'],
 docker:['Images','Volumes','Compose Stacks','Events','Updates'],
 storage:['Configuration','Disks','Datasets / Volumes','Snapshots','Shares','Performance'],
 network:['Interfaces','Devices','Routing','DNS','Traffic Analysis','Docker Networks'],
 backups:['Backup Archives','Restore Points','Schedules','Retention Policies','Destinations','Reports'],
 monitoring:['Provider Jobs','Hardware & Diagnostics'],
 alerts:['Alert History','Alert Rules'],users:['Audit Logs'],
 settings:['General','System','Security','Connections','Appearance','About']
}))for(const tab of tabs)routes.push(`/${page}?tab=${encodeURIComponent(tab)}`);
for(const section of ['connected','setup','notifications','remote'])routes.push(`/settings?tab=Connections&section=${section}`);
const selectedRoutes=process.env.LAYOUT_ROUTES?.split(',')||routes;
const widths=(process.env.LAYOUT_WIDTHS||'1280,768,390').split(',').map(Number);
const checkRefresh=process.env.LAYOUT_CHECK_REFRESH==='1';let readCount=0,refreshControls=0;
const tls=process.env.LAYOUT_HTTPS_CERT?{https:{key:readFileSync(process.env.LAYOUT_HTTPS_KEY),cert:readFileSync(process.env.LAYOUT_HTTPS_CERT)}}:{};
// Chromium fetches the service worker in a separate request. Trust only the fixture key.
const certArgs=tls.https?['--ignore-certificate-errors-spki-list='+createHash('sha256')
 .update(new X509Certificate(tls.https.cert).publicKey.export({type:'spki',format:'der'})).digest('base64')]:[];
const listen={host:'127.0.0.1',port:0,...tls};
const failures=[],server=await (process.env.LAYOUT_PRODUCTION==='1'?preview({root,preview:listen}):createServer({root,server:listen}));
let restartPower='running',restartVerified=false,restartPolls=0,restartWrites=[];
let updateWrites=0;
let browser,clusterSaves=0,clusterTests=0,aiModelReads=0,aiTests=0,aiSaves=0;
try{
 if(server.listen)await server.listen();const base=server.resolvedUrls.local[0];
 browser=await chromium.launch({headless:true,...(browserExecutable?{executablePath:browserExecutable}:{}),args:['--no-sandbox','--disable-dev-shm-usage',...certArgs,...(browserTools?['--no-zygote','--single-process']:[])]});
 const page=await browser.newPage({ignoreHTTPSErrors:!!process.env.LAYOUT_HTTPS_CERT});if(process.env.LAYOUT_CONNECTION_CHOICES)page.on('dialog',dialog=>dialog.accept());
 await page.addInitScript(locale=>{if(!localStorage.getItem('iclusters_language'))localStorage.setItem('iclusters_language',locale);if(!sessionStorage.getItem('language-login-audit'))localStorage.setItem('iclusters_access_token','layout-fixture');localStorage.setItem('iclusters_last_activity',String(Date.now()));},auditLocale);
 await page.addInitScript(theme=>{if(theme)localStorage.setItem('iclusters_appearance',JSON.stringify({theme,preset:'ocean'}))},process.env.LAYOUT_THEME||'');
 await page.route('**/api/**',async route=>{
  readCount++;if(checkRefresh)await new Promise(resolve=>setTimeout(resolve,150));
  const path=new URL(route.request().url()).pathname.replace('/api','');
  if(process.env.LAYOUT_GUEST_RESTART){
   if(path==='/connections/proxmox/guests')return route.fulfill({json:{guests:[{id:'100',node:'node01',name:'Control-VM',status:restartVerified?'connected':'disabled'}]}});
   if(path==='/node-agents/guest/agent')return route.fulfill({json:{result:{requiresPowerCycle:true,agentVerified:false,message:'Setup installed. Shutdown and start required.'}}});
   if(path==='/proxmox/vm/node01/100/details'){
    const view=new URL(route.request().url()).searchParams.get('view');
    return route.fulfill({json:view==='agent'?{os:{result:{name:'Debian'}}}:{status:{status:restartPower}}});
   }
   if(path.startsWith('/actions/proxmox/vm/100/')){
    const operation=path.split('/').at(-1);assert.equal(operation,'reboot');
    if(!route.request().headers()['x-iclusters-ssh-grant'])return route.fulfill({status:409,json:{confirmationPhrase:'CONFIRM FIXTURE RESTART',sshTarget:'node:node01'}});
    restartWrites.push(operation);return route.fulfill({json:{result:{task:operation+'-fixture-task'}}});
   }
   if(path==='/ssh/connect')return route.fulfill({json:{token:'fixture-approval'}});
   if(path.startsWith('/tasks/node01/')){await new Promise(resolve=>setTimeout(resolve,150));if(++restartPolls===1){restartPower='stopped';return route.fulfill({json:{status:'running'}})}restartPower='running';restartVerified=true;return route.fulfill({json:{status:'stopped',exitstatus:'OK'}});}
  }
  if(process.env.LAYOUT_UPDATE_NOTICE&&path==='/updates'&&route.request().method()==='POST'){updateWrites++;return route.fulfill({json:{ok:true,state:'queued'}})}
  if(process.env.LAYOUT_CONNECTION_CHOICES){
   if(path==='/node-agents/pairing-targets'){const kind=new URL(route.request().url()).searchParams.get('kind');return route.fulfill({json:{targets:kind==='docker'?[{id:'node01:qemu/100',name:'Control-VM',label:'Control-VM · VM 100 · node01'}]:[{id:'node:node01',name:'node01',label:'node01 · Proxmox node'}]}});}
   if(path.endsWith('/automatic-pairing/target')||path.endsWith('/automatic-docker-pairing/target'))return route.fulfill({json:{host:'192.0.2.100',connectionId:'fixture-only',controller:'https://controller.test'}});
   if(['/configuration/ai/models','/configuration/ai/test','/configuration/ai'].includes(path)&&route.request().method()!=='GET'){
    const posted=route.request().postDataJSON(),config=posted.configuration||posted,id=config.AI_PROVIDER||'openai';assert.ok(aiMetadata[id]);assert.equal(config.OPENAI_API_KEY,'fixture-'+id);assert.equal(config.OPENAI_API_TYPE,aiMetadata[id].types[0]);
    if(path.endsWith('/models')){aiModelReads++;return route.fulfill({json:{result:{models:[id+'-fixture-model']}}});}
    if(path.endsWith('/test')){aiTests++;assert.equal(posted.confirm,true);assert.equal(config.OPENAI_MODEL,id+'-fixture-model');return route.fulfill({json:{result:{verified:true,message:'AI connection verified for the entered settings. Save Configuration to apply them.'}}});}
    aiSaves++;aiFixture={...aiFixture,disabled:false,fields:aiFixture.fields.map(f=>({...f,value:f.type==='password'?'':config[f.key]||f.value,hasValue:true}))};return route.fulfill({json:{result:aiFixture}});
   }
  }
  if(process.env.LAYOUT_PROXMOX_SAVE){
   assert.ok(!path.includes('power-permissions'),'Saving must not open or call the removed power setup flow');
   if(path==='/connections/proxmox'&&route.request().method()==='PUT'||path==='/connections/proxmox/test'&&route.request().method()==='POST'){
    const body=route.request().postDataJSON();assert.equal(body.management,true);assert.equal(body.verifyTls,false);
    if(route.request().method()==='PUT')clusterSaves++;else clusterTests++;
    return route.fulfill({json:{ok:true,nodes:[{name:'node01',status:'online'}],management:{verified:true,power:true,configuration:true}}});
   }
  }
  if(process.env.LAYOUT_STORAGE_POPUPS&&path==='/storage/datasets/edit'&&route.request().method()==='GET'){
   const resourceId=new URL(route.request().url()).searchParams.get('resourceId'),resource=popupVolumes.find(row=>row.resourceId===resourceId);assert.ok(resource);return route.fulfill({json:{...resource,revision:'fixture-revision',connectionScope:'fixture-scope',disk:'scsi0',quota:0,compression:'LZ4',readonly:'OFF'}});
  }
  if(path==='/product/visit'&&route.request().method()==='POST'){
   const visit=route.request().postDataJSON();
   if(Object.keys(visit??{}).length!==1||typeof visit?.feature!=='string'||!visit.feature.trim())failures.push('Invalid product visit payload');
   return route.fulfill({status:204});
  }
  // The audit must never reach an actual provider or perform a management write.
  if(route.request().method()!=='GET'&&path!=='/ssh/fingerprint'&&!(checkRefresh&&path==='/docker/updates/check'))failures.push(`Unexpected write: ${path}`);
  return route.fulfill({json:fixture(path)});
 });
 let errors=[];page.on('pageerror',e=>errors.push(e.stack||e.message));
 page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
 for(const width of widths){
  console.log('Checking '+auditLocale+' at '+width+'px.');
  await page.setViewportSize({width,height:1000});
  for(const route of selectedRoutes){
   console.log('  '+width+'px '+route);
   errors=[];await page.goto(base.replace(/\/$/,'')+route);await page.locator('.content h1,.content h2').first().waitFor({timeout:15000}).catch(async()=>{throw Error(`Page did not render: ${route}; ${errors.join('; ')}; ${(await page.locator('body').innerText()).slice(0,300)}`)});await page.waitForTimeout(350);
   if(process.env.LAYOUT_CHECK_IMAGES==='1'){
    const images=page.locator('.page-image-icon img,.brand-mark img');assert.ok(await images.count()>0,route+': original page or brand images are rendered');
    const failures=await images.evaluateAll(async elements=>{await Promise.all(elements.map(image=>image.decode().catch(()=>{})));return elements.filter(image=>!image.complete||!image.naturalWidth||!image.getAttribute('src').startsWith('data:image/png;base64,')).map(image=>image.closest('[data-page-icon],[data-brand]')?.outerHTML.slice(0,160))});
    assert.deepEqual(failures,[],route+': every original bundled image loads');
   }
   if(process.env.LAYOUT_CHECK_ICON_SURFACES==='1'){
    await page.mouse.move(0,0);
    const painted=await page.evaluate(()=>{
     const clear=color=>color==='transparent'||color==='rgba(0, 0, 0, 0)'||/rgba\([^)]*,\s*0\)$/.test(color);
     const findings=new Set();
     for(const icon of document.querySelectorAll('svg,.page-image-icon img,.brand-mark img')){
      if(icon.closest('.recharts-wrapper,.access-qr'))continue;
      let element=icon;
      for(let depth=0;element&&depth<4;depth++,element=element.parentElement){
       if(element.matches('td,th,tr')||element instanceof SVGElement&&element.tagName.toLowerCase()!=='svg')break;
       const box=element.getBoundingClientRect();if(box.width>120||box.height>120||!box.width||!box.height||element.textContent.trim()&&!element.matches('.icon-btn'))break;
       const style=getComputedStyle(element);
       if(!clear(style.backgroundColor)||style.backgroundImage!=='none')findings.add(element.tagName.toLowerCase()+'.'+(element.getAttribute('class')||'')+' background='+style.backgroundColor+' image='+style.backgroundImage);
      }
     }
     return [...findings];
    });
    failures.push(...painted.map(issue=>`${width}px ${route}: painted icon surface ${issue}`));
   }
   if(process.env.LAYOUT_CHECK_CHARTS==='1'&&route==='/'){
    const mode=process.env.LAYOUT_CHART_HISTORY||'normal',history=page.locator('.overview-history');
    if(mode==='empty'){
     assert.equal(await history.locator('.recharts-wrapper').count(),0,'No history must not produce a fake plot');
     assert.ok((await history.innerText()).includes(copy('Waiting for CPU and memory measurements. Check Proxmox token permissions below.')));
     assert.equal(await page.locator('.resource-history-empty').count(),2,'CPU and memory tiles explain missing history');
    }else{
     const assertPlot=async()=>{
      const plots=page.locator('.overview-resources .resource-tile .recharts-wrapper,.overview-history .recharts-wrapper');
      await page.waitForFunction(()=>{const plots=[...document.querySelectorAll('.overview-resources .recharts-wrapper,.overview-history .recharts-wrapper')];return plots.length===3&&plots.every(plot=>plot.querySelector('.recharts-area-curve,.recharts-area-dot'))});
      assert.equal(await plots.count(),3,'CPU, memory and historical resource plots render');
      const shapes=await plots.locator('.recharts-area-curve,.recharts-area-dot').evaluateAll(elements=>elements.map(element=>({d:element.getAttribute('d'),cx:element.getAttribute('cx'),cy:element.getAttribute('cy')})));
      assert.ok(shapes.length>=4,'Both CPU and memory series have visible geometry');for(const shape of shapes)assert.doesNotMatch(JSON.stringify(shape),/NaN|undefined/);
      assert.ok(await history.locator('.recharts-xAxis .recharts-cartesian-axis-tick').count()>0,'Time axis renders');assert.ok(await history.locator('.recharts-yAxis .recharts-cartesian-axis-tick').count()>0,'Percent axis renders');
     };
     await assertPlot();
     await history.scrollIntoViewIfNeeded();const box=await history.locator('.recharts-surface').boundingBox();await page.mouse.move(box.x+box.width*.6,box.y+box.height*.5);
     await page.waitForFunction(()=>document.querySelector('.overview-history .recharts-tooltip-wrapper')?.textContent.includes('71'));
     const tooltip=await history.locator('.recharts-tooltip-wrapper').innerText();assert.ok(tooltip.includes(copy('CPU %')));assert.ok(tooltip.includes(copy('Memory %')));assert.match(tooltip,/71/,'Tooltip reports the fixture memory measurement');
     await page.getByLabel(copy('Select node'),{exact:true}).selectOption('node01');await assertPlot();await page.getByLabel(copy('History period'),{exact:true}).selectOption('1');await assertPlot();
     await page.getByLabel(copy('History period'),{exact:true}).selectOption('24');await page.getByLabel(copy('Select node'),{exact:true}).selectOption('');await assertPlot();await page.mouse.move(0,0);
    }
    const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:copy('Export overview report'),exact:true}).click();const download=await downloadEvent,report=JSON.parse(readFileSync(await download.path(),'utf8'));
    assert.ok(Array.isArray(report.history),'Export contains the selected history');assert.equal(report.history.length,mode==='empty'?0:mode==='single'?1:24);if(report.history.length)assert.equal(report.history.at(-1).memory,71,'Export uses actual measurements');
   }
   if(process.env.LAYOUT_CHECK_TYPOGRAPHY==='1'){
    const findings=await page.evaluate(()=>{
     const issues=[],visible=el=>!!el.getBoundingClientRect().width,root=parseFloat(getComputedStyle(document.documentElement).fontSize),pageSize=root*(innerWidth<=600?1.5:1.75);
     const heading=[...document.querySelectorAll('.content h1,.content h2')].find(visible);
     if(!heading||Math.abs(parseFloat(getComputedStyle(heading).fontSize)-pageSize)>.1)issues.push('Primary page title does not use the shared scale: '+heading?.textContent);
     for(const tab of document.querySelectorAll('.content .tabs>button,.content .pve-tabbar [role=tab],.content [role=tablist]>[role=tab]'))if(visible(tab)&&(Math.abs(parseFloat(getComputedStyle(tab).fontSize)-root*.875)>.1||getComputedStyle(tab).fontWeight!=='600'))issues.push('Tab label typography differs: '+tab.textContent);
     for(const title of document.querySelectorAll('.content .card h3'))if(visible(title)&&Math.abs(parseFloat(getComputedStyle(title).fontSize)-root)>.1)issues.push('Panel title size differs: '+title.textContent);
     const hostHeading=document.querySelector('.docker-host-heading');
     if(hostHeading){const title=hostHeading.querySelector('h1').getBoundingClientRect(),badge=hostHeading.querySelector('.badge').getBoundingClientRect();if(Math.abs((title.top+title.height/2)-(badge.top+badge.height/2))>1)issues.push('Docker connection badge leaves the host title row');if(innerWidth>=768&&hostHeading.querySelector('.docker-host-name').textContent.length<=40&&title.height>parseFloat(getComputedStyle(hostHeading.querySelector('h1')).lineHeight)+1)issues.push('Short Docker host title wraps at desktop width');}
     const summaries=document.querySelector('.storage-configuration-stats');if(summaries&&summaries.getBoundingClientRect().bottom>document.querySelector('.storage-configuration>[role=tablist]').getBoundingClientRect().top)issues.push('Storage configuration summaries must precede tabs');
     if(['/tools/shell','/tools/sftp','/users'].includes(location.pathname)&&[...document.querySelectorAll('.page-header small')].some(el=>/Tools[ ]?›|Management[ ]?\//.test(el.textContent)))issues.push('Legacy duplicate breadcrumb remains');
     for(const link of document.querySelectorAll('.nav-item'))if(!link.getAttribute('aria-label')?.trim())issues.push('Navigation link lacks an accessible label');
     return issues;
    });failures.push(...findings.map(issue=>`${width}px ${route}: ${issue}`));
   }
   const problems=await page.evaluate(()=>{
    const issues=[];
    if(document.documentElement.scrollWidth>innerWidth+1)issues.push('Page has horizontal overflow');
    const scrollContainer=e=>{for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){const c=getComputedStyle(p);if(/auto|scroll|hidden|clip/.test(c.overflowX))return true;}return false;};
    for(const e of document.querySelectorAll('.content .btn,.content select,.content input,.modal .btn')){
     const r=e.getBoundingClientRect();
     if(r.width&&r.right>innerWidth+1&&!scrollContainer(e))issues.push(`Control is outside viewport: ${e.textContent.slice(0,50)||e.getAttribute('aria-label')}`);
    }
    // A label may wrap at spaces, but ordinary words must not break vertically.
    for(const e of document.querySelectorAll('.health-line>span,.quick-grid .btn>span')){
     for(const node of e.childNodes){if(node.nodeType!==Node.TEXT_NODE)continue;
      for(const word of node.textContent.matchAll(/\S+/g)){const range=document.createRange();range.setStart(node,word.index);range.setEnd(node,word.index+word[0].length);if(new Set([...range.getClientRects()].map(r=>Math.round(r.top))).size>1)issues.push(`Broken word: ${word[0]}`);}
     }
    }
    return issues;
   });
   failures.push(...[...errors,...problems].map(p=>`${width}px ${route}: ${p}`));
   assert.equal(await page.locator('.software-update-notice').count(),0,'No update banner above page content');
   if(process.env.LAYOUT_CHECK_PATHS==='1'){
    const path=page.getByRole('navigation',{name:'Page path',exact:true});
    if(route==='/')assert.equal(await path.count(),0,'Overview must have no page path');
    else{
     assert.equal(await path.count(),1,`${route}: exactly one shared page path`);
     const current=path.locator('[aria-current=page]');assert.equal(await current.count(),1,`${route}: one current section`);
     const requested=new URL(route,base).searchParams.get('tab');
     if(requested&&route.startsWith('/settings')){
      assert.ok((await path.innerText()).includes(requested),`${route}: selected Settings tab in path`);
      const titles={General:'General Settings',System:'System Settings',Security:'Security Settings',Connections:'Connections',Appearance:'Appearance Settings',About:'About i-Clusters'};
      assert.equal(await page.locator('.content h1').first().innerText(),titles[requested],`${route}: Settings title matches tab`);
     }
    }
   }
   if(process.env.LAYOUT_CHECK_COMPACT==='1'){
    const compact=await page.evaluate(()=>{
     const issues=[];
     if(location.pathname==='/'){
      if(document.body.textContent.includes('Alerts & Updates'))issues.push('Removed overview panel is still present');
      if(innerWidth>=1440){const cards=[...document.querySelectorAll('.overview-primary-row>.card')].map(e=>e.getBoundingClientRect());if(cards.length===2&&Math.abs(cards[0].top-cards[1].top)>2)issues.push('Primary widgets are not in the same row');const tiles=[...document.querySelectorAll('.overview-primary-row .resource-tile')].map(e=>e.getBoundingClientRect().top);if(new Set(tiles.map(Math.round)).size>1)issues.push('Resource metrics do not share a desktop row');}
     }
     if(location.pathname==='/docker'){
      if(document.querySelector('.docker-host-picker'))issues.push('Separate host picker panel is still present');
      const picker=document.querySelector('.docker-host-selector.compact'),header=picker?.closest('.page-header,.volume-header,.vm-toolbar');
      if(!header)issues.push('Host selector is outside the page heading');
      else if(innerWidth>=1440){const heading=header.querySelector('h1,h2'),a=heading?.getBoundingClientRect(),b=picker.getBoundingClientRect();if(a&&Math.min(a.bottom,b.bottom)<=Math.max(a.top,b.top))issues.push('Host selector wraps away from the desktop title');}
      if(new URLSearchParams(location.search).get('tab')==='Updates'&&!document.querySelector('.docker-updates .page-header .refresh-button'))issues.push('Update check button is outside the header');
     }
     return issues;
    });failures.push(...compact.map(p=>`${width}px ${route}: ${p}`));
   }
   if(process.env.LAYOUT_SCREENSHOTS){mkdirSync(process.env.LAYOUT_SCREENSHOTS,{recursive:true});await page.screenshot({path:`${process.env.LAYOUT_SCREENSHOTS}/${width}-${route.replace(/[^a-z0-9]/gi,'_')}.png`,fullPage:true});}

   if(checkRefresh){
    const buttons=page.locator('button.refresh-button:visible');
    for(let index=0;index<await buttons.count();index++){
     const button=buttons.nth(index),label=(await button.getAttribute('aria-label'))||await button.innerText();
     if(!/Refresh|Scan Disks|Recheck Connections|Check for Updates/i.test(label)||!await button.isEnabled())continue;
     const before=readCount;await button.click();
     assert.equal(await button.getAttribute('data-refreshing'),'true',`${route}: ${label} should show progress`);
     const glyph=button.locator('.lucide-refresh-cw,.lucide-refresh-ccw').first();
     assert.notEqual(await glyph.evaluate(e=>getComputedStyle(e).animationName),'none',`${route}: ${label} should spin`);
     await page.waitForFunction(()=>!document.querySelector('button.refresh-button[aria-busy="true"]'),{},{timeout:10000});
     assert.ok(readCount>before,`${route}: ${label} should request fresh data`);refreshControls++;
    }
   }

  }
  if(process.env.LAYOUT_UPDATE_NOTICE==='available'&&!process.env.LAYOUT_ROLE){
   await page.goto(base);await page.getByRole('button',{name:'Review software update',exact:true}).click();
   const review=page.getByRole('dialog',{name:'Software update',exact:true});await review.waitFor();assert.equal(updateWrites,0,'Opening review does not install');assert.match(await review.innerText(),/fixture-old-release/);assert.match(await review.innerText(),/Fix SSH popup layout/);
   if(process.env.LAYOUT_SCREENSHOTS)await review.screenshot({path:`${process.env.LAYOUT_SCREENSHOTS}/${width}-software-update-review.png`});
   await review.getByRole('button',{name:'Update Software',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.software-update-review .update-spinner'));assert.equal(updateWrites,1);assert.equal(await page.locator('.connection-notice').count(),0);assert.equal(await page.locator('.update-message').count(),0);
   assert.ok(await review.getByRole('status').first().isVisible());await review.getByRole('button',{name:'Close',exact:true}).click();
   await page.evaluate(()=>sessionStorage.removeItem('iclusters_update_started'));updateWrites=0;
  }
  if(process.env.LAYOUT_CHECK_PATHS==='1'){
   await page.goto(base+'settings?tab=General');
   await page.getByRole('navigation',{name:'Settings sections',exact:true}).getByRole('button',{name:'Security',exact:true}).click();
   await page.getByRole('heading',{name:'Security Settings',exact:true}).waitFor();
   assert.equal(await page.locator('.page-breadcrumbs [aria-current=page]').innerText(),'Security');
   await page.getByRole('navigation',{name:'Page path',exact:true}).getByRole('link',{name:'Settings',exact:true}).click();
   await page.getByRole('heading',{name:'General Settings',exact:true}).waitFor();
   await page.goto(base+'docker?tab=Volumes');
   await page.locator('.page-breadcrumbs').waitFor();
   await page.evaluate(()=>{localStorage.setItem('iclusters_docker_host','docker-fixture');window.dispatchEvent(new Event('iclusters-connection'));});
   await page.waitForFunction(()=>document.querySelector('.page-breadcrumbs')?.textContent.includes('control-vm'));
   assert.equal(await page.locator('.page-breadcrumbs [aria-current=page]').innerText(),'Volumes');
  }
  if(process.env.LAYOUT_STORAGE_CLEANUP){
   await page.goto(base+'storage');await page.getByRole('link',{name:'Connect TrueNAS',exact:true}).waitFor();assert.equal(await page.locator('.storage-scope-note').count(),0);assert.equal(await page.getByRole('button',{name:'media-storage',exact:true}).count(),0);assert.ok(await page.getByRole('button',{name:'local',exact:true}).isVisible());await page.getByRole('link',{name:'Connect TrueNAS',exact:true}).click();const config=page.getByRole('dialog',{name:'Configure TrueNAS',exact:true});await config.waitFor();assert.ok(await config.getByLabel('HTTPS endpoint',{exact:true}).isVisible());await config.getByRole('button',{name:copy('Close dialog'),exact:true}).click();
   await page.goto(base+'docker');const picker=page.getByLabel('Docker host for resource views',{exact:true});await picker.waitFor();assert.equal(await picker.locator('option[value="docker-fixture"]').innerText(),'control-vm');
  }
  if(process.env.LAYOUT_GUEST_RESTART){
   restartPower='running';restartVerified=false;restartPolls=0;restartWrites=[];
   await page.goto(base+'settings?tab=Connections&section=setup');await page.getByRole('button',{name:'Set Up Guest Agent',exact:true}).click();
   const setup=page.getByRole('dialog',{name:'Set Up QEMU Guest Agent · Control-VM',exact:true});await setup.getByLabel('VM SSH address',{exact:true}).fill('192.0.2.100');await setup.getByLabel(copy('SSH / sudo password'),{exact:true}).fill('fixture-only');await setup.getByRole('button',{name:'Install / Start & Verify',exact:true}).click();
   const restart=page.getByRole('dialog',{name:'Restart VM · Control-VM',exact:true});await restart.waitFor();assert.deepEqual(restartWrites,[],'Installing must not restart without explicit consent');assert.equal(await restart.evaluate(e=>e.closest('.modal-backdrop').parentElement===document.body),true);
   if(process.env.LAYOUT_SCREENSHOTS)await restart.screenshot({path:`${process.env.LAYOUT_SCREENSHOTS}/${width}-guest-restart.png`});await restart.getByRole('button',{name:'Shutdown, Start & Verify',exact:true}).click();assert.equal(await restart.getByRole('button',{name:copy('Close dialog'),exact:true}).isDisabled(),true);
   const approval=page.getByRole('dialog',{name:'Authenticate node:node01',exact:true});await approval.waitFor();await approval.getByLabel('Password',{exact:true}).fill('fixture-only');
   assert.ok(await approval.evaluate(e=>e.contains(document.activeElement)),'Nested SSH approval owns keyboard focus');assert.ok(Number(await approval.evaluate(e=>e.closest('.modal-backdrop').style.zIndex))>Number(await restart.evaluate(e=>e.closest('.modal-backdrop').style.zIndex)),'SSH approval is above restart popup');
   assert.equal(await restart.getByRole('button',{name:'Shutdown, Start & Verify',exact:true}).evaluate(e=>getComputedStyle(e,'::before').animationName),'update-rotate');await approval.getByRole('button',{name:'Confirm',exact:true}).click();await restart.getByText('Starting the guest…',{exact:false}).waitFor();await restart.getByText('The VM is running and QEMU Guest Agent has responded.').waitFor();await restart.waitFor({state:'detached'});assert.deepEqual(restartWrites,['reboot']);await page.locator('.connection-success').waitFor();
  }
  if(process.env.LAYOUT_CONNECTION_CHOICES){
   const openPicker=async()=>{
    await page.goto(base+'settings?tab=Connections');
    await page.getByRole('button',{name:copy('Add Connection'),exact:true}).first().click();
    return page.getByRole('dialog',{name:copy('Add a connection'),exact:true});
   };
   const chooseCard=async title=>{
    const picker=await openPicker();
    await picker.locator('.connection-catalog button').filter({has:page.getByText(copy(title),{exact:true})}).click();
   };
   const picker=await openPicker();
   await picker.waitFor();
   assert.equal(await picker.locator('.connection-catalog button').count(),3);
   await chooseCard('Docker host');
   const advanced=page.locator('.connection-setup-flow details').filter({hasText:'Direct Docker API'});
   assert.equal(await advanced.evaluate(element=>element.open),false);
   await advanced.locator('summary').click();
   await advanced.getByRole('button',{name:copy('Direct Docker API'),exact:true}).click();
   await page.getByLabel('Docker HTTPS endpoint',{exact:true}).waitFor();
   await page.getByRole('dialog',{name:copy('Docker Connection'),exact:true}).getByRole('button',{name:copy('Back to Docker setup'),exact:true}).click();
   await page.getByLabel('Docker host',{exact:true}).waitFor();
   await chooseCard('TrueNAS');
   await page.getByLabel('HTTPS endpoint',{exact:false}).waitFor();
   await page.goto(base+'settings?tab=Integrations');
   await page.getByRole('heading',{name:copy('Notification Channels'),exact:true}).waitFor();
   assert.equal(await page.locator('.notification-settings-channel').count(),9);
   await chooseCard('Proxmox');
   const guide=page.locator('.cluster-setup-guide');await guide.waitFor();assert.equal(await guide.getAttribute('open'),null);assert.equal(await guide.locator('summary svg').count(),1);assert.equal(await guide.evaluate(e=>getComputedStyle(e).paddingLeft),'16px');assert.equal(await guide.locator('summary').evaluate(e=>getComputedStyle(e).color),'rgb(245, 180, 75)');await guide.locator('summary').click();assert.notEqual(await guide.getAttribute('open'),null);await guide.locator('summary').click();assert.equal(await guide.getAttribute('open'),null);if(process.env.LAYOUT_SCREENSHOTS)await page.locator('.modal').last().screenshot({path:`${process.env.LAYOUT_SCREENSHOTS}/${width}-proxmox-guide.png`});
   for(const [setup,label,host] of [['docker','Docker host','node01:qemu/100'],['proxmox-node','Proxmox node','node:node01']]){
    if(setup==='docker')await chooseCard('Docker host');else await page.goto(base+'settings?tab=Connections&setup=proxmox-node');await page.getByLabel(label,{exact:true}).selectOption(host);assert.equal(await page.getByRole('button',{name:'Generate Pairing Code',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Prepare Manual Installer',exact:true}).count(),0);const parent=page.getByLabel(label,{exact:true}).locator('xpath=ancestor::div[@role="dialog"][1]'),height=await parent.evaluate(e=>e.getBoundingClientRect().height);await page.getByRole('button',{name:'Connect Automatically with SSH',exact:true}).click();const ssh=page.getByRole('dialog',{name:setup==='docker'?'Connect Docker host with SSH':'Connect Proxmox node with SSH',exact:true});await ssh.waitFor();assert.ok(await ssh.locator('.automatic-node-pairing').isVisible());assert.equal(await parent.locator('.automatic-node-pairing').count(),0,'SSH must not extend the host-selection page');assert.equal(await ssh.evaluate(e=>e.closest('.modal-backdrop').parentElement===document.body),true);assert.ok(Math.abs(await parent.evaluate(e=>e.getBoundingClientRect().height)-height)<2);
    const identity=ssh.getByText('SSH host key checked automatically.',{exact:true});
    const install=ssh.getByRole('button',{name:'Install, Pair & Verify Automatically',exact:true});
    const consent=ssh.getByRole('checkbox',{name:'Approve automatic node pairing',exact:true});
    await identity.waitFor();
    await ssh.getByLabel(copy('SSH / sudo password'),{exact:true}).fill('fixture-only');
    assert.ok(await install.isDisabled(),'A password alone cannot authorize installation');
    await consent.check();
    assert.ok(await install.isEnabled(),'A verified target, credentials and consent enable installation');
    await page.keyboard.press('Escape');await ssh.waitFor({state:'detached'});assert.ok(await parent.isVisible());assert.equal(await page.getByLabel(label,{exact:true}).inputValue(),host);await page.waitForFunction(()=>document.activeElement?.textContent==='Connect Automatically with SSH');assert.equal(await page.getByRole('button',{name:'Connect Automatically with SSH',exact:true}).evaluate(e=>e===document.activeElement),true);await page.getByRole('button',{name:'Connect Automatically with SSH',exact:true}).click();await ssh.waitFor();assert.equal(await ssh.getByLabel(copy('SSH / sudo password'),{exact:true}).inputValue(),'');await identity.waitFor();assert.equal(await consent.isChecked(),false);assert.ok(await install.isDisabled());if(process.env.LAYOUT_SCREENSHOTS)await ssh.screenshot({path:`${process.env.LAYOUT_SCREENSHOTS}/${width}-${setup}-ssh-popup.png`});await ssh.getByRole('button',{name:copy('Close dialog'),exact:true}).click();await ssh.waitFor({state:'detached'});
   }
   await page.goto(base+'settings?tab=Integrations');await page.getByRole('button',{name:'Configure AI Assistant',exact:true}).click();await page.getByLabel('AI provider',{exact:true}).waitFor();const beforeModels=aiModelReads,beforeTests=aiTests,beforeSaves=aiSaves;
   for(const id of Object.keys(aiMetadata)){
    await page.getByLabel('AI provider',{exact:true}).selectOption(id);assert.equal(await page.getByLabel('API key',{exact:true}).inputValue(),'');assert.equal(await page.getByLabel('API type',{exact:true}).inputValue(),aiMetadata[id].types[0]);assert.equal(await page.getByLabel('Model',{exact:true}).inputValue(),aiMetadata[id].defaultModel);assert.ok(await page.getByLabel('Model',{exact:true}).locator('option').count()>=3,'Provider has multiple model choices and a custom option');if(process.env.LAYOUT_SCREENSHOTS&&id==='anthropic')await page.locator('.modal').last().screenshot({path:`${process.env.LAYOUT_SCREENSHOTS}/${width}-ai-claude.png`});await page.getByLabel('API key',{exact:true}).fill('fixture-'+id);await page.getByRole('button',{name:'Load Models',exact:true}).click();await page.getByRole('option',{name:id+'-fixture-model',exact:true}).waitFor({state:'attached'});await page.getByLabel('Model',{exact:true}).selectOption(id+'-fixture-model');await page.getByRole('button',{name:'Test Connection',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.configuration-feedback')?.textContent.includes('Connection test successful')).catch(async()=>{throw Error(id+': '+await page.locator('.configuration-dialog').innerText())});
   }
   assert.equal(aiModelReads,beforeModels+6);assert.equal(aiTests,beforeTests+6);assert.equal(aiSaves,beforeSaves);await page.getByRole('button',{name:'Save Configuration',exact:true}).click();await page.locator('.connection-success').waitFor();assert.equal(aiSaves,beforeSaves+1);await page.goto(base+'settings?tab=Connections&setup=ai');await page.getByLabel('AI provider',{exact:true}).waitFor();assert.equal(await page.getByLabel('AI provider',{exact:true}).inputValue(),'mistral');assert.equal(await page.getByLabel('Model',{exact:true}).inputValue(),'mistral-fixture-model');assert.equal(await page.getByLabel('API type',{exact:true}).inputValue(),'chat-completions');assert.equal(await page.getByLabel('API key',{exact:true}).inputValue(),'');
  }
  if(process.env.LAYOUT_PROXMOX_SAVE){
   const beforeSaves=clusterSaves,beforeTests=clusterTests;
   await page.goto(base+'settings?tab=Connections&setup=proxmox');const form=page.locator('.cluster-form');await form.waitFor();
   assert.equal(await form.locator('select').count(),0,'Removed access selector must be absent');
   const guide=form.locator('details.cluster-setup-guide');assert.equal(await guide.count(),1);assert.equal(await guide.getAttribute('open'),null);await guide.locator('summary').click();assert.notEqual(await guide.getAttribute('open'),null);await guide.locator('summary').click();assert.equal(await guide.getAttribute('open'),null);
   for(const [name,value] of Object.entries({name:'Fixture Lab',host:'pve.test',port:'8006',tokenId:'iclusters@pve!hub',tokenSecret:'fixture-only'}))await form.locator(`[name=${name}]`).fill(value);
   await form.getByRole('button',{name:'Test Connection',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('.cluster-form')?.textContent.includes('Connection verified'));
   assert.equal(clusterSaves,beforeSaves);assert.equal(clusterTests,beforeTests+1);
   await form.getByRole('button',{name:'Save',exact:true}).click();await page.locator('.connection-success').waitFor();
   assert.match(await page.locator('.connection-success').innerText(),/power and configuration access verified/);
   assert.equal(clusterSaves,beforeSaves+1);assert.equal(await page.getByLabel('Proxmox administrator password',{exact:true}).count(),0);
   await page.waitForFunction(()=>!document.querySelector('.cluster-form'));
  }
  if(process.env.LAYOUT_CHECK_ICON_INTERACTIONS==='1'){
   await page.goto(base+'tools/shell');await page.locator('.nav-toggle').waitFor();await page.waitForTimeout(200);
   const clear=value=>value==='rgba(0, 0, 0, 0)'||value==='transparent';
   for(const selector of ['.nav-toggle','.notification-bell','.shell-saved']){
    const control=page.locator(selector).first();if(!await control.count())throw Error('Missing representative icon control: '+selector);
    await page.mouse.move(0,0);await control.evaluate(element=>element.blur());await page.waitForTimeout(220);
    const before=await control.boundingBox();assert.ok(clear(await control.evaluate(element=>getComputedStyle(element).backgroundColor)),selector+': transparent at rest');
    await control.hover();await page.waitForTimeout(220);assert.ok(!clear(await control.evaluate(element=>getComputedStyle(element).backgroundColor)),selector+': hover highlight is visible');
    const after=await control.boundingBox();assert.equal(after.width,before.width,selector+': hover keeps width');assert.equal(after.height,before.height,selector+': hover keeps height');
    await page.mouse.move(0,0);await page.keyboard.press('Tab');await control.focus();await page.waitForTimeout(220);
    assert.equal(await control.evaluate(element=>getComputedStyle(element).outlineStyle),'solid',selector+': keyboard focus remains visible');
    assert.ok(!clear(await control.evaluate(element=>getComputedStyle(element).backgroundColor)),selector+': keyboard focus has a highlight');
    await control.evaluate(element=>{element.blur();element.disabled=true});await control.hover({force:true});await page.waitForTimeout(220);
    assert.ok(clear(await control.evaluate(element=>getComputedStyle(element).backgroundColor)),selector+': disabled controls do not acquire a hover background');
    await control.evaluate(element=>element.disabled=false);await page.mouse.move(0,0);
   }
   assert.ok(!clear(await page.locator('.notification-bell-count').evaluate(element=>getComputedStyle(element).backgroundColor)),'Notification badge remains visible');
   for(const selector of ['.shell-host-icon','.shell-host-icon.node','.shell-host-icon.ct']){
    const icon=page.locator(selector).first();if(await icon.count())assert.ok(clear(await icon.evaluate(element=>getComputedStyle(element).backgroundColor)),selector+': no decorative background');
   }
   assert.ok(await page.locator('.shell-host').first().evaluate(element=>{const style=getComputedStyle(element);return style.backgroundImage!=='none'||style.backgroundColor!=='rgba(0, 0, 0, 0)'}),'Resource cards retain their surface');
   if(process.env.LAYOUT_SCREENSHOTS){mkdirSync(process.env.LAYOUT_SCREENSHOTS,{recursive:true});await page.screenshot({path:`${process.env.LAYOUT_SCREENSHOTS}/${width}-transparent-shell.png`,fullPage:true});await page.locator('.nav-toggle').hover();await page.screenshot({path:`${process.env.LAYOUT_SCREENSHOTS}/${width}-icon-hover.png`});}
  }
  if(process.env.LAYOUT_CHECK_MOTION==='1'){
   await page.goto(base);await page.locator('#header-language').waitFor();
   for(const reduced of [false,true]){
    await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});await page.locator('#header-language').click();const options=page.locator('#header-language-options');await options.waitFor();await page.waitForFunction(e=>Number(getComputedStyle(e).opacity)===1&&getComputedStyle(e).transform==='none',await options.elementHandle());await page.keyboard.press('Escape');assert.equal(await options.count(),0);
    await page.getByRole('button',{name:copy('Add Widget')}).click();const modal=page.getByRole('dialog');await modal.waitFor();await page.waitForFunction(e=>Number(getComputedStyle(e).opacity)===1&&getComputedStyle(e).transform==='none',await modal.elementHandle());await page.keyboard.press('Escape');await modal.waitFor({state:'detached'});
   }
   await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('#header-language').click();await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(e=>Number(getComputedStyle(e).opacity)===1&&getComputedStyle(e).transform==='none',await page.locator('#header-language-options').elementHandle());await page.keyboard.press('Escape');await page.emulateMedia({reducedMotion:'no-preference'});
  }
  if(process.env.LAYOUT_STORAGE_POPUPS){
   await page.goto(base+'storage');await page.locator('.storage-pool-table tbody tr').nth(1).waitFor();assert.equal(await page.locator('.storage-overview-grid aside,.storage-inline-inspect,.storage-distribution').count(),0);
   const selectWithoutPopup=async row=>{
    assert.equal(await row.getAttribute('data-row-action'),'select');
    for(const cell of await row.locator('td:not(:last-child)').all()){await cell.click();assert.equal(await page.getByRole('dialog').count(),0,'Selecting content must not inspect');assert.equal(await row.getAttribute('aria-selected'),'true')}
    await row.focus();for(const key of ['Enter','Space']){await page.keyboard.press(key);assert.equal(await page.getByRole('dialog').count(),0,'Keyboard selection must not inspect')}
   };
   await selectWithoutPopup(page.locator('.storage-pool-table tbody tr').first());await selectWithoutPopup(page.locator('.storage-pool-table tbody tr').nth(1));assert.equal(await page.locator('.storage-pool-table tbody tr[aria-selected=true]').count(),1);
   await page.locator('.storage-top').first().click();assert.equal(await page.getByRole('dialog').count(),0,'Usage selections do not open inspection');
   const poolEye=page.locator('.storage-pool-table tbody tr').nth(1).locator('.table-action').first();await poolEye.click();let popup=page.getByRole('dialog',{name:copy('Inspect Pool'),exact:true});await popup.waitFor();assert.ok(await popup.locator('.storage-distribution').isVisible());assert.ok((await popup.locator('.storage-inspected-pool').innerText()).includes('node02'));assert.equal(await popup.locator('.distribution-summary-legend button').count(),2);
   const inViewport=async locator=>{const box=await locator.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1,'Storage popup stays inside viewport');assert.equal(await locator.evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,'Storage popup content does not overflow')};await inViewport(popup);
   if(process.env.LAYOUT_SCREENSHOTS)await popup.screenshot({path:`${process.env.LAYOUT_SCREENSHOTS}/${width}-pool-popup.png`});await page.keyboard.press('Escape');await popup.waitFor({state:'detached'});assert.equal(await poolEye.evaluate(e=>e===document.activeElement),true);
   await page.goto(base+'storage?tab=Disks');await page.locator('.disk-layout tbody tr').nth(1).waitFor();assert.equal(await page.locator('.disk-detail-card').count(),0);await selectWithoutPopup(page.locator('.disk-layout tbody tr').nth(1));await page.locator('.disk-capacity-list button').last().click();assert.equal(await page.getByRole('dialog').count(),0,'Capacity selections do not inspect');const diskEye=page.locator('.disk-layout tbody tr').nth(1).locator('.table-action');await diskEye.click();popup=page.getByRole('dialog',{name:copy('Disk Details'),exact:true});await popup.waitFor();assert.ok((await popup.innerText()).includes('serial-node02'));assert.ok(!(await popup.innerText()).includes('serial-node01'));await inViewport(popup);
   await popup.getByRole('button',{name:copy('Refresh S.M.A.R.T.'),exact:true}).click();await page.locator('.disk-smart pre').waitFor();await popup.getByRole('button',{name:copy('View Details'),exact:true}).click();const report=page.getByRole('dialog',{name:copy('Disk Report'),exact:true});await report.waitFor();assert.ok((await report.locator('pre').innerText()).includes('serial-node02'));await page.keyboard.press('Escape');await report.waitFor({state:'detached'});assert.ok(await popup.isVisible());
   if(process.env.LAYOUT_SCREENSHOTS)await popup.screenshot({path:`${process.env.LAYOUT_SCREENSHOTS}/${width}-disk-popup.png`});await page.keyboard.press('Escape');await popup.waitFor({state:'detached'});assert.equal(await diskEye.evaluate(e=>e===document.activeElement),true);
   await page.goto(base+'storage?tab='+encodeURIComponent('Datasets / Volumes'));await page.locator('.dataset-layout tbody tr').nth(1).waitFor();
   for(const resource of popupVolumes){
    const row=page.locator('.dataset-layout tbody tr').filter({hasText:resource.name});await row.locator('button').filter({hasText:copy('Edit')}).click();popup=page.getByRole('dialog',{name:copy('Edit Dataset / Volume'),exact:true});await popup.locator('.storage-resource-edit').waitFor();await inViewport(popup);
    const actions=popup.locator('.storage-edit-actions'),cancel=actions.getByRole('button',{name:copy('Cancel'),exact:true}),save=actions.getByRole('button',{name:copy('Save Changes'),exact:true}),a=await cancel.boundingBox(),b=await save.boundingBox(),form=await popup.locator('form').boundingBox();assert.ok(Math.abs(a.y-b.y)<2,'Cancel and Save share one row');assert.ok(a.height>=40&&a.height<=64&&b.height>=40&&b.height<=64,'Edit buttons have normal touch target heights');assert.ok(a.x>=form.x&&b.x+b.width<=form.x+form.width+1);assert.equal(await actions.evaluate(e=>getComputedStyle(e).gridColumn),'1 / -1','Edit actions span both form columns');
    if(process.env.LAYOUT_SCREENSHOTS&&resource.provider==='proxmox')await popup.screenshot({path:`${process.env.LAYOUT_SCREENSHOTS}/${width}-dataset-actions.png`});await cancel.click();await popup.waitFor({state:'detached'});
   }
  }
  if(process.env.LAYOUT_CHECK_HEADER_LANGUAGE==='1'){
   await page.goto(base);await page.locator('#header-language').waitFor();
   const trigger=page.locator('#header-language'),profile=page.locator('.profile-trigger'),bell=page.locator('.notification-bell');
   const controls=await Promise.all([bell,trigger,profile].map(control=>control.boundingBox()));assert.ok(controls[0].x<controls[1].x&&controls[1].x<controls[2].x,'Header order is alerts, language code, profile');
   for(const control of [trigger,profile]){await page.mouse.move(0,0);await control.evaluate(e=>e.blur());assert.equal(await control.evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');assert.ok((await control.boundingBox()).width>=40)}
   await trigger.click();await page.keyboard.press('End');assert.equal(await page.locator('#header-language-options [data-locale="pt-PT"]').evaluate(e=>e===document.activeElement),true);await page.keyboard.press('Escape');assert.equal(await trigger.evaluate(e=>e===document.activeElement),true);
   for(const [locale,code,,title] of languageChoices){
    await trigger.click();const menu=page.locator('#header-language-options');assert.equal(await menu.locator('[role=option]').count(),6);assert.equal(await menu.locator('img').count(),0);const box=await menu.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width,'Language dropdown stays in the viewport: '+JSON.stringify({width,box,style:await menu.evaluate(e=>({width:getComputedStyle(e).width,minWidth:getComputedStyle(e).minWidth,position:getComputedStyle(e).position,right:getComputedStyle(e).right,padding:getComputedStyle(e).padding}))}));
    if(process.env.LAYOUT_SCREENSHOTS&&locale==='fr-FR')await page.screenshot({path:`${process.env.LAYOUT_SCREENSHOTS}/${width}-header-language-menu.png`});
    await menu.locator(`[data-locale="${locale}"]`).click();await page.getByRole('heading',{name:title,exact:true}).waitFor();assert.equal(await trigger.innerText(),code);assert.equal(await page.evaluate(()=>localStorage.getItem('iclusters_language')),locale);assert.equal(await page.evaluate(()=>localStorage.getItem('iclusters_access_token')),'layout-fixture');assert.equal(await trigger.evaluate(e=>e===document.activeElement),true);
    await page.reload();await page.getByRole('heading',{name:title,exact:true}).waitFor();assert.equal(await trigger.innerText(),code);
   }
   await trigger.click();await bell.click();assert.equal(await page.locator('#header-language-options').count(),0);const notifications=page.locator('#header-notification-panel');await notifications.waitFor();const notificationBox=await notifications.boundingBox();assert.ok(notificationBox.x>=0&&notificationBox.x+notificationBox.width<=width,'Alerts remain within the viewport');await page.keyboard.press('Escape');
   await profile.click();assert.equal(await page.locator('.profile-dropdown-identity b').innerText(),'Layout Review');assert.equal(await page.locator('.profile-dropdown-identity small').innerText(),process.env.LAYOUT_ROLE||'owner');assert.ok(await page.locator('.profile-dropdown [role=menuitem]').isVisible());await page.keyboard.press('Escape');assert.equal(await profile.evaluate(e=>e===document.activeElement),true);
   await page.goto(base+'settings?tab=Appearance');await page.locator('#interface-language').waitFor();const search=page.locator('.settings-page input[type=search],.settings-search input').first();await search.fill('language');const saved=await search.elementHandle();await trigger.click();await page.locator('#header-language-options [data-locale="fr-FR"]').click();await page.waitForFunction(()=>document.documentElement.lang==='fr-FR');assert.equal(await page.locator('#interface-language').innerText(),'Français');assert.equal(await search.inputValue(),'language');assert.equal(await saved.evaluate(e=>e===document.querySelector('.settings-page input[type=search],.settings-search input')),true);
   await page.locator('#interface-language').click();await page.locator('#interface-language-options [data-locale="de-DE"]').click();await page.waitForFunction(()=>document.documentElement.lang==='de-DE');assert.equal(await trigger.innerText(),'DE');await trigger.click();await page.locator(`#header-language-options [data-locale="${auditLocale}"]`).click();await page.waitForFunction(locale=>document.documentElement.lang===locale,auditLocale);
   if(process.env.LAYOUT_SCREENSHOTS){await page.goto(base);await trigger.waitFor();await page.screenshot({path:`${process.env.LAYOUT_SCREENSHOTS}/${width}-header-controls.png`})}
  }
  if(process.env.LAYOUT_CHECK_LANGUAGES==='1'){
   for(const [locale,code,name,title] of languageChoices){
    await page.goto(base+'settings?tab=Appearance');await page.locator('#interface-language').waitFor();const search=page.locator('.settings-page input[type=search],.settings-search input').first();await search.fill('language');const saved=await search.elementHandle();await page.locator('#interface-language').click();const options=page.locator('.language-options [role=option]');assert.equal(await options.count(),6);assert.equal(await options.locator('img').count(),0);await page.locator(`[data-locale="${locale}"]`).click();await page.waitForFunction(locale=>document.documentElement.lang===locale,locale);assert.equal(await saved.evaluate(element=>element===document.querySelector('.settings-page input[type=search],.settings-search input')) ,true,'Language switching retains the form element');assert.equal(await search.inputValue(),'language');assert.equal(await page.locator('#interface-language').innerText(),name);assert.equal(await page.evaluate(()=>localStorage.getItem('iclusters_access_token')),'layout-fixture');assert.equal(await page.evaluate(()=>document.documentElement.dir),'ltr');
    await page.goto(base);await page.getByRole('heading',{name:title,exact:true}).waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('iclusters_language')),locale);
    if(locale==='fr-FR'){
     assert.deepEqual(await page.locator('.overview-controls select').nth(1).locator('option').allTextContents(),['Dernière heure','6 dernières heures','24 dernières heures']);
     await page.locator('.profile-menu > button').click();
     await page.getByRole('menuitem',{name:'Se déconnecter',exact:true}).waitFor();
     await page.keyboard.press('Escape');
    }
    await page.goto(base+'settings');const feedback=page.locator('.feedback-trigger');await feedback.click();const dialog=page.getByRole('dialog');const words=locale.startsWith('en')?{}:JSON.parse(readFileSync(new URL('../src/i18n/packs/'+code.toLowerCase()+'.json',import.meta.url),'utf8'));await dialog.getByRole('heading',{name:words['Feedback & Usage']||'Feedback & Usage',exact:true}).waitFor();await dialog.getByLabel(words['Reply email (optional)']||'Reply email (optional)').waitFor();await page.keyboard.press('Escape');
   }
   await page.goto(base+'settings?tab=Appearance');await page.locator('#interface-language').click();await page.keyboard.press('End');assert.equal(await page.locator('[data-locale="pt-PT"]').evaluate(element=>element===document.activeElement),true);await page.keyboard.press('Escape');assert.equal(await page.locator('#interface-language').evaluate(element=>element===document.activeElement),true);
   await page.evaluate(()=>{sessionStorage.setItem('language-login-audit','1');localStorage.setItem('iclusters_language','fr-FR');localStorage.removeItem('iclusters_access_token')});await page.goto(base);await page.getByRole('heading',{name:'Connectez-vous à votre compte',exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.dir),'ltr');await page.evaluate(locale=>{sessionStorage.removeItem('language-login-audit');localStorage.setItem('iclusters_language',locale)},auditLocale);
  }
  await page.goto(base);await page.getByRole('button',{name:copy('Add Widget')}).click();
  await page.getByRole('dialog').waitFor();
  assert.ok(await page.getByRole('button',{name:copy('Close dialog'),exact:true}).isVisible());
  await page.getByRole('button',{name:copy('Close dialog'),exact:true}).click();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('iclusters-ssh-approval',{detail:{target:'docker:11111111-1111-4111-8111-111111111111',path:'/docker/updates/image/install',dockerHost:'11111111-1111-4111-8111-111111111111:node',method:'POST',body:{},resolve(){},reject(){}}})));
  await page.getByLabel(copy('SSH username'),{exact:true}).waitFor();
  assert.ok(await page.getByLabel(copy('SSH / sudo password'),{exact:true}).isVisible());
  await page.getByRole('button',{name:copy('Close dialog'),exact:true}).click();
 }
 console.log(`Reviewed ${selectedRoutes.length*widths.length} page/section layouts and ${widths.length*2} dialogs.`);
 assert.deepEqual(failures,[]);
 console.log('No page overflow, escaped controls, broken dashboard words or runtime errors.');if(checkRefresh)console.log(`Verified ${refreshControls} refresh controls request data and visibly rotate.`);
}finally{await browser?.close();if(server.close)await server.close();else await new Promise(resolve=>server.httpServer.close(resolve));}
