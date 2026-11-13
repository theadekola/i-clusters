// Optional end-to-end audit. Called only by the disposable PostgreSQL/HTTPS
// integration fixture; no live controller URL or production credential is used.
import assert from 'node:assert/strict';
import {createHash,X509Certificate} from 'node:crypto';
import {cp,mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import {observedButtons,recordedKey,sweepClusterButtons} from './cluster-control-sweep.mjs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {preview} from 'vite';

const sections={
 '/':[''],
 '/proxmox':['Overview','Nodes','Virtual Machines','LXC Containers','Storage','Networks','Tasks & Logs'],
 '/docker':['Containers','Images','Volumes','Compose Stacks','Events','Updates'],
 '/storage':['Storage Pools','Configuration','Disks','Datasets / Volumes','Snapshots','Shares','Performance'],
 '/network':['Network Map','Interfaces','Devices','Routing','DNS','Traffic Analysis','Docker Networks'],
 '/backups':['Backup Jobs','Backup Archives','Restore Points','Schedules','Retention Policies','Destinations','Reports'],
 '/monitoring':['','Provider Jobs','Hardware & Diagnostics'],
 '/alerts':['Active Alerts','Alert History','Alert Rules'],
 '/ai':[''],'/tools/shell':[''],'/tools/sftp':[''],'/users':['','Audit Logs'],
 '/settings':['General','System','Security','Connections','Integrations','Appearance','About']
};
const markers=['VM','CT','pool','engine','container','job','volume','tank','disk','drive','share','membership','rule','controller'];
const controllerPaths=new Set(['auth','account','users','product','updates','cluster-profiles','health']);

export async function auditClusterReports({base,owner,profile,tls}){
 const browserTools=process.env.ICLUSTERS_BROWSER_TOOLS;
 const {chromium}=await import(browserTools?pathToFileURL(path.join(browserTools,'playwright-core/index.mjs')).href:'playwright');
 const executablePath=process.env.CHROMIUM_EXECUTABLE||(browserTools?await(await import(pathToFileURL(path.join(browserTools,'@sparticuz/chromium/build/index.js')).href)).default.executablePath():undefined);
 const root=fileURLToPath(new URL('../',import.meta.url));
 const assets=await mkdtemp(path.join(os.tmpdir(),'iclusters-audit-web-'));
 let browser,server;
 try{
  await cp(path.join(root,'dist'),assets,{recursive:true});
  server=await preview({root,build:{outDir:assets},preview:{host:'127.0.0.1',port:0,https:tls,proxy:{'/api':{target:base,changeOrigin:true}}}});
  // Trust this run's disposable preview key for parallel CSS and module requests.
  const previewKey=new X509Certificate(tls.cert).publicKey.export({type:'spki',format:'der'});
  const previewFingerprint=createHash('sha256').update(previewKey).digest('base64');
  browser=await chromium.launch({headless:true,executablePath,args:['--ignore-certificate-errors-spki-list='+previewFingerprint,'--no-sandbox','--disable-dev-shm-usage',...(browserTools?['--no-zygote','--single-process']:[])]});
  const origin=new URL(server.resolvedUrls.local[0]).origin;
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1366,height:900}});
  await context.addInitScript(token=>{
    sessionStorage.setItem('iclusters_access_token',token);
    sessionStorage.setItem('iclusters_last_activity',String(Date.now()));
  },owner);
  let burst=0,windowStart=Date.now();
  const snapshots=new Map(),views=[],requestScopes=new WeakMap();
  const skippedRefresh=[],violations=[],errors=new Map(),calls=new Set(),controls=new Set(),requests=new Set();
  let visits=0,refreshes=0,links=0,tabs=0,detailClicks=0;
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin!==origin)return route.abort();
   if(!url.pathname.startsWith('/api/'))return route.continue();
   const documentPath=new URL(request.frame().url()).pathname,secondary=documentPath.startsWith('/clusters/'+profile+'/');
   burst++;
   requestScopes.set(request,secondary?'Office':'Home');
   const prefix='/api/cluster-profiles/'+profile+'/api/';
   const scoped=url.pathname.startsWith(prefix),local=url.pathname.slice(scoped?prefix.length:'/api/'.length);
   const global=controllerPaths.has(local.split('/')[0]);
   if(scoped!==(secondary&&!global))violations.push({documentPath,path:url.pathname});
   calls.add((secondary?'Office':'Home')+' '+request.method()+' /'+local);
   if(!['GET','HEAD'].includes(request.method())&&local!=='product/visit'){
    violations.push({unexpectedWrite:request.method()+' '+local});return route.abort();
   }
   await route.continue();
  });
  const page=await context.newPage();
  page.on('pageerror',e=>violations.push({page:page.url(),error:e.message}));
  page.on('requestfinished',async request=>{
   const response=await request.response();if(!response)return;
   const pathname=new URL(response.url()).pathname;
   if(!pathname.startsWith('/api/'))return;
   const scope=requestScopes.get(response.request());
   if(response.status()>=400){const key=scope+' '+response.status()+' '+pathname.replace('/cluster-profiles/'+profile+'/api','');errors.set(key,(errors.get(key)||0)+1)}
   if(!response.headers()['content-type']?.includes('application/json'))return;
   const work=response.text().then(body=>{
    if(process.env.ICLUSTERS_AUDIT_CONTROLS==='1'&&response.request().method()==='GET'){
     const key=recordedKey(response.request());
     if(!snapshots.has(key)||response.status()===200&&JSON.parse(body)?.refreshing!==true)snapshots.set(key,{body,status:response.status(),contentType:'application/json'});
    }
    if(response.status()!==200||controllerPaths.has(pathname.slice(5).split('/')[0])&&!pathname.includes('/'+profile+'/api/'))return;
    const foreign=scope==='Home'?'Office':'Home';
    if(markers.some(label=>body.includes(foreign+'-'+label)))violations.push({foreignPayload:pathname,scope});
   }).catch(()=>{}).finally(()=>requests.delete(work));
   requests.add(work);
  });
  async function pace(){
   if(burst>300&&Date.now()-windowStart<60000)await page.waitForTimeout(61000-(Date.now()-windowStart));
   if(Date.now()-windowStart>=60000){windowStart=Date.now();burst=0}
  }
  async function inspect(pathname,expected='',detail=null){
   await page.locator('main.content h1,main.content h2,main.content h3,main.content .tabs,main.content .shell-page button').filter({visible:true}).first().waitFor({timeout:10000}).catch(async e=>{throw Error(pathname+' at '+page.url()+' failed to render: '+(await page.locator('body').innerText()).slice(0,350)+' '+JSON.stringify([...errors])+': '+e.name)});
   const main=page.locator('main.content');
   if(expected)await main.getByText(expected,{exact:false}).filter({visible:true}).first().waitFor({timeout:8000}).catch(e=>{throw Error(pathname+' expected '+expected+': '+e.message)});
   await page.waitForLoadState('networkidle',{timeout:6000}).catch(()=>{});
   assert.equal(await main.getByRole('button',{name:/^export(?:\s|$)/i}).count(),0,pathname+': export action');
   const text=await main.innerText();
   assert.ok(!text.includes('This page could not load'),pathname+': page error boundary');
   const foreign=page.url().includes('/clusters/'+profile+'/')?'Home':'Office';
   assert.ok(!markers.some(s=>text.includes(foreign+'-'+s)),pathname+': foreign resource rendered');
   for(const label of await main.locator('button,a,input,select,textarea').evaluateAll(els=>els.filter(el=>el.getClientRects().length).map(el=>el.tagName+' '+(el.getAttribute('aria-label')||el.title||el.innerText||el.getAttribute('placeholder')||el.type||'').trim().slice(0,100))))controls.add(pathname+' '+label);
   if(process.env.ICLUSTERS_AUDIT_CONTROLS==='1'&&page.url().includes('/clusters/'+profile+'/')){
    const region=detail?main.locator(detail.region):main;
    views.push({url:page.url(),key:pathname,detail,buttons:await region.evaluate(observedButtons)});
   }
   visits++;
  }
  for(const [scopeName,prefix] of [['Home',''],['Office','/clusters/'+profile]]){
   const url=route=>origin+prefix+route;
   await page.goto(url('/'));
   await page.locator('.cluster-switch-button').filter({hasText:scopeName==='Home'?'Environment cluster':'Office'}).waitFor();
   for(const [pathname,items] of Object.entries(sections)){
    const dest=url(pathname);console.log(scopeName,pathname);
    if(new URL(page.url()).pathname!==new URL(dest).pathname){
     const link=page.locator('#primary-navigation a').filter({visible:true});
     const exact=await link.evaluateAll((els,href)=>els.findIndex(e=>e.href===href),dest);
     if(exact>=0){await link.nth(exact).click();links++}else await page.goto(dest);
    }
    for(const tab of items){
     await pace();console.log('Section',scopeName,pathname,tab);
     const search=new URLSearchParams();if(tab)search.set('tab',tab);
     const target=dest+(tab?'?'+search:'');
     if(tab&&new URL(page.url()).searchParams.get('tab')!==tab){
      const button=page.locator('main').getByRole('button',{name:tab,exact:true}).first();
      if(await button.isVisible()){await button.click();tabs++}
     }
     // Exercise bookmark loading as well as the controls. A new document also
     // keeps a preceding lazy route from satisfying the next section check.
     await page.goto(target);
     assert.equal(new URL(page.url()).pathname,new URL(dest).pathname);
     const expected=({'/proxmox:Virtual Machines':'-VM','/proxmox:LXC Containers':'-CT','/docker:Containers':'-container','/docker:Volumes':'-volume','/storage:Storage Pools':'-pool','/storage:Datasets / Volumes':'-tank/data','/storage:Shares':'-share','/alerts:Alert Rules':'-rule','/network:Devices':'-VM'})[pathname+':'+tab];
     await inspect(pathname+'/'+tab,expected?scopeName+expected:'');
     if(pathname==='/proxmox'&&tab==='Virtual Machines'){
      await page.locator('.vm-stats .vm-stat').filter({hasText:'Disk Usage'}).getByText('Unavailable',{exact:true}).waitFor();
      assert.doesNotMatch(await page.locator('.vm-table').innerText(),/GiB attached|TiB attached/);
     }
     if(pathname==='/storage'&&tab==='Datasets / Volumes'){
      const device=page.getByRole('row',{name:'Select /dev/disk/by-id/'+scopeName+'-drive',exact:true});
      await device.getByText(scopeName==='Home'?'128.0 GiB':'512.0 GiB',{exact:true}).waitFor();
      assert.equal(await device.getByRole('button').isDisabled(),true);
     }
     const details=({'/proxmoxVirtual Machines':['.vm-detail','.vm-detail-tabs'],'/proxmoxLXC Containers':['.vm-detail','.vm-detail-tabs'],'/networkDevices':['.device-details-card','.tabs'],'/users':['.users-details','.tabs']})[pathname+tab];
     if(details){
      const [region,bar]=details,buttons=page.locator(region).locator(bar).getByRole('button');
      for(const label of await buttons.allTextContents()){
       const item=buttons.filter({hasText:label}).first();
       if(!await item.isVisible())continue;
       await item.click();detailClicks++;
       await inspect(pathname+'/'+tab+'/'+label,'',{region,bar,label});
      }
     }
     const refresh=page.locator('main').getByRole('button',{name:/^refresh(?:\s|$)/i}).first();
     if(await refresh.isVisible()){
      try{await refresh.click({timeout:1000});refreshes++}
      catch(error){skippedRefresh.push({scopeName,pathname,tab,message:error.name})}
     }
     if(pathname==='/settings'&&tab==='General'){
      const homepage=await page.getByRole('link',{name:'Open i-Clusters homepage'}).getAttribute('href');
      assert.equal(new URL(homepage).pathname,prefix||'/');
     }
     if(pathname==='/users'&&tab==='Audit Logs'){
      await page.getByRole('button',{name:'Create Audit Report'}).click();
      const dialog=page.getByRole('dialog',{name:'Audit Report'});
      const report=JSON.parse(await dialog.locator('pre').innerText());
      assert.equal(report.sourceCluster.id,prefix?profile:'default');
      assert.equal(report.sourceCluster.name,scopeName==='Home'?'Environment cluster':'Office');
      await dialog.getByRole('button',{name:'Close dialog'}).click();
     }
    }
   }
   const deep=[
    ...['Overview','Services','Storage','Network','Tasks','Logs','Configuration'].map(nodeTab=>'/proxmox?'+new URLSearchParams({tab:'Nodes',node:'node01',nodeTab})),
    ...['connected','setup','notifications','remote'].map(section=>'/settings?'+new URLSearchParams({tab:'Connections',section})),
    '/audit','/schedules','/retention','/restore'
   ];
   for(const route of deep){
    await pace();console.log(scopeName,route);await page.goto(url(route));await inspect(route);
    if(route.includes('nodeTab=Overview')){
     const details=page.locator('.node-information');await details.waitFor();
     const info=await details.innerText();assert.equal(info.includes('Cluster member'),!!prefix);
     if(prefix)assert.ok(info.includes('Office-membership'));
    }
    if(route.includes('section=remote')){
     const open=page.getByRole('link',{name:'Open Dashboard on This Device'});
     await open.waitFor();assert.equal(await open.getAttribute('href'),url('/'));
     assert.equal(await page.getByRole('link',{name:'Open in Browser'}).getAttribute('href'),url('/'));
    }
   }
  }
  await page.close();await Promise.all([...requests]);
  if(violations.length)console.error('Scope or browser errors:',JSON.stringify(violations.slice(0,8)));
  assert.deepEqual(violations,[]);
  const result={visits,detailClicks,skippedRefresh,sidebarClicks:links,sectionClicks:tabs,refreshClicks:refreshes,distinctControls:controls.size,distinctScopedMethodsAndPaths:calls.size,providerResponses:Object.fromEntries(errors)};
  console.log('Reports:',JSON.stringify(result));
  if(process.env.ICLUSTERS_AUDIT_OUTPUT)await writeFile(process.env.ICLUSTERS_AUDIT_OUTPUT,JSON.stringify(result,null,2));
  if(process.env.ICLUSTERS_AUDIT_CONTROLS==='1'){
   result.sweep=await sweepClusterButtons({context,origin,snapshots,views,profile});
   const {clicked,disabled,dialogs,unavailable}=result.sweep;
   console.log('Buttons:',JSON.stringify({clicked,disabled,dialogs,unavailable:unavailable.length}));
  }
  if(process.env.ICLUSTERS_AUDIT_OUTPUT)await writeFile(process.env.ICLUSTERS_AUDIT_OUTPUT,JSON.stringify({...result,observedControls:[...controls],routes:[...calls]},null,2));

 }finally{
  if(browser)await browser.close();
  if(server){server.httpServer.closeAllConnections();await new Promise(resolve=>server.httpServer.close(resolve))}
  await rm(assets,{recursive:true,force:true});
 }
}
